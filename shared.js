/* Relatórios compartilhados: sincronização com o Supabase (sem senha).
   O banco local (IndexedDB) continua sendo a base: funciona offline e sincroniza ao voltar a rede. */
(function(){
"use strict";
const C=window.SHARED_CONFIG||{};
const ok=C.URL&&C.KEY&&!/COLE_AQUI/.test(C.URL+C.KEY);
const $=id=>document.getElementById(id);
const ls={g:k=>{try{return localStorage.getItem(k)}catch(e){return null}},s:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}},d:k=>{try{localStorage.removeItem(k)}catch(e){}}};
const K={since:"relfoto_sh_since",pend:"relfoto_sh_pend",init:"relfoto_sh_init"};
let pw="",busy=false,mute=false,lastOk=0,online=null;

const pend=()=>{try{return JSON.parse(ls.g(K.pend)||"{}")}catch(e){return{}}};
const setPend=o=>ls.s(K.pend,JSON.stringify(o));

async function rpc(fn,args){
  const r=await fetch(C.URL.replace(/\/$/,"")+"/rest/v1/rpc/"+fn,{method:"POST",headers:{"Content-Type":"application/json",apikey:C.KEY},body:JSON.stringify(args)});
  const txt=await r.text();let j=null;try{j=JSON.parse(txt)}catch(e){}
  if(!r.ok){const m=(j&&j.message)||txt;const e=new Error(m);throw e}
  return j;
}

/* ---------- sincronização ---------- */
function status(t,cor){const e=$("shst");if(e){e.textContent=t;e.style.color=cor||""}}
function hora(){return new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}

async function pushAll(){
  const p=pend(),ids=Object.keys(p);if(!ids.length)return;
  const all=await dbAll(),by={};all.forEach(x=>by[x.id]=x);
  for(const id of ids){
    const op=p[id];
    if(op==="put"){const x=by[id];if(!x){delete p[id];continue}
      await rpc("rel_put",{p:pw,rid:id,rtipo:x.tipo||"habite",rdados:x,rt:x.t||0})}
    else await rpc("rel_del",{p:pw,rid:id,rt:p[id+"#t"]||Date.now()});
    delete p[id];delete p[id+"#t"];setPend(p);
  }
}

async function pull(){
  const since=parseInt(ls.g(K.since)||"0",10);
  const rows=await rpc("rel_list",{p:pw,since:Math.max(0,since-5000)});
  let max=since,mudou=0;
  if(rows.length){
    const all=await dbAll(),by={};all.forEach(x=>by[x.id]=x);const pd=pend();
    mute=true;
    try{for(const r of rows){
      max=Math.max(max,r.atualizado||0);
      const l=by[r.id];if(pd[r.id])continue;           // alteração local ainda não enviada: ela vence
      if(r.apagado){if(l&&(l.t||0)<=r.t){await dbDel(r.id);mudou++}}
      else if(r.dados&&(!l||(l.t||0)<r.t)){const o=r.dados;o.id=r.id;await dbPut(o);mudou++}
    }}finally{mute=false}
  }
  ls.s(K.since,String(max));
  return mudou;
}

let espera=0;
async function sync(manual){
  if(!ok||busy)return;
  if(typeof DB==='undefined'||!DB){if(espera++<40)setTimeout(sync,250);return}
  busy=true;
  try{
    if(!ls.g(K.init)){const p=pend();(await dbAll()).forEach(x=>{if(!p[x.id])p[x.id]="put"});setPend(p);ls.s(K.init,"1")}
    await pushAll();
    const n=await pull();
    lastOk=Date.now();online=true;
    status("Compartilhado e sincronizado às "+hora()+(Object.keys(pend()).length?"":""));
    if(n&&typeof list==="function")await list();
  }catch(e){
    {online=false;const np=Object.keys(pend()).length;status("Sem conexão com o servidor"+(np?" — "+np+" alteração(ões) aguardando envio":""),"#a63d2f")}
  }finally{busy=false}
}

window.syncPut=o=>{if(!ok||mute||!o||!o.id)return;const p=pend();p[o.id]="put";setPend(p);clearTimeout(window.__shT);window.__shT=setTimeout(sync,800)};
window.syncDel=id=>{if(!ok||mute)return;const p=pend();p[id]="del";p[id+"#t"]=Date.now();setPend(p);clearTimeout(window.__shT);window.__shT=setTimeout(sync,300)};

function homeUI(){
  const h=$("home");if(!h||$("shbox"))return;
  const b=document.createElement("div");b.id="shbox";b.className="gbox noprint";
  b.innerHTML='<h2>Relatórios compartilhados</h2><p class="lbl" style="margin:0 0 8px">Os relatórios são salvos no servidor e aparecem para todos que abrirem o app.</p><p class="lbl" id="shst" role="status">Conectando...</p><div class="bar"><button class="btn ghost sm" id="shnow" type="button">Sincronizar agora</button></div>';
  const g=h.querySelector(".gbox");g?h.insertBefore(b,g):h.appendChild(b);
  $("shnow").onclick=()=>sync(true);
}

let started=false;
function start(){
  if(started){sync();return}
  started=true;homeUI();sync();
  setInterval(()=>{if(!document.hidden)sync()},30000);
  addEventListener("online",()=>sync());
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
}

/* ---------- partida ---------- */
function boot(){
  if(!ok){return}                       // sem configuração: modo local
  start()
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
