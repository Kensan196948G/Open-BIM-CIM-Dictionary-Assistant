import { expect, test } from "@playwright/test";

/**
 * Acceptance flow for Issue #6 (SCR-01 → SCR-02 → SCR-03):
 * home → search → concept detail → source/provenance visible.
 * Layout follows the Claude Design dc prototype (sidebar + topbar shell).
 */

test("home renders search box and featured terms", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /探せる・分かる・根拠へ戻れる/ }),
  ).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("button", { name: "IfcAlignment" })).toBeVisible();
});

test("search 線形 → open IfcAlignment detail → provenance shown", async ({ page }) => {
  await page.goto("/");

  // keyboard-first: type and submit with Enter
  const input = page.getByLabel("用語を検索");
  await input.fill("線形");
  await input.press("Enter");

  // the query must survive URL-encoding round-trip as 線形
  await expect(page).toHaveURL(
    new RegExp(`/search\\?q=${encodeURIComponent("線形")}$`),
  );
  const resultLink = page.getByRole("link", { name: "IfcAlignment", exact: true });
  await expect(resultLink.first()).toBeVisible();

  // exact-name card navigates to the concept detail
  await resultLink.first().click();
  await expect(page).toHaveURL(/\/concepts\//);
  // the topbar (level-1 heading) shows the concept name
  await expect(
    page.getByRole("heading", { name: "IfcAlignment", exact: true, level: 1 }),
  ).toBeVisible();

  // §8.2: やさしい説明 and 出典 (publisher + 原典リンク) must be present
  await expect(page.getByRole("heading", { name: /やさしい説明/ })).toBeVisible();
  await expect(page.getByText("buildingSMART International")).toBeVisible();
  const sourceLink = page.getByRole("link", {
    name: /technical\.buildingsmart\.org/,
  });
  await expect(sourceLink).toHaveAttribute("rel", /noopener/);
  await expect(sourceLink).toHaveAttribute(
    "href",
    /^https:\/\/technical\.buildingsmart\.org\//,
  );
  await expect(sourceLink).toHaveAttribute("target", "_blank");

  // related concepts navigate within the dictionary — follow one and verify
  await expect(page.getByRole("heading", { name: /関連する概念/ })).toBeVisible();
  await page.getByRole("link", { name: "IfcAlignmentHorizontal", exact: true }).click();
  await expect(page).toHaveURL(/\/concepts\//);
  await expect(
    page.getByRole("heading", {
      name: "IfcAlignmentHorizontal",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
});

test("zero-result search shows guidance instead of an empty page", async ({ page }) => {
  await page.goto("/search?q=存在しない用語xyz");
  await expect(page.getByText(/一致する用語が見つかりませんでした/)).toBeVisible();
  await expect(
    page.getByText(/表記（全角\/半角・略語・英語名）を変える/),
  ).toBeVisible();
});

test("settings and audit-log pages are reachable from the sidebar nav", async ({
  page,
}) => {
  await page.goto("/");
  // favicon is declared for the browser tab
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/favicon.svg",
  );

  await page.getByRole("link", { name: "設定", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "設定", exact: true, level: 1 }),
  ).toBeVisible();
  // system info card loads from the API
  await expect(page.getByText(/サンプル辞書\(fixtures\)/)).toBeVisible();

  await page.getByRole("link", { name: /監査ログ/ }).click();
  await expect(
    page.getByRole("heading", { name: "監査ログ", exact: true, level: 1 }),
  ).toBeVisible();
  // the earlier system-info request is already recorded in the trail
  await expect(page.getByRole("table")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "/api/v1/system/info" }).first(),
  ).toBeVisible();
});

test("compare, learn, AI and sources pages are reachable from the sidebar", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("link", { name: "比較", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "比較", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(/比較する用語を検索結果または上のメニュー/),
  ).toBeVisible();

  await page.getByRole("link", { name: "学習", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "学習", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /確認問題/ })).toBeVisible();

  await page.getByRole("link", { name: "AI質問", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI質問", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /質問する/ })).toBeVisible();

  await page.getByRole("link", { name: "出典・取り込み管理", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "出典・取り込み管理", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/情報源一覧/)).toBeVisible();
});

test("recent searches persist on this device and can be cleared", async ({ page }) => {
  await page.goto("/search?q=ç·å½¢");
  await expect(
    page.getByRole("link", { name: "IfcAlignment", exact: true }).first(),
  ).toBeVisible();

  await page.goto("/search");
  await expect(page.getByText(/ð æè¿ã®æ¤ç´¢/)).toBeVisible();
  await page.getByRole("button", { name: "ç·å½¢", exact: true }).click();
  await expect(page).toHaveURL(/\/search\?q=/);

  await page.goto("/search");
  await page.getByRole("button", { name: "å±¥æ­´ãæ¶å»" }).click();
  await expect(page.getByText("æ¤ç´¢èªãå¥åãã¦ãã ããã")).toBeVisible();
});
