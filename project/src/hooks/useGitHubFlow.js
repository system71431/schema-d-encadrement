// Hook qui orchestre les flux GitHub déclenchés depuis l'éditeur :
// - obtenir / mémoriser / oublier le token (via promptDialog)
// - partager (push HTML autonome → GitHub Pages)
// - publier la version officielle (push data.js)
// - télécharger l'HTML autonome localement
// - suivre l'état du build Pages après chaque push (toast quand live)
//
// Le hook expose les callbacks à brancher sur les boutons de la toolbar.
// Tout l'I/O réseau passe par les helpers de `share.js`.

import { useCallback, useState, useRef, useEffect } from "react";
import {
  GH_TOKEN_KEY,
  buildDataModuleSource,
  buildViewerHTML,
  fetchPagesBuildStatus,
  hasStoredToken,
  clearStoredToken,
  makeShareFilename,
  uploadFileToGitHub,
  uploadHtmlToGitHub,
} from "../share.js";
import { confirmDialog, infoDialog, promptDialog, toast } from "../feedback.jsx";

const TOKEN_HINT =
  "Recommandé : un fine-grained PAT limité à ce repo (Contents: read & write). " +
  "Mémorisé localement, jamais transmis ailleurs qu'à api.github.com.";

// Démarre un poll en arrière-plan pour suivre le build Pages déclenché par
// le commit `targetSha`. Toast de succès quand `status === "built"` et que
// le `commitSha` du build matche. Stoppe au bout de `maxAttempts` polls
// (~3 min avec 6s d'intervalle).
function startPagesPoll(token, targetSha, label) {
  if (!targetSha) return () => {};
  let cancelled = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 30;
  const INTERVAL_MS = 6000;
  const seenStatuses = new Set();
  let interval;
  const tick = async () => {
    if (cancelled) return;
    attempts++;
    const info = await fetchPagesBuildStatus(token);
    if (cancelled) return;
    if (info && info.status && !seenStatuses.has(info.status)) {
      seenStatuses.add(info.status);
      if (info.status === "built" && info.commitSha === targetSha) {
        toast.success(`${label} : déploiement terminé, la page est en ligne.`);
        clearInterval(interval);
        return;
      }
      if (info.status === "errored") {
        toast.error(`${label} : le build Pages a échoué. Vérifie l'onglet Actions sur GitHub.`);
        clearInterval(interval);
        return;
      }
    }
    if (attempts >= MAX_ATTEMPTS) {
      clearInterval(interval);
    }
  };
  // Premier check rapide (1s) puis intervalle régulier.
  const first = setTimeout(tick, 1000);
  interval = setInterval(tick, INTERVAL_MS);
  return () => {
    cancelled = true;
    clearTimeout(first);
    clearInterval(interval);
  };
}

async function ensureToken() {
  let token = "";
  try { token = localStorage.getItem(GH_TOKEN_KEY) || ""; } catch (_) {}
  if (token) return token;
  const r = await promptDialog({
    title: "Token GitHub requis",
    message: "Colle ton Personal Access Token. Tu peux en générer un sur https://github.com/settings/tokens.",
    fields: [{ name: "token", label: "Token", type: "password", autoComplete: "off", hint: TOKEN_HINT }],
    submitLabel: "Continuer",
  });
  if (!r || !r.values.token) return null;
  token = r.values.token.trim();
  try { localStorage.setItem(GH_TOKEN_KEY, token); } catch (_) {}
  return token;
}

export function useGitHubFlow({ nodes, links, header, draftKey }) {
  const [shareBusy, setShareBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const cancelPollRef = useRef(null);

  // Stoppe tout poll en cours quand le composant démonte (évite les toasts
  // tardifs quand l'utilisateur a déjà quitté l'app).
  useEffect(() => () => { if (cancelPollRef.current) cancelPollRef.current(); }, []);

  const onPublishOfficial = useCallback(async () => {
    if (publishBusy) return;
    const ok = await confirmDialog({
      title: "Publier la version officielle ?",
      message:
        "Cela remplace project/src/data.js sur GitHub. Tous les visiteurs (et tous tes appareils) recevront cette version après le re-deploy. Les brouillons d'édition non publiés sur les autres navigateurs seront purgés.",
      confirmLabel: "Publier",
      cancelLabel: "Annuler",
      variant: "danger",
    });
    if (!ok) return;
    const token = await ensureToken();
    if (!token) return;
    setPublishBusy(true);
    try {
      const newVersion = new Date().toISOString();
      const source = buildDataModuleSource(nodes, links, header, newVersion);
      const sha = await uploadFileToGitHub(
        token,
        "project/src/data.js",
        source,
        `Publication officielle (${newVersion})`
      );
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          nodes, links, header,
          savedAt: Date.now(),
          dataVersion: newVersion,
        }));
      } catch (_) {}
      toast.info("Push réussi. Build Pages en cours…");
      if (cancelPollRef.current) cancelPollRef.current();
      cancelPollRef.current = startPagesPoll(token, sha, "Publication");
    } catch (e) {
      toast.error("Échec de la publication : " + (e && e.message ? e.message : String(e)));
    } finally {
      setPublishBusy(false);
    }
  }, [nodes, links, header, publishBusy, draftKey]);

  const onShareViewer = useCallback(async () => {
    if (shareBusy) return;
    const token = await ensureToken();
    if (!token) return;
    const defaultName = (header && header.title) ? header.title : "schema";
    const r2 = await promptDialog({
      title: "Partager le schéma",
      message: "Choisis un nom pour la page partagée. Laisse vide pour un nom auto avec date.",
      fields: [{ name: "name", label: "Nom de page", defaultValue: defaultName, placeholder: "ex. asn-2026" }],
      submitLabel: "Publier",
    });
    if (!r2) return;
    const filename = makeShareFilename(r2.values.name);
    setShareBusy(true);
    try {
      const html = buildViewerHTML(nodes, links, header);
      const { url, commitSha } = await uploadHtmlToGitHub(token, filename, html);
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (_) {}
      await infoDialog({
        title: "Schéma partagé",
        message: copied
          ? "URL copiée dans le presse-papiers. Une notification s'affichera dès que GitHub Pages aura terminé le déploiement."
          : "Voici l'URL publique. Une notification s'affichera dès que GitHub Pages aura terminé le déploiement.",
        copyValue: url,
        okLabel: "Fermer",
      });
      if (cancelPollRef.current) cancelPollRef.current();
      cancelPollRef.current = startPagesPoll(token, commitSha, "Partage");
    } catch (e) {
      toast.error("Échec du partage : " + (e && e.message ? e.message : String(e)));
    } finally {
      setShareBusy(false);
    }
  }, [nodes, links, header, shareBusy]);

  const onGenerateViewer = useCallback(() => {
    try {
      const html = buildViewerHTML(nodes, links, header);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schema-encadrement-viewer-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("HTML autonome téléchargé.");
    } catch (e) {
      toast.error("Erreur lors de la génération du HTML : " + e.message);
    }
  }, [nodes, links, header]);

  // Permet d'effacer le token stocké depuis l'UI — utile quand on change
  // d'appareil ou qu'on régénère un PAT.
  const onForgetToken = useCallback(async () => {
    if (!hasStoredToken()) {
      toast.info("Aucun token GitHub mémorisé sur cet appareil.");
      return;
    }
    const ok = await confirmDialog({
      title: "Oublier le token GitHub ?",
      message: "Le token stocké localement sera effacé. Il faudra le ressaisir au prochain partage / publication.",
      confirmLabel: "Oublier",
      variant: "danger",
    });
    if (!ok) return;
    clearStoredToken();
    toast.success("Token effacé.");
  }, []);

  return {
    onShareViewer,
    onPublishOfficial,
    onGenerateViewer,
    onForgetToken,
    shareBusy,
    publishBusy,
  };
}
