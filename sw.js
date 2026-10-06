const CACHE = "vistorias-v3";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./drive-config.js",
  "./shared-config.js",
  "./shared.js",
  "./icons/logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Google (login/Drive) e outros domínios: sempre pela rede, sem cache
  if (url.origin !== location.origin) return;

  // Navegação: rede primeiro (pega versão nova), cache como reserva offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(r => {
        const copia = r.clone();
        caches.open(CACHE).then(c => c.put("./index.html", copia));
        return r;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Configuração do Drive: rede primeiro, para a edição valer na hora
  if ((url.pathname.endsWith("/drive-config.js")||url.pathname.endsWith("/shared-config.js")||url.pathname.endsWith("/shared.js"))) {
    e.respondWith(
      fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(req, c)); return r; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Demais arquivos: cache primeiro, atualiza em segundo plano
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
