import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // L'app stocke un brouillon dans localStorage qui pourrait persister entre
  // tests si reuseExistingServer=true. On efface avant chaque test.
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch (_) {}
  });
  await page.goto("/");
  // Attendre que React ait monté l'app : la toolbar doit avoir apparu.
  await expect(page.locator(".toolbar__title")).toBeVisible();
});

test("la pastille SHA est visible et cliquable", async ({ page }) => {
  const v = page.locator(".toolbar__version");
  await expect(v).toBeVisible();
  const text = (await v.textContent())?.trim() || "";
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toBe("dev");
  // Lien externe vers GitHub
  await expect(v).toHaveAttribute("href", /github\.com\/.+\/commit\/[a-f0-9]+/);
});

test("au chargement, le bouton recadrer n'est PAS affiché", async ({ page }) => {
  await expect(page.locator(".schema__reset-zoom")).toHaveCount(0);
});

test("tap sur un rôle ouvre le popup en bottom-sheet (mobile)", async ({ page }) => {
  // Trouver un nœud cliquable (un rôle)
  const node = page.locator(".node--role").first();
  await expect(node).toBeVisible();
  await node.tap();

  const pop = page.locator(".pop");
  await expect(pop).toBeVisible();

  // Vérifier que c'est bien stylé en bottom-sheet : position fixed, ancré bas
  const box = await pop.boundingBox();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  // Le popup doit toucher le bas de l'écran (à <2px près)
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 4);
  // Et être presque pleine largeur
  expect(box.width).toBeGreaterThan(viewport.width - 8);
});

test("tap sur le bouton X ferme le popup", async ({ page }) => {
  await page.locator(".node--role").first().tap();
  const pop = page.locator(".pop");
  await expect(pop).toBeVisible();
  await page.locator(".pop__close").tap();
  await expect(pop).toBeHidden();
});

test("tap sur le backdrop ferme le popup (mobile)", async ({ page }) => {
  await page.locator(".node--role").first().tap();
  await expect(page.locator(".pop")).toBeVisible();
  // Le backdrop couvre tout l'écran ; le popup le recouvre dans sa zone
  // (75vh en bas). On tape sur la portion exposée en haut.
  await page.locator(".pop-backdrop").tap({ position: { x: 50, y: 30 } });
  await expect(page.locator(".pop")).toBeHidden();
});

test("pan 1 doigt sur le schéma déclenche le zoom et le bouton recadrer", async ({ page }) => {
  const schema = page.locator(".schema");
  const box = await schema.boundingBox();
  expect(box).not.toBeNull();
  // Mouvement sur >8px (au-delà du seuil) sur une zone vide du schéma
  const startX = box.x + box.width * 0.8;
  const startY = box.y + box.height * 0.5;
  await page.touchscreen.tap(startX, startY); // pour s'assurer qu'on est dessus
  // Drag manuel via dispatchEvent pointer
  await schema.dispatchEvent("pointerdown", { pointerId: 1, clientX: startX, clientY: startY, pointerType: "touch", isPrimary: true });
  await schema.dispatchEvent("pointermove", { pointerId: 1, clientX: startX - 80, clientY: startY, pointerType: "touch" });
  await schema.dispatchEvent("pointermove", { pointerId: 1, clientX: startX - 160, clientY: startY, pointerType: "touch" });
  await schema.dispatchEvent("pointerup",   { pointerId: 1, clientX: startX - 160, clientY: startY, pointerType: "touch" });

  // Le bouton recadrer doit apparaître
  await expect(page.locator(".schema__reset-zoom")).toBeVisible();
});

test("le bouton recadrer remet le zoom à zéro", async ({ page }) => {
  const schema = page.locator(".schema");
  const box = await schema.boundingBox();
  const startX = box.x + box.width * 0.8;
  const startY = box.y + box.height * 0.5;
  await schema.dispatchEvent("pointerdown", { pointerId: 1, clientX: startX, clientY: startY, pointerType: "touch", isPrimary: true });
  await schema.dispatchEvent("pointermove", { pointerId: 1, clientX: startX - 200, clientY: startY, pointerType: "touch" });
  await schema.dispatchEvent("pointerup",   { pointerId: 1, clientX: startX - 200, clientY: startY, pointerType: "touch" });

  const reset = page.locator(".schema__reset-zoom");
  await expect(reset).toBeVisible();
  await reset.tap();
  await expect(reset).toBeHidden();
});

test("la toolbar tient sur la largeur du viewport mobile", async ({ page }) => {
  const toolbar = page.locator(".toolbar");
  const box = await toolbar.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
});

test("aucune erreur console au chargement", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.reload();
  await expect(page.locator(".toolbar__title")).toBeVisible();
  // On filtre les erreurs réseau externes (fonts.googleapis.com bloqué dans
  // certains environnements de test mais sans impact fonctionnel — la police
  // tombe en fallback).
  const real = errors.filter((e) => !/CERT_AUTHORITY_INVALID|fonts\.googleapis|fonts\.gstatic|net::ERR_/.test(e));
  expect(real).toEqual([]);
});
