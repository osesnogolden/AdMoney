const CACHE = "admoney-v2-logo";
const ASSETS = [
  "./", "./index.html", "./login.html", "./registro.html", "./dashboard.html",
  "./css/styles.css", "./js/auth.js", "./js/storage.js", "./js/app.js",
  "./assets/logo.png", "./assets/favicon.png", "./assets/icon-192.png", "./assets/icon-512.png",
  "./manifest.webmanifest"
];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)).catch(() => caches.match("./index.html")));
});
