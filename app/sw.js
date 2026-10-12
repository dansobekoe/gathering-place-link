/* Gathering Place service worker.
   Keeps the app shell openable when the portal cannot be reached, and remembers the
   app's own files so the next launch does not wait on the network. It never answers
   for the API — live data is only ever live data; if the portal is down, the screens
   say so rather than showing yesterday as if it were today. */
const CACHE = "gathering-place-v2";

/* The folder this worker answers for, as a full address. Read rather than written down,
   because the same file is published in two places: the top of the portal's own address,
   and a folder of the fixed public page. A rooted "/" would store the wrong shell in the
   second, and would claim every other page on that domain as its own. */
const SHELL = self.registration.scope;
const ROOT = new URL(SHELL).pathname;   // always ends in "/"

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache:"reload" goes past the browser's own cache, so the stored shell is the
    // page the server serves today, not a copy of a copy.
    await cache.put(SHELL, await fetch(SHELL, { cache: "reload" }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Anything on another address is none of this worker's business — including, on the
  // published copy, every call to the portal itself, which lives on a laptop elsewhere.
  if (url.origin !== self.location.origin) return;
  // Live data: registration, marks, messages. Pass it straight through untouched.
  if (url.pathname.startsWith(ROOT + "api/")) return;

  // A full page load: try the network first so an update is never held back, and
  // fall back to the stored shell only when the portal itself cannot be reached.
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request);
        const cache = await caches.open(CACHE);
        cache.put(SHELL, fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        const shell = await cache.match(SHELL);
        return shell || Response.error();
      }
    })());
    return;
  }

  // The app's own files and uploaded pictures. Their URLs carry a version number
  // (?v=NN), so a stored copy is always exactly the file its address names.
  const isStatic = url.pathname.startsWith(ROOT + "assets/")
                || url.pathname.startsWith(ROOT + "media/");
  if (isStatic && event.request.method === "GET") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      try {
        const fresh = await fetch(event.request);
        const length = Number(fresh.headers.get("content-length") || "0");
        if (fresh.ok && length < 2000000) cache.put(event.request, fresh.clone());
        return fresh;
      } catch (err) {
        return Response.error();
      }
    })());
  }
});
