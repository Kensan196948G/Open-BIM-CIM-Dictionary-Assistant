import { Link, Route, Routes } from "react-router-dom";

import { ConceptDetailPage } from "./pages/ConceptDetailPage";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="text-lg font-bold text-slate-900 hover:text-blue-700 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
          >
            🧭 openBIM/CIM 辞書アシスタント
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/concepts/:id" element={<ConceptDetailPage />} />
          <Route
            path="*"
            element={
              <p role="alert" className="text-slate-700">
                ページが見つかりません。
                <Link to="/" className="ml-2 text-blue-700 underline">
                  ホームへ戻る
                </Link>
              </p>
            }
          />
        </Routes>
      </main>
      <footer className="mx-auto max-w-4xl px-4 py-6 text-xs text-slate-500">
        本システムは公開情報の検索・理解・教育を支援するものであり、仕様適合・契約・設計上の判断を保証しません。実務では対象案件に適用される最新版の原典を必ず確認してください。
      </footer>
    </div>
  );
}
