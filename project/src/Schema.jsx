import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";

function findById(arr, id) {
  return arr.find((n) => n.id === id);
}
function anchorOnNode(node, towards, sizes) {
  const size = sizes[node.id] || { w: 14, h: 6 };
  const cx = node.x;
  const cy = node.y;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = size.w / 2;
  const hh = size.h / 2;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

// Si un point d'ancrage explicite ({x, y} normalisé 0..1) est fourni, l'utilise.
// Sinon, ancre automatiquement au bord du nœud le plus proche de `towards`.
function linkPoint(node, sizes, anchor, towards) {
  if (anchor) {
    const size = sizes[node.id] || { w: 14, h: 6 };
    return {
      x: node.x - size.w / 2 + anchor.x * size.w,
      y: node.y - size.h / 2 + anchor.y * size.h,
    };
  }
  return anchorOnNode(node, towards, sizes);
}

// Distance constante (en % du canvas 100×100) entre la pointe d'une flèche
// et le bord du nœud cible. Égalise visuellement tous les liens, quel que
// soit l'anchor stocké : qu'un toAnchor soit dedans, sur le bord ou en
// dehors du nœud, la flèche atterrit toujours au même offset uniforme.
const ARROW_GAP = 0.7;

// Projette `towards` sur un rectangle virtuel de taille (size + 2*gap)
// centré sur le nœud. Le résultat est sur ce rectangle, dans la direction
// de l'autre extrémité du lien — donc la pointe atterrit à `gap` au-delà
// du bord visible. La direction utilise la position de `towards` (centre
// du nœud source ou point de contrôle de la courbe), pas l'anchor stocké.
function arrowEndpoint(targetNode, sizes, towards, gap) {
  const size = sizes[targetNode.id] || { w: 14, h: 6 };
  const cx = targetNode.x;
  const cy = targetNode.y;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return { x: cx, y: cy };
  const hw = size.w / 2 + gap;
  const hh = size.h / 2 + gap;
  const tx = Math.abs(dx) < 1e-3 ? Infinity : hw / Math.abs(dx);
  const ty = Math.abs(dy) < 1e-3 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

function ShapeSvg({ shape, color, strokeColor, strokeWidth, strokeStyle }) {
  const fill = color || "none";
  // Pas de contour par défaut (libre à l'utilisateur d'en mettre un via le
  // color picker « Couleur du contour »).
  const stroke = strokeColor || "none";
  const sw = (strokeWidth != null && strokeWidth !== "") ? String(strokeWidth) : "3";
  // Dasharray proportionnel à l'épaisseur pour rester lisible quel que soit
  // strokeWidth. dashed = traits longs ; dotted = points (linecap round +
  // dashes très courts).
  const swNum = parseFloat(sw) || 3;
  let dashArray;
  if (strokeStyle === "dashed") dashArray = `${swNum * 2.5} ${swNum * 2}`;
  else if (strokeStyle === "dotted") dashArray = `0 ${swNum * 1.8}`;
  // `vector-effect: non-scaling-stroke` empêche le stroke d'être étiré avec
  // le SVG (le viewBox 100×100 est preserveAspectRatio="none", donc la forme
  // se déforme librement, mais on veut que le contour garde une épaisseur
  // constante en pixels écran — sinon il est compressé sur un axe et étalé
  // sur l'autre, d'où l'effet pixelisé / "mauvaise résolution").
  const common = {
    fill, stroke, strokeWidth: sw,
    strokeLinejoin: "round", strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    ...(dashArray ? { strokeDasharray: dashArray } : {}),
  };
  // width/height="100%" en attributs (en plus du CSS) : même précaution que
  // pour Arrowhead — iOS Safari peut ignorer la taille CSS d'un <svg> sans
  // dimensions intrinsèques quand un ancêtre porte une CSS transform, et
  // retomber sur la taille SVG par défaut (300×150). Les nodes shape sont
  // dans .schema__design (transform: scale) ET .node--shape (transform:
  // translate+rotate) — combinaison sensible.
  const sized = { width: "100%", height: "100%", viewBox: "0 0 100 100", preserveAspectRatio: "none" };
  switch (shape) {
    case "square":
      return (<svg {...sized}><rect x="6" y="6" width="88" height="88" {...common}/></svg>);
    case "triangle":
      return (<svg {...sized}><polygon points="50,8 92,88 8,88" {...common}/></svg>);
    case "diamond":
      return (<svg {...sized}><polygon points="50,6 94,50 50,94 6,50" {...common}/></svg>);
    case "hexagon":
      return (<svg {...sized}><polygon points="25,8 75,8 96,50 75,92 25,92 4,50" {...common}/></svg>);
    case "star":
      return (<svg {...sized}><polygon points="50,5 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" {...common}/></svg>);
    case "circle":
    default:
      return (<svg {...sized}><circle cx="50" cy="50" r="44" {...common}/></svg>);
  }
}

// Hash FNV-1a 32 bits → entier non-signé. Utilisé comme seed déterministe
// pour les variations visuelles (tilt des nœuds, jitter des liens) :
// même id ⇒ même rendu, indépendant de l'ordre du DOM ou du moment du
// rendu. Crucial pour que le « hand-drawn » reste stable.
function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// PRNG mulberry32 — minuscule, déterministe, distribution correcte sur
// [0,1). On l'utilise pour générer plusieurs valeurs jittered à partir
// d'une même seed (le générateur est stateful, chaque appel avance).
function seededRand(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tilt stable par id : hash FNV-1a → réel dans [-1,1] → multiplié par
// l'amplitude propre au type. Indépendant de l'ordre du DOM, donc tout
// ajout/suppression/réordonnancement de nœud laisse les autres tilts
// intacts (l'ancien CSS `nth-of-type` les faisait tous bouger).
function tiltForId(id, kind) {
  const norm = (hashStr(id) / 0xffffffff) * 2 - 1; // [-1, 1]
  const ranges = { role: 1.4, group: 1.1, resource: 1.4, shape: 2.0 };
  return (norm * (ranges[kind] || 1.0)).toFixed(2) + "deg";
}

// Path SVG « tracé à main levée » : quadratique d'origine convertie en
// 2 segments quadratiques se rejoignant au point t=0.5, chaque control
// point + le midpoint de raccord ayant un jitter déterministe seedé
// par l'id du lien. L'amplitude du jitter (en % du canvas 100×100)
// scale légèrement avec la longueur du lien — un trait court reste
// précis, un trait long « tremble » davantage. Ne dépasse jamais ~0.6%
// pour rester de l'ordre de la vibration de la main, pas du gribouillis.
function shakyPath(a, b, cx, cy, seed) {
  const rand = seededRand(seed);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const amp = Math.min(0.55, len * 0.02);
  // Midpoint à t=0.5 sur la quadratique smooth, légèrement décalé.
  const m = {
    x: 0.25 * a.x + 0.5 * cx + 0.25 * b.x + (rand() - 0.5) * amp,
    y: 0.25 * a.y + 0.5 * cy + 0.25 * b.y + (rand() - 0.5) * amp,
  };
  // Control points des deux sous-segments — ancrés à mi-chemin entre
  // l'extrémité et le control central, avec leur propre jitter.
  const c1 = {
    x: a.x + (cx - a.x) * 0.5 + (rand() - 0.5) * amp,
    y: a.y + (cy - a.y) * 0.5 + (rand() - 0.5) * amp,
  };
  const c2 = {
    x: b.x + (cx - b.x) * 0.5 + (rand() - 0.5) * amp,
    y: b.y + (cy - b.y) * 0.5 + (rand() - 0.5) * amp,
  };
  return `M ${a.x} ${a.y} Q ${c1.x} ${c1.y} ${m.x} ${m.y} Q ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

function SchemaNode({ node, selected, dimmed, highlighted, editMode, isLinkSource, hasTasks, onClick, onHover, onLeave, onDragStart, registerSize }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const parent = ref.current.parentElement;
    if (!parent) return;
    const pr = parent.getBoundingClientRect();
    const pw = pr.width || 1;
    const ph = pr.height || 1;
    const r = ref.current.getBoundingClientRect();
    registerSize(node.id, { w: (r.width / pw) * 100, h: (r.height / ph) * 100 });
  }, [node.id, registerSize, node.label, node.sublabel, node.kind, node.w, node.h]);

  const cls = ["node", `node--${node.kind}`,
    selected && "is-selected", dimmed && "is-dimmed",
    highlighted && "is-highlighted",
    editMode && "is-editable",
    isLinkSource && "is-link-source",
    node.variant && `is-variant-${node.variant}`,
  ].filter(Boolean).join(" ");

  const style = { left: `${node.x}%`, top: `${node.y}%` };
  if (node.kind === "container" || node.kind === "shape") {
    style.width = `${node.w}%`;
    style.height = `${node.h}%`;
  }
  if (node.color) style["--node-color"] = node.color;
  if (node.scale != null && node.scale !== 1) style["--node-scale"] = node.scale;
  // Épaisseur du trait : appliquée à la border des containers (via CSS var)
  // et passée directement au SVG pour les shapes (cf. plus bas).
  if (node.strokeWidth != null && node.strokeWidth !== "") {
    style["--stroke-width"] = `${node.strokeWidth}px`;
  }
  // Tilt déterministe dérivé de l'id : remplace l'ancienne logique CSS
  // `nth-of-type(2n)` qui dépendait de l'ordre du DOM (donc instable au
  // moindre changement de tri ou d'ajout/suppression). Hash FNV-1a → [-1,1]
  // → range adapté au type. Les containers ne reçoivent pas de tilt (ils
  // gardent leur valeur CSS d'origine, plus discrète).
  if (node.kind !== "container") {
    style["--tilt"] = tiltForId(node.id || "", node.kind);
  }
  // Stagger d'apparition : delay déterministe (0 à ~280ms) basé sur le
  // hash de l'id. L'animation elle-même est définie côté CSS sur .node
  // — uniquement opacity pour ne pas entrer en conflit avec le transform
  // (centrage + tilt + hover). Pseudo-aléatoire pour que la séquence
  // semble organique plutôt qu'en balayage gauche-droite.
  if (node.id) {
    style["--enter-delay"] = (hashStr(node.id) % 35) * 8 + "ms";
  }

  const handleMouseDown = editMode ? (e) => onDragStart(node.id, e) : undefined;
  const handleClick = (e) => { e.stopPropagation(); onClick(node, e); };

  if (node.kind === "container") {
    return (
      <div ref={ref} data-id={node.id} className={cls} style={style}
        onMouseDown={handleMouseDown}
        onClick={editMode ? handleClick : undefined}>
        <span className="node__container-label">{node.label}</span>
      </div>
    );
  }
  if (node.kind === "shape") {
    return (
      <div ref={ref} data-id={node.id} className={cls} style={style}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onMouseEnter={() => onHover(node)}
        onMouseLeave={onLeave}>
        <ShapeSvg shape={node.shape || "circle"} color={node.color} strokeColor={node.strokeColor} strokeWidth={node.strokeWidth} strokeStyle={node.strokeStyle} />
        {node.label ? <span className="node__shape-label">{node.label}</span> : null}
      </div>
    );
  }
  return (
    <div ref={ref} data-id={node.id} className={cls} style={style}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onMouseEnter={() => onHover(node)}
      onMouseLeave={onLeave}>
      <span className="node__label">{node.label}</span>
      {node.sublabel ? <span className="node__sublabel">{node.sublabel}</span> : null}
      {hasTasks && !editMode ? (
        <span className="node__has-tasks" aria-label="Cliquer pour voir les tâches">
          <svg viewBox="0 0 14 14" aria-hidden="true">
            <path d="M 3.5 7.5 L 6 10 L 11 4.5" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}

function SchemaLink({ link, nodes, sizes, selected, dimmed, highlighted, onClick, onHover, onLeave }) {
  const from = findById(nodes, link.from);
  const to = findById(nodes, link.to);
  if (!from || !to) return null;
  // Extrémités calculées en deux passes :
  // 1. positions « brutes » (avec anchor utilisateur) pour orienter la courbe
  // 2. extrémités côté cible (et côté source pour les collaborations) re-projetées
  //    sur un rectangle virtuel à ARROW_GAP du bord du nœud — garantit que
  //    toutes les pointes de flèche atterrissent à la même distance visuelle.
  const aRaw = linkPoint(from, sizes, link.fromAnchor, { x: to.x, y: to.y });
  const bRaw = linkPoint(to, sizes, link.toAnchor, { x: from.x, y: from.y });
  const b = arrowEndpoint(to, sizes, aRaw, ARROW_GAP);
  const a = link.kind === "collaboration"
    ? arrowEndpoint(from, sizes, bRaw, ARROW_GAP)
    : aRaw;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const curve = link.curve ?? 0;
  const cx = mx + nx * curve;
  const cy = my + ny * curve;
  // Tracé crayonné déterministe (seed = hash de l'id) — donne du caractère
  // au schéma sans casser la stabilité visuelle d'un re-render à l'autre.
  const d = shakyPath(a, b, cx, cy, hashStr(link.id || `${a.x},${a.y},${b.x},${b.y}`));
  const cls = ["link", `link--${link.kind}`,
    selected && "is-selected", dimmed && "is-dimmed", highlighted && "is-highlighted"
  ].filter(Boolean).join(" ");
  return (
    <g className={cls}
      onMouseEnter={() => onHover(link)}
      onMouseLeave={onLeave}
      onClick={(e) => { e.stopPropagation(); onClick(link, e); }}>
      <path d={d} className="link__hit" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={d} className="link__line" fill="none"
        vectorEffect="non-scaling-stroke" />
    </g>
  );
}

function SchemaLinkLabel({ link, nodes, sizes, visible, editMode, onDragStart }) {
  const from = findById(nodes, link.from);
  const to = findById(nodes, link.to);
  if (!from || !to) return null;
  // Mêmes extrémités que SchemaLink — sinon le label ne tombe plus sur la
  // ligne après le re-projection à ARROW_GAP.
  const aRaw = linkPoint(from, sizes, link.fromAnchor, { x: to.x, y: to.y });
  const bRaw = linkPoint(to, sizes, link.toAnchor, { x: from.x, y: from.y });
  const b = arrowEndpoint(to, sizes, aRaw, ARROW_GAP);
  const a = link.kind === "collaboration"
    ? arrowEndpoint(from, sizes, bRaw, ARROW_GAP)
    : aRaw;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const ox = (link.labelOffset && link.labelOffset.x) || 0;
  const oy = (link.labelOffset && link.labelOffset.y) || 0;
  return (
    <div className={`link-label link-label--${link.kind} ${visible ? "is-visible" : ""}`}
      style={{ left: `${cx + ox}%`, top: `${cy + oy}%` }}
      title={editMode ? "Glisser pour repositionner" : undefined}
      onMouseDown={editMode && onDragStart ? (e) => onDragStart(link.id, e) : undefined}>
      {link.label}
    </div>
  );
}

function Arrowhead({ x, y, angle, kind, dimmed, highlighted }) {
  const color = highlighted
    ? (kind === "encadrement" ? "var(--red)" : "var(--blue)")
    : "var(--ink)";
  // Le triangle déborde de 2 unités au-delà du viewBox (overflow: visible) pour
  // que la pointe protège tout sub-pixel résiduel du trait.
  // width/height explicites (en plus du CSS) : iOS Safari ignore parfois la
  // taille CSS d'un <svg> sans width/height intrinsèques quand un ancêtre
  // porte une transform — l'élément retombait alors sur 300×150 (taille SVG
  // par défaut), d'où des flèches « explosées » sur la version partagée mobile.
  return (
    <svg
      className={"arrow-marker arrow-marker--" + kind + (dimmed ? " is-dim" : "")}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-100%, -50%) rotate(${angle}deg)`,
      }}
      width="14"
      height="12"
      viewBox="0 0 14 12"
    >
      {/* Triangle volontairement asymétrique (point inférieur à 11.6 au lieu
          de 12, base supérieure à 0.3 au lieu de 0) : effet « gouache pas
          tout à fait sèche », assorti à la légère arrondie crayonnée des
          liens. La pointe reste à 16 pour déborder de 2 unités au-delà du
          viewBox et protéger le sub-pixel résiduel du trait. */}
      <path d="M 0 0.3 L 16 6 L 0.6 11.6 z" fill={color} strokeLinejoin="round" />
    </svg>
  );
}

function Schema({ nodes, links, filter, selection, hover, setHover, onPickNode, onPickLink, onBlankClick, editMode, onNodeMove, linkDrawing, editing, onLinkAnchorChange, selectedIds, onLinkLabelMove, onPushHistory }) {
  const [sizes, setSizes] = useState({});
  const dragMovedRef = useRef(false);
  const schemaRef = useRef(null);
  const [canvasPx, setCanvasPx] = useState({ w: 1, h: 1 });
  // Pan + pinch zoom utilisateur (mobile principalement). Composé par-dessus
  // le fit-to-screen homothétique. Désactivé en mode édition (le drag des
  // nœuds y a déjà ses propres handlers).
  const [userZoom, setUserZoom] = useState({ scale: 1, tx: 0, ty: 0 });
  const gestureRef = useRef({ pointers: new Map(), lastPinch: null, panMoved: 0, panSuppressClick: false });
  const isZoomed = userZoom.scale !== 1 || userZoom.tx !== 0 || userZoom.ty !== 0;
  const resetZoom = useCallback(() => setUserZoom({ scale: 1, tx: 0, ty: 0 }), []);
  // Sortie du mode édition → on remet le zoom à 0 (cohérence visuelle).
  useEffect(() => { if (editMode) resetZoom(); }, [editMode, resetZoom]);
  useEffect(() => {
    const el = schemaRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasPx({ w: r.width || 1, h: r.height || 1 });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Seuil sous lequel on ignore un changement de taille de nœud (en % du
  // canvas). Évite la boucle de re-render quand ResizeObserver remonte des
  // micro-variations sub-pixel après un layout.
  const SIZE_CHANGE_EPSILON = 0.1;
  const registerSize = useCallback((id, s) => setSizes((prev) => {
    const cur = prev[id];
    if (cur && Math.abs(cur.w - s.w) < SIZE_CHANGE_EPSILON && Math.abs(cur.h - s.h) < SIZE_CHANGE_EPSILON) return prev;
    return { ...prev, [id]: s };
  }), []);

  const focused = !editMode ? (selection || hover) : null;
  const focusInfo = useMemo(() => {
    if (!focused) return null;
    const groupOf = (id) => {
      const n = nodes.find((x) => x.id === id);
      if (!n || !n.groupId) return [id];
      return nodes.filter((x) => x.groupId === n.groupId).map((x) => x.id);
    };
    if (focused.type === "node") {
      const groupIds = new Set(groupOf(focused.id));
      const linkedLinks = links.filter((l) => groupIds.has(l.from) || groupIds.has(l.to));
      const linkedNodes = new Set(groupIds);
      linkedLinks.forEach((l) => { linkedNodes.add(l.from); linkedNodes.add(l.to); });
      return { kind: "node", id: focused.id, linkedNodes, linkedLinks: new Set(linkedLinks.map((l) => l.id)) };
    } else {
      const link = links.find((l) => l.id === focused.id);
      if (!link) return null;
      const allEndpoints = new Set([...groupOf(link.from), ...groupOf(link.to)]);
      return { kind: "link", id: link.id, linkedNodes: allEndpoints, linkedLinks: new Set([link.id]) };
    }
  }, [focused, links, nodes]);

  // On rend TOUS les liens en permanence — le filtre est désormais purement
  // visuel (classe is-filter-X sur .schema, opacité gérée par CSS), ce qui
  // permet une transition d'opacité au changement de filtre. Les liens
  // filtrés deviennent inertes via `pointer-events: none`.
  const visibleLinks = links;

  // Set des nœuds (role/group/resource) qui ont au moins une tâche associée,
  // soit définie directement sur le nœud (node.tasks[].towards), soit via un
  // lien d'encadrement (link.tasks[nodeId]). Sert à afficher une pastille
  // « cliquable » qui invite à ouvrir le popup pour voir les tâches.
  const nodesWithTasks = useMemo(() => {
    const s = new Set();
    nodes.forEach((n) => {
      if (n.kind !== "role" && n.kind !== "group" && n.kind !== "resource") return;
      if (Array.isArray(n.tasks) && n.tasks.some((t) => t && t.towards)) s.add(n.id);
    });
    links.forEach((l) => {
      if (l.kind !== "encadrement" || !l.tasks) return;
      Object.keys(l.tasks).forEach((rid) => {
        const ts = l.tasks[rid];
        if (Array.isArray(ts) && ts.length > 0) s.add(rid);
      });
    });
    return s;
  }, [nodes, links]);

  const onDragStart = (id, e) => {
    if (!editMode || e.button !== 0) return;
    const schemaEl = document.querySelector(".schema");
    if (!schemaEl) return;
    const node = findById(nodes, id);
    if (!node) return;
    const rect = schemaEl.getBoundingClientRect();
    e.preventDefault();
    e.stopPropagation();
    const startMouseX = ((e.clientX - rect.left) / rect.width) * 100;
    const startMouseY = ((e.clientY - rect.top) / rect.height) * 100;
    const offsetX = startMouseX - node.x;
    const offsetY = startMouseY - node.y;
    dragMovedRef.current = false;
    let pushed = false;
    const onMove = (ev) => {
      const px = ((ev.clientX - rect.left) / rect.width) * 100 - offsetX;
      const py = ((ev.clientY - rect.top) / rect.height) * 100 - offsetY;
      if (Math.abs(px - node.x) > 0.3 || Math.abs(py - node.y) > 0.3) {
        if (!pushed) { onPushHistory && onPushHistory(); pushed = true; }
        dragMovedRef.current = true;
      }
      onNodeMove(id, Math.max(0, Math.min(100, px)), Math.max(0, Math.min(100, py)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (dragMovedRef.current) {
        const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", block, true);
        setTimeout(() => window.removeEventListener("click", block, true), 0);
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Drag des poignées d'extrémités d'un lien.
  const onAnchorDragStart = (linkId, end, e) => {
    if (!editMode || e.button !== 0 || !onLinkAnchorChange) return;
    e.preventDefault();
    e.stopPropagation();
    const link = links.find((l) => l.id === linkId);
    if (!link) return;
    const targetId = end === "from" ? link.from : link.to;
    const otherId = end === "from" ? link.to : link.from;
    const node = findById(nodes, targetId);
    const otherNode = findById(nodes, otherId);
    if (!node) return;
    const schemaEl = document.querySelector(".schema");
    if (!schemaEl) return;
    const rect = schemaEl.getBoundingClientRect();
    // Position actuelle de la poignée → offset cursor↔poignée pour éviter le saut au clic.
    const currentAnchor = end === "from" ? link.fromAnchor : link.toAnchor;
    const towards = otherNode ? { x: otherNode.x, y: otherNode.y } : { x: 50, y: 50 };
    const handlePos = linkPoint(node, sizes, currentAnchor, towards);
    const startMx = ((e.clientX - rect.left) / rect.width) * 100;
    const startMy = ((e.clientY - rect.top) / rect.height) * 100;
    const offsetX = startMx - handlePos.x;
    const offsetY = startMy - handlePos.y;

    let pushed = false;
    const onMove = (ev) => {
      const mx = ((ev.clientX - rect.left) / rect.width) * 100 - offsetX;
      const my = ((ev.clientY - rect.top) / rect.height) * 100 - offsetY;
      const size = sizes[node.id] || { w: 14, h: 6 };
      const rx = (mx - (node.x - size.w / 2)) / size.w;
      const ry = (my - (node.y - size.h / 2)) / size.h;
      // Bornes élargies : la poignée peut sortir du nœud (jusqu'à plusieurs
      // largeurs/hauteurs de chaque côté). L'ancre reste relative au nœud
      // (donc elle suit le nœud quand il bouge), mais elle n'est plus
      // contrainte sur ses bords.
      const cx = Math.max(-5, Math.min(6, rx));
      const cy = Math.max(-5, Math.min(6, ry));
      if (!pushed) { onPushHistory && onPushHistory(); pushed = true; }
      onLinkAnchorChange(linkId, end, { x: cx, y: cy });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Drag du label d'un lien (pour repositionner manuellement).
  const onLabelDragStart = (linkId, e) => {
    if (!editMode || e.button !== 0 || !onLinkLabelMove) return;
    e.preventDefault();
    e.stopPropagation();
    const link = links.find((l) => l.id === linkId);
    if (!link) return;
    const schemaEl = schemaRef.current;
    if (!schemaEl) return;
    const rect = schemaEl.getBoundingClientRect();
    const startMx = ((e.clientX - rect.left) / rect.width) * 100;
    const startMy = ((e.clientY - rect.top) / rect.height) * 100;
    const startOffset = link.labelOffset || { x: 0, y: 0 };
    let pushed = false;
    const onMove = (ev) => {
      const mx = ((ev.clientX - rect.left) / rect.width) * 100;
      const my = ((ev.clientY - rect.top) / rect.height) * 100;
      const dx = mx - startMx;
      const dy = my - startMy;
      if (!pushed && (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3)) {
        onPushHistory && onPushHistory();
        pushed = true;
      }
      onLinkLabelMove(linkId, {
        x: startOffset.x + dx,
        y: startOffset.y + dy,
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // ====== Fit-to-screen ======
  // Canvas de design 1200×800 (positions et proportions des nœuds y sont
  // exprimées en %). On applique un scale *homothétique* (le même sur les
  // deux axes) : le schéma rentre sans déformation dans la zone disponible,
  // centré. L'écran peut avoir des marges blanches en haut/bas (portrait) ou
  // gauche/droite (paysage très large), c'est le prix à payer pour préserver
  // les proportions.
  const DESIGN_W = 1200;
  const DESIGN_H = 800;
  // Sur les viewports plus étroits que le design (= portrait téléphone /
  // tablette portrait), le fit homothétique strict laisse 30%+ d'écran
  // vide en haut/bas. On change de stratégie : on fit en hauteur (le
  // design remplit verticalement), au prix d'un débordement horizontal.
  // L'utilisateur pan/pinch pour voir les extrémités. Sur paysage et
  // tablette landscape, fit homothétique classique (les deux axes sont
  // proches du design 3:2, pas besoin de booster).
  const designAspect = DESIGN_W / DESIGN_H;
  const viewportAspect = (canvasPx.w > 0 && canvasPx.h > 0) ? canvasPx.w / canvasPx.h : designAspect;
  const isPortrait = viewportAspect < designAspect;
  const widthFit = canvasPx.w / DESIGN_W;
  const heightFit = canvasPx.h / DESIGN_H;
  // Sur portrait, on plafonne l'overflow horizontal du design (scale max =
  // widthFit × OVERFLOW_CAP). heightFit reste le plafond vertical (pas
  // d'overflow vertical). Avec 2.5, sur un iPhone moderne (393×851, ratio
  // ~9:19.5) on remplit ~84% de la hauteur du schéma au lieu de ~55%, tout
  // en gardant ~40% du design visible horizontalement (le reste se voit en
  // panant ou pinchant). Compromis entre "trop d'espace vide en haut/bas"
  // et "trop d'overflow latéral à panner".
  const OVERFLOW_CAP = 2.5;
  const fitScale = (canvasPx.w > 0 && canvasPx.h > 0)
    ? (isPortrait
        ? Math.min(heightFit, widthFit * OVERFLOW_CAP)
        : Math.min(widthFit, heightFit))
    : 1;
  // Centrage : sur portrait, design centré horizontalement (user voit
  // le milieu du schéma — Coach, Responsable de groupe — où se trouve
  // l'essentiel du contenu) et verticalement (espace vide haut/bas
  // symétrique, lecture aérée).
  const fitTx = (canvasPx.w - DESIGN_W * fitScale) / 2;
  const fitTy = (canvasPx.h - DESIGN_H * fitScale) / 2;
  // Composition : visuellement, le fit transform s'applique d'abord à
  // l'élément (preserveAspectRatio + centrage), puis le pan/zoom utilisateur
  // par-dessus. CSS applique de droite à gauche → user à gauche, fit à droite.
  const userT = "translate(" + userZoom.tx + "px, " + userZoom.ty + "px) scale(" + userZoom.scale + ")";
  const fitT = "translate(" + fitTx + "px, " + fitTy + "px) scale(" + fitScale + ")";
  const combinedTransform = userT + " " + fitT;

  // Gestes tactiles : 1 doigt = pan (au-delà d'un seuil pour ne pas bloquer
  // les taps), 2 doigts = pinch zoom autour du midpoint. Désactivé en mode
  // édition. On utilise les Pointer Events (unifié souris/tactile/stylet).
  useEffect(() => {
    if (editMode) return;
    const el = schemaRef.current;
    if (!el) return;
    const ZOOM_MIN = 0.4;
    const ZOOM_MAX = 6;
    const PAN_THRESHOLD_PX = 8;

    const onPointerDown = (e) => {
      // Ignore boutons souris droit/milieu (laisser le menu contextuel passer).
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const g = gestureRef.current;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g.panMoved = 0;
      g.panSuppressClick = false;
      if (g.pointers.size >= 2) {
        const pts = Array.from(g.pointers.values()).slice(0, 2);
        g.lastPinch = {
          dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
          cx: (pts[0].x + pts[1].x) / 2,
          cy: (pts[0].y + pts[1].y) / 2,
        };
        // Empêcher la sélection / scroll natif pendant le pinch.
        e.preventDefault();
      }
    };

    const onPointerMove = (e) => {
      const g = gestureRef.current;
      const ptr = g.pointers.get(e.pointerId);
      if (!ptr) return;
      const prev = { x: ptr.x, y: ptr.y };
      ptr.x = e.clientX;
      ptr.y = e.clientY;

      if (g.pointers.size === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        g.panMoved += Math.abs(dx) + Math.abs(dy);
        if (g.panMoved > PAN_THRESHOLD_PX) {
          // Au-delà du seuil = pan. On bloque le clic qui suivrait.
          g.panSuppressClick = true;
          setUserZoom((z) => ({ ...z, tx: z.tx + dx, ty: z.ty + dy }));
          e.preventDefault();
        }
      } else if (g.pointers.size >= 2) {
        const pts = Array.from(g.pointers.values()).slice(0, 2);
        const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const newCx = (pts[0].x + pts[1].x) / 2;
        const newCy = (pts[0].y + pts[1].y) / 2;
        const last = g.lastPinch;
        if (last && last.dist > 0) {
          const factor = newDist / last.dist;
          const rect = el.getBoundingClientRect();
          const cxLocal = newCx - rect.left;
          const cyLocal = newCy - rect.top;
          const dCx = newCx - last.cx;
          const dCy = newCy - last.cy;
          setUserZoom((z) => {
            const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z.scale * factor));
            const realFactor = newScale / z.scale;
            // Zoom centré sur le midpoint + déplacement du midpoint lui-même.
            const tx = cxLocal - (cxLocal - z.tx) * realFactor + dCx;
            const ty = cyLocal - (cyLocal - z.ty) * realFactor + dCy;
            return { scale: newScale, tx, ty };
          });
          g.lastPinch = { dist: newDist, cx: newCx, cy: newCy };
        }
        g.panSuppressClick = true;
        e.preventDefault();
      }
    };

    const onPointerUp = (e) => {
      const g = gestureRef.current;
      g.pointers.delete(e.pointerId);
      if (g.pointers.size < 2) g.lastPinch = null;
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: false });
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [editMode]);

  // Lien actuellement édité (pour afficher ses poignées).
  const editingLink = (editMode && editing && editing.type === "link")
    ? links.find((l) => l.id === editing.id)
    : null;

  return (
    <div ref={schemaRef} className={"schema is-filter-" + filter + (editMode ? " is-edit-mode" : "") + (linkDrawing ? " is-link-drawing" : "") + (isZoomed ? " is-zoomed" : "")}
      onClick={(e) => {
        // Après un pan/pinch, le navigateur émet un click — on l'ignore
        // pour ne pas refermer le popup ou perdre la sélection.
        if (gestureRef.current.panSuppressClick) {
          gestureRef.current.panSuppressClick = false;
          return;
        }
        onBlankClick(e);
      }}>
      <div className="schema__viewport">
      <div className="schema__design" style={{ transform: combinedTransform }}>
      <svg className="schema__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker id="arrow-enc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow arrow--enc" />
          </marker>
          <marker id="arrow-coll" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow arrow--coll" />
          </marker>
        </defs>
        {visibleLinks.map((l) => {
          const isSel = selection?.type === "link" && selection.id === l.id;
          const isHl = focusInfo?.linkedLinks.has(l.id) ?? false;
          const isDim = focusInfo && !isHl;
          return (
            <SchemaLink key={l.id} link={l} nodes={nodes} sizes={sizes}
              selected={isSel} highlighted={isHl} dimmed={isDim}
              onClick={(lnk, ev) => onPickLink(lnk.id, ev)}
              onHover={(lnk) => setHover({ type: "link", id: lnk.id })}
              onLeave={() => setHover(null)} />
          );
        })}
      </svg>
      <div className="schema__arrows">
        {visibleLinks.map((link) => {
          const from = findById(nodes, link.from);
          const to = findById(nodes, link.to);
          if (!from || !to) return null;
          // Cf. SchemaLink : extrémité côté cible re-projetée à ARROW_GAP
          // pour que toutes les flèches atterrissent à distance constante.
          const aRaw = linkPoint(from, sizes, link.fromAnchor, { x: to.x, y: to.y });
          const bRaw = linkPoint(to, sizes, link.toAnchor, { x: from.x, y: from.y });
          const b = arrowEndpoint(to, sizes, aRaw, ARROW_GAP);
          const a = link.kind === "collaboration"
            ? arrowEndpoint(from, sizes, bRaw, ARROW_GAP)
            : aRaw;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const curve = link.curve ?? 0;
          const cx = mx + nx * curve;
          const cy = my + ny * curve;
          // Pour calculer l'angle visuel des arrowheads, on convertit les
          // coords (en % du canvas de design 1200×800) en pixels du DESIGN,
          // pas de la zone .schema. Le scale homothétique appliqué ensuite
          // est uniforme et ne change pas les angles.
          const sx = DESIGN_W / 100;
          const sy = DESIGN_H / 100;
          const angleEnd = Math.atan2((b.y - cy) * sy, (b.x - cx) * sx) * 180 / Math.PI;
          const angleStart = Math.atan2((a.y - cy) * sy, (a.x - cx) * sx) * 180 / Math.PI;
          const isSel = selection?.type === "link" && selection.id === link.id;
          const isHl = focusInfo?.linkedLinks.has(link.id) ?? false;
          const isDim = focusInfo && !isHl;
          return (
            <React.Fragment key={link.id}>
              <Arrowhead x={b.x} y={b.y} angle={angleEnd} kind={link.kind} highlighted={isSel || isHl} dimmed={isDim} />
              {link.kind === "collaboration" ? (
                <Arrowhead x={a.x} y={a.y} angle={angleStart} kind={link.kind} highlighted={isSel || isHl} dimmed={isDim} />
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      <div className="schema__labels">
        {visibleLinks.map((l) => {
          const isSel = selection?.type === "link" && selection.id === l.id;
          const isHl = focusInfo?.linkedLinks.has(l.id) ?? false;
          return <SchemaLinkLabel key={l.id} link={l} nodes={nodes} sizes={sizes}
            visible={editMode || isSel || isHl}
            editMode={editMode}
            onDragStart={onLabelDragStart} />;
        })}
      </div>
      <div className="schema__nodes">
        {nodes.filter((n) => n.kind === "container").map((n) => {
          const isSel = (selection?.type === "node" && selection.id === n.id) || (selectedIds && selectedIds.includes(n.id));
          const isHl = focusInfo?.linkedNodes.has(n.id) ?? false;
          const isDim = focusInfo && !isHl;
          return (
            <SchemaNode key={n.id} node={n} selected={isSel} highlighted={isHl} dimmed={isDim}
              editMode={editMode} isLinkSource={linkDrawing?.from === n.id}
              onClick={(nd, ev) => onPickNode(nd.id, ev)}
              onHover={(nd) => setHover({ type: "node", id: nd.id })}
              onLeave={() => setHover(null)}
              onDragStart={onDragStart} registerSize={registerSize} />
          );
        })}
        {nodes.filter((n) => n.kind !== "container").map((n) => {
          const isSel = (selection?.type === "node" && selection.id === n.id) || (selectedIds && selectedIds.includes(n.id));
          const isHl = focusInfo?.linkedNodes.has(n.id) ?? false;
          const isDim = focusInfo && !isHl;
          return (
            <SchemaNode key={n.id} node={n} selected={isSel} highlighted={isHl} dimmed={isDim}
              editMode={editMode} isLinkSource={linkDrawing?.from === n.id}
              hasTasks={nodesWithTasks.has(n.id)}
              onClick={(nd, ev) => onPickNode(nd.id, ev)}
              onHover={(nd) => setHover({ type: "node", id: nd.id })}
              onLeave={() => setHover(null)}
              onDragStart={onDragStart} registerSize={registerSize} />
          );
        })}
      </div>
      {editingLink ? (() => {
        const fromNode = findById(nodes, editingLink.from);
        const toNode = findById(nodes, editingLink.to);
        if (!fromNode || !toNode) return null;
        const a = linkPoint(fromNode, sizes, editingLink.fromAnchor, { x: toNode.x, y: toNode.y });
        const b = linkPoint(toNode, sizes, editingLink.toAnchor, { x: fromNode.x, y: fromNode.y });
        // Une ancre est "détachée" si ses coords sortent du rectangle [0,1]
        // (= la poignée n'est plus sur le bord du nœud, mais dans le canvas).
        const isOut = (an) => an && (an.x < 0 || an.x > 1 || an.y < 0 || an.y > 1);
        const fromOut = isOut(editingLink.fromAnchor);
        const toOut = isOut(editingLink.toAnchor);
        return (
          <div className="schema__handles">
            <div className={"link-handle" + (fromOut ? " is-detached" : "")}
              style={{ left: `${a.x}%`, top: `${a.y}%` }}
              title={fromOut ? "Départ détaché du nœud — glisser pour ajuster" : "Glisser pour ajuster le départ"}
              onClick={(ev) => ev.stopPropagation()}
              onMouseDown={(ev) => onAnchorDragStart(editingLink.id, "from", ev)} />
            <div className={"link-handle" + (toOut ? " is-detached" : "")}
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
              title={toOut ? "Arrivée détachée du nœud — glisser pour ajuster" : "Glisser pour ajuster l'arrivée"}
              onClick={(ev) => ev.stopPropagation()}
              onMouseDown={(ev) => onAnchorDragStart(editingLink.id, "to", ev)} />
          </div>
        );
      })() : null}
      </div>{/* /.schema__design */}
      </div>{/* /.schema__viewport */}
      {!editMode && isZoomed ? (
        <button type="button" className="schema__reset-zoom"
          onClick={(e) => { e.stopPropagation(); resetZoom(); }}
          title="Réinitialiser le zoom et le déplacement">
          ⟲ Recadrer
        </button>
      ) : null}
    </div>
  );
}

export default Schema;
