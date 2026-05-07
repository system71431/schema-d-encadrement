// @ts-check
// Export PNG : capture `.schema__viewport` (parent du `.schema__design`
// transformé) — html2canvas gère mal les CSS transforms, donc on capture
// le viewport déjà rasterisé à la taille écran.
//
// Import dynamique de html2canvas : ~150KB gzippés qu'on ne charge que si
// l'utilisateur clique sur Exporter. Le bundle reste léger pour la
// majorité des visiteurs (la page partagée n'utilise jamais l'export).

import { useCallback } from "react";
import { toast } from "../feedback.jsx";

export function usePngExport() {
  return useCallback(async () => {
    const target = /** @type {HTMLElement | null} */ (document.querySelector(".schema__viewport"));
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
  }, []);
}
