import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "E2e-test-password-1";

async function signUpWithProject(page: Page) {
  await page.goto("/inscription");
  await page.getByLabel("Adresse e-mail").fill(`e2e-v2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`);
  await page.getByLabel(/Mot de passe/).fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/veille/);
  await page.goto("/projets/nouveau");
  await page.getByLabel("Nom du projet *").fill("Projet E2E");
  await page.getByLabel("Courte description *").fill("SaaS Next.js et PostgreSQL avec paiement.");
  await page.getByRole("checkbox", { name: "Next.js" }).check();
  await page.getByRole("checkbox", { name: "PostgreSQL" }).check();
  await page.getByRole("checkbox", { name: "Paiement" }).check();
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page.getByRole("heading", { name: "Projet E2E" })).toBeVisible();
}

test("palette Ctrl+K, panneau de détail et retour sans perdre la position", async ({ page }) => {
  await signUpWithProject(page);
  await page.goto("/veille");
  // Palette: own projects only, keyboard navigation.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Palette de commandes" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill("Projet E2E");
  await expect(palette.getByRole("option", { name: /Projet E2E/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  // Shortcut help, opened with « ? » outside of inputs.
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Raccourcis clavier" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Detail opens in a side panel over the list; Échap closes it and returns focus to the trigger.
  const link = page.locator("article h3 a").first();
  await link.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  await link.click();
  const panel = page.locator("dialog[open]");
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\/contenu\//);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/veille/);
  await expect(panel).toHaveCount(0);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(5);
  await expect(link).toBeFocused();
});

test("utilisable avec les effets désactivés et les animations réduites", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signUpWithProject(page);
  await page.goto("/parametres");
  await page.getByRole("button", { name: "Désactiver les effets" }).click();
  await expect(page.getByRole("button", { name: "Activer les effets" })).toBeVisible();
  await page.goto("/veille");
  await expect(page.locator("html")).toHaveAttribute("data-effects", "off");
  // Static radar only, content fully usable.
  expect(await page.locator("canvas").evaluateAll((cs) => cs.every((c) => getComputedStyle(c).opacity === "0"))).toBe(true);
  const card = page.locator("article").first();
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByRole("button", { name: "Enregistré" })).toBeVisible();
  await page.reload();
  await expect(page.locator("article").first().getByRole("button", { name: "Enregistré" })).toBeVisible();
});
