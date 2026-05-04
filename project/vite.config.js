import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Le projet sort un seul HTML autonome (CSS + JS inlinés) pour conserver
// le mode de distribution historique : un fichier qu'on peut envoyer par
// email ou ouvrir en file://. La feature « Générer page » dépend de cette
// auto-suffisance pour cloner document.documentElement.outerHTML.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
