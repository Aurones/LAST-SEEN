const CACHE = "last-seen-episode01-1.1.0";
const entry = "./index.html";
const files = [
  entry, "./style.css?v=1.1", "./script.mjs?v=1.1", "./game.mjs", "./views.mjs",
  "./people.mjs", "./materials.mjs", "./manifest.webmanifest",
  ...["wallpaper.svg", "icon.svg", "icon-192.png", "icon-512.png", "parking.jpg",
    "flat.jpg", "tram.jpg", "coffee.jpg", "vera.jpg", "mark.jpg", "alina.jpg",
    "pavel.jpg", "nina.jpg", "denis.jpg"].map(file => "./assets/" + file),
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(files.map(file => new Request(file, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("last-seen-episode01-") && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const known = files.some(file => new URL(file, scope).href === url.href);
  if (request.mode !== "navigate" && !known) return;
  event.respondWith(fetch(request, { cache: "no-cache" }).then(async response => {
    if (response.ok && known) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(request.mode === "navigate" ? new URL(entry, scope) : request)) ?? Response.error();
  }));
});
