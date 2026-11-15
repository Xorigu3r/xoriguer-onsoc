// Funcionament sense connexió de la interfície (només a la versió web; l'app porta els fitxers a dins).
// Les dades (servidor) i les rajoles del mapa sempre van per la xarxa.
const CACHE = 'xoriguer-onsoc-v6';
const FITXERS = ['./', 'index.html', 'style.css', 'app.js', 'cripto.js', 'config.js', 'i18n.js', 'traduccions.js', 'guia-traduccions.js', 'veure.html', 'veure.js', 'capacitor.js', 'manifest.webmanifest',
  'lib/leaflet.js', 'lib/leaflet.css', 'fonts/Montserrat-ExtraBold.ttf',
  'icons/simbol.png', 'icons/favicon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo-complet.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FITXERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((r) => {
    const xarxa = fetch(e.request).then((resp) => {
      if (resp.ok) caches.open(CACHE).then((c) => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => r);
    return r || xarxa;
  }));
});
