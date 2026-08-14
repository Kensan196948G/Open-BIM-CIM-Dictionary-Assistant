# 📋 MVP 評価レポート — Open BIM/CIM Dictionary Assistant（2026-08-14 ラウンド）

- 📅 評価日: 2026-08-14
- 🔖 評価対象: `origin/main`（v0.3.0 + #38〜#41 マージ済み。最終コミット `e25bf0b`）
- 🔬 方法: 実コード・API 実測（app.fetch スモーク 14 項目 PASS）・CI 結果・文書突合・Git 履歴

---

## 1. 総合評価サマリー

| 評価軸 | 評点 | 一言評価 |
|---|---|---|
| 機能デモ・UX | B | 9 画面が実 API で一周するデモ導線は完結。ただし辞書 14 語・検索フィルタ UI なし・レビューキューがモック残存 |
| セキュリティ・監査 | B+ | 認可（Access JWT）・キー暗号化・レート制限・CSP・ホストガードまで実装済み（#40）。監査 DB 永続化も #41 で実装 |
| コード品質・設計 | A− | 厳格 TS・port/adapter・enum 単一情報源。neon.ts 未テスト・web 単体テスト 0 が残 |
| 運用・信頼性 | C+ | 手順書・smoke/deploy スクリプトは良質。本番 DB 未適用・監視未構成は人間ゲート依存 |

**総評**: 「小さく正しく作られた MVP」から「限定運用可能なデモ/PoC 水準」（先行レビュー 68.5/100）へ到達済み。
本ラウンドの主眼は **①辞書データ拡充（14→43 語）で製品価値を可視化 ②モック残存の実データ化（レビューキュー） ③未実装要件の実装（辞書エクスポート API / 検索フィルタ UI / 引用コピー） ④web 単体テスト導入**。

---

## 2. 実装済み／部分／未実装の判定（実コード根拠）

### ✅ 実装済み（動作確認済み）
- 統合検索（正規化・ランキング・cursor・family/type/schema フィルタ API 対応）— `ranking.ts` / `neon.ts`
- 用語詳細・関連概念・出典（発行主体・版・取得日時・原典リンク）— `concepts.ts` / `inMemory.ts`
- 比較（2〜4 件）— `compare.ts` / `ComparePage.tsx`
- 学習（フラッシュカード + 確認問題）— `LearnPage.tsx`
- AI質問（根拠限定回答・引用検証・3 層縮退・利用記録・日次トークン予算・実 Anthropic アダプタ）— `llm.ts` / `assistant.ts` / `admin.ts`
- 出典一覧・版一覧 — `sources.ts`
- 監査ログ（メモリ）+ S4 変更監査（DB 永続化対応）— `auditLog.ts` / `auditEvents.ts`
- 検索履歴（端末 localStorage + 匿名日次集計）— ブランチ `feat/search-production-history`（PR #37）
- 管理 API: AI 設定（暗号化保存・接続テスト・削除・変更監査）+ AI 利用メトリクス — `admin.ts` / `keyCrypto.ts` / `aiUsage.ts`
- セキュリティ基盤: Access JWT 検証・レート制限・CSP/HSTS・CORS 完全一致・SSRF 防御・ホストガード — `middleware/*` / `ingestion`
- Neon/Drizzle 16 テーブル + migration round-trip + seed — `packages/db` / `migrations/` / `scripts/seed.ts`
- CI: format/lint/typecheck/test/build + E2E + audit — `.github/workflows/ci.yml`

### ⚠️ 部分実装／モック残存
| 項目 | 現状 | 本ラウンド |
|---|---|---|
| 差分レビューキュー（出典画面） | 3 件ハードコード・承認/却下はクライアント内のみ | **実 API 化**（admin/review-queue + decision + 監査連携） |
| 辞書データ | 14 概念・公式定義 null | **43 概念へ拡充**（IFC 4.3 エンティティ・Pset/Qto・国内要領・bSDD・draft 3 件） |
| 検索フィルタ UI | API 対応済みだが UI から操作不可 | **フィルタ UI + ページネーション実装** |
| 公開辞書エクスポート | 未実装（FR-308・MVP スコープ） | **JSON/CSV エクスポート API + UI 実装** |
| IFC 詳細（属性・継承・スキーマ） | 詳細画面に「未収録」表示のみ（FR-101〜105） | **縦スライス実装**（fixtures+contracts+API(両repo)+seed+UI+テスト・PR #44） |
| レスポンシブ | 固定 250px サイドバー（スマホ不可） | **バックログ化**（ドロワー化は中規模） |
| web 単体テスト | 0 件（E2E 5 本のみ） | **lib 層に Vitest 導入** |
| AI 回答の live 通知 | aria-live なし | **実装** |

### ❌ 未実装（バックログ・P3）
- #25 検索 SQL 押し下げ（索引活用）/ #29 取り込み DB 永続化 / AI-1 本格 RAG（pgvector）/ AI-2 ストリーミング
- 版差分比較（FR-108）/ PWA / 英語 UI（i18n）/ 監視アラート / Dependabot・CodeQL / 本番 DB 適用（人間ゲート）

---

## 3. 問題・技術的負債の抽出（P0〜P3）

### P0（致命的）: なし
### P1（主要操作不能・重大）: なし（先行ラウンドで解消済み）
### P2（MVP 価値向上）
- P2-1 辞書 14 語は評価・操作の実感が不足 → 拡充（本ラウンド実施）
- P2-2 レビュー承認がモック → 実 API 化（本ラウンド実施）
- P2-3 エクスポート API 未実装（FR-308）→ 本ラウンド実施
- P2-4 検索フィルタ UI 未実装（U1）→ 本ラウンド実施
- P2-5 IFC 詳細（F1）→ **第2弾で縦スライス実装**（属性表・継承元・スキーマ版表示）
### P3（改善・将来）
- P3-1 レスポンシブ・ドロワー化（U3）/ P3-2 web Zod 再検証（Q4）/ P3-3 packages/ui 統合（Q6）
- P3-4 Cache/ETag（Q7）/ P3-5 neon.ts 統合テスト（Q3）/ P3-6 コントラスト faint 色（本ラウンドで一部対応）

---

## 4. MVP 判定（本ラウンド前）

**CONDITIONAL GO** — 主要ユースケース（検索→詳細→比較→学習→AI→出典→監査）は実動作しデモ可能。
ただし「辞書としての中身（14 語）」「管理機能のモック」「エクスポート欠落」が評価上の制約。
→ 本ラウンドでこれらを解消し **GO** を目指す。
