const APP_VERSION = "1.5";
const CACHE = "catalogo-v5";
const SHELL = ["./", "index.html", "style.css", "app.js", "config.js", "manifest.json", "rm-logo.png", "icons/favicon.ico", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-192.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const big = e.request.url.includes("alt=media"); // fotos originais (grandes) não entram no cache
  // rede primeiro, cache como reserva (funciona offline com os últimos dados)
  e.respondWith(fetch(e.request).then(r => {
    if (!big && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});