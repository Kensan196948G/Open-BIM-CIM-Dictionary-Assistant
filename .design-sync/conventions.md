# Using the OBCDA UI kit

Dictionary-app components for the Open BIM/CIM Dictionary Assistant (React 19 + Tailwind v4 utilities). Language of the product is Japanese — write realistic Japanese content in labels/summaries (e.g. 「線形」「属性情報」), and keep IFC identifiers in exact CamelCase (`IfcAlignment`).

## Setup

No provider or theme wrapper is required — components are self-contained. `styles.css` must be loaded (it `@import`s the component CSS); without it everything renders unstyled browser defaults. Fonts are system-default by design.

## Styling idiom — a CLOSED utility vocabulary

This kit ships Tailwind-generated CSS **containing only the utilities its components use (55 classes)**. Arbitrary Tailwind class names (e.g. `grid-cols-3`, `bg-indigo-500`, `p-6`) have NO CSS here and will silently do nothing. For your own layout glue either reuse the shipped classes below or use inline `style={{…}}` (preferred for anything not listed).

Shipped classes you may reuse:

| Family | Classes |
|---|---|
| Layout | `flex` `flex-col` `flex-wrap` `flex-1` `items-center` `gap-2` `inline-block` |
| Spacing | `p-4` `px-3` `px-4` `px-1.5` `py-2` `py-0.5` `mt-1` `mt-2` |
| Surface | `bg-white` `bg-slate-100` `bg-blue-700` `bg-green-100` `bg-amber-100` `bg-red-100` |
| Border | `border` `rounded` `rounded-md` `rounded-lg` `border-slate-200` `border-slate-300` `border-green-300` `border-amber-300` `border-red-300` |
| Text | `text-xs` `text-sm` `text-base` `text-lg` `font-medium` `font-semibold` `text-white` `text-slate-500/600/700/800` `text-blue-800` `text-green-800` `text-amber-900` `text-red-800` `line-clamp-2` `sr-only` |
| Interaction | `hover:bg-blue-800` `focus:outline-2` `focus:outline-offset-1` `focus:outline-offset-2` `focus:outline-blue-600` `transition-colors` `sm:flex-row` |

Accessibility rules baked into the kit: meaning never relies on color alone (StatusPill/Badge always carry text); interactive elements keep visible focus outlines — follow the same rules in your glue markup.

## Where the truth lives

Read before styling: `styles.css` (imports `_ds_bundle.css` — the complete shipped CSS) and each component's `components/general/<Name>/<Name>.d.ts` (props contract) + `<Name>.prompt.md` (usage).

## Idiomatic example

```tsx
import { SearchBox, ResultCard, EmptyState } from "@obcda/ui";

<div className="flex flex-col" style={{ gap: 16, maxWidth: 720 }}>
  <SearchBox initialQuery="IfcAlignment" onSearch={(q) => runSearch(q)} />
  <ResultCard
    name="IfcAlignment"
    badges={["IFC", "entity", "IFC4.3.2.0"]}
    summary="道路・鉄道などの線形構造物で基準となる線形を表すエンティティです。"
    footnote="一致理由: 識別子一致"
  />
  <EmptyState
    title="一致する用語が見つかりませんでした。"
    hint="表記（全角/半角・略語・英語名）を変えて検索してください。"
  />
</div>
```

`SearchBox` is router-agnostic (`onSearch` callback). `ResultCard` is presentation-only — wrap it in your own `<a>`/`Link` with class `group` for navigation (its border highlights via `group-hover`). `SectionCard` is the standard white content panel; `StatusPill` tones: `success | warning | error | neutral`.
