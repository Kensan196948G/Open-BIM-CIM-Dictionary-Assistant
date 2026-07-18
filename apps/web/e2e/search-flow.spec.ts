import { expect, test } from "@playwright/test";

/**
 * Acceptance flow for Issue #6 (SCR-01 → SCR-02 → SCR-03):
 * home → search → concept detail → source/provenance visible.
 */

test("home renders search box and featured terms", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /探せる・分かる・根拠へ戻れる/ }),
  ).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("link", { name: "IfcAlignment" })).toBeVisible();
});

test("search 線形 → open IfcAlignment detail → provenance shown", async ({ page }) => {
  await page.goto("/");

  // keyboard-first: type and submit with Enter
  const input = page.getByLabel("用語を検索");
  await input.fill("線形");
  await input.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=/);
  const resultLink = page.getByRole("link", { name: /IfcAlignment IFC entity/ });
  await expect(resultLink.first()).toBeVisible();

  // exact-name card navigates to the concept detail
  await page
    .getByRole("link", { name: /^IfcAlignment IFC entity/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/concepts\//);
  await expect(
    page.getByRole("heading", { name: "IfcAlignment", exact: true }),
  ).toBeVisible();

  // §8.2: やさしい説明 and 出典 (publisher + 原典リンク) must be present
  await expect(page.getByRole("heading", { name: /やさしい説明/ })).toBeVisible();
  await expect(page.getByText("buildingSMART International")).toBeVisible();
  const sourceLink = page.getByRole("link", {
    name: /technical\.buildingsmart\.org/,
  });
  await expect(sourceLink).toHaveAttribute("rel", /noopener/);

  // related concepts navigate within the dictionary
  await expect(page.getByRole("heading", { name: /関連する概念/ })).toBeVisible();
});

test("zero-result search shows guidance instead of an empty page", async ({ page }) => {
  await page.goto("/search?q=存在しない用語xyz");
  await expect(page.getByText(/一致する用語が見つかりませんでした/)).toBeVisible();
  await expect(
    page.getByText(/表記（全角\/半角・略語・英語名）を変える/),
  ).toBeVisible();
});
