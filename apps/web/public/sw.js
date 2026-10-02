/* upay Compass service worker.
 *
 * Goal: after one online visit the app shell opens offline and shows the last data. The data itself
 * is not cached here; the app keeps the last read results in IndexedDB (see offline-cache.ts).
 * Supabase and every other cross-origin request is never touched.
 *
 *  - Static build assets (/_next/static, icons): cache-first (their URLs change with content).
 *  - Page navigations: network-first, falling back to the last copy of that page. The pages are
 *    client-rendered shells, so the HTML is the same for every user.
 *  - Anything else: straight to the network.
 */
const VERSION = "v1";
const PAGES = `compass-pages-${VERSION}`;
const ASSETS = `compass-assets-${VERSION}`;
const ROUTES = [
  "/",
  "/budgets",
  "/goals",
  "/coach",
  "/learn",
  "/transactions",
  "/score",
  "/forecast",
  "/nudges",
  // one page per learn module (keep in step with LEARN_SLUGS in packages/shared/src/learn.ts)
  ...[
    "budget-basics",
    "needs-vs-wants",
    "emergency-fund",
    "save-small",
    "mobile-money-safety",
    "irregular-income",
    "goals-that-stick",
    "borrowing-basics",
  ].map((slug) => `/learn/${slug}`),
];

const OFFLINE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>upay Compass</title><style>body{font-family:system-ui,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center}</style></head><body><p>You are offline and this page has not been saved yet. Reconnect and try again.<br><br>আপনি অফলাইনে আছেন এবং এই পেজটি এখনও সংরক্ষিত হয়নি। ইন্টারনেট চালু করে আবার চেষ্টা করুন।</p></body></html>';

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.allSettled(ROUTES.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("compass-") && k !== PAGES && k !== ASSETS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(url.pathname);
          return (
            cached ||
            new Response(OFFLINE_HTML, {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          );
        }),
    );
  }
});
