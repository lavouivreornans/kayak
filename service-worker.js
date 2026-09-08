// ============================================================================
// Service worker — cache l'app shell pour un fonctionnement hors-ligne.
// Les appels réseau (Google Drive, météo, Hub'Eau…) ne sont volontairement
// PAS mis en cache : on veut toujours des données fraîches quand il y a du
// réseau, et l'appli gère elle-même le mode hors-ligne (voir js/store.js).
// ============================================================================

const CACHE_NAME = "edp-kayak-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/drive.js",
  "./js/store.js",
  "./js/geo.js",
  "./js/weather.js",
  "./js/sessions.js",
  "./js/users.js",
  "./js/evaluations.js",
  "./js/progression.js",
  "./js/charts.js",
  "./js/config.js",
  "./js/session-context.js",
  "./js/ui/saisie.js",
  "./js/ui/consultation.js",
  "./js/ui/progression-ui.js",
  "./js/ui/reglages.js",
  "./js/ui/toast.js",
  "./data/pagaies-couleur.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Ne gère que les requêtes vers notre propre origine (app shell). Tout le
  // reste (googleapis.com, open-meteo.com, hubeau.eaufrance.fr, overpass,
  // nominatim…) part directement au réseau, sans passer par le cache.
  if (url.origin !== self.location.origin) return;

  // Réseau en priorité (l'appli évolue souvent : on veut toujours le code à
  // jour quand il y a de la connexion) ; le cache ne sert que de secours
  // hors-ligne.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
