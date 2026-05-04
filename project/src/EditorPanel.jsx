import React from "react";

const PALETTE = [
  { name: "Jaune",  value: "#f5c443" },
  { name: "Rouge",  value: "#e54b3f" },
  { name: "Vert",   value: "#3eb371" },
  { name: "Bleu",   value: "#4f8fd6" },
  { name: "Rose",   value: "#f2b6b6" },
  { name: "Papier", value: "#fbf6ea" },
  { name: "Encre",  value: "#21201d" },
];

// Insère un retour à la ligne (\n) dans un <input> sur Alt+Entrée.
function altEnterHandler(value, onChange) {
  return (e) => {
    if (e.key !== "Enter" || !e.altKey) return;
    e.preventDefault();
    const t = e.target;
    const s = t.selectionStart || 0;
    const en = t.selectionEnd || 0;
    const v = value || "";
    onChange(v.slice(0, s) + "\n" + v.slice(en));
    requestAnimationFrame(() => {
      try { t.setSelectionRange(s + 1, s + 1); } catch (_) {}
    });
  };
}

function ColorField({ label, value, onChange, allowEmpty, transparentOption }) {
  return (
    <div className="editor-field">
      <span>{label}</span>
      <div className="color-picker">
        {transparentOption ? (
          <button type="button"
            className={"color-swatch color-swatch--transparent" + (!value ? " is-selected" : "")}
            title="Aucune (transparent — que le contour)"
            onClick={() => onChange(undefined)} />
        ) : null}
        {PALETTE.map((c) => (
          <button key={c.value} type="button"
            className={"color-swatch" + (value === c.value ? " is-selected" : "")}
            style={{ background: c.value }} title={c.name}
            onClick={() => onChange(c.value)} />
        ))}
        <input type="color" value={value || "#fbf6ea"}
          onChange={(e) => onChange(e.target.value)} />
        {allowEmpty && !transparentOption && value ? (
          <button type="button" className="color-clear" onClick={() => onChange(undefined)} title="Réinitialiser à la couleur par défaut">×</button>
        ) : null}
      </div>
    </div>
  );
}

function ListField({ label, items, onChange, placeholder }) {
  return (
    <div className="editor-field">
      <span>{label}</span>
      <div className="editor-list">
        {items.map((item, i) => (
          <div key={i} className="editor-list__row">
            <input value={item} placeholder={placeholder}
              title="Alt+Entrée pour passer à la ligne"
              onChange={(e) => { const next = items.slice(); next[i] = e.target.value; onChange(next); }}
              onKeyDown={altEnterHandler(item, (v) => { const next = items.slice(); next[i] = v; onChange(next); })} />
            <button type="button" title="Supprimer cette ligne"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="editor-list__add"
          onClick={() => onChange([...items, ""])}>+ Ajouter</button>
      </div>
    </div>
  );
}

function NodeEditor({ node, nodes, onUpdate, onDelete, onClose }) {
  const update = (patch) => onUpdate(node.id, { ...node, ...patch });
  const isShape = node.kind === "shape";
  const isContainer = node.kind === "container";
  const hasSize = isShape || isContainer;
  const groupMates = node.groupId
    ? (nodes || []).filter((n) => n.groupId === node.groupId && n.id !== node.id)
    : [];
  return (
    <div className="editor-form">
      <header className="editor-form__head">
        <h3>{isShape ? "Éditer la forme" : "Éditer le nœud"}</h3>
        <button type="button" className="editor-form__close" onClick={onClose} aria-label="Fermer">×</button>
      </header>
      <label className="editor-field">
        <span>Type</span>
        <select value={node.kind} onChange={(e) => update({ kind: e.target.value })}>
          <option value="role">Rôle individuel</option>
          <option value="group">Organe collectif</option>
          <option value="resource">Ressource externe</option>
          <option value="container">Conteneur (périmètre)</option>
          <option value="shape">Forme libre</option>
        </select>
      </label>
      {isShape ? (
        <label className="editor-field">
          <span>Forme</span>
          <select value={node.shape || "circle"} onChange={(e) => update({ shape: e.target.value })}>
            <option value="circle">Cercle</option>
            <option value="square">Carré</option>
            <option value="triangle">Triangle</option>
            <option value="diamond">Losange</option>
            <option value="hexagon">Hexagone</option>
            <option value="star">Étoile</option>
          </select>
        </label>
      ) : null}
      {!isShape ? (
        <label className="editor-field">
          <span>Style graphique</span>
          <select value={node.variant || "default"}
            onChange={(e) => {
              const v = e.target.value;
              update({ variant: v === "default" ? undefined : v });
            }}>
            <option value="default">Par défaut</option>
            <option value="filled">Plein (fond foncé)</option>
            <option value="paper">Papier (fond clair)</option>
            <option value="outline">Contour (transparent)</option>
            {isContainer ? <option value="badge">Badge (cadre arrondi, couleur d'accent)</option> : null}
          </select>
        </label>
      ) : null}
      <label className="editor-field">
        <span>ID interne</span>
        <input value={node.id} disabled title="L'ID ne peut pas être modifié — il sert de référence pour les liens." />
      </label>
      <label className="editor-field">
        <span>{isShape ? "Texte (optionnel)" : "Label"}</span>
        <input value={node.label || ""}
          title="Alt+Entrée pour passer à la ligne"
          onChange={(e) => update({ label: e.target.value })}
          onKeyDown={altEnterHandler(node.label || "", (v) => update({ label: v }))} />
      </label>
      {!isShape ? (
        <label className="editor-field">
          <span>Sous-titre (optionnel)</span>
          <input value={node.sublabel || ""} placeholder="ex. Responsable de Groupe"
            title="Alt+Entrée pour passer à la ligne"
            onChange={(e) => { const v = e.target.value; update({ sublabel: v || undefined }); }}
            onKeyDown={altEnterHandler(node.sublabel || "", (v) => update({ sublabel: v || undefined }))} />
        </label>
      ) : null}
      <ColorField
        label={isShape ? "Couleur de remplissage" : (node.variant === "badge" ? "Couleur d'accent" : "Couleur de fond")}
        value={node.color}
        onChange={(v) => update({ color: v })}
        allowEmpty
        transparentOption={isShape}
      />
      {isShape ? (
        <ColorField
          label="Couleur du contour"
          value={node.strokeColor}
          onChange={(v) => update({ strokeColor: v })}
          allowEmpty
        />
      ) : null}
      {(isShape || isContainer) ? (
        <label className="editor-field">
          <span>Épaisseur du trait</span>
          <input type="number" min="0" max="20" step="0.5"
            value={node.strokeWidth ?? ""}
            placeholder={isShape ? "3" : (node.variant === "badge" ? "4" : "2.5")}
            onChange={(e) => {
              const v = e.target.value;
              update({ strokeWidth: v === "" ? undefined : Number(v) });
            }} />
        </label>
      ) : null}
      {isShape ? (
        <label className="editor-field">
          <span>Style du trait</span>
          <select value={node.strokeStyle || "solid"}
            onChange={(e) => {
              const v = e.target.value;
              update({ strokeStyle: v === "solid" ? undefined : v });
            }}>
            <option value="solid">Plein</option>
            <option value="dashed">Traitillé</option>
            <option value="dotted">Pointillé</option>
          </select>
        </label>
      ) : null}
      {!isShape ? (
        <>
          <label className="editor-field">
            <span>Description</span>
            <textarea rows="4" value={node.description || ""} onChange={(e) => update({ description: e.target.value })} />
          </label>
          <ListField label="Responsabilités" items={node.responsabilites || []}
            onChange={(items) => update({ responsabilites: items })} placeholder="ex. Animer les séances" />
          <ListField label="Rend des comptes à" items={node.superviseurs || []}
            onChange={(items) => update({ superviseurs: items })} placeholder="ex. Comité" />
        </>
      ) : null}
      {(node.kind === "role" || node.kind === "group" || node.kind === "resource") ? (
        <NodeTaskListField
          nodes={nodes}
          items={node.tasks || []}
          currentNodeId={node.id}
          onChange={(items) => update({ tasks: items.length ? items : undefined })}
        />
      ) : null}
      <div className="editor-pos">
        <label className="editor-field editor-field--inline">
          <span>X (%)</span>
          <input type="number" step="0.5" min="0" max="100" value={node.x}
            onChange={(e) => update({ x: Number(e.target.value) })} />
        </label>
        <label className="editor-field editor-field--inline">
          <span>Y (%)</span>
          <input type="number" step="0.5" min="0" max="100" value={node.y}
            onChange={(e) => update({ y: Number(e.target.value) })} />
        </label>
        {hasSize ? (
          <>
            <label className="editor-field editor-field--inline">
              <span>Largeur (%)</span>
              <input type="number" step="0.5" min="2" max="100" value={node.w ?? (isShape ? 12 : 20)}
                onChange={(e) => update({ w: Number(e.target.value) })} />
            </label>
            <label className="editor-field editor-field--inline">
              <span>Hauteur (%)</span>
              <input type="number" step="0.5" min="2" max="100" value={node.h ?? (isShape ? 12 : 60)}
                onChange={(e) => update({ h: Number(e.target.value) })} />
            </label>
          </>
        ) : null}
        <label className="editor-field editor-field--inline editor-scale">
          <span>Échelle (×)</span>
          <input type="number" step="0.1" min="0.3" max="4" value={node.scale ?? 1}
            onChange={(e) => {
              const v = Number(e.target.value);
              update({ scale: (Number.isFinite(v) && v !== 1) ? v : undefined });
            }} />
        </label>
      </div>
      {node.groupId ? (
        <div className="editor-group-info">
          <span>Fusionné avec :</span>
          <div className="editor-group-info__mates">
            {groupMates.length > 0
              ? groupMates.map((m) => (
                  <span key={m.id} className="editor-group-info__chip">{m.label || m.id}</span>
                ))
              : <em style={{ fontFamily: "var(--font-hand)", color: "var(--ink-3)" }}>(aucun autre membre)</em>}
          </div>
          <button type="button" className="editor-detach-group"
            onClick={() => update({ groupId: undefined })}>
            Détacher du groupe
          </button>
        </div>
      ) : null}
      <button type="button" className="editor-delete"
        onClick={() => {
          const what = isShape ? "la forme" : "le nœud";
          const tail = !isShape ? " Tous les liens connectés seront aussi supprimés." : "";
          if (confirm(`Supprimer ${what} "${node.label || node.id}" ?${tail}`)) onDelete(node.id);
        }}>
        Supprimer {isShape ? "cette forme" : "ce nœud"}
      </button>
    </div>
  );
}

const ANCHOR_POSITIONS = [
  { x: 0,   y: 0,   key: "tl", label: "↖" },
  { x: 0.5, y: 0,   key: "t",  label: "↑" },
  { x: 1,   y: 0,   key: "tr", label: "↗" },
  { x: 0,   y: 0.5, key: "l",  label: "←" },
  { x: 0.5, y: 0.5, key: "c",  label: "•" },
  { x: 1,   y: 0.5, key: "r",  label: "→" },
  { x: 0,   y: 1,   key: "bl", label: "↙" },
  { x: 0.5, y: 1,   key: "b",  label: "↓" },
  { x: 1,   y: 1,   key: "br", label: "↘" },
];

function AnchorPicker({ label, value, onChange }) {
  const isAuto = !value;
  const isDetached = value && (value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1);
  return (
    <div className="editor-field">
      <span>{label}</span>
      <div className="anchor-picker">
        <button type="button"
          className={"anchor-auto" + (isAuto ? " is-active" : "")}
          onClick={() => onChange(undefined)}
          title="Ancrage automatique au bord le plus proche">Auto</button>
        <div className="anchor-grid">
          {ANCHOR_POSITIONS.map((p) => {
            const active = value && Math.abs(value.x - p.x) < 0.01 && Math.abs(value.y - p.y) < 0.01;
            return (
              <button key={p.key} type="button"
                className={"anchor-cell" + (active ? " is-active" : "")}
                onClick={() => onChange({ x: p.x, y: p.y })}>{p.label}</button>
            );
          })}
        </div>
      </div>
      {isDetached ? (
        <div className="anchor-detached-hint">
          ⚠ Position détachée du nœud (x={value.x.toFixed(2)}, y={value.y.toFixed(2)}).
          Glisser la poignée bleue dans le schéma, ou cliquer un preset ci-dessus pour ramener au bord.
        </div>
      ) : null}
    </div>
  );
}

function NodeTaskListField({ nodes, items, currentNodeId, onChange }) {
  const targets = (nodes || []).filter((n) =>
    (n.kind === "role" || n.kind === "group" || n.kind === "resource") && n.id !== currentNodeId
  );
  const list = items || [];
  return (
    <div className="editor-field">
      <span>Tâches envers d'autres nœuds</span>
      <div className="editor-list editor-tasks">
        {list.map((item, i) => (
          <div key={i} className="editor-task-row editor-task-row--node">
            <input type="text"
              value={item.label || ""}
              placeholder="Tâche…"
              title="Alt+Entrée pour passer à la ligne"
              onChange={(e) => {
                const next = list.slice();
                next[i] = { ...item, label: e.target.value };
                onChange(next);
              }}
              onKeyDown={altEnterHandler(item.label || "", (v) => {
                const next = list.slice();
                next[i] = { ...item, label: v };
                onChange(next);
              })}
            />
            <select
              className="editor-task-towards"
              value={item.towards || ""}
              onChange={(e) => {
                const next = list.slice();
                if (e.target.value) next[i] = { ...item, towards: e.target.value };
                else { const c = { ...item }; delete c.towards; next[i] = c; }
                onChange(next);
              }}>
              <option value="">— Envers… —</option>
              {targets.map((n) => (
                <option key={n.id} value={n.id}>{n.label || n.id}</option>
              ))}
            </select>
            <select
              className="editor-task-shared-select"
              value={item.sharedWith || ""}
              title="Optionnel : tâche partagée avec un autre nœud"
              onChange={(e) => {
                const next = list.slice();
                if (e.target.value) next[i] = { ...item, sharedWith: e.target.value };
                else { const c = { ...item }; delete c.sharedWith; next[i] = c; }
                onChange(next);
              }}>
              <option value="">— Pas partagée —</option>
              {targets.map((n) => (
                <option key={n.id} value={n.id}>+ {n.label || n.id}</option>
              ))}
            </select>
            <button type="button" title="Supprimer cette tâche"
              onClick={() => onChange(list.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className="editor-list__add"
          onClick={() => onChange([...list, { label: "", towards: "" }])}>+ Ajouter une tâche</button>
      </div>
    </div>
  );
}

function TaskListField({ label, items, otherNode, onChange }) {
  const otherId = otherNode ? otherNode.id : "";
  const otherLabel = otherNode ? (otherNode.label || otherId) : "?";
  return (
    <div className="editor-field">
      <span>{label}</span>
      <div className="editor-list editor-tasks">
        {items.map((item, i) => {
          const isShared = item.sharedWith === otherId;
          return (
            <div key={i} className="editor-task-row">
              <input type="text"
                value={item.label || ""}
                placeholder="Tâche…"
                title="Alt+Entrée pour passer à la ligne"
                onChange={(e) => {
                  const next = items.slice();
                  next[i] = { ...item, label: e.target.value };
                  onChange(next);
                }}
                onKeyDown={altEnterHandler(item.label || "", (v) => {
                  const next = items.slice();
                  next[i] = { ...item, label: v };
                  onChange(next);
                })}
              />
              <label className="editor-task-shared" title={"Cocher si la tâche est partagée avec " + otherLabel}>
                <input type="checkbox" checked={isShared}
                  onChange={(e) => {
                    const next = items.slice();
                    if (e.target.checked) {
                      next[i] = { ...item, sharedWith: otherId };
                    } else {
                      const copy = { ...item };
                      delete copy.sharedWith;
                      next[i] = copy;
                    }
                    onChange(next);
                  }} />
                <span>+ {otherLabel}</span>
              </label>
              <button type="button" title="Supprimer cette tâche"
                onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
            </div>
          );
        })}
        <button type="button" className="editor-list__add"
          onClick={() => onChange([...items, { label: "" }])}>+ Ajouter une tâche</button>
      </div>
    </div>
  );
}

function LinkEditor({ link, nodes, onUpdate, onDelete, onClose }) {
  const update = (patch) => onUpdate(link.id, { ...link, ...patch });
  const choices = nodes.filter((n) => n.kind !== "container");
  const fromN = nodes.find((n) => n.id === link.from);
  const toN = nodes.find((n) => n.id === link.to);
  return (
    <div className="editor-form">
      <header className="editor-form__head">
        <h3>Éditer le lien</h3>
        <button type="button" className="editor-form__close" onClick={onClose} aria-label="Fermer">×</button>
      </header>
      <label className="editor-field">
        <span>Source (de)</span>
        <select value={link.from} onChange={(e) => update({ from: e.target.value })}>
          {choices.map((n) => <option key={n.id} value={n.id}>{n.label} {n.sublabel ? `— ${n.sublabel}` : ""}</option>)}
        </select>
      </label>
      <label className="editor-field">
        <span>Cible (vers)</span>
        <select value={link.to} onChange={(e) => update({ to: e.target.value })}>
          {choices.map((n) => <option key={n.id} value={n.id}>{n.label} {n.sublabel ? `— ${n.sublabel}` : ""}</option>)}
        </select>
      </label>
      <label className="editor-field">
        <span>Type de relation</span>
        <select value={link.kind} onChange={(e) => update({ kind: e.target.value })}>
          <option value="encadrement">Encadrement</option>
          <option value="collaboration">Collaboration</option>
        </select>
      </label>
      <AnchorPicker label="Point de départ (source)"
        value={link.fromAnchor}
        onChange={(v) => update({ fromAnchor: v })} />
      <AnchorPicker label="Point d'arrivée (cible)"
        value={link.toAnchor}
        onChange={(v) => update({ toAnchor: v })} />
      <label className="editor-field">
        <span>Verbe / label</span>
        <input value={link.label || ""} placeholder="Encadre, Coordonne, Forme…"
          title="Alt+Entrée pour passer à la ligne"
          onChange={(e) => update({ label: e.target.value })}
          onKeyDown={altEnterHandler(link.label || "", (v) => update({ label: v }))} />
      </label>
      <label className="editor-field">
        <span>Description</span>
        <textarea rows="4" value={link.description || ""} onChange={(e) => update({ description: e.target.value })} />
      </label>
      {link.kind === "encadrement" && fromN && toN ? (
        <>
          <TaskListField
            label={"Tâches de « " + (fromN.label || fromN.id) + " » envers " + (toN.label || toN.id)}
            items={(link.tasks && link.tasks[fromN.id]) || []}
            otherNode={toN}
            onChange={(items) => {
              const next = { ...(link.tasks || {}) };
              if (items.length === 0) delete next[fromN.id];
              else next[fromN.id] = items;
              update({ tasks: Object.keys(next).length ? next : undefined });
            }}
          />
          <TaskListField
            label={"Tâches de « " + (toN.label || toN.id) + " » avec " + (fromN.label || fromN.id)}
            items={(link.tasks && link.tasks[toN.id]) || []}
            otherNode={fromN}
            onChange={(items) => {
              const next = { ...(link.tasks || {}) };
              if (items.length === 0) delete next[toN.id];
              else next[toN.id] = items;
              update({ tasks: Object.keys(next).length ? next : undefined });
            }}
          />
        </>
      ) : null}
      <label className="editor-field editor-field--inline">
        <span>Courbure</span>
        <input type="number" step="1" value={link.curve ?? 0}
          onChange={(e) => update({ curve: Number(e.target.value) })} />
      </label>
      <button type="button" className="editor-delete"
        onClick={() => { if (confirm(`Supprimer le lien "${link.label}" ?`)) onDelete(link.id); }}>
        Supprimer ce lien
      </button>
    </div>
  );
}

function EditorPanel(props) {
  const {
    editMode, editing, nodes, links,
    onEditingChange, onNodeUpdate, onLinkUpdate,
    onNodeDelete, onLinkDelete, onAddNode, onStartLinkDraw,
    linkDrawing, onCancelLinkDraw,
    onExport, onImport, onExitEdit, onResetDraft,
    selectedIds, onFuseSelected, onClearMultiSelection,
    onGenerateViewer,
    onUndo, onRedo, canUndo, canRedo,
    onExportPNG,
    header, onHeaderChange,
  } = props;
  const fileRef = React.useRef(null);
  if (!editMode) return null;

  const multi = (selectedIds && selectedIds.length >= 2) ? selectedIds : null;

  let body;
  if (linkDrawing) {
    const fromNode = linkDrawing.from ? nodes.find((n) => n.id === linkDrawing.from) : null;
    body = (
      <div className="editor-empty">
        <p><strong>Mode dessin de lien</strong></p>
        {fromNode
          ? <p>Source sélectionnée : <em>« {fromNode.label} »</em>.<br />Cliquez maintenant le nœud cible.</p>
          : <p>Cliquez le nœud <strong>source</strong> du nouveau lien.</p>}
        <button type="button" className="editor-cancel" onClick={onCancelLinkDraw}>Annuler</button>
      </div>
    );
  } else if (multi) {
    const sel = multi.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
    const groups = new Set(sel.map((n) => n.groupId).filter(Boolean));
    const sameGroup = groups.size === 1 && sel.every((n) => n.groupId);
    body = (
      <div className="editor-multi">
        <h3 className="editor-multi__title">Sélection ({sel.length})</h3>
        <ul className="editor-multi__list">
          {sel.map((n) => (
            <li key={n.id}>
              <span>{n.label || n.id}</span>
              <span className="editor-multi__list-kind">{n.kind}</span>
            </li>
          ))}
        </ul>
        {sameGroup ? (
          <p className="editor-multi__info">Ces nœuds sont déjà fusionnés en un seul groupe.</p>
        ) : (
          <button type="button" className="editor-fuse" onClick={onFuseSelected}>Fusionner ces nœuds</button>
        )}
        <button type="button" onClick={onClearMultiSelection}>Annuler la sélection</button>
        <p className="editor-multi__hint">Astuce : Ctrl+clic (ou ⌘+clic) sur un nœud pour l'ajouter ou le retirer de la sélection.</p>
      </div>
    );
  } else if (editing) {
    if (editing.type === "node") {
      const n = nodes.find((x) => x.id === editing.id);
      body = n ? <NodeEditor node={n} nodes={nodes} onUpdate={onNodeUpdate} onDelete={onNodeDelete} onClose={() => onEditingChange(null)} /> : null;
    } else if (editing.type === "link") {
      const l = links.find((x) => x.id === editing.id);
      body = l ? <LinkEditor link={l} nodes={nodes} onUpdate={onLinkUpdate} onDelete={onLinkDelete} onClose={() => onEditingChange(null)} /> : null;
    }
  } else {
    body = (
      <div className="editor-empty">
        <p>Cliquez un <strong>nœud</strong> ou un <strong>lien</strong> pour l'éditer.</p>
        <p>Glissez un nœud pour le déplacer.</p>
        {header && onHeaderChange ? (
          <div className="editor-form" style={{ marginTop: 16, paddingTop: 16, borderTop: "1px dashed rgba(33,32,29,0.25)" }}>
            <h3 style={{ margin: "0 0 8px", fontFamily: "var(--font-hand-big)", fontSize: 22 }}>En-tête de la page</h3>
            <label className="editor-field">
              <span>Titre</span>
              <input value={header.title || ""}
                onChange={(e) => onHeaderChange({ ...header, title: e.target.value })} />
            </label>
            <label className="editor-field">
              <span>Sous-titre (optionnel)</span>
              <input value={header.subtitle || ""}
                onChange={(e) => onHeaderChange({ ...header, subtitle: e.target.value })} />
            </label>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <aside className="editor-panel" onClick={(e) => e.stopPropagation()}>
      <div className="editor-panel__head">
        <span className="editor-panel__title">✎ Édition</span>
        <div className="editor-panel__history">
          <button type="button" className="editor-panel__hist-btn" onClick={onUndo} disabled={!canUndo}
            title="Annuler (Ctrl+Z)" aria-label="Annuler">↶</button>
          <button type="button" className="editor-panel__hist-btn" onClick={onRedo} disabled={!canRedo}
            title="Rétablir (Ctrl+Y / Ctrl+Maj+Z)" aria-label="Rétablir">↷</button>
        </div>
        <button type="button" className="editor-panel__exit" onClick={onExitEdit}>Quitter</button>
      </div>
      <div className="editor-panel__add">
        <button type="button" onClick={() => onAddNode("role")}>+ Rôle</button>
        <button type="button" onClick={() => onAddNode("group")}>+ Organe</button>
        <button type="button" onClick={() => onAddNode("resource")}>+ Ressource</button>
        <button type="button" onClick={() => onAddNode("container")}>+ Conteneur</button>
        <button type="button" onClick={() => onAddNode("shape")}>+ Forme</button>
        <button type="button" className={linkDrawing ? "is-active" : ""} onClick={onStartLinkDraw}>
          {linkDrawing ? "Annuler lien" : "+ Lien"}
        </button>
      </div>
      <div className="editor-panel__body">{body}</div>
      <div className="editor-panel__io">
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => { onImport(String(reader.result || "")); if (fileRef.current) fileRef.current.value = ""; };
            reader.readAsText(f);
          }} />
        <button type="button" onClick={() => fileRef.current && fileRef.current.click()}>Importer</button>
        <button type="button" onClick={onExport}>Exporter JSON</button>
        <button type="button" onClick={onExportPNG} title="Exporte le schéma en image PNG">Exporter PNG</button>
        <button type="button" onClick={onGenerateViewer} title="Génère une page HTML autonome (viewer-only) avec les données actuelles">Générer page</button>
        <button type="button" className="editor-reset" onClick={onResetDraft} title="Annule toutes les modifications non exportées">Réinitialiser</button>
      </div>
    </aside>
  );
}

export default EditorPanel;
