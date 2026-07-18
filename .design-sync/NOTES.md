# design-sync NOTES

- 2026-07-18 初回同期（package shape）。対象 `packages/ui`（6 コンポーネント）→ プロジェクト `223b7183-8786-4166-930e-f0d089014946`。
- **このマシンは headless Chrome が SIGTRAP で起動不能**（リポジトリ Issue #9: Playwright/システム Chrome とも）。render check・capture は実行不可 → `--no-render-check` + ユーザー目視（.review.html / claude.ai/design 上）で代替した。グレード JSON は未作成。
- `dist/styles.css` は Tailwind v4 CLI の `@source ./**/*.tsx` スキャン生成 — **コンポーネントが使う utility のみ（初回 55 クラス）**。conventions.md のクラス表はここから列挙した。
- ビルドは `pnpm --filter @obcda/ui build`（tsup ESM+d.ts → tailwindcss CLI）。dist が無いと `[NO_DIST]`。
- docs は 0/6 マッチ（per-component docs なし）— `.prompt.md` は d.ts + previews から合成。group は既定の `general`。

## Known render warns

- `[RENDER_SKIPPED]`（環境起因・上記のとおり了承済み）

## Re-sync risks

- **render 未機械検証の anchor**: 環境回復（マシン再起動等で Chrome が直った）後の再同期では、スコープに関わらず一度 full render check + capture/grade を回して検証済み状態にすること。
- `.design-sync/previews/*.tsx` は `@obcda/ui` の props API に直結 — API 変更時はプレビューが compile 落ちしてフロアカードに落ちる（ビルドログの `! preview build failed` を確認）。
- `conventions.md` のクラス表は styles.css 再生成で乖離しうる — 再同期のたびに `_ds_bundle.css` への grep で再検証する。
- Node 25 + pnpm 10 環境。コンバータ deps は `.ds-sync/`（gitignored）に npm で隔離インストール。
