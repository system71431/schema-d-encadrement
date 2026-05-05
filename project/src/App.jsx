import React, { useState, useEffect, useMemo, useCallback } from "react";
import html2canvas from "html2canvas";
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
import "./styles.css";

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
  const [expanded, setExpanded] = useState(false);
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
        alert("Format invalide. Le fichier doit contenir { nodes: [...], links: [...] }");
        return;
      }
      pushHistory();
      setNodes(data.nodes);
      setLinks(data.links);
      if (data.header && typeof data.header === "object") setHeader(data.header);
      setEditing(null);
      setLinkDrawing(null);
    } catch (e) {
      alert("Erreur de lecture du fichier JSON : " + e.message);
    }
  };

  const onResetDraft = () => {
    if (!confirm("Annuler toutes les modifications et revenir aux données d'origine ?")) return;
    pushHistory();
    setNodes(JSON.parse(JSON.stringify(seed.nodes)));
    setLinks(JSON.parse(JSON.stringify(seed.links)));
    setHeader(JSON.parse(JSON.stringify(seed.header)));
    setEditing(null);
    setLinkDrawing(null);
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
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
    } catch (e) {
      alert("Erreur lors de la génération du HTML : " + e.message);
    }
  };

  // Export PNG : on capture `.schema__viewport` (parent du `.schema__design`
  // transformé) parce que html2canvas gère mal les transformations CSS.
  // Le viewport contient déjà tout ce qui est rendu, à la résolution écran.
  const onExportPNG = async () => {
    const target = document.querySelector(".schema__viewport");
    if (!target) { alert("Schéma introuvable."); return; }
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: getComputedStyle(document.body).getPropertyValue("background-color") || "#fbf6ea",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      canvas.toBlob((blob) => {
        if (!blob) { alert("Échec de génération du PNG."); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `schema-encadrement-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch (e) {
      alert("Erreur export PNG : " + e.message);
    }
  };


  return (
    <div className={"app-fs" + (editMode ? " is-edit-mode" : "") + (expanded ? " is-expanded" : "")}>
      <header className="toolbar">
        <h1 className="toolbar__title">
          <span className="toolbar__title-mark">{header.title}</span>
          {header.subtitle ? <em>{header.subtitle}</em> : null}
        </h1>
        <div className="toolbar__filters" role="tablist">
          <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout</button>
          <button className={filter === "encadrement" ? "is-active" : ""} onClick={() => setFilter("encadrement")}>Encadrement</button>
          <button className={filter === "collaboration" ? "is-active" : ""} onClick={() => setFilter("collaboration")}>Collaboration</button>
        </div>
        <button className="toolbar__expand"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Vue normale" : "Vue agrandie (cacher légende et conseils)"}>
          ⤢
        </button>
        {!editMode && !VIEWER_ONLY ? (
          <button className="toolbar__edit" onClick={enterEdit} title="Activer le mode édition">✎ Éditer</button>
        ) : null}
        {__COMMIT_SHA__ ? (
          <a className="toolbar__version"
            href={`https://github.com/system71431/schema-d-encadrement/commit/${__COMMIT_SHA__}`}
            target="_blank" rel="noopener"
            title={`Voir le commit ${__COMMIT_SHA__} sur GitHub`}>
            {__COMMIT_SHORT__}
          </a>
        ) : (
          <span className="toolbar__version" title="Build hors d'un dépôt git">{__COMMIT_SHORT__}</span>
        )}
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
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onExportPNG={onExportPNG}
        header={header}
        onHeaderChange={(next) => { pushHistory(); setHeader(next); }}
      />
    </div>
  );
}

export default App;
