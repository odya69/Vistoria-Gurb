/* Histórico de alterações e movimentações dos processos.
   - Cada gravação de um processo é comparada com a versão anterior; o que mudou vira um "evento"
     (cadastrado, editado, vistoria preenchida, revistoria, deferido, pendência lançada, excluído...).
   - Os eventos vão para a tabela rel_historico do Supabase (o mesmo banco dos relatórios), então todos veem o mesmo histórico.
   - Sem internet, os eventos ficam numa fila neste aparelho e são enviados quando a conexão voltar.
   - Fotos não entram no histórico (só a quantidade), para o registro continuar leve. */
(function(){
"use strict";
const C=window.SHARED_CONFIG||{};
const ok=!!(C.URL&&C.KEY&&!/COLE_AQUI/.test(C.URL+C.KEY));
const $=id=>document.getElementById(id);
const E=t=>String(t==null?"":t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const ls={g:k=>{try{return localStorage.getItem(k)}catch(e){return null}},s:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
const K={pend:"relfoto_hist_pend",user:"relfoto_user"};
const ATRASO={editado:15000,cadastrado:15000,vistoriado:15000};   // eventos de digitação esperam um pouco para juntar as edições seguidas
const JUNTA=10*60*1000;

const ACAO={cadastrado:"Cadastrado",vistoriado:"Vistoria preenchida",editado:"Dados alterados",revistoria:"Revistoria",revistoria_cancelada:"Revistoria cancelada",
  deferido:"Deferido",devolvido:"Voltou para análise",pendencia_lancada:"Pendência lançada",pendencia_removida:"Pendência removida",tipo:"Tipo alterado",excluido:"Excluído",importado:"Importado"};
const COR={cadastrado:"#164194",vistoriado:"#164194",editado:"#4a5876",revistoria:"#b45309",revistoria_cancelada:"#b45309",deferido:"#1d6b3a",devolvido:"#b45309",
  pendencia_lancada:"#b45309",pendencia_removida:"#4a5876",tipo:"#4a5876",excluido:"#a63d2f",importado:"#4a5876"};
const F_LAB={proc:"Nº do processo",insc:"Inscrição imobiliária",maps:"Link do mapa",rua:"Rua",numero:"Número",quadra:"Quadra",nlote:"Lote",bairro:"Bairro",analista:"Analista",
  lote:"Loteamento",data:"Data da vistoria",resp:"Responsável pela vistoria",uso:"Uso da edificação",pav:"Nº de pavimentos",usod:"Descrição do uso",obs:"Observações",obsm:"Observações sobre as medidas"};

const trunc=(v,n)=>{v=v==null?"":String(v);return v.length>n?v.slice(0,n)+"…":v};
const sv=v=>v==null?"":String(v).trim();
const rnd=()=>Math.random().toString(36).slice(2,10);
const autor=()=>(ls.g(K.user)||"").trim();

/* ---------- cópia leve do processo (sem as fotos) para comparar ---------- */
const SH={};
function light(o){
  return JSON.parse(JSON.stringify({id:o.id,tipo:o.tipo,def:o.def,pl:o.pl,conf:o.conf,f:o.f||{},c:o.c||{},m:o.m||{},o:o.o||{},
    p:(o.p||[]).map(q=>({cap:(q&&q.cap)||""})),
    hist:(o.hist||[]).map(h=>({n:h.n,data:h.data,resp:h.resp,obs:h.obs,pend:h.pend,c:h.c||{},m:h.m||{},o:h.o||{},p:[]}))}));
}
window.hOld=async function(id){
  if(SH[id])return SH[id];
  try{const x=typeof dbGet==="function"?await dbGet(id):null;return x?light(x):null}catch(e){return null}
};
(function pre(n){n=n||0;
  if(typeof DB==="undefined"||!DB){if(n<80)setTimeout(()=>pre(n+1),250);return}
  try{dbAll().then(a=>a.forEach(x=>{if(!SH[x.id])SH[x.id]=light(x)})).catch(()=>{})}catch(e){}
})();

/* ---------- comparação ---------- */
const checksOf=t=>t==="acess"?CHECKS_A:t==="regul"?CHECKS_R:CHECKS_H;
const medsOf=t=>t==="acess"?MEDS_A:MEDS_H;
function rotulos(tipo){
  const L={};
  checksOf(tipo).forEach(([k,t])=>{L["c."+k]=t.replace(/\?$/,"").replace(/ \(.*\)$/,"");L["o."+k]="Observação: "+L["c."+k]});
  L["c.fechado"]="Imóvel fechado";L["c.naoloc"]="Imóvel não localizado";L["c.pend"]="Possui pendência";
  medsOf(tipo).forEach(([k,t])=>{L["m."+k]=t});
  L["m.arvL"]="Caixa de árvore - largura";L["m.arvC"]="Caixa de árvore - comprimento";
  Object.keys(F_LAB).forEach(k=>{L["f."+k]=F_LAB[k]});
  return L;
}
function dg(a,b,pre,L,out){
  a=a||{};b=b||{};
  const ks=Object.keys(a).concat(Object.keys(b).filter(k=>!(k in a)));
  ks.forEach(k=>{
    const x=sv(a[k]),y=sv(b[k]);if(x===y)return;
    out.push({campo:L[pre+k]||(pre==="o."?"Observação: "+k:k),de:trunc(x,200),para:trunc(y,200)});
  });
}
const defFmt=v=>typeof defTxt==="function"?defTxt({def:v}):String(v);
const plFmt=v=>typeof fd==="function"?fd(v):String(v);
function resumoEdit(det){
  const n=[];det.forEach(d=>{if(!n.includes(d.campo))n.push(d.campo)});
  return "Alterou: "+n.slice(0,4).join(", ")+(n.length>4?" e mais "+(n.length-4):"");
}
function diff(old,nw){
  const tipo=nw.tipo||"habite";
  const base={rid:nw.id,proc:sv(nw.f&&nw.f.proc),tipo,end:trunc(typeof addr==="function"?addr(nw):"",200)};
  const evs=[],mk=(acao,resumo,det)=>evs.push(Object.assign({acao,resumo,det:det||[]},base));
  if(window.hModo==="import"){mk("importado",old?"Atualizado por importação de backup":"Adicionado por importação de backup");return evs}
  const O=old||{f:{},c:{},m:{},o:{},p:[],hist:[],tipo};
  const L=rotulos(tipo);
  const oh=(O.hist||[]).length,nh=(nw.hist||[]).length;
  if(nh>oh){
    const z=nw.hist[nh-1],det=[{campo:"Vistoria arquivada",de:"",para:nh+"ª vistoria"+(z&&z.data?" de "+plFmt(z.data):"")}];
    if(sv(nw.f.data))det.push({campo:"Data da revistoria",de:"",para:plFmt(nw.f.data)});
    mk("revistoria","Marcado para revistoria ("+nh+"ª vistoria arquivada)",det);return evs;
  }
  if(nh<oh){mk("revistoria_cancelada","Retirado da revistoria: a "+oh+"ª vistoria voltou a valer");return evs}
  const dO=sv(O.def),dN=sv(nw.def);
  if(dN&&!dO)mk("deferido","Processo deferido em "+defFmt(nw.def));
  else if(!dN&&dO)mk("devolvido","Voltou para análise (deferimento de "+defFmt(O.def)+" removido)");
  else if(dN&&dO&&dN!==dO)mk("deferido","Data do deferimento alterada de "+defFmt(O.def)+" para "+defFmt(nw.def));
  const pO=sv(O.pl),pN=sv(nw.pl);
  if(pN&&!pO)mk("pendencia_lancada","Pendência lançada no sistema em "+plFmt(nw.pl));
  else if(!pN&&pO)mk("pendencia_removida","Marca de pendência lançada removida (era "+plFmt(O.pl)+")");
  else if(pN&&pO&&pN!==pO)mk("pendencia_lancada","Data da pendência lançada alterada de "+plFmt(O.pl)+" para "+plFmt(nw.pl));
  if(old&&(O.tipo||"habite")!==tipo)mk("tipo","Tipo alterado de "+((TIPOS||{})[O.tipo||"habite"]||O.tipo)+" para "+((TIPOS||{})[tipo]||tipo));
  const det=[];
  dg(O.f,nw.f,"f.",L,det);dg(O.c,nw.c,"c.",L,det);dg(O.m,nw.m,"m.",L,det);dg(O.o,nw.o,"o.",L,det);
  const op=O.p||[],np=nw.p||[];
  if(op.length!==np.length)det.push({campo:"Fotos",de:op.length+" foto(s)",para:np.length+" foto(s)"});
  else{let n=0;np.forEach((q,i)=>{if(sv(q&&q.cap)!==sv(op[i]&&op[i].cap))n++});if(n)det.push({campo:"Legendas das fotos",de:"",para:n+" legenda(s) alterada(s)"})}
  if(!old){mk("cadastrado","Processo cadastrado ("+((TIPOS||{})[tipo]||tipo)+")",det)}
  else if(det.length){
    let vis=false;try{vis=!feito(O)&&feito(nw)&&!(sv(O.def))}catch(e){}
    if(vis){let np2=0;try{np2=pends(nw).p.length}catch(e){}
      mk("vistoriado","Vistoria preenchida"+(np2?" ("+np2+" pendência(s) encontrada(s))":""),det)}
    else mk("editado",resumoEdit(det),det);
  }
  return evs;
}

/* ---------- fila de envio ---------- */
const FLY=new Set();
const fila=()=>{try{const q=JSON.parse(ls.g(K.pend)||"[]");return Array.isArray(q)?q:[]}catch(e){return[]}};
const salva=q=>ls.s(K.pend,JSON.stringify(q.slice(-3000)));
function enfileira(ev){
  ev.eid="e"+Date.now().toString(36)+rnd();ev.t=Date.now();ev.autor=autor()||"Não identificado";
  const q=fila();
  if(ev.acao==="editado"){
    for(let i=q.length-1;i>=0;i--){
      const l=q[i];if(l.rid!==ev.rid)continue;
      if(["editado","cadastrado","vistoriado"].includes(l.acao)&&l.autor===ev.autor&&ev.t-l.t<JUNTA&&!FLY.has(l.eid)){
        const m=(l.det||[]).slice();
        ev.det.forEach(d=>{const j=m.findIndex(z=>z.campo===d.campo);if(j>=0)m[j]=Object.assign({},m[j],{para:d.para});else m.push(d)});
        l.det=m.filter(d=>d.de!==d.para);l.t=ev.t;l.proc=ev.proc;l.end=ev.end;
        if(!l.det.length&&l.acao==="editado")q.splice(i,1);
        else if(l.acao==="editado")l.resumo=resumoEdit(l.det);
        salva(q);return;
      }
      break;
    }
  }
  q.push(ev);salva(q);
  if(!ATRASO[ev.acao])setTimeout(()=>enviar(),700);
}
window.hLog=function(old,nw){
  if(!nw||!nw.id)return;
  const muted=typeof window.syncMuted==="function"&&window.syncMuted();
  SH[nw.id]=light(nw);
  if(muted)return;
  diff(old,nw).forEach(enfileira);
};
window.hLogDel=function(old,id){
  delete SH[id];
  if(typeof window.syncMuted==="function"&&window.syncMuted())return;
  if(!old)return;
  const tipo=old.tipo||"habite";
  enfileira({acao:"excluido",resumo:"Processo excluído",det:[],rid:id,proc:sv(old.f&&old.f.proc),tipo,end:trunc(typeof addr==="function"?addr(old):"",200)});
};

async function rpc(fn,args){
  const body=JSON.stringify(args);
  const r=await fetch(C.URL.replace(/\/$/,"")+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"Content-Type":"application/json",apikey:C.KEY},body,keepalive:body.length<60000});
  const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch(e){}
  if(!r.ok)throw new Error((j&&j.message)||txt);
  return j;
}
let ocupado=false;
async function enviar(forca){
  if(!ok||ocupado)return;
  const q=fila(),agora=Date.now();
  const pronto=q.filter(e=>forca||agora-e.t>=(ATRASO[e.acao]||500));
  if(!pronto.length)return;
  ocupado=true;pronto.forEach(e=>FLY.add(e.eid));
  try{
    const evs=pronto.map(e=>({eid:e.eid,rid:e.rid,t:e.t,autor:e.autor,acao:e.acao,proc:e.proc,tipo:e.tipo,end:e.end,resumo:e.resumo,det:e.det}));
    await rpc("rel_hist_add",{p:"",evs});
    const ids=new Set(pronto.map(e=>e.eid));salva(fila().filter(e=>!ids.has(e.eid)));
    if(telaAberta())carrega(true);
  }catch(e){/* fica na fila; tenta de novo depois */}
  finally{pronto.forEach(e=>FLY.delete(e.eid));ocupado=false}
}
setInterval(()=>{enviar()},5000);
addEventListener("online",()=>enviar(true));
document.addEventListener("visibilitychange",()=>{if(document.hidden)enviar(true)});
addEventListener("pagehide",()=>{enviar(true)});

/* ---------- tela do histórico ---------- */
const H={rid:null,itens:[],mais:false,erro:"",carregando:false,fechado:false};
const telaAberta=()=>{const v=$("vhist");return !!v&&!v.hidden};
const fdh=t=>new Date(t).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const dia=t=>{const s=new Date(t).toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});return s.charAt(0).toUpperCase()+s.slice(1)};

function css(){
  const s=document.createElement("style");
  s.textContent=`
  .hev{border:1px solid var(--line);border-left:6px solid var(--mut);border-radius:6px;padding:10px 12px;margin:0 0 10px;background:var(--bg)}
  .hev .hh{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}
  .hev .hb{display:inline-block;padding:2px 9px;border-radius:999px;color:#fff;font:700 .8rem "Trebuchet MS",Verdana,system-ui,sans-serif}
  .hev .hq{background:#fff3e0;color:#b45309;border:1px solid #b45309;padding:1px 8px;border-radius:999px;font:700 .75rem "Trebuchet MS",Verdana,system-ui,sans-serif}
  .hev .hr{margin:6px 0 0}
  .hev details{margin-top:6px}
  .hev summary{cursor:pointer;color:var(--acc);font:700 .9rem "Trebuchet MS",Verdana,system-ui,sans-serif;min-height:32px;display:flex;align-items:center}
  .hev ul.hd{margin:6px 0 0;padding-left:18px}
  .hev ul.hd li{margin:3px 0;font-size:.92rem;overflow-wrap:anywhere}
  .hev .de{color:var(--nao);text-decoration:line-through}
  .hev .pa{color:#1d6b3a;font-weight:700}
  .hev .vz{color:var(--mut);font-style:italic}
  .hev button.hp{background:none;border:0;padding:0;color:var(--acc);font:700 1rem "Trebuchet MS",Verdana,system-ui,sans-serif;text-decoration:underline;cursor:pointer}
  `;
  document.head.appendChild(s);
}

function monta(){
  if($("vhist"))return;
  const app=$("app"),form=$("vform");if(!app||!form)return;
  const v=document.createElement("div");v.id="vhist";v.hidden=true;
  v.innerHTML=`<section class="noprint">
   <h2 id="hh_t">Histórico de alterações e movimentações</h2>
   <p class="lbl" style="margin-top:0">Tudo o que é feito nos processos fica registrado aqui, com quem fez e quando: cadastro, alterações de dados, vistoria preenchida, revistoria, pendência lançada, deferimento e exclusão. O registro é do banco compartilhado, então todos veem o mesmo histórico.</p>
   <div class="grid" style="margin-bottom:10px">
    <div class="f"><label class="lbl" for="hh_nome">Seu nome (aparece nas alterações que você fizer)</label><input id="hh_nome" list="hh_dl" autocomplete="off" placeholder="Seu nome"><datalist id="hh_dl"></datalist></div>
    <div class="f"><label class="lbl" for="hh_q">Buscar</label><input id="hh_q" type="search" autocomplete="off" placeholder="Nº do processo, endereço, autor, campo..."></div>
    <div class="f"><label class="lbl" for="hh_a">Tipo de registro</label><select id="hh_a"><option value="">Todos</option><option value="__mov">Só movimentações</option><option value="__dados">Só alterações de dados</option></select></div>
    <div class="f"><label class="lbl" for="hh_u">Quem fez</label><select id="hh_u"><option value="">Todos</option></select></div>
   </div>
   <div class="bar"><button class="btn sm" id="hh_r" type="button">Atualizar</button><button class="btn ghost sm" id="hh_todos" type="button" hidden>Ver todos os processos</button><button class="btn ghost sm" id="hh_csv" type="button">Baixar planilha (CSV)</button></div>
   <p class="lbl" id="hh_st" role="status" style="margin:8px 0"></p>
   <div id="hh_l"></div>
   <div class="bar"><button class="btn ghost" id="hh_mais" type="button" hidden>Carregar mais</button></div>
  </section>`;
  form.parentNode.insertBefore(v,form.nextSibling);
  $("hh_nome").value=autor();
  $("hh_nome").oninput=e=>{ls.s(K.user,e.target.value.trim())};
  $("hh_r").onclick=async()=>{await enviar(true);carrega(true)};
  $("hh_mais").onclick=()=>carrega(false);
  $("hh_todos").onclick=()=>abre(null);
  $("hh_q").oninput=$("hh_a").onchange=$("hh_u").onchange=()=>pinta();
  $("hh_csv").onclick=csv;
  const dl=$("hh_dl");if(typeof FIXOS!=="undefined")dl.innerHTML=FIXOS.map(n=>`<option value="${E(n)}">`).join("");
}

function locais(){
  const q=fila();
  return q.filter(e=>!H.rid||e.rid===H.rid).map(e=>Object.assign({},e,{local:true}));
}
function todos(){
  const vistos=new Set(),out=[];
  locais().concat(H.itens).forEach(e=>{if(vistos.has(e.eid))return;vistos.add(e.eid);out.push(e)});
  return out.sort((a,b)=>b.t-a.t);
}
function filtra(arr){
  const q=sv($("hh_q").value).toLowerCase(),a=$("hh_a").value,u=$("hh_u").value;
  return arr.filter(e=>{
    if(a==="__mov"&&e.acao==="editado")return false;
    if(a==="__dados"&&e.acao!=="editado")return false;
    if(u&&(e.autor||"Não identificado")!==u)return false;
    if(q){const txt=[e.proc,e.end,e.autor,e.resumo,ACAO[e.acao],(e.det||[]).map(d=>d.campo+" "+d.de+" "+d.para).join(" ")].join(" ").toLowerCase();if(!txt.includes(q))return false}
    return true;
  });
}
function itemHTML(e){
  const cor=COR[e.acao]||"#4a5876",tp=(typeof TIPOS!=="undefined"&&TIPOS[e.tipo])||e.tipo||"";
  const det=(e.det||[]),vz='<span class="vz">(vazio)</span>';
  const proc=e.proc?"Processo "+E(e.proc):"Processo sem número";
  const nome=e.acao==="excluido"?`<strong>${proc}</strong>`:`<button type="button" class="hp" data-open="${E(e.rid)}" title="Abrir este processo">${proc}</button>`;
  return `<article class="hev" style="border-left-color:${cor}">
   <div class="hh"><span class="hb" style="background:${cor}">${E(ACAO[e.acao]||e.acao)}</span>${nome}${tp?`<span class="st tp">${E(tp)}</span>`:""}${e.local?'<span class="hq">aguardando envio</span>':""}</div>
   <p class="lbl hr">${E(fdh(e.t))} · ${E(e.autor||"Não identificado")}${e.end?" · "+E(e.end):""}</p>
   <p class="hr" style="margin-top:4px">${E(e.resumo||"")}</p>
   ${det.length?`<details><summary>Ver ${det.length} detalhe(s)</summary><ul class="hd">${det.map(d=>`<li><strong>${E(d.campo)}</strong>: ${d.de?`<span class="de">${E(d.de)}</span>`:vz} &rarr; ${d.para?`<span class="pa">${E(d.para)}</span>`:vz}</li>`).join("")}</ul></details>`:""}
  </article>`;
}
function pinta(){
  const box=$("hh_l");if(!box)return;
  const todosE=todos();
  // lista de autores
  const us=[...new Set(todosE.map(e=>e.autor||"Não identificado"))].sort(),sel=$("hh_u"),at=sel.value;
  sel.innerHTML='<option value="">Todos</option>'+us.map(u=>`<option value="${E(u)}">${E(u)}</option>`).join("");
  sel.value=us.includes(at)?at:"";
  const v=filtra(todosE);
  let h="",d0="";
  v.forEach(e=>{const d=dia(e.t);if(d!==d0){h+=`<h3 class="grp">${E(d)}</h3>`;d0=d}h+=itemHTML(e)});
  box.innerHTML=h||`<p class="empty">${H.carregando?"Carregando...":todosE.length?"Nenhum registro com esses filtros.":"Nenhum registro ainda. As alterações feitas a partir de agora aparecem aqui."}</p>`;
  $("hh_mais").hidden=!H.mais;
  $("hh_todos").hidden=!H.rid;
  const base=H.rid?"Histórico de um processo":"Histórico de todos os processos";
  const par=todosE.length?" · "+v.length+" de "+todosE.length+" registro(s) carregado(s)":"";
  const st=$("hh_st");
  if(H.erro){st.textContent=H.erro;st.style.color="#a63d2f"}
  else{st.style.color="";st.textContent=base+par+(ok?"":" · banco compartilhado não configurado: mostrando só o que foi feito neste aparelho")}
}
async function carrega(reset){
  if(!telaAberta()&&!reset)return;
  if(!ok){H.itens=[];H.mais=false;H.erro="";pinta();return}
  if(H.carregando)return;H.carregando=true;
  if(reset){H.itens=[];H.mais=false}
  H.erro="";pinta();
  try{
    const ult=!reset&&H.itens.length?H.itens[H.itens.length-1].t+1:null;
    const r=await rpc("rel_hist_list",{p:"",prid:H.rid,pantes:ult,plim:200});
    const vistos=new Set(H.itens.map(e=>e.eid));let novos=0;
    (r||[]).forEach(e=>{if(!vistos.has(e.eid)){H.itens.push(e);novos++}});
    H.mais=(r||[]).length>=200&&novos>0;
  }catch(e){
    const falta=/rel_hist|schema cache|Could not find/i.test(String(e&&e.message));
    H.erro=falta?"Falta atualizar o Supabase: rode de novo o arquivo supabase-setup.sql no SQL Editor para liberar o histórico. Enquanto isso os registros ficam guardados neste aparelho e são enviados depois.":"Não foi possível carregar o histórico agora. Verifique a conexão com a internet.";
  }finally{H.carregando=false;pinta()}
}
async function abre(rid){
  pedeNome();
  if(typeof flush==="function")await flush();
  if($("app").hidden){$("home").hidden=true;$("app").hidden=false}
  monta();
  H.rid=rid||null;
  $("hh_t").textContent=rid?"Histórico do processo":"Histórico de alterações e movimentações";
  $("hh_q").value="";$("hh_a").value="";$("hh_u").value="";$("hh_nome").value=autor();
  tela("hist");
  await enviar(true);
  carrega(true);
}
window.hAbrir=abre;

function csv(){
  const v=filtra(todos());if(!v.length){alert("Não há registros para baixar.");return}
  const q=t=>'"'+String(t==null?"":t).replace(/"/g,'""')+'"';
  const lin=[["Data e hora","Quem fez","Registro","Processo","Tipo","Endereço","Resumo","Detalhes"].map(q).join(";")];
  v.forEach(e=>lin.push([fdh(e.t),e.autor||"",ACAO[e.acao]||e.acao,e.proc||"",(typeof TIPOS!=="undefined"&&TIPOS[e.tipo])||e.tipo||"",e.end||"",e.resumo||"",
    (e.det||[]).map(d=>d.campo+": "+(d.de||"(vazio)")+" -> "+(d.para||"(vazio)")).join(" | ")].map(q).join(";")));
  const b=new Blob(["﻿"+lin.join("\r\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");
  a.href=URL.createObjectURL(b);a.download="historico-processos.csv";document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}

/* ---------- pergunta o nome na primeira vez ---------- */
function pedeNome(){
  if(autor())return;
  try{if(sessionStorage.getItem("relfoto_user_skip"))return}catch(e){}
  let m=$("hum");
  if(!m){
    m=document.createElement("div");m.id="hum";m.className="modal noprint";m.hidden=true;m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-labelledby","hum_t");
    m.innerHTML=`<div class="box"><h3 id="hum_t">Quem está usando?</h3>
     <p class="lbl" style="margin-top:0">Seu nome aparece no histórico ao lado de cada alteração que você fizer neste aparelho. Dá para trocar depois na tela do histórico.</p>
     <input id="hum_n" list="hum_dl" autocomplete="off" placeholder="Seu nome" aria-label="Seu nome" style="margin-bottom:14px"><datalist id="hum_dl"></datalist>
     <div class="bar"><button class="btn" id="hum_ok" type="button">Confirmar</button><button class="btn ghost" id="hum_no" type="button">Agora não</button></div></div>`;
    document.body.appendChild(m);
    $("hum_ok").onclick=()=>{const n=$("hum_n").value.trim();if(!n){$("hum_n").focus();return}ls.s(K.user,n);m.hidden=true;const e=$("hh_nome");if(e)e.value=n};
    $("hum_no").onclick=()=>{try{sessionStorage.setItem("relfoto_user_skip","1")}catch(e){}m.hidden=true};
    $("hum_n").onkeydown=e=>{if(e.key==="Enter")$("hum_ok").click()};
  }
  if(typeof FIXOS!=="undefined")$("hum_dl").innerHTML=FIXOS.map(n=>`<option value="${E(n)}">`).join("");
  m.hidden=false;$("hum_n").focus();
}

/* ---------- botões de entrada ---------- */
function liga(){
  css();monta();
  const ent=$("entrar");if(ent)ent.addEventListener("click",pedeNome);
  const he=$("hentrar");if(he)he.onclick=async()=>{if(typeof escolher==="function")await escolher();abre(null)};
  const hb=$("hbtn");if(hb)hb.onclick=()=>abre(null);
  const hf=$("hform");if(hf)hf.onclick=()=>{const id=typeof S!=="undefined"&&S&&S.id;abre(id||null)};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",liga);else liga();
})();
