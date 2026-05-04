const { useMemo: _useMemo, useRef: _useRef, useState: _useState, useEffect: _useEffect, useCallback: _useCallback } = React;

function getNodeById(id) {
  return (window.NODES || []).find((n) => n.id === id);
}
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
  switch (shape) {
    case "square":
      return (<svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="6" y="6" width="88" height="88" {...common}/></svg>);
    case "triangle":
      return (<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,8 92,88 8,88" {...common}/></svg>);
    case "diamond":
      return (<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,6 94,50 50,94 6,50" {...common}/></svg>);
    case "hexagon":
      return (<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,8 75,8 96,50 75,92 25,92 4,50" {...common}/></svg>);
    case "star":
      return (<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,5 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" {...common}/></svg>);
    case "circle":
    default:
      return (<svg viewBox="0 0 100 100" preserveAspectRatio="none"><circle cx="50" cy="50" r="44" {...common}/></svg>);
  }
}

function SchemaNode({ node, selected, dimmed, highlighted, editMode, isLinkSource, onClick, onHover, onLeave, onDragStart, registerSize }) {
  const ref = _useRef(null);
  _useEffect(() => {
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
    </div>
  );
}

function SchemaLink({ link, nodes, sizes, selected, dimmed, highlighted, onClick, onHover, onLeave }) {
  const from = findById(nodes, link.from);
  const to = findById(nodes, link.to);
  if (!from || !to) return null;
  const a = linkPoint(from, sizes, link.fromAnchor, { x: to.x, y: to.y });
  const b = linkPoint(to, sizes, link.toAnchor, { x: from.x, y: from.y });
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
  const d = `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
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
  const a = linkPoint(from, sizes, link.fromAnchor, { x: to.x, y: to.y });
  const b = linkPoint(to, sizes, link.toAnchor, { x: from.x, y: from.y });
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
  return (
    <svg
      className={"arrow-marker arrow-marker--" + kind + (dimmed ? " is-dim" : "")}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-100%, -50%) rotate(${angle}deg)`,
      }}
      viewBox="0 0 14 12"
    >
      <path d="M 0 0 L 16 6 L 0 12 z" fill={color} />
    </svg>
  );
}

function Schema({ nodes, links, filter, selection, hover, setHover, onPickNode, onPickLink, onBlankClick, editMode, onNodeMove, linkDrawing, editing, onLinkAnchorChange, selectedIds, onLinkLabelMove, onPushHistory }) {
  const [sizes, setSizes] = _useState({});
  const dragMovedRef = _useRef(false);
  const schemaRef = _useRef(null);
  const [canvasPx, setCanvasPx] = _useState({ w: 1, h: 1 });
  _useEffect(() => {
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
  const registerSize = _useCallback((id, s) => setSizes((prev) => {
    const cur = prev[id];
    if (cur && Math.abs(cur.w - s.w) < SIZE_CHANGE_EPSILON && Math.abs(cur.h - s.h) < SIZE_CHANGE_EPSILON) return prev;
    return { ...prev, [id]: s };
  }), []);

  const focused = !editMode ? (selection || hover) : null;
  const focusInfo = _useMemo(() => {
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

  const visibleLinks = links.filter((l) => filter === "all" ? true : l.kind === filter);

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
  const fitScale = (canvasPx.w > 0 && canvasPx.h > 0)
    ? Math.min(canvasPx.w / DESIGN_W, canvasPx.h / DESIGN_H)
    : 1;
  const fitTx = (canvasPx.w - DESIGN_W * fitScale) / 2;
  const fitTy = (canvasPx.h - DESIGN_H * fitScale) / 2;
  const combinedTransform = "translate(" + fitTx + "px, " + fitTy + "px) scale(" + fitScale + ")";

  // Lien actuellement édité (pour afficher ses poignées).
  const editingLink = (editMode && editing && editing.type === "link")
    ? links.find((l) => l.id === editing.id)
    : null;

  return (
    <div ref={schemaRef} className={"schema" + (editMode ? " is-edit-mode" : "") + (linkDrawing ? " is-link-drawing" : "")} onClick={(e) => onBlankClick(e)}>
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
          const a = linkPoint(from, sizes, link.fromAnchor, { x: to.x, y: to.y });
          const b = linkPoint(to, sizes, link.toAnchor, { x: from.x, y: from.y });
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
    </div>
  );
}

window.Schema = Schema;
window.getNodeById = getNodeById;
