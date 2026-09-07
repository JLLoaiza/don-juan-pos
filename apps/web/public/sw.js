// Bump CACHE_VERSION whenever the app shell should be invalidated. There is no
// build-time manifest generation yet, so this cannot be derived automatically.
const CACHE_VERSION = "dj-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only same-origin GET requests for the shell/static assets are cached.
  // Every other request (API calls included) always goes to the network so a
  // mutating response is never served as if it were still true.
  const isStaticAsset =
    request.method === "GET" && url.origin === self.location.origin && (APP_SHELL.includes(url.pathname) || url.pathname.startsWith("/assets/"));

  if (!isStaticAsset) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
