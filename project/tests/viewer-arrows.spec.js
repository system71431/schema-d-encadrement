import { test, expect } from "@playwright/test";

// Protocole de test pour la version partagée (mode viewer) sur mobile.
// On charge la page autonome publiée dans `public/shared/` et on vérifie
// que les flèches (arrowheads) sont rendues à une taille raisonnable et
// positionnées près de l'extrémité de leur lien.
//
// Symptôme reproduit : sur mobile, les triangles d'arrowhead « explosent »
// (taille démesurée, déconnectés des liens). Ces tests doivent échouer
// avant le fix et passer après.

// On vise un fichier partagé spécifique committé dans le repo. S'il
// disparaît (l'utilisateur l'a supprimé via l'API), on skip plutôt
// que de cascader 6 échecs trompeurs. Le suite reste vert même quand
// le partage de référence change de nom — il suffit de pointer vers un
// autre via la variable d'env VIEWER_SAMPLE.
const SHARED_PATH = process.env.VIEWER_SAMPLE || "/shared/schema-d-encadrement-asn.html";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_) {}
  });
  const res = await page.goto(SHARED_PATH);
  test.skip(!res || res.status() === 404, `Page partagée ${SHARED_PATH} introuvable — skip.`);
  // L'app monte de la même manière qu'en mode editor — on attend la toolbar.
  await expect(page.locator(".toolbar__title")).toBeVisible();
  // Un peu de marge pour laisser ResizeObserver enregistrer les sizes des
  // nœuds, qui conditionnent les positions/angles des arrowheads.
  await page.waitForTimeout(300);
});

test("la page partagée s'ouvre en mode viewer (pas de bouton Éditer)", async ({ page }) => {
  await expect(page.locator(".toolbar__edit")).toHaveCount(0);
});

test("au moins une flèche d'arrowhead est rendue", async ({ page }) => {
  const count = await page.locator(".arrow-marker").count();
  expect(count).toBeGreaterThan(0);
});

test("les arrowheads ont une taille raisonnable (pas d'explosion)", async ({ page }) => {
  // Récupère la bounding-box rendue de chaque arrowhead. Avec le scale
  // homothétique mobile + l'OVERFLOW_CAP de 2.5x, un arrowhead 14×12 en
  // design coords ne devrait pas dépasser ~80px à l'écran sur un viewport
  // 393×851. On exige < 120px pour avoir une marge mais détecter quand
  // ça dérape (centaines/milliers de px).
  const sizes = await page.locator(".arrow-marker").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    })
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) {
    expect(s.w).toBeGreaterThan(0);
    expect(s.h).toBeGreaterThan(0);
    expect(s.w).toBeLessThan(120);
    expect(s.h).toBeLessThan(120);
  }
});

test("chaque arrowhead a des attributs width/height explicites (régression iOS Safari)", async ({ page }) => {
  // Sans `width`/`height` sur l'élément <svg>, iOS Safari retombe sur la
  // taille intrinsèque par défaut (300×150) quand un ancêtre porte une
  // CSS transform — ce qui faisait « exploser » les flèches sur la page
  // partagée mobile. On exige les attributs en plus du CSS.
  const missing = await page.locator(".arrow-marker").evaluateAll((els) =>
    els
      .map((el, i) => ({
        i,
        width: el.getAttribute("width"),
        height: el.getAttribute("height"),
      }))
      .filter((a) => !a.width || !a.height)
  );
  expect(missing).toEqual([]);
});

test("aucun arrowhead ne dépasse la zone du schéma", async ({ page }) => {
  // Garde-fou supplémentaire : un arrowhead qui « explose » à 300×150
  // déborde largement du conteneur .schema. Si la régression revient
  // (par exemple sur un nouveau navigateur), ce test l'attrape même si
  // la mesure brute paraît OK dans le DOM.
  const result = await page.evaluate(() => {
    const schema = document.querySelector(".schema").getBoundingClientRect();
    const arrows = Array.from(document.querySelectorAll(".arrow-marker"));
    const offenders = [];
    for (const a of arrows) {
      const r = a.getBoundingClientRect();
      const overflowX = Math.max(0, schema.left - r.left, r.right - schema.right);
      const overflowY = Math.max(0, schema.top - r.top, r.bottom - schema.bottom);
      if (overflowX > 30 || overflowY > 30) {
        offenders.push({ rect: r, overflowX, overflowY });
      }
    }
    return offenders;
  });
  expect(result, JSON.stringify(result)).toEqual([]);
});

test("aucune erreur console au chargement de la page partagée", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.reload();
  await expect(page.locator(".toolbar__title")).toBeVisible();
  const real = errors.filter((e) => !/CERT_AUTHORITY_INVALID|fonts\.googleapis|fonts\.gstatic|net::ERR_/.test(e));
  expect(real).toEqual([]);
});
