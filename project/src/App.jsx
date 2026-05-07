import React, { useState, useEffect, useMemo, useCallback } from "react";
import Schema from "./Schema.jsx";
import Popup from "./Popup.jsx";
import EditorPanel from "./EditorPanel.jsx";
import {
  NODES as SEED_NODES,
  LINKS as SEED_LINKS,
  HEADER as SEED_HEADER,
  DATA_VERSION,
} from "./data.js";
import logoUrl from "./logo-scoutisme-neuchatelois.png";
import { FeedbackHost, toast, confirmDialog, promptDialog, infoDialog } from "./feedback.jsx";
import "./styles.css";

// html2canvas est importé dynamiquement uniquement à l'export PNG (cf.
// onExportPNG) pour ne pas peser dans le bundle initial — il représente
// ~30% du JS et n'est pas utilisé sur la version partagée.

// Cible des partages : fichier HTML poussé via l'API GitHub Contents.
// Le repo est servi par GitHub Pages, donc tout fichier dans
// `project/public/shared/` est copié par Vite vers `dist/shared/` au build,
// puis publié à `https://<user>.github.io/<repo>/shared/<nom>.html`.
const SHARE_REPO_OWNER = "system71431";
const SHARE_REPO_NAME = "schema-d-encadrement";
const SHARE_BRANCH = "main";
const SHARE_PATH_PREFIX = "project/public/shared/";
const SHARE_BASE_URL = `https://${SHARE_REPO_OWNER}.github.io/${SHARE_REPO_NAME}/shared/`;
const GH_TOKEN_KEY = "schema-encadrement-gh-token";

// Encode une string UTF-8 en base64 — robuste sur les gros payloads (le HTML
// fait ~480 KB) où `btoa(String.fromCharCode(...))` casse à cause de la
// limite d'arguments. FileReader gère le streaming proprement.
function utf8ToBase64(str) {
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
function makeShareFilename(rawName) {
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
async function uploadHtmlToGitHub(token, filename, html) {
  const path = SHARE_PATH_PREFIX + filename;
  const sha = await uploadFileToGitHub(token, path, html, `Partage du schéma : ${filename}`);
  // Cache-bust : on suffixe l'URL avec le SHA du commit qui vient d'être créé,
  // pour que le lien partagé pointe toujours sur la dernière version (sinon
  // GitHub Pages / le navigateur peuvent servir une copie cachée).
  return sha ? `${SHARE_BASE_URL}${filename}?v=${sha}` : SHARE_BASE_URL + filename;
}

// Push générique d'un fichier texte (UTF-8) vers le repo. Mutualise la
// logique « probe SHA si existe puis PUT » entre le partage HTML et la
// publication de la version officielle (data.js).
async function uploadFileToGitHub(token, path, text, commitMessage) {
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
        `Token GitHub refusé (${res.status}). Génère un nouveau Personal Access Token avec scope « repo » sur https://github.com/settings/tokens et réessaie.`
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
function buildDataModuleSource(nodes, links, header, version) {
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
function loadInitialData() {
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
const INITIAL_NODES = INITIAL_FROM_TAG ? INITIAL_FROM_TAG.nodes : SEED_NODES;
const INITIAL_LINKS = INITIAL_FROM_TAG ? INITIAL_FROM_TAG.links : SEED_LINKS;
const INITIAL_HEADER = INITIAL_FROM_TAG ? INITIAL_FROM_TAG.header : SEED_HEADER;
// Mode viewer : édition désactivée (boutons cachés). Utilisé par les pages
// générées pour figer l'export en lecture seule.
const VIEWER_ONLY = !!(INITIAL_FROM_TAG && INITIAL_FROM_TAG.mode === "viewer");

const HIST_LIMIT = 50;
// Brouillon : auto-save dans localStorage pendant l'édition, pour ne pas
// perdre les modifs au reload. La cohérence avec `data.js` est garantie par
// la `DATA_VERSION` : un brouillon dont la version diffère de celle du
// fichier est considéré obsolète et purgé silencieusement.
const DRAFT_KEY = "schema-encadrement-draft";

function Doodles() {
  return (
    <>
      {/* Soleil — coin haut droit */}
      <svg className="doodle doodle--rotate-2" style={{top: 22, right: 280, width: 70, height: 70}} viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <circle cx="30" cy="30" r="11"/>
        <path d="M30 4 v8 M30 48 v8 M4 30 h8 M48 30 h8 M11 11 l5.5 5.5 M44 44 l5.5 5.5 M49 11 l-5.5 5.5 M11 49 l5.5 -5.5"/>
      </svg>
      {/* Étoile — milieu gauche */}
      <svg className="doodle doodle--rotate-1" style={{top: 200, left: 18, width: 44, height: 44, color: 'var(--red)'}} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4 l4.5 11 l11.5 0.8 l-9 7.5 l3 11.5 l-10 -6.5 l-10 6.5 l3 -11.5 l-9 -7.5 l11.5 -0.8 z"/>
      </svg>
      {/* Étincelles */}
      <svg className="doodle doodle--rotate-3" style={{top: 96, left: 280, width: 36, height: 36, color: 'var(--green)'}} viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M15 3 v8 M15 19 v8 M3 15 h8 M19 15 h8"/>
      </svg>
      {/* Nuage — milieu droit */}
      <svg className="doodle doodle--rotate-3" style={{top: 240, right: 50, width: 80, height: 50, color: 'var(--ink)'}} viewBox="0 0 80 50" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 38 q-10 0 -10 -10 q0 -8 8 -10 q1 -10 13 -10 q9 0 12 7 q3 -2 7 -2 q9 0 11 9 q9 1 9 9 q0 7 -8 7 z"/>
      </svg>
      {/* Sapin — bas gauche */}
      <svg className="doodle doodle--rotate-1" style={{bottom: 140, left: 14, width: 40, height: 56, color: 'var(--green)'}} viewBox="0 0 40 56" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4 l-12 18 h6 l-10 14 h8 l-10 12 h36 l-10 -12 h8 l-10 -14 h6 z"/>
        <path d="M20 48 v6"/>
      </svg>
      {/* Tente — bas droite */}
      <svg className="doodle doodle--rotate-2" style={{bottom: 110, right: 18, width: 64, height: 48, color: 'var(--ink)'}} viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 42 l28 -36 l28 36 z"/>
        <path d="M32 6 v36"/>
        <path d="M22 42 l10 -14 l10 14"/>
      </svg>
      {/* Flèche pointillée */}
      <svg className="doodle" style={{top: 90, right: 100, width: 80, height: 30, color: 'var(--blue)'}} viewBox="0 0 80 30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 5">
        <path d="M4 22 q20 -22 60 -10"/>
        <path d="M58 6 l8 6 l-4 9" fill="none" strokeDasharray="0"/>
      </svg>
    </>
  );
}

function Legend() {
  return (
    <div className="legend">
      <div className="legend__item">
        <svg width="48" height="14" viewBox="0 0 48 14">
          <line x1="2" y1="7" x2="38" y2="7" className="legend-line legend-line--enc" vectorEffect="non-scaling-stroke"/>
          <path d="M 36 2 L 44 7 L 36 12 z" className="legend-arrow legend-arrow--enc"/>
        </svg>
        <span><strong>Encadrement</strong> — relation hiérarchique</span>
      </div>
      <div className="legend__item">
        <svg width="48" height="14" viewBox="0 0 48 14">
          <path d="M 12 2 L 4 7 L 12 12 z" className="legend-arrow legend-arrow--coll"/>
          <line x1="10" y1="7" x2="38" y2="7" className="legend-line legend-line--coll" vectorEffect="non-scaling-stroke"/>
          <path d="M 36 2 L 44 7 L 36 12 z" className="legend-arrow legend-arrow--coll"/>
        </svg>
        <span><strong>Collaboration</strong> — échange dans les deux sens</span>
      </div>
      <div className="legend__item legend__item--badge">
        <span className="legend-badge" aria-hidden="true">
          <svg viewBox="0 0 14 14">
            <path d="M 3.5 7.5 L 6 10 L 11 4.5" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span><strong>Tâches disponibles</strong> — cliquer pour les voir</span>
      </div>
    </div>
  );
}

// Génère un HTML autonome qui démarre sur les données courantes. Stratégie :
// le bundle Vite produit déjà un fichier auto-suffisant (CSS + JS inlinés via
// vite-plugin-singlefile), donc on clone le DOM courant et on remplace le
// contenu de <script id="schema-data"> par l'instantané sérialisé. La page
// générée se charge en mode viewer (data-mode="viewer" → édition désactivée).
function buildViewerHTML(viewNodes, viewLinks, viewHeader) {
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

function App() {
  const seed = useMemo(() => ({
    nodes: JSON.parse(JSON.stringify(INITIAL_NODES)),
    links: JSON.parse(JSON.stringify(INITIAL_LINKS)),
    header: JSON.parse(JSON.stringify(INITIAL_HEADER || { title: "Schéma d'encadrement", subtitle: "du groupe scout — qui encadre qui ?" })),
  }), []);

  // Initialisation : si un brouillon localStorage existe ET correspond à la
  // même DATA_VERSION que `data.js`, on le restaure silencieusement (l'user
  // retrouve ses modifs au reload). Sinon, on part des données du fichier.
  const initial = useMemo(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && Array.isArray(draft.nodes) && Array.isArray(draft.links)) {
          if ((draft.dataVersion || null) === (DATA_VERSION || null)) {
            return {
              nodes: draft.nodes,
              links: draft.links,
              header: draft.header || seed.header,
            };
          } else {
            // Brouillon obsolète (data.js a été mis à jour) → purge silencieuse.
            localStorage.removeItem(DRAFT_KEY);
          }
        }
      }
    } catch (_) {}
    return seed;
  }, [seed]);

  const [nodes, setNodes] = useState(initial.nodes);
  const [links, setLinks] = useState(initial.links);
  const [header, setHeader] = useState(initial.header);

  const [filter, setFilter] = useState("all");
  const [selection, setSelection] = useState(null);
  const [hover, setHover] = useState(null);
  const [popupAt, setPopupAt] = useState(null);

  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState(null);
  const [linkDrawing, setLinkDrawing] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  // Historique undo/redo. On ne sauvegarde que `{nodes, links}`. La sélection
  // et l'état d'édition ne sont pas dans l'historique (volontaire : un undo ne
  // doit pas rouvrir un panneau qu'on vient de fermer).
  const [history, setHistory] = useState({ undo: [], redo: [] });
  const pushHistory = useCallback(() => {
    setHistory((h) => ({
      undo: [...h.undo, { nodes, links }].slice(-HIST_LIMIT),
      redo: [],
    }));
  }, [nodes, links]);
  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.undo.length) return h;
      const prev = h.undo[h.undo.length - 1];
      setNodes(prev.nodes);
      setLinks(prev.links);
      return {
        undo: h.undo.slice(0, -1),
        redo: [...h.redo, { nodes, links }].slice(-HIST_LIMIT),
      };
    });
  }, [nodes, links]);
  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.redo.length) return h;
      const next = h.redo[h.redo.length - 1];
      setNodes(next.nodes);
      setLinks(next.links);
      return {
        undo: [...h.undo, { nodes, links }].slice(-HIST_LIMIT),
        redo: h.redo.slice(0, -1),
      };
    });
  }, [nodes, links]);
  const canUndo = history.undo.length > 0;
  const canRedo = history.redo.length > 0;

  // Auto-save brouillon : à chaque modification de nodes/links/header, on
  // écrit dans localStorage. Inclut DATA_VERSION pour pouvoir détecter les
  // brouillons obsolètes (= antérieurs à une mise à jour de data.js).
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        nodes, links, header,
        savedAt: Date.now(),
        dataVersion: DATA_VERSION || null,
      }));
    } catch (_) {}
  }, [nodes, links, header]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (linkDrawing) { setLinkDrawing(null); return; }
      if (editing) { setEditing(null); return; }
      setSelection(null);
      setPopupAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, linkDrawing]);

  // Raccourcis undo/redo : actifs en mode édition uniquement, et ignorés
  // quand le focus est dans un champ de saisie (pour ne pas casser le
  // Ctrl+Z natif de l'<input>).
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const t = e.target;
      const tag = (t && t.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, undo, redo]);

  const enterEdit = () => {
    setEditMode(true);
    setSelection(null);
    setPopupAt(null);
    setHover(null);
  };

  const exitEdit = () => {
    setEditMode(false);
    setEditing(null);
    setLinkDrawing(null);
    setSelection(null);
    setPopupAt(null);
  };

  const pickNode = (id, ev) => {
    if (editMode) {
      if (linkDrawing) {
        if (!linkDrawing.from) {
          setLinkDrawing({ from: id });
          return;
        }
        if (linkDrawing.from === id) return;
        const newLink = {
          id: `l-${Date.now()}`,
          from: linkDrawing.from,
          to: id,
          kind: "encadrement",
          label: "Nouveau",
          description: "",
        };
        pushHistory();
        setLinks((prev) => [...prev, newLink]);
        setLinkDrawing(null);
        setEditing({ type: "link", id: newLink.id });
        return;
      }
      const isMulti = ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey);
      if (isMulti) {
        setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
        return;
      }
      setSelectedIds([id]);
      setEditing({ type: "node", id });
      return;
    }
    const x = ev?.clientX ?? window.innerWidth / 2;
    const y = ev?.clientY ?? window.innerHeight / 2;
    setSelection({ type: "node", id });
    setPopupAt({ x, y, kind: "node", id });
  };

  const onFuseSelected = () => {
    if (selectedIds.length < 2) return;
    const sel = nodes.filter((n) => selectedIds.includes(n.id));
    const existing = sel.find((n) => n.groupId);
    const groupId = existing ? existing.groupId : `g-${Date.now()}`;
    pushHistory();
    setNodes((prev) => prev.map((n) =>
      selectedIds.includes(n.id) ? { ...n, groupId } : n
    ));
  };

  const onClearMultiSelection = () => {
    setSelectedIds([]);
  };

  const pickLink = (id, ev) => {
    if (editMode) {
      setEditing({ type: "link", id });
      return;
    }
    // En mode lecture : pas de popup pour les liens. Toggle de surlignage
    // uniquement (clic à nouveau sur le même lien le déselectionne).
    setPopupAt(null);
    setSelection((prev) => (prev?.type === "link" && prev.id === id) ? null : { type: "link", id });
  };

  const closePopup = () => {
    if (editMode) {
      setEditing(null);
      if (linkDrawing && !linkDrawing.from) setLinkDrawing(null);
      return;
    }
    setSelection(null);
    setPopupAt(null);
  };

  // Mutations en mode édition. Les mutations ATOMIQUES (formulaire, suppression,
  // ajout, fusion) appellent `pushHistory()` avant de muter. Les mutations
  // CONTINUES (drag de nœud, drag de label, drag de poignée d'ancrage) ne
  // poussent pas ici : Schema appelle `onPushHistory` une seule fois au début
  // du drag, sinon on aurait une entrée d'historique par pixel parcouru.
  const onNodeMove = (id, x, y) =>
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  const onNodeUpdate = (id, next) => {
    pushHistory();
    setNodes((prev) => prev.map((n) => (n.id === id ? next : n)));
  };
  const onNodeDelete = (id) => {
    pushHistory();
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setLinks((prev) => prev.filter((l) => l.from !== id && l.to !== id));
    setEditing(null);
  };
  const onLinkUpdate = (id, next) => {
    pushHistory();
    setLinks((prev) => prev.map((l) => (l.id === id ? next : l)));
  };
  const onLinkAnchorChange = (id, end, anchor) => {
    const key = end === "from" ? "fromAnchor" : "toAnchor";
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: anchor } : l)));
  };
  const onLinkLabelMove = (id, offset) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, labelOffset: offset } : l)));
  };
  const onLinkDelete = (id) => {
    pushHistory();
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setEditing(null);
  };
  const onAddNode = (kind) => {
    const id = `n-${Date.now()}`;
    let newNode;
    if (kind === "container") {
      newNode = { id, kind, label: "Nouveau périmètre", x: 50, y: 50, w: 30, h: 40, description: "", responsabilites: [], superviseurs: [] };
    } else if (kind === "shape") {
      newNode = { id, kind, shape: "circle", label: "", x: 50, y: 50, w: 12, h: 12, color: "#f5c443" };
    } else {
      newNode = { id, kind, label: "Nouveau", x: 50, y: 50, description: "", responsabilites: [], superviseurs: [] };
    }
    pushHistory();
    setNodes((prev) => [...prev, newNode]);
    setEditing({ type: "node", id });
  };
  const onStartLinkDraw = () => {
    if (linkDrawing) { setLinkDrawing(null); return; }
    setLinkDrawing({});
    setEditing(null);
  };
  const onCancelLinkDraw = () => setLinkDrawing(null);

  const onExport = () => {
    const data = { nodes, links, header };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schema-encadrement-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onImport = (text) => {
    try {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
        toast.error("Format invalide. Le fichier doit contenir { nodes: [...], links: [...] }");
        return;
      }
      pushHistory();
      setNodes(data.nodes);
      setLinks(data.links);
      if (data.header && typeof data.header === "object") setHeader(data.header);
      setEditing(null);
      setLinkDrawing(null);
    } catch (e) {
      toast.error("Erreur de lecture du fichier JSON : " + e.message);
    }
  };

  const onResetDraft = async () => {
    const ok = await confirmDialog({
      title: "Tout effacer ?",
      message: "Annule toutes les modifications et revient aux données d'origine. Cette action ne peut pas être annulée.",
      confirmLabel: "Tout effacer",
      cancelLabel: "Garder mes modifs",
      variant: "danger",
    });
    if (!ok) return;
    pushHistory();
    setNodes(JSON.parse(JSON.stringify(seed.nodes)));
    setLinks(JSON.parse(JSON.stringify(seed.links)));
    setHeader(JSON.parse(JSON.stringify(seed.header)));
    setEditing(null);
    setLinkDrawing(null);
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
    toast.info("Modifications annulées.");
  };

  const onGenerateViewer = () => {
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
  };

  // « Publier la version officielle » : pousse les données courantes dans
  // project/src/data.js sur main. Le workflow Actions rebuild + redéploie
  // → tous les visiteurs (et tous tes navigateurs) verront cette version
  // après ~2 min. La DATA_VERSION est bumpée à l'ISO courant : les
  // brouillons localStorage des autres appareils sont automatiquement
  // purgés (cf. logique de `initial` qui compare DATA_VERSION).
  const [publishBusy, setPublishBusy] = useState(false);
  const onPublishOfficial = useCallback(async () => {
    if (publishBusy) return;
    const ok = await confirmDialog({
      title: "Publier la version officielle ?",
      message:
        "Cela remplace project/src/data.js sur GitHub. Tous les visiteurs (et tous tes appareils) recevront cette version après le re-deploy (~2 min). Les brouillons d'édition non publiés sur les autres navigateurs seront purgés.",
      confirmLabel: "Publier",
      cancelLabel: "Annuler",
      variant: "danger",
    });
    if (!ok) return;
    let token;
    try { token = localStorage.getItem(GH_TOKEN_KEY) || ""; } catch (_) { token = ""; }
    if (!token) {
      const r = await promptDialog({
        title: "Token GitHub requis",
        message: "Colle ton Personal Access Token (scope « repo »). Génère-le sur https://github.com/settings/tokens.",
        fields: [{ name: "token", label: "Token", type: "password", autoComplete: "off", hint: "Mémorisé localement, jamais transmis ailleurs qu'à api.github.com." }],
        submitLabel: "Continuer",
      });
      if (!r || !r.values.token) return;
      token = r.values.token.trim();
      try { localStorage.setItem(GH_TOKEN_KEY, token); } catch (_) {}
    }
    setPublishBusy(true);
    try {
      const newVersion = new Date().toISOString();
      const source = buildDataModuleSource(nodes, links, header, newVersion);
      await uploadFileToGitHub(
        token,
        "project/src/data.js",
        source,
        `Publication officielle (${newVersion})`
      );
      // Met à jour le brouillon local pour matcher la nouvelle version,
      // sinon au prochain reload de cet appareil le brouillon serait purgé
      // alors qu'il est en réalité aligné avec la version qu'on vient de pousser.
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          nodes, links, header,
          savedAt: Date.now(),
          dataVersion: newVersion,
        }));
      } catch (_) {}
      toast.success("Publié sur GitHub. Re-deploy en cours (~2 min).");
    } catch (e) {
      toast.error("Échec de la publication : " + (e && e.message ? e.message : String(e)));
    } finally {
      setPublishBusy(false);
    }
  }, [nodes, links, header, publishBusy]);

  // « Partager » : génère le HTML autonome (mode viewer) puis le pousse via
  // l'API GitHub Contents dans `project/public/shared/<nom>.html`. L'URL
  // résultante est publique sur GitHub Pages dès que le workflow Actions a
  // re-build et redéployé (~2 min).
  const [shareBusy, setShareBusy] = useState(false);
  const onShareViewer = useCallback(async () => {
    if (shareBusy) return;
    let token;
    try { token = localStorage.getItem(GH_TOKEN_KEY) || ""; } catch (_) { token = ""; }
    if (!token) {
      const r = await promptDialog({
        title: "Token GitHub requis",
        message: "Pour publier, colle ton Personal Access Token (scope « repo »). Génère-le sur https://github.com/settings/tokens.",
        fields: [{ name: "token", label: "Token", type: "password", autoComplete: "off", hint: "Mémorisé localement sur cet appareil — tu ne le ressaisiras plus." }],
        submitLabel: "Continuer",
      });
      if (!r || !r.values.token) return;
      token = r.values.token.trim();
      try { localStorage.setItem(GH_TOKEN_KEY, token); } catch (_) {}
    }
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
      const url = await uploadHtmlToGitHub(token, filename, html);
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (_) {}
      await infoDialog({
        title: "Schéma partagé",
        message: copied
          ? "URL copiée dans le presse-papiers. La page sera publique après le déploiement (~2 min)."
          : "Voici l'URL publique. La page sera disponible après le déploiement (~2 min).",
        copyValue: url,
        okLabel: "Fermer",
      });
    } catch (e) {
      toast.error("Échec du partage : " + (e && e.message ? e.message : String(e)));
    } finally {
      setShareBusy(false);
    }
  }, [nodes, links, header, shareBusy]);

  // Export PNG : on capture `.schema__viewport` (parent du `.schema__design`
  // transformé) parce que html2canvas gère mal les transformations CSS.
  // Le viewport contient déjà tout ce qui est rendu, à la résolution écran.
  // Import dynamique : html2canvas pèse ~150KB gzippés, on ne le charge que
  // si l'utilisateur clique sur Export.
  const onExportPNG = async () => {
    const target = document.querySelector(".schema__viewport");
    if (!target) { toast.error("Schéma introuvable."); return; }
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(target, {
        backgroundColor: getComputedStyle(document.body).getPropertyValue("background-color") || "#fbf6ea",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (!blob) { toast.error("Échec de génération du PNG."); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `schema-encadrement-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("PNG téléchargé.");
      }, "image/png");
    } catch (e) {
      toast.error("Erreur export PNG : " + e.message);
    }
  };


  return (
    <div className={"app-fs" + (editMode ? " is-edit-mode" : "")}>
      <header className="toolbar">
        <h1 className="toolbar__title">
          <span className="toolbar__title-mark">{header.title}</span>
          {header.subtitle ? <em>{header.subtitle}</em> : null}
        </h1>
        <div className="toolbar__filters" role="tablist" aria-label="Filtrer les liens">
          <button role="tab" aria-selected={filter === "all"} className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout</button>
          <button role="tab" aria-selected={filter === "encadrement"} className={filter === "encadrement" ? "is-active" : ""} onClick={() => setFilter("encadrement")}>Encadrement</button>
          <button role="tab" aria-selected={filter === "collaboration"} className={filter === "collaboration" ? "is-active" : ""} onClick={() => setFilter("collaboration")}>Collaboration</button>
        </div>
        {!editMode && !VIEWER_ONLY ? (
          <button className="toolbar__edit" onClick={enterEdit} title="Activer le mode édition">✎ Éditer</button>
        ) : null}
        {!VIEWER_ONLY && __COMMIT_SHA__ ? (
          <a className="toolbar__version"
            href={`https://github.com/system71431/schema-d-encadrement/commit/${__COMMIT_SHA__}`}
            target="_blank" rel="noopener"
            title={`Voir le commit ${__COMMIT_SHA__} sur GitHub`}>
            {__COMMIT_SHORT__}
          </a>
        ) : !VIEWER_ONLY ? (
          <span className="toolbar__version" title="Build hors d'un dépôt git">{__COMMIT_SHORT__}</span>
        ) : null}
        <a href="https://scoutisme-neuchatelois.ch" target="_blank" rel="noopener" className="brand-logo" aria-label="Scoutisme Neuchâtelois">
          <img src={logoUrl} alt="Scoutisme Neuchâtelois" />
        </a>
      </header>

      <Schema
        nodes={nodes}
        links={links}
        filter={filter}
        selection={selection}
        hover={hover}
        setHover={setHover}
        onPickNode={pickNode}
        onPickLink={pickLink}
        onBlankClick={closePopup}
        editMode={editMode}
        onNodeMove={onNodeMove}
        linkDrawing={linkDrawing}
        editing={editing}
        onLinkAnchorChange={onLinkAnchorChange}
        selectedIds={selectedIds}
        onLinkLabelMove={onLinkLabelMove}
        onPushHistory={pushHistory}
      />

      <Legend />

      {!editMode ? (
        <div className="hint">
          <span>Cliquez un rôle ou un lien</span>
          <kbd>Esc</kbd>
        </div>
      ) : null}

      <Popup
        payload={editMode ? null : popupAt}
        nodes={nodes}
        links={links}
        onClose={closePopup}
        onSelectNode={(id) => {
          const el = document.querySelector(`.node[data-id="${id}"]`);
          if (el) {
            const r = el.getBoundingClientRect();
            setSelection({ type: "node", id });
            setPopupAt({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: "node", id });
          } else {
            setSelection({ type: "node", id });
            setPopupAt({ ...popupAt, kind: "node", id });
          }
        }}
        onSelectLink={(id) => {
          setSelection({ type: "link", id });
          setPopupAt({ ...popupAt, kind: "link", id });
        }}
      />

      <EditorPanel
        editMode={editMode}
        editing={editing}
        nodes={nodes}
        links={links}
        onEditingChange={setEditing}
        onNodeUpdate={onNodeUpdate}
        onLinkUpdate={onLinkUpdate}
        onNodeDelete={onNodeDelete}
        onLinkDelete={onLinkDelete}
        onAddNode={onAddNode}
        onStartLinkDraw={onStartLinkDraw}
        linkDrawing={linkDrawing}
        onCancelLinkDraw={onCancelLinkDraw}
        onExport={onExport}
        onImport={onImport}
        onExitEdit={exitEdit}
        onResetDraft={onResetDraft}
        selectedIds={selectedIds}
        onFuseSelected={onFuseSelected}
        onClearMultiSelection={onClearMultiSelection}
        onGenerateViewer={onGenerateViewer}
        onShareViewer={onShareViewer}
        shareBusy={shareBusy}
        onPublishOfficial={onPublishOfficial}
        publishBusy={publishBusy}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onExportPNG={onExportPNG}
        header={header}
        onHeaderChange={(next) => { pushHistory(); setHeader(next); }}
      />
      <OnboardingHint editMode={editMode} />
      <FeedbackHost />
    </div>
  );
}

// Hint discret au premier lancement mobile : informe que pinch+pan fonctionnent.
// On ne le montre qu'une seule fois par appareil (localStorage), uniquement
// hors mode édition (le panneau d'édition rend le hint redondant), et seulement
// si l'écran est étroit (le pan/pinch n'a pas d'intérêt sur desktop).
const HINT_KEY = "schema-encadrement-pinch-hint-seen";
function OnboardingHint({ editMode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (editMode) return;
    let seen = false;
    try { seen = !!localStorage.getItem(HINT_KEY); } catch (_) {}
    if (seen) return;
    if (window.matchMedia && !window.matchMedia("(max-width: 720px)").matches) return;
    const t = setTimeout(() => setShow(true), 600);
    const t2 = setTimeout(() => {
      setShow(false);
      try { localStorage.setItem(HINT_KEY, "1"); } catch (_) {}
    }, 7400);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [editMode]);
  if (!show) return null;
  return (
    <div className="onboard-hint" role="note">
      <span className="onboard-hint__icon" aria-hidden="true">✌︎</span>
      <span>Pince pour zoomer · glisse pour panner</span>
    </div>
  );
}

export default App;
