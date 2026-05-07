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

// On cherche un `<script ...>...</script>` dont les attributs contiennent
// À LA FOIS `id="schema-data"` et `type="application/json"`, dans n'importe
// quel ordre. La double exigence évite de matcher le littéral
// `<script id="schema-data">` qui apparaît aussi dans le bundle JS (message
// d'erreur). L'indépendance d'ordre survit à un éventuel réordonnancement
// par Vite ou à un changement manuel de `index.html`.
const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
function findSchemaDataBlock(html) {
  SCRIPT_TAG_RE.lastIndex = 0;
  let m;
  while ((m = SCRIPT_TAG_RE.exec(html)) !== null) {
    const attrs = m[1];
    const hasId = /\bid\s*=\s*["']schema-data["']/.test(attrs);
    const hasJson = /\btype\s*=\s*["']application\/json["']/.test(attrs);
    if (hasId && hasJson) return { start: m.index, end: m.index + m[0].length, body: m[2] };
  }
  return null;
}

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
  const templateBlock = findSchemaDataBlock(freshTemplate);
  if (!templateBlock) {
    console.error("[rebuild-shared] Bloc schema-data introuvable dans dist/index.html — abandon.");
    process.exit(1);
  }
  for (const filename of entries) {
    const oldPath = path.join(PUBLIC_SHARED, filename);
    const oldHtml = await readFile(oldPath, "utf8");
    const oldBlock = findSchemaDataBlock(oldHtml);
    if (!oldBlock) {
      console.warn(`[rebuild-shared] ${filename} : bloc schema-data introuvable, skip.`);
      continue;
    }
    // Remplace par splice de chaîne (plus robuste qu'un .replace avec une
    // regex appliquée sur freshTemplate, qui pourrait introduire des
    // ambiguïtés si plusieurs candidats existent).
    const newTag = `<script id="schema-data" type="application/json" data-mode="viewer">${oldBlock.body}</script>`;
    const rebuilt =
      freshTemplate.slice(0, templateBlock.start) +
      newTag +
      freshTemplate.slice(templateBlock.end);
    const outPath = path.join(DIST_SHARED, filename);
    await writeFile(outPath, rebuilt);
    console.log(`[rebuild-shared] ${filename} régénéré (${rebuilt.length} octets).`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
