// Historique undo/redo : pile à deux côtés, plafonnée à `limit` entrées.
// On ne sauvegarde que `{nodes, links}` — la sélection et l'état
// d'édition ne sont pas dans l'historique (volontaire : un undo ne doit
// pas rouvrir un panneau qu'on vient de fermer).

import { useState, useCallback } from "react";

const DEFAULT_LIMIT = 50;

export function useHistory(nodes, links, setNodes, setLinks, limit = DEFAULT_LIMIT) {
  const [history, setHistory] = useState({ undo: [], redo: [] });

  const pushHistory = useCallback(() => {
    setHistory((h) => ({
      undo: [...h.undo, { nodes, links }].slice(-limit),
      redo: [],
    }));
  }, [nodes, links, limit]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.undo.length) return h;
      const prev = h.undo[h.undo.length - 1];
      setNodes(prev.nodes);
      setLinks(prev.links);
      return {
        undo: h.undo.slice(0, -1),
        redo: [...h.redo, { nodes, links }].slice(-limit),
      };
    });
  }, [nodes, links, setNodes, setLinks, limit]);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (!h.redo.length) return h;
      const next = h.redo[h.redo.length - 1];
      setNodes(next.nodes);
      setLinks(next.links);
      return {
        undo: [...h.undo, { nodes, links }].slice(-limit),
        redo: h.redo.slice(0, -1),
      };
    });
  }, [nodes, links, setNodes, setLinks, limit]);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
  };
}
