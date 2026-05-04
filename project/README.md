# Schéma d'encadrement — sources

Application React (Vite) servant à visualiser et éditer le schéma d'encadrement
d'un groupe scout. Le build produit un **HTML autonome** (CSS + JS inlinés)
qu'on peut envoyer par email ou ouvrir en `file://`.

## Développement

```bash
npm install
npm run dev      # serveur de dev avec HMR sur http://localhost:5173
npm run build    # produit dist/index.html (single-file)
npm run preview  # sert dist/ pour vérifier le bundle
```

## Architecture

- `index.html` — entrée Vite (charge `src/main.jsx` + slot `<script id="schema-data">`)
- `src/data.js` — seed du schéma (NODES, LINKS, HEADER, DATA_VERSION)
- `src/Schema.jsx` — rendu SVG du schéma (nœuds, liens, drag, ancrages)
- `src/Popup.jsx` — popup d'info sur un nœud / lien (mode lecture)
- `src/EditorPanel.jsx` — panneau latéral d'édition
- `src/App.jsx` — orchestration, undo/redo, brouillon localStorage, exports
- `src/main.jsx` — montage React
- `src/styles.css` — styles
- `vite.config.js` — config Vite + `vite-plugin-singlefile`

## Feature « Générer page »

Le bouton « Générer page » dans le panneau d'édition produit un HTML autonome
qui démarre sur l'état courant. Implémentation : on clone
`document.documentElement.outerHTML` (auto-suffisant grâce à `vite-plugin-singlefile`)
et on injecte les données dans `<script id="schema-data" type="application/json">`
avec `data-mode="viewer"` pour désactiver l'édition.

## Migration depuis l'ancienne pipeline

Avant : `build.py` concaténait `template.html` + sources `.jsx` + `data.js` +
`styles.css` ; React/Babel chargés via CDN, transpilation runtime. Les
composants communiquaient via des globales `window.*`.

Maintenant : Vite + `@vitejs/plugin-react` + `vite-plugin-singlefile`. Les
sources utilisent les imports ES standard. `html2canvas` est une dépendance
npm. La cohérence cross-fichier passe par les props (Popup reçoit `nodes`/`links`
de App), plus de globales.
