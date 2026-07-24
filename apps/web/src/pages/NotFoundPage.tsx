import { Link } from "react-router-dom";

import { EmptyCard } from "../components/ui";
import { usePageMeta } from "../lib/topbar";

export function NotFoundPage() {
  usePageMeta("ページが見つかりません", "");
  return (
    <EmptyCard>
      <p role="alert" className="m-0">
        ページが見つかりません。
        <Link to="/" className="ml-2 font-semibold text-link">
          ホームへ戻る
        </Link>
      </p>
    </EmptyCard>
  );
}
