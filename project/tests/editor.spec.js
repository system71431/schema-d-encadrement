// Tests des flux éditeur : entrée/sortie du mode édition, undo/redo,
// brouillon localStorage, raccourcis clavier. Ne touche pas aux flows
// GitHub (qui réclament un PAT et un backend mock — couverture séparée).
//
// Configurés pour le profil `desktop` uniquement (cf. playwright.config.js)
// car le bouton Éditer est masqué par CSS sur les viewports < 600px.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // On efface le localStorage uniquement avant le premier load — pas via
  // addInitScript qui se rejouerait à chaque navigation (et viderait un
  // brouillon que le test vient de poser pour vérifier la restauration au
  // reload).
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
  await page.reload();
  await expect(page.locator(".toolbar__title")).toBeVisible();
});

test("le bouton Éditer entre en mode édition (panneau visible)", async ({ page }) => {
  await page.locator(".toolbar__edit").click();
  await expect(page.locator(".editor-panel")).toBeVisible();
  // Les boutons undo / redo sont rendus mais désactivés au démarrage.
  await expect(page.locator(".editor-panel__hist-btn").first()).toBeDisabled();
});

test("Quitter ferme le panneau d'édition", async ({ page }) => {
  await page.locator(".toolbar__edit").click();
  await expect(page.locator(".editor-panel")).toBeVisible();
  await page.locator(".editor-panel__exit").click();
  await expect(page.locator(".editor-panel")).toHaveCount(0);
});

test("Ctrl+Z / Ctrl+Y ne font rien sans modification préalable", async ({ page }) => {
  await page.locator(".toolbar__edit").click();
  // Aucun pushHistory → undo doit rester no-op : pas d'erreur, pas de toast d'erreur.
  await page.keyboard.press("Control+KeyZ");
  await page.keyboard.press("Control+KeyY");
  await expect(page.locator(".toast--error")).toHaveCount(0);
});

test("le brouillon est écrit en localStorage à l'édition", async ({ page }) => {
  await page.locator(".toolbar__edit").click();
  // L'auto-save tourne à chaque changement de nodes/links/header. Pour
  // déclencher un changement vérifiable sans interagir avec le drag (qui
  // requiert des positions précises), on modifie le titre via le panneau
  // d'édition s'il en expose un input. Sinon, on s'appuie juste sur
  // l'auto-save initial qui se déclenche au montage en mode édition.
  await page.waitForTimeout(150);
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("schema-encadrement-draft") || "null")
  );
  expect(draft).not.toBeNull();
  expect(Array.isArray(draft.nodes)).toBe(true);
  expect(Array.isArray(draft.links)).toBe(true);
  expect(typeof draft.savedAt).toBe("number");
});

test("le brouillon est restauré au reload (même DATA_VERSION)", async ({ page }) => {
  await page.locator(".toolbar__edit").click();
  // Laisse le auto-save écrire le draft initial (useEffect mount).
  await page.waitForTimeout(150);
  // Pose un faux brouillon avec un label distinct sur le premier rôle, en
  // réutilisant la DATA_VERSION exposée par la page courante.
  const debug = await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("schema-encadrement-draft") || "null");
    if (!cur) return { ok: false, reason: "brouillon absent" };
    let touched = false;
    cur.nodes = cur.nodes.map((n) => {
      if (!touched && n.kind === "role") { touched = true; return { ...n, label: "ROLE-TEST-XYZ" }; }
      return n;
    });
    if (!touched) return { ok: false, reason: "aucun rôle dans la seed" };
    localStorage.setItem("schema-encadrement-draft", JSON.stringify(cur));
    return { ok: true, dataVersion: cur.dataVersion };
  });
  expect(debug.ok, debug.reason).toBe(true);
  await page.reload();
  await expect(page.locator(".toolbar__title")).toBeVisible();
  // Le label modifié doit apparaître dans le DOM rendu.
  await expect(page.locator(".node__label", { hasText: "ROLE-TEST-XYZ" })).toBeVisible();
});

test("un brouillon avec une DATA_VERSION périmée est purgé silencieusement", async ({ page }) => {
  await page.locator(".toolbar__edit").click();
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("schema-encadrement-draft") || "null");
    cur.dataVersion = "9999-12-31T23:59:59Z"; // version qui ne matchera jamais
    let touched = false;
    cur.nodes = cur.nodes.map((n) => {
      if (!touched && n.kind === "role") { touched = true; return { ...n, label: "BROUILLON-PERIME" }; }
      return n;
    });
    localStorage.setItem("schema-encadrement-draft", JSON.stringify(cur));
  });
  await page.reload();
  await expect(page.locator(".toolbar__title")).toBeVisible();
  await expect(page.locator(".node__label", { hasText: "BROUILLON-PERIME" })).toHaveCount(0);
});

test("Échap ferme le panneau popup ouvert", async ({ page }) => {
  // Ouvrir le popup en cliquant sur un nœud
  await page.locator(".node--role").first().click();
  await expect(page.locator(".pop")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".pop")).toHaveCount(0);
});

test("le bouton SHA pointe vers github avec l'attribut href correct", async ({ page }) => {
  const v = page.locator(".toolbar__version");
  await expect(v).toBeVisible();
  await expect(v).toHaveAttribute("href", /github\.com\/.+\/commit\/[a-f0-9]+/);
  await expect(v).toHaveAttribute("target", "_blank");
});
