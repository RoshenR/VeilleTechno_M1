import { expect, test } from "@playwright/test";

test("démo et écrans principaux utilisables en largeur mobile", async ({ page }) => {
  await page.goto("/demo?item=d2");
  await expect(page.getByText("Mode démonstration")).toBeVisible();
  await expect(page.getByText("Donnée de démonstration").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto("/inscription");
  await page.getByLabel("Adresse e-mail").fill(`e2e-mobile-${Date.now()}@example.test`);
  await page.getByLabel(/Mot de passe/).fill("E2e-test-password-1");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/veille/);
  // Bottom navigation replaces the sidebar.
  const nav = page.getByRole("navigation", { name: "Navigation principale" }).last();
  await expect(nav.getByRole("link", { name: "Mes projets" })).toBeVisible();
  await nav.getByRole("link", { name: "Paramètres" }).click();
  await expect(page.getByRole("heading", { name: "Paramètres" })).toBeVisible();
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
});
