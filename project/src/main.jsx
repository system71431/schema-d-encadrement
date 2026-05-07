import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

// Enregistrement du service worker (PWA installable). On garde l'enregistrement
// silencieux : si la résolution échoue (file://, environnement sans HTTPS,
// navigateur non supporté), on n'affiche rien — c'est un nice-to-have, pas
// une fonctionnalité requise. On skip aussi le mode viewer (page partagée
// autonome) parce que `./sw.js` n'y existe pas et le SW n'apporte rien là-bas.
if ("serviceWorker" in navigator) {
  const isViewer = !!document.querySelector('#schema-data[data-mode="viewer"]');
  if (!isViewer) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}
