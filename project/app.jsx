const { useState, useEffect, useMemo, useCallback } = React;
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

// Génère un HTML autonome ne contenant que le viewer (pas l'éditeur), avec
// les données courantes baked-in et le CSS local inliné.
function buildViewerHTML(viewNodes, viewLinks, viewHeader) {
  let inlineCss = "";
  // 1) Lire les <style> inline (toujours accessibles, même file://)
  for (const styleEl of document.querySelectorAll("style")) {
    inlineCss += (styleEl.textContent || "") + "\n";
  }
  // 2) Lire les feuilles de style via cssRules (peut échouer sur file:// avec <link>)
  for (const sheet of document.styleSheets) {
    try {
      if (sheet.ownerNode && sheet.ownerNode.tagName === "STYLE") continue; // déjà extrait
      if (sheet.href && sheet.href.indexOf("http") === 0 && sheet.href.indexOf(window.location.origin) !== 0) continue;
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of rules) inlineCss += rule.cssText + "\n";
    } catch (e) { /* cross-origin / bloqué : on saute */ }
  }
  // 3) Fallback : XHR synchrone vers styles.css (souvent OK sur file://, sauf Chrome récent)
  if (inlineCss.replace(/\s/g, "").length < 100) {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      const href = link.getAttribute("href");
      if (!href || href.indexOf("http") === 0) continue;
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", href, false);
        xhr.send(null);
        if (xhr.status === 200 || xhr.status === 0) inlineCss += "\n" + xhr.responseText + "\n";
      } catch (e) {}
    }
  }
  if (inlineCss.replace(/\s/g, "").length < 100) {
    if (!confirm("Impossible d'extraire le CSS automatiquement (sécurité du navigateur sur file://). \n\nLe HTML sera généré avec un lien vers \"styles.css\" — il faudra mettre styles.css à côté du fichier généré.\n\nContinuer ?")) {
      throw new Error("Génération annulée par l'utilisateur");
    }
  }
  let schemaSrc = "", popupSrc = "";
  for (const s of document.querySelectorAll('script[type="text/babel"]')) {
    const t = s.textContent || "";
    // Le script App contient les littéraux "function Schema(" / "window.Schema = Schema"
    // dans son propre code (cette fonction !) → on l'écarte d'abord. Il est le seul
    // à appeler ReactDOM.createRoot.
    if (t.indexOf("ReactDOM.createRoot") !== -1) continue;
    if (!schemaSrc && t.indexOf("window.Schema = Schema;") !== -1) schemaSrc = t;
    else if (!popupSrc && t.indexOf("window.Popup = Popup;") !== -1) popupSrc = t;
  }
  if (!schemaSrc || !popupSrc) {
    throw new Error("Impossible d'extraire le code Schema/Popup du document. (schema: " + schemaSrc.length + " car., popup: " + popupSrc.length + " car.)");
  }
  const viewerApp = [
    'const { useState, useEffect } = React;',
    '',
    'function App() {',
    '  const [filter, setFilter] = useState("all");',
    '  const [selection, setSelection] = useState(null);',
    '  const [hover, setHover] = useState(null);',
    '  const [popupAt, setPopupAt] = useState(null);',
    '',
    '  useEffect(() => {',
    '    const onKey = (e) => {',
    '      if (e.key === "Escape") { setSelection(null); setPopupAt(null); }',
    '    };',
    '    window.addEventListener("keydown", onKey);',
    '    return () => window.removeEventListener("keydown", onKey);',
    '  }, []);',
    '',
    '  const pickNode = (id, ev) => {',
    '    const x = (ev && ev.clientX != null) ? ev.clientX : window.innerWidth / 2;',
    '    const y = (ev && ev.clientY != null) ? ev.clientY : window.innerHeight / 2;',
    '    setSelection({ type: "node", id });',
    '    setPopupAt({ x: x, y: y, kind: "node", id: id });',
    '  };',
    '  const pickLink = (id, ev) => {',
    '    // Pas de popup pour les liens — juste toggle du surlignage.',
    '    setPopupAt(null);',
    '    setSelection((prev) => (prev && prev.type === "link" && prev.id === id) ? null : { type: "link", id: id });',
    '  };',
    '  const closePopup = () => { setSelection(null); setPopupAt(null); };',
    '',
    '  return (',
    '    <div className="app-fs">',
    '      <header className="toolbar">',
    '        <h1 className="toolbar__title">',
    '          <span className="toolbar__title-mark">{(window.HEADER && window.HEADER.title) || "Schéma d\'encadrement"}</span>',
    '          {(window.HEADER && window.HEADER.subtitle) ? <em>{window.HEADER.subtitle}</em> : null}',
    '        </h1>',
    '        <div className="toolbar__filters" role="tablist">',
    '          <button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>Tout</button>',
    '          <button className={filter === "encadrement" ? "is-active" : ""} onClick={() => setFilter("encadrement")}>Encadrement</button>',
    '          <button className={filter === "collaboration" ? "is-active" : ""} onClick={() => setFilter("collaboration")}>Collaboration</button>',
    '        </div>',
    '      </header>',
    '      <window.Schema',
    '        nodes={window.NODES} links={window.LINKS}',
    '        filter={filter} selection={selection} hover={hover} setHover={setHover}',
    '        onPickNode={pickNode} onPickLink={pickLink} onBlankClick={closePopup}',
    '        editMode={false}',
    '      />',
    '      <div className="legend">',
    '        <div className="legend__item">',
    '          <svg width="48" height="14" viewBox="0 0 48 14">',
    '            <line x1="2" y1="7" x2="38" y2="7" className="legend-line legend-line--enc" vectorEffect="non-scaling-stroke"/>',
    '            <path d="M 36 2 L 44 7 L 36 12 z" className="legend-arrow legend-arrow--enc"/>',
    '          </svg>',
    '          <span><strong>Encadrement</strong> — relation hiérarchique</span>',
    '        </div>',
    '        <div className="legend__item">',
    '          <svg width="48" height="14" viewBox="0 0 48 14">',
    '            <path d="M 12 2 L 4 7 L 12 12 z" className="legend-arrow legend-arrow--coll"/>',
    '            <line x1="10" y1="7" x2="38" y2="7" className="legend-line legend-line--coll" vectorEffect="non-scaling-stroke"/>',
    '            <path d="M 36 2 L 44 7 L 36 12 z" className="legend-arrow legend-arrow--coll"/>',
    '          </svg>',
    '          <span><strong>Collaboration</strong> — échange dans les deux sens</span>',
    '        </div>',
    '      </div>',
    '      <div className="hint"><span>Cliquez un rôle ou un lien</span><kbd>Esc</kbd></div>',
    '      <window.Popup',
    '        payload={popupAt} onClose={closePopup}',
    '        onSelectNode={(id) => {',
    '          const el = document.querySelector(\'.node[data-id="\' + id + \'"]\');',
    '          if (el) {',
    '            const r = el.getBoundingClientRect();',
    '            setSelection({ type: "node", id: id });',
    '            setPopupAt({ x: r.left + r.width / 2, y: r.top + r.height / 2, kind: "node", id: id });',
    '          } else {',
    '            setSelection({ type: "node", id: id });',
    '            setPopupAt({ ...popupAt, kind: "node", id: id });',
    '          }',
    '        }}',
    '        onSelectLink={(id) => {',
    '          setSelection({ type: "link", id: id });',
    '          setPopupAt({ ...popupAt, kind: "link", id: id });',
    '        }}',
    '      />',
    '    </div>',
    '  );',
    '}',
    '',
    'const root = ReactDOM.createRoot(document.getElementById("root"));',
    'root.render(<App />);',
  ].join("\n");
  const dataScript = "window.NODES = " + JSON.stringify(viewNodes, null, 2) + ";\nwindow.LINKS = " + JSON.stringify(viewLinks, null, 2) + ";\nwindow.HEADER = " + JSON.stringify(viewHeader || { title: "Schéma d'encadrement", subtitle: "" }) + ";";
  return [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>Schéma d\'encadrement — Groupe scout</title>',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&family=Kalam:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&display=swap">',
    (inlineCss.replace(/\s/g, "").length < 100 ? '<link rel="stylesheet" href="styles.css">' : ''),
    '<style>',
    inlineCss,
    '</style>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"><\/script>',
    '<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"><\/script>',
    '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"><\/script>',
    '<script>' + dataScript + '<\/script>',
    '<script type="text/babel">' + schemaSrc + '<\/script>',
    '<script type="text/babel">' + popupSrc + '<\/script>',
    '<script type="text/babel">' + viewerApp + '<\/script>',
    '</body>',
    '</html>',
  ].join("\n");
}

function App() {
  const seed = useMemo(() => ({
    nodes: JSON.parse(JSON.stringify(window.NODES)),
    links: JSON.parse(JSON.stringify(window.LINKS)),
    header: JSON.parse(JSON.stringify(window.HEADER || { title: "Schéma d'encadrement", subtitle: "du groupe scout — qui encadre qui ?" })),
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
          if ((draft.dataVersion || null) === (window.DATA_VERSION || null)) {
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

  // Garde window.NODES / window.LINKS synchronisés avec l'état React,
  // pour que le Popup et tout code qui lit `window.*` voient la dernière version.
  useEffect(() => { window.NODES = nodes; }, [nodes]);
  useEffect(() => { window.LINKS = links; }, [links]);

  // Auto-save brouillon : à chaque modification de nodes/links/header, on
  // écrit dans localStorage. Inclut DATA_VERSION pour pouvoir détecter les
  // brouillons obsolètes (= antérieurs à une mise à jour de data.js).
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        nodes, links, header,
        savedAt: Date.now(),
        dataVersion: window.DATA_VERSION || null,
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
    if (typeof window.html2canvas !== "function") {
      alert("html2canvas n'est pas chargé (vérifier la connexion réseau).");
      return;
    }
    const target = document.querySelector(".schema__viewport");
    if (!target) { alert("Schéma introuvable."); return; }
    try {
      const canvas = await window.html2canvas(target, {
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
        {!editMode ? (
          <button className="toolbar__edit" onClick={enterEdit} title="Activer le mode édition">✎ Éditer</button>
        ) : null}
        <a href="https://scoutisme-neuchatelois.ch" target="_blank" rel="noopener" className="brand-logo" aria-label="Scoutisme Neuchâtelois">
          <img src="logo-scoutisme-neuchatelois.png" alt="Scoutisme Neuchâtelois" />
        </a>
      </header>

      <window.Schema
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

      <window.Popup
        payload={editMode ? null : popupAt}
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

      <window.EditorPanel
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

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
