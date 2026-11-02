const CACHE = "vistorias-v29";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./drive-config.js",
  "./shared-config.js",
  "./shared.js",
  "./historico.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

// Instalação tolerante: se um arquivo (ex.: um ícone) não existir, o resto é guardado mesmo assim.
// Antes, um único 404 derrubava a instalação inteira e o aparelho ficava preso na versão antiga.
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ARQUIVOS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro; se a rede demorar mais de 5 s ou falhar, usa o cache (evita ficar travado em sinal fraco)
function redePrimeiro(req, chave) {
  return new Promise(resolve => {
    let fim = false;
    const usaCache = () => caches.match(chave || req).then(h => { if (!fim && h) { fim = true; resolve(h); } });
    const t = setTimeout(usaCache, 5000);
    fetch(req).then(r => {
      clearTimeout(t);
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(chave || req, c)); }
      if (!fim) { fim = true; resolve(r); }
    }).catch(() => {
      clearTimeout(t);
      caches.match(chave || req).then(h => { if (!fim) { fim = true; resolve(h || Response.error()); } });
    });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Supabase, Google (login/Drive) e outros domínios: sempre pela rede, sem cache
  if (url.origin !== location.origin) return;

  // Dados grandes (GeoJSON do mapa): o app controla a atualização; não passa pelo cache do service worker
  if (url.pathname.includes("/dados/")) return;

  // Navegação: rede primeiro (pega versão nova), cache como reserva offline
  if (req.mode === "navigate") {
    e.respondWith(redePrimeiro(req, "./index.html"));
    return;
  }

  // Todo código e configuração (.js, .html, .webmanifest): rede primeiro, para as correções chegarem em todos os aparelhos
  if (/\.(js|html|webmanifest)$/.test(url.pathname)) {
    e.respondWith(redePrimeiro(req));
    return;
  }

  // Imagens e ícones: cache primeiro, atualiza em segundo plano
  e.respondWith(
    caches.match(req).then(hit => {
      const rede = fetch(req).then(r => {
        if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone()));
        return r;
      }).catch(() => hit);
      return hit || rede;
    })
  );
});
