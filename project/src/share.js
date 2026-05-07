// Helpers pour le flux de partage GitHub (Pages) :
// - constantes du repo cible
// - encodage UTF-8 → base64 robuste sur gros payload
// - construction du HTML autonome (mode viewer)
// - lecture du `<script id="schema-data">` éventuellement embarqué
// - source du module `data.js` régénéré par « Publier »
// - upload générique via l'API GitHub Contents (probe SHA + PUT)
//
// Mutualisé entre App.jsx et les hooks de flow (share / publish).

import {
  NODES as SEED_NODES,
  LINKS as SEED_LINKS,
  HEADER as SEED_HEADER,
} from "./data.js";

// Cible des partages : fichier HTML poussé via l'API GitHub Contents.
// Le repo est servi par GitHub Pages, donc tout fichier dans
// `project/public/shared/` est copié par Vite vers `dist/shared/` au build,
// puis publié à `https://<user>.github.io/<repo>/shared/<nom>.html`.
export const SHARE_REPO_OWNER = "system71431";
export const SHARE_REPO_NAME = "schema-d-encadrement";
export const SHARE_BRANCH = "main";
export const SHARE_PATH_PREFIX = "project/public/shared/";
export const SHARE_BASE_URL = `https://${SHARE_REPO_OWNER}.github.io/${SHARE_REPO_NAME}/shared/`;
export const GH_TOKEN_KEY = "schema-encadrement-gh-token";

// Encode une string UTF-8 en base64 — robuste sur les gros payloads (le HTML
// fait ~480 KB) où `btoa(String.fromCharCode(...))` casse à cause de la
// limite d'arguments. FileReader gère le streaming proprement.
export function utf8ToBase64(str) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([str]);
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || "").split(",")[1] || "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Slugifie un nom utilisateur en filename safe : ASCII bas, tirets, garde
// l'extension .html. Si vide, fallback sur un timestamp aléatoire.
export function makeShareFilename(rawName) {
  const base = (rawName || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) {
    const stamp = new Date().toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 7);
    return `schema-${stamp}-${rand}.html`;
  }
  return base.endsWith(".html") ? base : `${base}.html`;
}

// Push un blob HTML vers GitHub via l'API Contents. Si le fichier existe
// déjà au même chemin, on récupère son SHA pour faire un update plutôt
// qu'une création (sinon GitHub renvoie 422).
export async function uploadHtmlToGitHub(token, filename, html) {
  const path = SHARE_PATH_PREFIX + filename;
  const sha = await uploadFileToGitHub(token, path, html, `Partage du schéma : ${filename}`);
  // Cache-bust : on suffixe l'URL avec le SHA du commit qui vient d'être créé,
  // pour que le lien partagé pointe toujours sur la dernière version (sinon
  // GitHub Pages / le navigateur peuvent servir une copie cachée).
  return {
    url: sha ? `${SHARE_BASE_URL}${filename}?v=${sha}` : SHARE_BASE_URL + filename,
    commitSha: sha,
  };
}

// Push générique d'un fichier texte (UTF-8) vers le repo. Mutualise la
// logique « probe SHA si existe puis PUT » entre le partage HTML et la
// publication de la version officielle (data.js).
export async function uploadFileToGitHub(token, path, text, commitMessage) {
  const apiUrl = `https://api.github.com/repos/${SHARE_REPO_OWNER}/${SHARE_REPO_NAME}/contents/${path}`;
  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
  };
  let existingSha = null;
  try {
    // `cache: "no-store"` est crucial : sans ça, le navigateur peut servir
    // un 404 caché d'un précédent appel (quand le fichier n'existait pas
    // encore), ce qui fait qu'on n'envoie pas de `sha` au PUT et GitHub
    // renvoie 409 « does not match » parce que le fichier existe en réalité.
    const probe = await fetch(`${apiUrl}?ref=${SHARE_BRANCH}`, { headers, cache: "no-store" });
    if (probe.ok) {
      const data = await probe.json();
      existingSha = data && data.sha ? data.sha : null;
    }
  } catch (_) {}
  const content = await utf8ToBase64(text);
  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: commitMessage,
      content,
      branch: SHARE_BRANCH,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      try { localStorage.removeItem(GH_TOKEN_KEY); } catch (_) {}
      throw new Error(
        `Token GitHub refusé (${res.status}). Génère un nouveau Personal Access Token (fine-grained recommandé, scope « Contents: read & write » sur ce repo uniquement) sur https://github.com/settings/tokens et réessaie.`
      );
    }
    throw new Error(`Erreur GitHub ${res.status} : ${errBody.message || "échec inconnu"}`);
  }
  const body = await res.json().catch(() => ({}));
  return (body && body.commit && body.commit.sha) || null;
}

// Sérialise les données courantes vers le format attendu par data.js.
// On régénère un module ES propre avec les exports NODES/LINKS/HEADER/
// DATA_VERSION. La version est l'ISO timestamp courant : tout brouillon
// localStorage antérieur sera purgé automatiquement par App.jsx (cf. le
// useMemo `initial`) puisque sa `dataVersion` ne matchera plus.
export function buildDataModuleSource(nodes, links, header, version) {
  const j = (val) => JSON.stringify(val, null, 2);
  return (
    "// Fichier généré automatiquement par le bouton « Publier la version officielle ».\n" +
    "// La modification manuelle est OK, mais sera écrasée au prochain push depuis l'app.\n" +
    "\n" +
    `export const NODES = ${j(nodes)};\n` +
    "\n" +
    `export const LINKS = ${j(links)};\n` +
    "\n" +
    `export const HEADER = ${j(header)};\n` +
    "\n" +
    `export const DATA_VERSION = ${JSON.stringify(version)};\n`
  );
}

// Lit l'instantané JSON éventuellement embarqué dans
// <script id="schema-data" type="application/json">. Quand le bloc est vide
// (cas du bundle de base), on retombe sur les seeds importés depuis data.js.
// La feature « Générer page » écrit ses données ici pour produire un HTML
// autonome qui démarre sur l'état exporté.
export function loadInitialData() {
  try {
    const el = document.getElementById("schema-data");
    if (!el) return null;
    const raw = (el.textContent || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) return null;
    return {
      nodes: parsed.nodes,
      links: parsed.links,
      header: parsed.header || { title: "Schéma d'encadrement", subtitle: "" },
      mode: el.getAttribute("data-mode") || "editor",
    };
  } catch (_) {
    return null;
  }
}

const INITIAL_FROM_TAG = loadInitialData();
export const INITIAL_NODES = INITIAL_FROM_TAG ? INITIAL_FROM_TAG.nodes : SEED_NODES;
export const INITIAL_LINKS = INITIAL_FROM_TAG ? INITIAL_FROM_TAG.links : SEED_LINKS;
export const INITIAL_HEADER = INITIAL_FROM_TAG ? INITIAL_FROM_TAG.header : SEED_HEADER;
// Mode viewer : édition désactivée (boutons cachés). Utilisé par les pages
// générées pour figer l'export en lecture seule.
export const VIEWER_ONLY = !!(INITIAL_FROM_TAG && INITIAL_FROM_TAG.mode === "viewer");

// Génère un HTML autonome qui démarre sur les données courantes. Stratégie :
// le bundle Vite produit déjà un fichier auto-suffisant (CSS + JS inlinés via
// vite-plugin-singlefile), donc on clone le DOM courant et on remplace le
// contenu de <script id="schema-data"> par l'instantané sérialisé. La page
// générée se charge en mode viewer (data-mode="viewer" → édition désactivée).
export function buildViewerHTML(viewNodes, viewLinks, viewHeader) {
  const doc = document.documentElement.cloneNode(true);
  const dataEl = doc.querySelector("#schema-data");
  if (!dataEl) {
    throw new Error("Bloc <script id=\"schema-data\"> introuvable dans la page courante.");
  }
  const payload = {
    nodes: viewNodes,
    links: viewLinks,
    header: viewHeader || { title: "Schéma d'encadrement", subtitle: "" },
  };
  dataEl.textContent = JSON.stringify(payload);
  dataEl.setAttribute("data-mode", "viewer");
  return "<!doctype html>\n" + doc.outerHTML;
}

// Demande à GitHub le statut du dernier build Pages. Retourne la promesse
// d'un objet `{status, commitSha}` ou `null` si la requête échoue (l'app
// fonctionne sans, c'est juste une indication UX). `status` ∈
// {"queued", "building", "built", "errored", null}.
export async function fetchPagesBuildStatus(token) {
  const url = `https://api.github.com/repos/${SHARE_REPO_OWNER}/${SHARE_REPO_NAME}/pages/builds/latest`;
  try {
    const headers = { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" };
    if (token) headers.Authorization = `token ${token}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return {
      status: body.status || null,
      commitSha: body.commit || null,
    };
  } catch (_) {
    return null;
  }
}

// Wipe le token stocké. Exposé pour permettre une UI « oublier mon token »
// indépendamment du flux de partage.
export function clearStoredToken() {
  try { localStorage.removeItem(GH_TOKEN_KEY); } catch (_) {}
}
export function hasStoredToken() {
  try { return !!localStorage.getItem(GH_TOKEN_KEY); } catch (_) { return false; }
}
