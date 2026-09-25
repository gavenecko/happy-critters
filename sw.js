// Happy Critters service worker — offline play with painless updates.
// assemble.py stamps VERSION with a content hash, so every release changes sw.js; browsers then install the new worker,
// which pre-caches the fresh files and deletes old caches.
const VERSION = "v5-dcef90d225"; // stamped by assemble.py (content hash)
const CACHE = "happy-critters-" + VERSION;
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-64.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("happy-critters-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isPage(req, url) {
  return req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
}

// The game page: network-first (revalidating past the HTTP cache) so a new push shows up
// on the next launch; falls back to the cached copy when offline or the network is slow.
async function pageFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(req, { cache: "no-cache", signal: ctrl.signal });
    clearTimeout(timer);
    if (res && res.ok) cache.put("./index.html", res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match("./index.html")) || (await cache.match("./"));
    if (hit) return hit;
    throw e;
  }
}

// Icons / manifest: stale-while-revalidate.
async function assetSWR(req, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { event.waitUntil(net); return hit; }
  const res = await net;
  return res || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;
  if (isPage(req, url)) event.respondWith(pageFirst(req));
  else event.respondWith(assetSWR(req, event));
});
