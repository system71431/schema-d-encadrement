import React, { useState, useEffect, useMemo, useCallback } from "react";
import Schema from "./Schema.jsx";
import Popup from "./Popup.jsx";
import EditorPanel from "./EditorPanel.jsx";
import { Doodles, Legend } from "./Decoration.jsx";
import {
  INITIAL_NODES,
  INITIAL_LINKS,
  INITIAL_HEADER,
  VIEWER_ONLY,
} from "./share.js";
import { DATA_VERSION } from "./data.js";
import logoUrl from "./logo-scoutisme-neuchatelois.png";
import { FeedbackHost, toast, confirmDialog } from "./feedback.jsx";
import { useHistory } from "./hooks/useHistory.js";
import { useGitHubFlow } from "./hooks/useGitHubFlow.js";
import { usePngExport } from "./hooks/usePngExport.js";
import "./styles.css";

// Brouillon : auto-save dans localStorage pendant l'édition, pour ne pas
// perdre les modifs au reload. La cohérence avec `data.js` est garantie par
// la `DATA_VERSION` : un brouillon dont la version diffère de celle du
// fichier est considéré obsolète et purgé silencieusement.
const DRAFT_KEY = "schema-encadrement-draft";

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

  // Historique + flows extraits dans des hooks dédiés pour garder ce
  // composant centré sur l'orchestration de l'UI.
  const { pushHistory, undo, redo, canUndo, canRedo } = useHistory(nodes, links, setNodes, setLinks);

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

  // Flux GitHub (publish + share + génération HTML) extraits dans un hook
  // dédié. Ce hook gère token, dialogs, toasts et le polling Pages.
  const {
    onShareViewer,
    onPublishOfficial,
    onGenerateViewer,
    shareBusy,
    publishBusy,
  } = useGitHubFlow({ nodes, links, header, draftKey: DRAFT_KEY });
  const onExportPNG = usePngExport();


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
