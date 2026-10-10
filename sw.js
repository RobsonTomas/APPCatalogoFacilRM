const CACHE = "catalogo-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // rede primeiro, cache como reserva (funciona offline com os últimos dados)
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    if (r.ok || r.type === "opaque") caches.open(CACHE).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
