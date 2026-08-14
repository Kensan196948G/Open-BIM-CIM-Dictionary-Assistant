import { expect, test } from "@playwright/test";

/**
 * MVP 評価ラウンド（2026-08-14）の追加検証:
 * ① レビューキューの実 API 連携（承認→状態反映） ② 辞書エクスポート導線
 * ③ 検索フィルタ UI ④ 引用コピー（FR-009）
 */

test("sources page loads the review queue from the API and approves an item", async ({
  page,
}) => {
  await page.goto("/sources");
  await expect(
    page.getByRole("heading", { name: /差分レビュー キュー/ }),
  ).toBeVisible();

  // queue items come from the API (draft concepts are real fixture data)
  const approveButton = page.getByRole("button", { name: "✅ 承認・公開" }).first();
  await expect(approveButton).toBeVisible();
  await approveButton.click();

  // the decision is persisted server-side and reflected in the queue
  await expect(page.getByText("公開済み").first()).toBeVisible();
  await expect(page.getByText(/判定: demo-admin/).first()).toBeVisible();
});

test("sources page exposes dictionary export links (JSON/CSV)", async ({ page }) => {
  await page.goto("/sources");
  const jsonLink = page.getByRole("link", { name: "JSON", exact: true });
  await expect(jsonLink).toBeVisible();
  await expect(jsonLink).toHaveAttribute(
    "href",
    /\/api\/v1\/export\/dictionary\?format=json/,
  );
  await expect(page.getByRole("link", { name: "CSV", exact: true })).toHaveAttribute(
    "href",
    /format=csv/,
  );
});

test("search filters narrow results by standard family and stay in the URL", async ({
  page,
}) => {
  await page.goto("/search?q=道路");
  await page.getByLabel("標準").selectOption("IFC");
  await expect(page).toHaveURL(/family=IFC/);
  await expect(page.getByText("（絞り込み中）")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "IfcRoad", exact: true }).first(),
  ).toBeVisible();
});

test("concept detail offers one-click citation copy (FR-009)", async ({ page }) => {
  await page.goto("/search?q=IfcAlignment");
  await page.getByRole("link", { name: "IfcAlignment", exact: true }).first().click();
  await expect(page).toHaveURL(/\/concepts\//);
  await expect(page.getByRole("button", { name: /引用をコピー/ })).toBeVisible();
});

test("search pagination appends the next page via cursor", async ({ page }) => {
  await page.goto("/search?q=Ifc");
  const loadMore = page.getByRole("button", { name: "⏬ もっと見る" });
  await expect(loadMore).toBeVisible();
  const countText = await page.getByText(/📊 検索結果 \d+ 件/).textContent();
  const before = Number(countText?.match(/\d+/)?.[0] ?? 0);
  await loadMore.click();
  await expect
    .poll(
      async () => {
        const afterText = await page.getByText(/📊 検索結果 \d+ 件/).textContent();
        return Number(afterText?.match(/\d+/)?.[0] ?? 0);
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(before);
});

test("IFC detail shows schema, supertype and attributes table (FR-101〜105)", async ({
  page,
}) => {
  await page.goto("/search?q=IfcAlignment");
  await page.getByRole("link", { name: "IfcAlignment", exact: true }).first().click();
  await expect(page).toHaveURL(/\/concepts\//);
  await expect(page.getByRole("heading", { name: /IFC詳細/ })).toBeVisible();
  await expect(page.getByText("スキーマ: IFC4.3.2.0")).toBeVisible();
  await expect(page.getByText("種別: entity")).toBeVisible();
  // 継承元リンク（関連する概念にも同名リンクがあるため .first() で解決）
  await expect(
    page.getByRole("link", { name: "IfcLinearPositioningElement" }).first(),
  ).toBeVisible();
  // attributes table with the explicit PredefinedType attribute
  await expect(page.getByText("PredefinedType").first()).toBeVisible();
  await expect(page.getByText("明示属性")).toBeVisible();
});
