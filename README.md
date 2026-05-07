# Schéma d'encadrement — Groupe scout

Application web pour visualiser et éditer le schéma d'encadrement d'un groupe
scout (qui supervise qui, qui collabore avec qui, qui fait quelles tâches).
Déployée automatiquement sur GitHub Pages depuis `main`.

- **App** : <https://system71431.github.io/schema-d-encadrement/>
- **Sources** : `project/`

## Développement

```bash
cd project
npm install
npm run dev      # HMR, http://localhost:5173
npm run build    # bundle single-file → dist/index.html (+ régen dist/shared/*.html)
npm run preview  # sert dist/ pour vérifier le bundle
npm test         # tests Playwright (mobile)
```

Le build produit un `dist/index.html` autonome (CSS + JS inlinés via
`vite-plugin-singlefile`), et régénère chaque `dist/shared/*.html` pour qu'il
contienne le bundle frais tout en préservant les données du schéma partagé.

## Partage public

Le bouton « Partager » dans l'app pousse un HTML autonome (mode viewer) sur ce
repo via l'API GitHub Contents, dans `project/public/shared/<nom>.html`. Après
le redéploiement Pages (~2 min), la page est accessible publiquement à
`https://system71431.github.io/schema-d-encadrement/shared/<nom>.html?v=<sha>`.
Le suffixe `?v=<sha>` du commit créé sert de cache-bust pour que le lien pointe
toujours sur la version qui vient d'être publiée.

L'opération nécessite un Personal Access Token GitHub. Un bouton « Oublier le
token GitHub » dans le panneau d'édition permet d'effacer le token mémorisé sur
l'appareil courant (utile sur un poste partagé ou après une rotation).

### Modèle de confiance et bonnes pratiques

- **Recommandé** : utiliser un *fine-grained PAT* limité à ce repo seul, avec
  les permissions « Contents: read & write » (et rien d'autre). Les tokens
  classiques scope `repo` fonctionnent aussi mais donnent accès à tous les
  repos privés du compte — sur-portée pour cet usage.
- Le token est stocké en `localStorage`, donc accessible à tout JS qui
  s'exécute sur l'origine. Concrètement : un `data.js` poussé hostilement
  (par un collaborateur ayant accès en écriture) peut exfiltrer le token. Le
  modèle de confiance est donc **le même que pour les collaborateurs du
  repo** — si tu acceptes leur accès en écriture, tu acceptes leur accès au
  PAT des autres.
- Pas de Device Flow OAuth : l'endpoint d'échange de code GitHub ne permet
  pas CORS, ce qui obligerait à introduire un backend. Vu la cible (un petit
  groupe scout), le PAT scope minimal est le compromis raisonnable.

## CI

`.github/workflows/deploy.yml` exécute build + tests Playwright sur chaque push
sur `main`, puis déploie `project/dist/` sur GitHub Pages.
