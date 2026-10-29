import { expect, test, type Page } from "@playwright/test";

// Test-only credentials for the local Supabase instance (never a real account).
const PASSWORD = "E2e-test-password-1";

async function signUp(page: Page, email: string) {
  await page.goto("/inscription");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/Mot de passe/).fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/veille/);
}

test("création → veille → favori → action → retour, persistants après rechargement", async ({ page }) => {
  await signUp(page, `e2e-${Date.now()}@example.test`);
  await expect(page.getByText("Aucun projet actif")).toBeVisible();
  await page.getByRole("link", { name: "Créer mon premier projet" }).first().click();

  await page.getByLabel("Nom du projet *").fill("Réservation salon");
  await page.getByLabel("Courte description *").fill("SaaS de réservation avec paiement d’un acompte. Next.js et PostgreSQL.");
  await page.getByRole("checkbox", { name: "Next.js" }).check();
  await page.getByRole("checkbox", { name: "PostgreSQL" }).check();
  await page.getByLabel("Stade").selectOption("production");
  await page.getByRole("checkbox", { name: "Paiement" }).check();
  await page.getByRole("button", { name: "Créer le projet" }).click();

  await expect(page.getByRole("heading", { name: "Réservation salon" })).toBeVisible();
  await expect(page.getByText("Contexte utilisé pour personnaliser la veille")).toBeVisible();

  await page.getByRole("link", { name: "Veille", exact: true }).click();
  const first = page.locator("article").first();
  await expect(first).toBeVisible();
  await expect(first.getByText(/Pourquoi pour ce projet/)).toBeVisible();
  const title = (await first.locator("h3").innerText()).trim();

  // Favorite
  await first.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("article", { hasText: title }).first().getByRole("button", { name: "Enregistré" })).toBeVisible();

  // Action from the item
  const card = page.locator("article", { hasText: title }).first();
  await card.getByText("Créer une action").click();
  await card.getByRole("button", { name: "Créer l’action" }).click();
  await expect(card.getByText("Action créée.")).toBeVisible();

  // Persistence after reload
  await page.reload();
  await page.goto("/enregistres");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto("/actions");
  await expect(page.getByText(`Étudier : ${title}`.slice(0, 40))).toBeVisible();

  // Feedback is per project and reversible
  await page.goto("/veille");
  const target = page.locator("article").first();
  const targetTitle = (await target.locator("h3").innerText()).trim();
  await target.getByText("Peu pertinent").click();
  await target.getByRole("button", { name: "Déjà connu" }).click();
  await expect(page.locator("article h3", { hasText: targetTitle })).toHaveCount(0);
  await page.getByRole("link", { name: "Mes projets" }).first().click();
  await page.getByRole("link", { name: /Réservation salon/ }).click();
  await expect(page.getByText(targetTitle)).toBeVisible();
  await page.getByRole("button", { name: "Annuler" }).first().click();
  await expect(page.getByText("Aucun retour.")).toBeVisible();
});

test("un projet sans stack reçoit une veille fondée sur ses besoins", async ({ page }) => {
  await signUp(page, `e2e-idea-${Date.now()}@example.test`);
  await page.goto("/projets/nouveau");
  await page.getByLabel("Nom du projet *").fill("Idée plateforme");
  await page.getByLabel("Courte description *").fill("Une plateforme de cours en ligne, stack pas encore choisie.");
  await page.getByRole("checkbox", { name: "Accessibilité" }).check();
  await page.getByRole("checkbox", { name: "Performance" }).check();
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page.getByText(/Non définie — la veille s’appuie sur les besoins/)).toBeVisible();
  await page.getByRole("link", { name: "Veille", exact: true }).click();
  // Either relevant items or an honest empty state — never filler.
  await expect(page.locator("article").first().or(page.getByText("Aucune information pertinente pour l’instant"))).toBeVisible();
});

test("une URL de projet d’un autre compte renvoie une page introuvable", async ({ page, browser }) => {
  await signUp(page, `e2e-owner-${Date.now()}@example.test`);
  await page.goto("/projets/nouveau");
  await page.getByLabel("Nom du projet *").fill("Projet privé");
  await page.getByLabel("Courte description *").fill("Données privées.");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page.getByRole("heading", { name: "Projet privé" })).toBeVisible();
  const url = page.url();

  const other = await browser.newPage();
  await signUp(other, `e2e-intruder-${Date.now()}@example.test`);
  await other.goto(url);
  await expect(other.getByRole("heading", { name: "Projet privé" })).toHaveCount(0);
  await expect(other.getByText(/404|introuvable|could not be found/i).first()).toBeVisible();
});

test("navigation au clavier : lien d’évitement et focus visible", async ({ page }) => {
  await signUp(page, `e2e-kbd-${Date.now()}@example.test`);
  await page.goto("/veille"); // fresh document load
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});
