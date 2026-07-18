import { EmptyState } from "@obcda/ui";

export const ZeroResults = () => (
  <EmptyState
    title="「存在しない用語」に一致する用語が見つかりませんでした。"
    hint="表記（全角/半角・略語・英語名）を変えるか、別の関連語で検索してください。"
  />
);

export const NoRecords = () => (
  <EmptyState title="記録がまだありません。検索や用語閲覧を行うとここに表示されます。" />
);
