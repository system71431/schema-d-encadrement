import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { execSync } from "node:child_process";

// SHA injecté au build pour que l'app puisse afficher sa version. En CI,
// GITHUB_SHA est posé automatiquement ; en local, on lit `git rev-parse HEAD`.
// Fallback "dev" si aucune source disponible (build hors repo).
function readCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}
const COMMIT = readCommit();
const COMMIT_SHORT = COMMIT ? COMMIT.slice(0, 7) : "dev";

// Le projet sort un seul HTML autonome (CSS + JS inlinés) pour conserver
// le mode de distribution historique : un fichier qu'on peut envoyer par
// email ou ouvrir en file://. La feature « Générer page » dépend de cette
// auto-suffisance pour cloner document.documentElement.outerHTML.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    __COMMIT_SHA__: JSON.stringify(COMMIT),
    __COMMIT_SHORT__: JSON.stringify(COMMIT_SHORT),
  },
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
