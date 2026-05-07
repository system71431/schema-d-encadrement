// Regénère les fichiers `dist/shared/*.html` à partir du bundle frais
// (dist/index.html), en préservant les données de chaque schéma partagé
// (#schema-data + data-mode="viewer"). Sans cette étape, les pages
// partagées restent figées sur le bundle qui était en vigueur lors du
// partage initial — donc ne bénéficient d'aucun fix appliqué depuis.
//
// Stratégie : on extrait le textContent du bloc `<script id="schema-data">`
// dans chaque fichier shared/ existant (committé), puis on l'injecte dans
// une copie du nouveau dist/index.html, en marquant data-mode="viewer".
//
// Note : ce script est utilisé en local et en CI pour que le déploiement
// GitHub Pages serve une page partagée à jour. Les utilisateurs qui ont
// déjà copié leur lien voient automatiquement la dernière version (le
// fichier au même chemin a juste été mis à jour).

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "..");
const PUBLIC_SHARED = path.join(PROJECT, "public", "shared");
const DIST_SHARED = path.join(PROJECT, "dist", "shared");
const DIST_INDEX = path.join(PROJECT, "dist", "index.html");

// Capture le bloc `<script id="schema-data" type="application/json" ...>` ouvrant +
// son contenu + sa fermeture. On exige `type="application/json"` parce que la
// chaîne `<script id="schema-data">` apparaît aussi dans le bundle JS (dans
// un message d'erreur littéral) — sans cette contrainte la regex matchait
// d'abord là, ce qui sabotait la régénération.
const SCHEMA_DATA_RE = /<script\s+id="schema-data"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/;

async function main() {
  if (!existsSync(DIST_INDEX)) {
    console.error("[rebuild-shared] dist/index.html introuvable. Lance `npm run build` d'abord.");
    process.exit(1);
  }
  if (!existsSync(PUBLIC_SHARED)) {
    console.log("[rebuild-shared] Pas de dossier public/shared/ — rien à faire.");
    return;
  }
  const freshTemplate = await readFile(DIST_INDEX, "utf8");
  const entries = (await readdir(PUBLIC_SHARED)).filter((f) => f.endsWith(".html"));
  if (entries.length === 0) {
    console.log("[rebuild-shared] Aucun fichier shared/ à reconstruire.");
    return;
  }
  await mkdir(DIST_SHARED, { recursive: true });
  for (const filename of entries) {
    const oldPath = path.join(PUBLIC_SHARED, filename);
    const oldHtml = await readFile(oldPath, "utf8");
    const m = oldHtml.match(SCHEMA_DATA_RE);
    if (!m) {
      console.warn(`[rebuild-shared] ${filename} : bloc schema-data introuvable, skip.`);
      continue;
    }
    const data = m[1];
    // Remplace dans le bundle frais le bloc schema-data + force viewer.
    const rebuilt = freshTemplate.replace(
      SCHEMA_DATA_RE,
      () =>
        `<script id="schema-data" type="application/json" data-mode="viewer">${data}</script>`
    );
    if (rebuilt === freshTemplate) {
      console.warn(`[rebuild-shared] ${filename} : le template ne contient pas de bloc schema-data à remplacer.`);
      continue;
    }
    const outPath = path.join(DIST_SHARED, filename);
    await writeFile(outPath, rebuilt);
    console.log(`[rebuild-shared] ${filename} régénéré (${rebuilt.length} octets).`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
