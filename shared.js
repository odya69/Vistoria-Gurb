/* Relatórios compartilhados: sincronização com o Supabase (sem senha).
   O banco local (IndexedDB) continua sendo a base: funciona offline e sincroniza ao voltar a rede.
   v2: um relatório com problema não trava mais os outros; download em páginas; timeouts;
       correção de relógio; mensagens de erro específicas e botão "Diagnóstico". */
(function(){
"use strict";
const VER="sync-2026-10-29b";
const C=window.SHARED_CONFIG||{};
const ok=C.URL&&C.KEY&&!/COLE_AQUI/.test(C.URL+C.KEY);
const $=id=>document.getElementById(id);
const H=t=>String(t==null?"":t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* ---------- armazenamento local (com reserva em memória se o navegador bloquear) ---------- */
const MEM={};let lsOk=true;
try{localStorage.setItem("__t","1");localStorage.removeItem("__t")}catch(e){lsOk=false}
const ls={
  g:k=>{try{const v=localStorage.getItem(k);if(v!==null)return v}catch(e){lsOk=false}return k in MEM?MEM[k]:null},
  s:(k,v)=>{MEM[k]=v;try{localStorage.setItem(k,v)}catch(e){lsOk=false}},
  d:k=>{delete MEM[k];try{localStorage.removeItem(k)}catch(e){}}
};
const K={since:"relfoto_sh_since",pend:"relfoto_sh_pend",init:"relfoto_sh_init",log:"relfoto_sh_log"};
let pw="",busy=false,again=false,mute=false,lastOk=0,online=null,OFF=0,started=false;
const DV={};          // versão "suja" de cada relatório (detecta edição durante o envio)
const PT={};          // t da última versão que este aparelho acabou de enviar
const FAIL={};        // tentativas que falharam (para não insistir a cada 30 s)
const PROB={};        // problemas atuais, mostrados na tela
const FN={pag:true,put:true,del:true,agora:true};   // funções novas do SQL disponíveis?

const pend=()=>{try{return JSON.parse(ls.g(K.pend)||"{}")}catch(e){return{}}};
const setPend=o=>ls.s(K.pend,JSON.stringify(o));
const pendIds=()=>Object.keys(pend()).filter(k=>k.slice(-2)!=="#t");
/* sempre relê a fila antes de alterar, para não apagar uma edição feita enquanto o envio rodava */
function limpaPend(id,op,ver){
  if((DV[id]||0)!==ver)return;
  const q=pend();if(q[id]!==op)return;delete q[id];delete q[id+"#t"];setPend(q);
}
const mbs=n=>(n/1048576).toFixed(n>=10485760?0:1).replace(".",",")+" MB";
function dur(ms){ms=Math.abs(ms);const m=Math.round(ms/60000);if(m<60)return m+" min";const h=Math.floor(m/60),r=m%60;if(h<24)return h+" h"+(r?" "+r+" min":"");return Math.round(h/24)+" dia(s)"}

/* ---------- chamada ao servidor: com tempo limite e erro detalhado ---------- */
function mkErr(msg,x){const e=new Error(msg);for(const k in x)e[k]=x[k];return e}
async function rpc(fn,args,opt){
  opt=opt||{};
  const body=JSON.stringify(args);
  const tmo=opt.timeout||Math.min(240000,Math.max(25000,20000+body.length/1048576*20000));
  const ctl=typeof AbortController!=="undefined"?new AbortController():null;
  let to=false;const tm=setTimeout(()=>{to=true;try{ctl&&ctl.abort()}catch(e){}},tmo);
  let r,txt;
  try{
    r=await fetch(C.URL.replace(/\/$/,"")+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"Content-Type":"application/json",apikey:C.KEY},body:body,signal:ctl?ctl.signal:undefined});
    txt=await r.text();
  }catch(e){
    throw mkErr(to?"tempo esgotado":((e&&e.message)||"falha de rede"),{rede:true,timeout:to,fn:fn,bytes:body.length});
  }finally{clearTimeout(tm)}
  let j=null;try{j=JSON.parse(txt)}catch(e){}
  if(!r.ok)throw mkErr((j&&j.message)||String(txt).slice(0,300)||("HTTP "+r.status),{status:r.status,code:j&&j.code,hint:j&&j.hint,fn:fn,bytes:body.length});
  return j;
}
const faltaFn=e=>!!e&&(e.status===404||e.code==="PGRST202"||e.code==="42883"||/Could not find the function|schema cache/i.test(e.message||""));

/* ---------- tradução dos erros ---------- */
function classify(e){
  const m=String((e&&e.message)||e||""),st=e&&e.status,cd=e&&e.code,nm=String((e&&e.name)||"");
  const tec=[e&&e.fn,st?"HTTP "+st:"",cd||"",m.slice(0,180)].filter(Boolean).join(" | ");
  const R=(cod,titulo,dica,nivel)=>({cod:cod,titulo:titulo,dica:dica,nivel:nivel||"erro",tec:tec});
  const big=e&&e.bytes>3*1048576?" Este envio tinha "+mbs(e.bytes)+" (muitas fotos).":"";
  if(nm==="QuotaExceededError"||(/quota/i.test(m)&&!st))
    return R("E-LOCAL","A memória deste aparelho está cheia","Libere espaço no celular/tablet (apague fotos e apps que não usa) ou gere o PDF e exclua relatórios antigos deste aparelho.");
  if(e&&e.timeout)
    return R("E-TEMPO","O servidor demorou demais para responder","Sinal fraco ou relatório muito pesado."+big+" Tente em Wi-Fi ou em um lugar com sinal melhor. O app tenta de novo sozinho.");
  if(e&&e.rede)
    return navigator.onLine===false
      ?R("E-SEMNET","Aparelho sem internet","Ligue o Wi-Fi ou os dados móveis. Nada se perde: as alterações ficam salvas e são enviadas quando a internet voltar.","aviso")
      :R("E-REDE","Não consegui falar com o servidor","Internet instável, rede com bloqueio (firewall/proxy do órgão) ou projeto do Supabase pausado. Teste em outra rede (dados móveis) e, se só falha em uma rede, peça à TI para liberar *.supabase.co. Se falha em todas, abra o painel do Supabase e veja se o projeto não está pausado (plano grátis pausa por inatividade).");
  if(st===401||st===403||/api key|apikey|jwt/i.test(m))
    return R("E-CHAVE","O servidor recusou a chave de acesso","Confira URL e KEY em shared-config.js (use a chave anon/publishable do projeto certo) e publique de novo.");
  if(/read-only transaction/i.test(m)||cd==="25006"||cd==="53100"||/No space left|disk full/i.test(m))
    return R("E-BANCOCHEIO","O banco online está cheio ou somente leitura","O plano grátis do Supabase (500 MB) foi atingido e ele bloqueia novas gravações. Gere o PDF e exclua relatórios antigos, ou aumente o plano no painel do Supabase.");
  if(faltaFn(e)||cd==="42P01"||/does not exist/i.test(m))
    return R("E-SQL","O banco do Supabase está desatualizado","Abra o Supabase > SQL Editor e rode de novo o arquivo supabase-setup.sql inteiro (pode repetir sem problema)."+(e&&e.fn?" Função que falta: "+e.fn+".":""),"aviso");
  if(cd==="42501"||/permission denied/i.test(m))
    return R("E-PERM","O banco recusou o acesso (permissão)","Rode de novo o supabase-setup.sql no SQL Editor: ele refaz as permissões.");
  if(/senha_invalida/i.test(m))
    return R("E-SENHA","O banco ainda está na versão antiga com senha","Rode de novo o supabase-setup.sql no SQL Editor para remover a senha antiga.");
  if(cd==="57014"||/statement timeout|canceling statement/i.test(m))
    return R("E-DBTEMPO","O banco demorou demais para processar","Muitos dados de uma vez. O app já reduz o tamanho dos pedidos; rode também o supabase-setup.sql para aumentar o tempo permitido.");
  if(st===413||/too large|payload/i.test(m))
    return R("E-GRANDE","Relatório grande demais para enviar","Há fotos demais neste relatório."+big+" Remova algumas fotos ou divida em dois relatórios.");
  if(st===429)
    return R("E-LIMITE","Muitas requisições ao servidor","Aguarde um minuto; o app tenta de novo sozinho.","aviso");
  if(st>=500)
    return R("E-SERV","Servidor indisponível ("+st+")","O Supabase está fora do ar, reiniciando ou o projeto está pausado. Veja o painel do Supabase. O app tenta de novo sozinho.");
  if(st===400||st===422)
    return R("E-DADOS","O servidor recusou os dados","Há um dado fora do formato esperado neste relatório. Envie o diagnóstico para o suporte.");
  return R("E-OUTRO","Erro inesperado",(m||"sem detalhes")+". Toque em Diagnóstico e envie para o suporte.");
}

/* registro dos últimos erros (ajuda a achar o problema depois) */
function logErro(c,item){
  try{
    const a=JSON.parse(ls.g(K.log)||"[]"),u=a[a.length-1],t=Date.now();
    if(u&&u.c===c.cod&&u.x===c.tec&&t-u.t<300000)return;
    a.push({t:t,c:c.cod,x:c.tec,i:item||""});ls.s(K.log,JSON.stringify(a.slice(-25)));
  }catch(e){}
}
function addProb(key,e,item){
  const c=classify(e);PROB[key]={cls:c,item:item||""};logErro(c,item);return c;
}

/* ---------- tela ---------- */
function status(t,cor){const e=$("shst");if(e){e.textContent=t;e.style.color=cor||""}}
function hora(){return new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
function render(){
  const bx=$("sherr");if(!bx)return;
  const g={},ord=[];
  Object.keys(PROB).forEach(k=>{const p=PROB[k],c=p.cls;if(!g[c.cod]){g[c.cod]={c:c,it:[]};ord.push(c.cod)}if(p.item)g[c.cod].it.push(p.item)});
  if(!ord.length){bx.hidden=true;bx.innerHTML="";return}
  bx.hidden=false;
  bx.innerHTML=ord.map(cod=>{const o=g[cod],c=o.c,cor=c.nivel==="aviso"?"#b36b00":"#a63d2f";
    const it=o.it.length?'<div style="font-size:.85em;opacity:.85">Afetados: '+o.it.slice(0,5).map(H).join("; ")+(o.it.length>5?" e mais "+(o.it.length-5):"")+'</div>':"";
    return '<div style="border-left:4px solid '+cor+';padding:2px 0 2px 8px;margin:6px 0"><strong style="color:'+cor+'">'+H(c.titulo)+'</strong> <span style="opacity:.6;font-size:.85em">['+H(c.cod)+']</span><div>'+H(c.dica)+'</div>'+it+'<div style="font-size:.75em;opacity:.6;word-break:break-word">Detalhe técnico: '+H(c.tec)+'</div></div>'}).join("");
}
function resumo(){
  const np=pendIds().length,n=Object.keys(PROB).length;
  const graves=Object.keys(PROB).filter(k=>PROB[k].cls.nivel!=="aviso");
  render();
  if(!graves.length){
    status("Compartilhado e sincronizado às "+hora()+(np?" — "+np+" aguardando envio":""),n?"#b36b00":"");
  }else{
    const c0=PROB[graves[0]].cls;
    status((online?"Sincronização com problema":"Sem sincronizar")+" ("+c0.cod+") — "+c0.titulo+(np?" — "+np+" alteração(ões) aguardando envio":""),"#a63d2f");
  }
}

/* ---------- relógio: o aparelho com hora errada fazia o servidor ignorar suas alterações ---------- */
async function relogio(){
  if(!FN.agora)return;
  const t0=Date.now();
  try{
    const s=await rpc("rel_agora",{p:pw},{timeout:15000}),t1=Date.now();
    if(typeof s==="number"&&t1-t0<15000){
      OFF=s-Math.round((t0+t1)/2);delete PROB.relogio;
      if(Math.abs(OFF)>120000){
        const c={cod:"E-RELOGIO",nivel:"aviso",titulo:"A data/hora deste aparelho está errada",
          dica:"O relógio está "+dur(OFF)+(OFF>0?" atrasado":" adiantado")+" em relação ao servidor. O app compensa a diferença, mas ative \"data e hora automáticas\" nas configurações do aparelho para evitar conflitos.",tec:"diferença "+Math.round(OFF/1000)+" s"};
        PROB.relogio={cls:c,item:""};logErro(c,"");
      }
    }
  }catch(e){if(faltaFn(e)){FN.agora=false;addProb("sql",e,"")}}
}
const corrige=t=>Math.abs(OFF)>30000?t+OFF:t;

/* ---------- envio: cada relatório é independente ---------- */
async function putRemoto(id,x,rt){
  const dados=Object.assign({},x,{t:rt});
  if(FN.put){
    try{return await rpc("rel_put2",{p:pw,rid:id,rtipo:x.tipo||"habite",rdados:dados,rt:rt})}
    catch(e){if(faltaFn(e)){FN.put=false;addProb("sql",e,"")}else throw e}
  }
  await rpc("rel_put",{p:pw,rid:id,rtipo:x.tipo||"habite",rdados:dados,rt:rt});return{aceito:true};
}
async function delRemoto(id,rt){
  if(FN.del){
    try{return await rpc("rel_del2",{p:pw,rid:id,rt:rt})}
    catch(e){if(faltaFn(e)){FN.del=false;addProb("sql",e,"")}else throw e}
  }
  await rpc("rel_del",{p:pw,rid:id,rt:rt});return{aceito:true};
}

async function pushAll(manual){
  let p=pend();
  const ids=pendIds().sort((a,b)=>(p[a]==="del"?0:1)-(p[b]==="del"?0:1));
  let parar=false,n=0;
  Object.keys(PROB).forEach(k=>{if(k.slice(0,3)==="av:")delete PROB[k]});
  for(const id of ids){
    if(parar)break;
    const f=FAIL[id];if(f&&!manual&&f.next>Date.now())continue;
    const op=pend()[id];if(!op)continue;
    const ver=DV[id]||0;let proc="",bytes=0;
    status("Enviando "+(++n)+" de "+ids.length+"...");
    try{
      if(op==="put"){
        const x=await dbGet(id);
        if(!x){limpaPend(id,op,ver);delete PROB[id];continue}
        proc=(x.f&&x.f.proc)?"Processo "+String(x.f.proc).slice(0,40):"Relatório "+id;
        const rt=corrige(x.t||0);
        const res=await putRemoto(id,x,rt);
        PT[id]=rt;
        if(res&&res.aceito===false)
          PROB["av:"+id]={cls:{cod:"E-CONFLITO",nivel:"aviso",titulo:"Alteração mais antiga que a do servidor",
            dica:"Outro aparelho salvou este relatório depois, então a versão do servidor foi mantida e vai aparecer aqui. Se isso se repete sem ninguém mais editar, confira a data/hora do aparelho.",tec:"t local "+rt+" < t servidor "+(res.t||"?")},item:proc};
      }else{
        proc="Exclusão do relatório "+id;
        await delRemoto(id,corrige(pend()[id+"#t"]||Date.now()));
      }
      limpaPend(id,op,ver);delete FAIL[id];delete PROB[id];
    }catch(e){
      const k=(FAIL[id]&&FAIL[id].n||0)+1;
      FAIL[id]={n:k,next:Date.now()+Math.min(600000,30000*Math.pow(2,k-1))};
      const c=addProb(id,e,proc||id);
      /* erro de rede/servidor geral: não adianta insistir nos demais agora.
         Erro específico do relatório (muito grande, dados recusados, tempo no pesado): segue para o próximo. */
      const geral=(e.rede&&!e.timeout)||e.status>=500||e.status===401||e.status===403||e.status===429||c.cod==="E-SQL"||c.cod==="E-BANCOCHEIO"||c.cod==="E-PERM"||(e.timeout&&(e.bytes||0)<1500000);
      if(geral)parar=true;
    }
  }
}

/* ---------- download em páginas pequenas ---------- */
async function listPag(cursor,lim,maxb){
  if(FN.pag){
    try{return await rpc("rel_list_pag",{p:pw,since:cursor,maxbytes:maxb,maxrows:lim},{timeout:90000})}
    catch(e){if(faltaFn(e)){FN.pag=false;addProb("sql",e,"")}else throw e}
  }
  const rows=await rpc("rel_list",{p:pw,since:cursor},{timeout:180000});
  return{rows:rows,mais:false};
}

async function pull(){
  const since=parseInt(ls.g(K.since)||"0",10)||0;
  let cursor=Math.max(0,since-5000),max=since,mudou=0,lim=30,maxb=2500000,tentativas=0;
  for(let pag=0;pag<2000;pag++){
    let res;
    try{res=await listPag(cursor,lim,maxb)}
    catch(e){
      /* pedido pesado demais: reduz o tamanho da página e tenta de novo */
      if((e.timeout||e.code==="57014"||e.status===413||e.status>=500)&&lim>1&&tentativas<6){lim=Math.max(1,Math.floor(lim/2));maxb=Math.max(300000,Math.floor(maxb/2));tentativas++;continue}
      throw e;
    }
    const rows=(res&&res.rows)||[];
    for(const r of rows){
      max=Math.max(max,r.atualizado||0);
      if(pend()[r.id])continue;                       // alteração local ainda não enviada: ela vence
      if(!r.apagado&&PT[r.id]===r.t)continue;         // é a versão que este aparelho acabou de enviar
      let l=null;try{l=await dbGet(r.id)}catch(e){}
      try{
        if(r.apagado){if(l&&(l.t||0)<=r.t){mute=true;try{await dbDel(r.id)}finally{mute=false};mudou++}}
        else if(r.dados&&(!l||(l.t||0)<r.t)){const o=r.dados;o.id=r.id;o.t=r.t;mute=true;try{await dbPut(o)}finally{mute=false};mudou++}
      }catch(e){throw e}
    }
    if(rows.length){cursor=Math.max(cursor,max);ls.s(K.since,String(max));status("Baixando do servidor... "+mudou+" atualizado(s)")}
    if(!res||!res.mais||!rows.length)break;
  }
  ls.s(K.since,String(max));
  return mudou;
}

/* ---------- tamanho do banco compartilhado ---------- */
let lastTam=0;
async function tamanho(force){
  const bx=$("dbbox");if(!ok||!bx)return;bx.hidden=false;
  if(!force&&Date.now()-lastTam<60000)return;
  const lim=(C.LIMITE_MB||500)*1048576;
  try{
    const r=await rpc("rel_tamanho",{p:pw},{timeout:20000});lastTam=Date.now();
    const pc=barPaint("2",r.banco,lim);
    $("sttx2").textContent=mb(r.banco)+" de "+mb(lim)+(pc!==null?" ("+pc+"% usado)":"");
    $("sttx2").style.color="";
    $("stsub2").textContent="Espaço do banco online, usado por todos os aparelhos juntos. O limite de "+mb(lim)+" é o do plano grátis (se o seu plano for outro, ajuste LIMITE_MB em shared-config.js). Só os relatórios: "+mb(r.relatorios)+" ("+r.qtd+" relatório"+(Number(r.qtd)===1?"":"s")+").";
  }catch(e){
    const c=classify(e);
    $("sttx2").textContent=c.cod==="E-SQL"?"tamanho ainda não disponível":"não foi possível consultar agora ("+c.cod+")";
    $("sttx2").style.color="#a63d2f";
    $("stpb2").hidden=true;
    $("stsub2").textContent=c.titulo+". "+c.dica}
}

/* ---------- ciclo de sincronização ---------- */
const dbKeys=()=>tx("readonly",s=>s.getAllKeys());
let espera=0;
async function sync(manual){
  if(!ok)return;
  if(busy){again=true;return}
  if(typeof DB==='undefined'||!DB){if(espera++<40)setTimeout(sync,250);return}
  busy=true;again=false;
  if(manual===true)Object.keys(FAIL).forEach(k=>delete FAIL[k]);
  if(!lsOk)PROB.arm={cls:{cod:"E-ARMAZ",nivel:"aviso",titulo:"O navegador bloqueia o armazenamento local",dica:"Provavelmente aba anônima ou navegador interno de outro app (WhatsApp, Instagram). Abra o link no Chrome/Safari ou instale o app. Enquanto isso a sincronização só funciona até fechar esta aba.",tec:"localStorage indisponível"},item:""};
  else delete PROB.arm;
  try{
    if(!ls.g(K.init)){const p=pend();(await dbKeys()).forEach(id=>{if(!p[id])p[id]="put"});setPend(p);ls.s(K.init,"1")}
    await relogio();
    let falhouEnvio=false;
    try{await pushAll(manual===true)}catch(e){falhouEnvio=true;addProb("envio",e,"")}
    let n=0,baixou=true;
    try{n=await pull();delete PROB.pull}
    catch(e){baixou=false;addProb("pull",e,"Baixar do servidor");online=!(e.rede&&!e.timeout)}
    if(baixou){online=true;lastOk=Date.now();delete PROB.envio;tamanho(manual===true)}
    resumo();
    if(n&&typeof list==="function")await list();
  }catch(e){
    online=false;addProb("geral",e,"");resumo();
  }finally{
    busy=false;
    if(again){again=false;setTimeout(sync,1500)}
  }
}

window.syncMuted=()=>mute;
window.syncPut=o=>{if(!ok||mute||!o||!o.id)return;DV[o.id]=(DV[o.id]||0)+1;const p=pend();p[o.id]="put";setPend(p);clearTimeout(window.__shT);window.__shT=setTimeout(sync,800)};
window.syncDel=id=>{if(!ok||mute)return;DV[id]=(DV[id]||0)+1;const p=pend();p[id]="del";p[id+"#t"]=Date.now();setPend(p);clearTimeout(window.__shT);window.__shT=setTimeout(sync,300)};

/* ---------- diagnóstico (para mandar ao suporte) ---------- */
async function diagnostico(){
  const L=[];const ln=(a,b)=>L.push(a+": "+b);
  L.push("DIAGNÓSTICO DE SINCRONIZAÇÃO");
  ln("Gerado em",new Date().toString());ln("Versão do sincronizador",VER);
  ln("Endereço do app",location.href);ln("Aparelho/navegador",navigator.userAgent);
  try{ln("App instalado (standalone)",matchMedia("(display-mode: standalone)").matches?"sim":"não")}catch(e){}
  ln("Internet (navigator.onLine)",navigator.onLine);
  ln("localStorage funcionando",lsOk?"sim":"NÃO");
  ln("Diferença do relógio p/ servidor",FN.agora?Math.round(OFF/1000)+" s":"não medida (função rel_agora ausente)");
  ln("Funções novas do banco (pag/put/del/agora)",[FN.pag,FN.put,FN.del,FN.agora].map(v=>v?"ok":"FALTA").join("/"));
  ln("Último sync completo",lastOk?new Date(lastOk).toString():"nunca nesta sessão");
  try{ln("Service Worker / caches",(await caches.keys()).join(", ")||"nenhum")}catch(e){}
  try{if(navigator.storage&&navigator.storage.estimate){const s=await navigator.storage.estimate();ln("Armazenamento do navegador",mbs(s.usage||0)+" de "+mbs(s.quota||0));
    if(navigator.storage.persisted)ln("Armazenamento protegido contra limpeza",(await navigator.storage.persisted())?"sim":"não")}}catch(e){}
  try{ln("Relatórios neste aparelho",(await dbKeys()).length)}catch(e){ln("Relatórios neste aparelho","erro ao ler: "+e.message)}
  const ids=pendIds();ln("Aguardando envio",ids.length);
  for(const id of ids.slice(0,10)){let s="";try{const x=await dbGet(id);if(x)s=((x.f&&x.f.proc)||id)+" — "+mbs(JSON.stringify(x).length)}catch(e){}
    const f=FAIL[id];L.push("  · "+(s||id)+" ("+pend()[id]+")"+(f?" — falhou "+f.n+"x":""))}
  if(ids.length>10)L.push("  · ... e mais "+(ids.length-10));
  const pr=Object.keys(PROB);ln("Problemas agora",pr.length?"":"nenhum");
  pr.forEach(k=>L.push("  · ["+PROB[k].cls.cod+"] "+PROB[k].cls.titulo+(PROB[k].item?" ("+PROB[k].item+")":"")+" — "+PROB[k].cls.tec));
  if(window.__histErr)ln("Último erro do histórico",new Date(window.__histErr.t).toString()+" — "+window.__histErr.msg);
  try{ln("Eventos do histórico aguardando envio",JSON.parse(ls.g("relfoto_hist_pend")||"[]").length)}catch(e){}
  try{const lg=JSON.parse(ls.g(K.log)||"[]");L.push("Últimos erros registrados:");lg.slice(-12).forEach(x=>L.push("  · "+new Date(x.t).toLocaleString("pt-BR")+" ["+x.c+"] "+(x.i?x.i+" — ":"")+x.x))}catch(e){}
  const t0=Date.now();
  try{const c=new AbortController(),tm=setTimeout(()=>c.abort(),8000);
    const r=await fetch(C.URL.replace(/\/$/,"")+"/rest/v1/",{headers:{apikey:C.KEY},signal:c.signal});clearTimeout(tm);
    ln("Teste de conexão com o Supabase","HTTP "+r.status+" em "+(Date.now()-t0)+" ms")}
  catch(e){ln("Teste de conexão com o Supabase","FALHOU ("+(e&&e.name==="AbortError"?"sem resposta em 8 s":(e&&e.message)||"erro")+")")}
  return L.join("\n");
}
async function copiarDiag(){
  const t=await diagnostico();
  try{await navigator.clipboard.writeText(t);status("Diagnóstico copiado — cole numa mensagem para o suporte.","")}
  catch(e){const a=$("shdiagtx");if(a){a.hidden=false;a.value=t;a.focus();a.select();status("Selecione e copie o texto do diagnóstico abaixo.","")}}
  const a=$("shdiagtx");if(a&&!a.hidden)a.value=t;
}

function homeUI(){
  const h=$("home");if(!h||$("shbox"))return;
  const b=document.createElement("div");b.id="shbox";b.className="mini noprint";
  b.innerHTML='<span class="lbl"><strong>Compartilhado:</strong> <span id="shst" role="status">Conectando...</span></span><button class="btn ghost sm" id="shnow" type="button">Sincronizar</button><button class="btn ghost sm" id="shdg" type="button">Diagnóstico</button>';
  const e=document.createElement("div");e.id="sherr";e.className="mini noprint";e.hidden=true;e.style.cssText="width:100%;text-align:left;font-size:.9em";
  const ta=document.createElement("textarea");ta.id="shdiagtx";ta.hidden=true;ta.readOnly=true;ta.rows=10;ta.style.cssText="width:100%;font:11px monospace";
  const st=$("stbox");
  if(st){h.insertBefore(b,st);h.insertBefore(e,st);h.insertBefore(ta,st)}else{h.appendChild(b);h.appendChild(e);h.appendChild(ta)}
  $("shnow").onclick=()=>sync(true);
  $("shdg").onclick=copiarDiag;
  const db=$("dbbox");if(db)db.hidden=false;
  render();
}

function start(){
  if(started){sync();return}
  started=true;homeUI();sync();
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}   // pede ao navegador para não apagar os relatórios
  setInterval(()=>{if(!document.hidden)sync()},30000);
  addEventListener("online",()=>{Object.keys(FAIL).forEach(k=>delete FAIL[k]);sync()});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
}

function boot(){
  if(!ok){return}                       // sem configuração: modo local
  start()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
