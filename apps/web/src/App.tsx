import { Link, NavLink, Route, Routes } from "react-router-dom";

import { AuditLogPage } from "./pages/AuditLogPage";
import { ConceptDetailPage } from "./pages/ConceptDetailPage";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 ${
    isActive
      ? "bg-blue-50 font-medium text-blue-800"
      : "text-slate-600 hover:text-blue-700"
  }`;

export function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="text-lg font-bold text-slate-900 hover:text-blue-700 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
          >
            🧭 openBIM/CIM 辞書アシスタント
          </Link>
          <nav aria-label="メイン" className="ml-auto flex items-center gap-1">
            <NavLink to="/audit" className={navLinkClass}>
              📋 監査ログ
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              ⚙️ 設定
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/concepts/:id" element={<ConceptDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
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
