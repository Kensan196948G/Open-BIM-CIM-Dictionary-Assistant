# 🧭 操作・デモ手順書（MVP 評価用）

- 📅 2026-08-14 / 対象: fixtures モード（ダミーデータ 43 概念・3 出典・全て架空/公開情報由来）
- 🎯 目的: 関係者が主要ユースケースを一通り操作・評価できるようにする

## 🚀 起動方法（ローカル）

```bash
# API（ポートは環境で空いているものに変更可）
PORT=18788 pnpm --filter @obcda/api dev

# Web（/api は Vite プロキシで API へ）
API_PROXY_TARGET=http://localhost:18788 pnpm exec vite --port 4173 --strictPort
```

ブラウザで `http://localhost:4173` を開く（Playwright E2E と同じ構成）。

## 🧪 5 分デモシナリオ（主要導線）

1. **ホーム** — 注目の用語チップ（IfcAlignment 等）と KPI（概念 43・公開済み 40・情報源 3）を確認
2. **検索** — 「線形」で検索 → IfcAlignment がトップヒット
   - **フィルタ**: 「標準 = IFC」「種別 = Pset」を選ぶと絞り込み（URL に family/type が同期）
   - **ページネーション**: 「Ifc」で検索し「もっと見る」で次ページ追加
   - **ゼロ結果**: 「存在しない用語xyz」→ ガイダンス表示
3. **用語詳細** — IfcAlignment を開く → やさしい説明・IFC 詳細（継承元）・関連概念・出典（発行主体/版/取得日時/原典リンク）
   - **引用コピー**: 「📋 引用をコピー」で引用情報をクリップボードへ
4. **比較** — 検索結果から 2〜4 件を「＋ 比較に追加」→ 比較画面で並べて確認
5. **学習** — 用語カード（クリックで裏面）と確認問題 5 問
6. **AI質問** — 「IfcAlignmentとは？」→ 根拠カード表示（AI 未接続時は「回答を保留し根拠を提示」を正しくデモ）
   - 「宇宙エレベーターとは？」→ 根拠不足で保留（"分からないと言える AI"）
7. **出典・取り込み管理** — 情報源一覧 3 件
   - **エクスポート**: 「JSON」「CSV」リンクで公開辞書をダウンロード（UTF-8 BOM 付き CSV は Excel で開ける）
   - **レビューキュー**: レビュー待ち 5 件（draft 概念 3 件 + 版更新 2 件）→「✅ 承認・公開」で状態が変わり、監査ログ（設定 → 変更監査）に記録される
8. **監査ログ** — API リクエスト記録（検索語は非記録）を CSV/HTML/PDF 出力
9. **設定** — 表示設定（説明レベル・検索件数）、システム情報（fixtures モード・AI 未接続）、AI 設定（管理者用）

## 🧪 15 分デモシナリオ（深掘り）

上記に加えて:

- **検索の正規化**: 半角カナ「ｱﾗｲﾒﾝﾄ」・表記揺れ「IFC 4.3」≡「IFC4.3」・誤字「IfcAlignmet」→ 類似候補（fuzzy）を確認
- **版フィルタ**: 「版 = IFC4.3」で IFC 概念のみ表示、「版 = IFC2x3」で 0 件（版プレフィックス一致の仕様）
- **エクスポートのライセンスフィルタ**: `?format=csv&license=metadata_only` で絞り込み
- **API 直接確認**: `GET /api/v1/export/dictionary` / `GET /api/v1/admin/review-queue` / `POST /api/v1/admin/reviews/{id}/decision`
- **異常系**: 存在しない用語 ID（404）・不正な入力（400 VALIDATION_ERROR）・レート制限（AI 質問を連打 → 429）

## 🗂️ ダミーデータ構成（fixtures/concepts.sample.json）

| 区分 | 件数 | 例 |
| --- | --- | --- |
| IFC 4.3 エンティティ | 18 | IfcAlignment, IfcRoad, IfcBridge, IfcCulvert, IfcPavement, IfcSign, IfcTunnel, IfcPile, IfcWall… |
| Pset / Qto | 9 | Pset_AlignmentCommon, Qto_BridgeBaseQuantities…（draft 3 件含む） |
| 国交省 BIM/CIM 要領 | 6 | BIM/CIMモデル, 属性情報, 詳細度, 電子納品, 点群データ, 3次元モデル |
| openBIM / bSDD 用語 | 10 | openBIM, IFC, IDS, BCF, MVD, IDM, bSDD, Classification, Class, Property |

- 人物・会社・住所・メール・案件などの実在情報は含まない（全て架空/公開情報に基づく説明）
- draft 概念（3 件）はレビューキューで承認操作の対象になり、公開概念には含まれない

## 📝 レビュー観点

1. 辞書の横断検索（日本語・英語・略語・表記揺れ）が実用的か
2. 出典・版・取得日時の明示で「根拠へ戻れる」か
3. 比較・学習・AI 質問が学習/確認に使えるか
4. 管理操作（エクスポート・レビュー承認・監査）が一通り動作するか
5. 未実装（IFC 詳細の属性/Pset 表示・実 LLM・本番 DB）を評価して優先度を付ける
