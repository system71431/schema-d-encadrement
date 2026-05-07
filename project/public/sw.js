// Service worker minimal pour qualifier l'app en PWA installable. On ne
// fait pas de cache offline ici : le bundle est un single-file de ~500KB
// déjà servi avec un cache HTTP, et le partage GitHub Pages dépend de
// requêtes vers l'API GitHub qu'on ne veut surtout pas servir depuis un
// cache stale. Le SW se contente donc de prendre le contrôle de la page
// et de laisser le réseau gérer chaque requête.
//
// Si on veut un mode offline plus tard : intercepter `fetch` et servir
// `index.html` depuis caches.match en fallback. À ce moment-là, prévoir
// aussi un mécanisme de skipWaiting + invalidation à chaque deploy
// (sinon les utilisateurs restent figés sur l'ancienne version).
self.addEventListener("install", (e) => {
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});
