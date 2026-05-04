import React from "react";

function Popup({ payload, nodes, links, onClose, onSelectNode, onSelectLink }) {
  if (!payload) return null;
  const { x, y, kind, id } = payload;
  const NODES = nodes || [];
  const LINKS = links || [];
  const getNodeById = (nid) => NODES.find((n) => n.id === nid);

  let body = null;
  let title = "";
  let eyebrow = "";
  let _isNamed = false;
  let _isWide = false;

  if (kind === "node") {
    const node = getNodeById(id);
    if (!node) return null;
    _isNamed = node.kind === "role" || node.kind === "group" || node.kind === "resource";
    // Bascule en mode "wide" (popup centré, multi-colonnes, sans scroll)
    // dès que le nœud a un nombre conséquent de tâches.
    if (_isNamed) {
      let n = 0;
      (LINKS || []).forEach((l) => {
        if (l.kind !== "encadrement") return;
        if (l.from !== node.id && l.to !== node.id) return;
        const ts = l.tasks && l.tasks[node.id];
        if (Array.isArray(ts)) n += ts.length;
      });
      (node.tasks || []).forEach((t) => { if (t && t.towards) n += 1; });
      _isWide = n >= 8;
    }
    title = _isNamed ? "" : node.label;
    eyebrow = _isNamed ? (node.label || node.id) : (function (k) {
      switch (k) {
        case "container": return "Périmètre";
        case "shape": return "Forme libre";
        default: return k;
      }
    })(node.kind);
    const incoming = LINKS.filter((l) => l.to === id);
    const outgoing = LINKS.filter((l) => l.from === id);
    const getLbl = (nid) => { const n = getNodeById(nid); return n ? n.label : nid; };
    const groupMates = node.groupId
      ? (NODES || []).filter((n) => n.groupId === node.groupId && n.id !== node.id)
      : [];
    body = (
      <>
        {node.sublabel ? <div className="pop__sub">{node.sublabel}</div> : null}
        <p className="pop__desc">{node.description}</p>
        {groupMates.length ? (
          <section className="pop__section">
            <h3 className="pop__h3">Fusionné avec</h3>
            <div className="pop__chips">
              {groupMates.map((n) => (
                <button key={n.id} className="pop__group-mate" onClick={(e) => { e.stopPropagation(); onSelectNode(n.id); }}>
                  {n.label || n.id}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {node.responsabilites?.length ? (
          <section className="pop__section">
            <h3 className="pop__h3">Responsabilités</h3>
            <ul className="pop__list">
              {node.responsabilites.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>
        ) : null}
        {(node.kind === "role" || node.kind === "group" || node.kind === "resource") ? (() => {
          // Fusionne tâches issues des liens d'encadrement (link.tasks[node.id]) et tâches
          // définies directement sur le nœud (node.tasks avec champ towards).
          const groups = new Map();
          const addToGroup = (target, direction, tasks) => {
            const key = target + "|" + direction;
            const existing = groups.get(key);
            if (existing) existing.tasks = existing.tasks.concat(tasks);
            else groups.set(key, { target, direction, tasks: tasks.slice() });
          };
          (LINKS || []).forEach((l) => {
            if (l.kind !== "encadrement") return;
            if (l.from !== node.id && l.to !== node.id) return;
            const ts = l.tasks && l.tasks[node.id];
            if (!Array.isArray(ts) || ts.length === 0) return;
            const isFrom = l.from === node.id;
            addToGroup(isFrom ? l.to : l.from, isFrom ? "envers" : "avec", ts);
          });
          (node.tasks || []).forEach((task) => {
            if (!task || !task.towards) return;
            addToGroup(task.towards, "envers", [task]);
          });
          if (groups.size === 0) return null;
          // Détection automatique des tâches partagées : pour un label donné,
          // on cherche TOUS les autres rôles (via node.tasks ou link.tasks)
          // qui ont la même tâche, et on affiche un tag pour chacun.
          const findSharedRoles = (label) => {
            const ids = new Set();
            (NODES || []).forEach((n) => {
              if (n.id === node.id) return;
              if ((n.tasks || []).some((t) => t && t.label === label)) ids.add(n.id);
            });
            (LINKS || []).forEach((l) => {
              if (!l.tasks) return;
              Object.keys(l.tasks).forEach((roleId) => {
                if (roleId === node.id) return;
                const ts = l.tasks[roleId] || [];
                if (ts.some((t) => t && t.label === label)) ids.add(roleId);
              });
            });
            return Array.from(ids);
          };
          // Vérifier s'il y a au moins une tâche partagée → affiche la légende.
          let hasShared = false;
          for (const g of groups.values()) {
            for (const t of g.tasks) {
              if (findSharedRoles(t.label).length > 0 || t.sharedWith) { hasShared = true; break; }
            }
            if (hasShared) break;
          }
          return (
            <section className="pop__section">
              <h3 className="pop__h3">Tâches</h3>
              {hasShared ? (
                <div className="pop__legend">
                  <span className="pop__legend-item">
                    <span className="pop__legend-dot" />
                    Tâche aussi assignée à un autre rôle (clic pour y aller)
                  </span>
                </div>
              ) : null}
              {/* Une seule liste multi-colonnes : les sous-titres "envers X"
                  occupent toute la largeur (column-span: all) et coupent les
                  colonnes ; les tâches qui suivent reprennent en flow. */}
              <ul className="pop__tasks-list pop__tasks-list--unified">
                {Array.from(groups.values()).map((group, gIdx) => {
                  const other = getNodeById(group.target);
                  return (
                    <React.Fragment key={gIdx}>
                      <li className="pop__tasks-subtitle">
                        <span>{group.direction}</span>
                        <button className="pop__inline-link"
                          onClick={(e) => { e.stopPropagation(); onSelectNode(group.target); }}>
                          {other ? (other.label || group.target) : group.target}
                        </button>
                      </li>
                      {group.tasks.map((task, i) => {
                        // Fusionne sharedWith explicite + détection auto (sans doublon).
                        const sharedIds = new Set(findSharedRoles(task.label));
                        if (task.sharedWith) sharedIds.add(task.sharedWith);
                        const sharedNodes = Array.from(sharedIds)
                          .map((sid) => getNodeById(sid))
                          .filter(Boolean);
                        return (
                          <li key={gIdx + '-' + i} className="pop__task">
                            <svg className="pop__task-icon" viewBox="0 0 16 16" aria-hidden="true">
                              <path d="M 3 8.5 L 7 12.5 L 13.5 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span>{task.label}</span>
                            {sharedNodes.length > 0 ? (
                              <span className="pop__task-shared">
                                {sharedNodes.map((sn) => (
                                  <button key={sn.id} className="pop__task-shared-dot"
                                    data-tooltip={(sn.label || sn.id).replace(/\n/g, " ")}
                                    onClick={(e) => { e.stopPropagation(); onSelectNode(sn.id); }}
                                    aria-label={"Voir " + (sn.label || sn.id)} />
                                ))}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </ul>
            </section>
          );
        })() : null}
        {node.superviseurs?.length ? (
          <section className="pop__section">
            <h3 className="pop__h3">Rend des comptes à</h3>
            <div className="pop__chips">
              {node.superviseurs.map((s, i) => <span key={i} className="chip">{s}</span>)}
            </div>
          </section>
        ) : null}
      </>
    );
  } else if (kind === "link") {
    const link = LINKS.find((l) => l.id === id);
    if (!link) return null;
    const from = getNodeById(link.from);
    const to = getNodeById(link.to);
    const fromGroup = (from && from.groupId)
      ? (NODES || []).filter((n) => n.groupId === from.groupId)
      : (from ? [from] : []);
    const toGroup = (to && to.groupId)
      ? (NODES || []).filter((n) => n.groupId === to.groupId)
      : (to ? [to] : []);
    eyebrow = link.kind === "encadrement" ? "Relation d'encadrement" : "Collaboration";
    title = link.label;
    body = (
      <>
        <div className="pop__link-header">
          <div className="pop__link-side">
            {fromGroup.map((n) => (
              <button key={n.id} className="pop__inline-link" onClick={(e) => { e.stopPropagation(); onSelectNode(n.id); }}>{n.label || n.id}</button>
            ))}
          </div>
          <svg width="32" height="12" viewBox="0 0 32 12" className="pop__link-arrow">
            <line x1="0" y1="6" x2="24" y2="6" className={`arrow-line arrow-line--${link.kind}`} vectorEffect="non-scaling-stroke"/>
            <path d="M 22 2 L 30 6 L 22 10 z" className={`arrow-head arrow-head--${link.kind}`} />
          </svg>
          <div className="pop__link-side">
            {toGroup.map((n) => (
              <button key={n.id} className="pop__inline-link" onClick={(e) => { e.stopPropagation(); onSelectNode(n.id); }}>{n.label || n.id}</button>
            ))}
          </div>
        </div>
        <p className="pop__desc">{link.description}</p>
        <div className={`pop__type-card pop__type-card--${link.kind}`}>
          {link.kind === "encadrement"
            ? <span><strong>Encadrement.</strong> Relation hiérarchique à sens unique : la flèche pointe vers la personne ou l'organe encadré.</span>
            : <span><strong>Collaboration.</strong> Échange d'informations dans les deux sens, sans rapport hiérarchique.</span>}
        </div>
      </>
    );
  }

  // Largeur fixe du popup et estimation de hauteur (vrai height est unknown
  // tant que pas rendu — POPUP_H_EST sert au flip vertical pour ne pas sortir
  // de l'écran). Si tu retailles le popup en CSS, mets à jour POPUP_W.
  const POPUP_W = 320;
  const POPUP_H_EST = 360;
  let left = x + 16;
  let top = y + 16;
  let arrow = "tl";
  if (typeof window !== "undefined") {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + POPUP_W > vw - 16) { left = x - POPUP_W - 16; arrow = "tr"; }
    if (top + POPUP_H_EST > vh - 16) {
      top = y - POPUP_H_EST - 16;
      arrow = arrow === "tl" ? "bl" : "br";
    }
    if (left < 16) left = 16;
    if (top < 16) top = 16;
  }

  const popClass = `pop pop--${arrow}` + (_isWide ? " pop--wide" : "");
  const popStyle = _isWide ? {} : { left, top, width: POPUP_W };

  return (
    <div className={popClass} style={popStyle} onClick={(e) => e.stopPropagation()}>
      <div className="pop__head">
        <div className={"pop__eyebrow" + (_isNamed ? " pop__eyebrow--name" : "")}>{eyebrow}</div>
        <button className="pop__close" onClick={onClose} aria-label="Fermer">
          <svg width="12" height="12" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>
      </div>
      {title ? <h2 className="pop__title">{title}</h2> : null}
      {body}
    </div>
  );
}
export default Popup;
