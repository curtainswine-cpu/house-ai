/* JARVIS service worker — makes the app open instantly and work offline.
   Bump CACHE whenever the app files change so phones pick up the update. */
const CACHE = "jarvis-v37";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./js/storage.js", "./js/routines.js", "./js/projects.js",
  "./js/trackers.js", "./js/finance.js", "./js/calendar.js", "./js/punjabi.js", "./js/food.js", "./js/shopping.js", "./js/app.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-180.png", "./icons/favicon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Let cross-origin requests (e.g. the Google Sheets finance CSV) always hit the network.
  if (new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
