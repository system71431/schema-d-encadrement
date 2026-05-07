// Système global de feedback UI : toasts non-bloquants + dialogs modaux.
// Remplace les `window.alert` / `window.prompt` / `window.confirm` qui
// cassent le thread JS, ne se stylisent pas et trahissent l'esthétique
// papier de l'app.
//
// API :
//   toast.success(msg) / toast.error(msg) / toast.info(msg)
//   await confirmDialog({ title, message, confirmLabel, variant })
//   await promptDialog({ title, message, fields, submitLabel })
//   await infoDialog({ title, message, copyValue })
//
// Architecture : module-level singleton + un <FeedbackHost /> monté une
// fois au top-level. Pas de contexte React (boilerplate inutile vu qu'il
// n'y a qu'un consommateur global).

import React, { useEffect, useState, useRef } from "react";

// ---- Toasts ---------------------------------------------------------------

let toastSeq = 0;
let toastList = [];
let toastListeners = [];

function emitToasts() { toastListeners.forEach((l) => l(toastList)); }

function pushToast(kind, msg, duration = 4500) {
  const id = ++toastSeq;
  toastList = [...toastList, { id, kind, msg }];
  emitToasts();
  setTimeout(() => dismissToast(id), duration);
  return id;
}
function dismissToast(id) {
  toastList = toastList.filter((t) => t.id !== id);
  emitToasts();
}

export const toast = {
  success: (msg, d) => pushToast("success", msg, d),
  error: (msg, d) => pushToast("error", msg, d ?? 7000),
  info: (msg, d) => pushToast("info", msg, d),
};

function ToastHost() {
  const [items, setItems] = useState(toastList);
  useEffect(() => {
    toastListeners.push(setItems);
    return () => { toastListeners = toastListeners.filter((l) => l !== setItems); };
  }, []);
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <span className="toast__msg">{t.msg}</span>
          <button className="toast__close" aria-label="Fermer"
            onClick={() => dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

// ---- Dialog ---------------------------------------------------------------

let dialogResolver = null;
let dialogState = null;
let dialogListener = null;

function openDialog(opts) {
  return new Promise((resolve) => {
    if (dialogResolver) {
      // Un dialog déjà ouvert : on annule le précédent (cancel) avant
      // d'afficher le nouveau, sinon les promises s'empilent.
      dialogResolver(null);
    }
    dialogResolver = resolve;
    dialogState = opts;
    dialogListener?.(dialogState);
  });
}
function closeDialog(result) {
  const r = dialogResolver;
  dialogResolver = null;
  dialogState = null;
  dialogListener?.(null);
  r?.(result);
}

export function confirmDialog({ title, message, confirmLabel = "OK", cancelLabel = "Annuler", variant }) {
  return openDialog({ kind: "confirm", title, message, confirmLabel, cancelLabel, variant });
}
export function promptDialog({ title, message, fields, submitLabel = "OK", cancelLabel = "Annuler" }) {
  return openDialog({ kind: "prompt", title, message, fields, submitLabel, cancelLabel });
}
export function infoDialog({ title, message, copyValue, okLabel = "OK" }) {
  return openDialog({ kind: "info", title, message, copyValue, okLabel });
}

function DialogHost() {
  const [state, setState] = useState(dialogState);
  useEffect(() => {
    dialogListener = setState;
    return () => { dialogListener = null; };
  }, []);
  // Esc = cancel ; Enter = submit (si pas dans un textarea).
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeDialog(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);
  if (!state) return null;
  return <DialogModal state={state} />;
}

function DialogModal({ state }) {
  const firstFieldRef = useRef(null);
  const [values, setValues] = useState(() => {
    const v = {};
    (state.fields || []).forEach((f) => { v[f.name] = f.defaultValue ?? ""; });
    return v;
  });
  useEffect(() => {
    // Auto-focus du premier input ; sur mobile cela ouvre aussi le clavier.
    firstFieldRef.current?.focus();
  }, []);
  const onSubmit = (e) => {
    e?.preventDefault();
    if (state.kind === "prompt") closeDialog({ values });
    else if (state.kind === "confirm") closeDialog(true);
    else closeDialog(true);
  };
  const onCancel = () => closeDialog(state.kind === "confirm" ? false : null);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(state.copyValue); toast.success("URL copiée"); } catch (_) {}
  };
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={"dialog" + (state.variant ? ` dialog--${state.variant}` : "")}
        role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" className="dialog__title">{state.title}</h2>
        {state.message ? (
          <p className="dialog__message">{state.message}</p>
        ) : null}
        {state.kind === "info" && state.copyValue ? (
          <div className="dialog__copy">
            <code className="dialog__copy-value">{state.copyValue}</code>
            <button type="button" className="dialog__copy-btn" onClick={onCopy}>Copier</button>
          </div>
        ) : null}
        {state.kind === "prompt" ? (
          <form onSubmit={onSubmit} className="dialog__form">
            {(state.fields || []).map((f, i) => (
              <label key={f.name} className="dialog__field">
                <span className="dialog__field-label">{f.label}</span>
                <input
                  ref={i === 0 ? firstFieldRef : undefined}
                  type={f.type || "text"}
                  value={values[f.name]}
                  placeholder={f.placeholder || ""}
                  autoComplete={f.autoComplete || "off"}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                />
                {f.hint ? <span className="dialog__field-hint">{f.hint}</span> : null}
              </label>
            ))}
            <div className="dialog__actions">
              <button type="button" className="dialog__btn dialog__btn--ghost" onClick={onCancel}>{state.cancelLabel}</button>
              <button type="submit" className="dialog__btn dialog__btn--primary">{state.submitLabel}</button>
            </div>
          </form>
        ) : (
          <div className="dialog__actions">
            {state.kind === "confirm" ? (
              <>
                <button type="button" className="dialog__btn dialog__btn--ghost" onClick={onCancel}>{state.cancelLabel}</button>
                <button type="button"
                  className={"dialog__btn " + (state.variant === "danger" ? "dialog__btn--danger" : "dialog__btn--primary")}
                  onClick={onSubmit}>{state.confirmLabel}</button>
              </>
            ) : (
              <button type="button" className="dialog__btn dialog__btn--primary" onClick={onSubmit}>{state.okLabel}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Host -----------------------------------------------------------------

export function FeedbackHost() {
  return (
    <>
      <DialogHost />
      <ToastHost />
    </>
  );
}
