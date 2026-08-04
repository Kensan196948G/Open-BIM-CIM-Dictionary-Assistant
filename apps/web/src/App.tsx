import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router";

import { fetchSystemInfo } from "./lib/api";
import { CompareProvider } from "./lib/compare";
import { TopbarProvider, useTopbarMeta } from "./lib/topbar";
import { AiPage } from "./pages/AiPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { ComparePage } from "./pages/ComparePage";
import { ConceptDetailPage } from "./pages/ConceptDetailPage";
import { HomePage } from "./pages/HomePage";
import { LearnPage } from "./pages/LearnPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SourcesPage } from "./pages/SourcesPage";

type NavItem = { to: string; label: string; icon: string; end?: boolean };

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "辞書",
    items: [
      { to: "/", label: "ホーム", icon: "🏠", end: true },
      { to: "/search", label: "検索", icon: "🔎" },
      { to: "/compare", label: "比較", icon: "⚖️" },
      { to: "/learn", label: "学習", icon: "🎓" },
    ],
  },
  { heading: "AI", items: [{ to: "/ai", label: "AI質問", icon: "🤖" }] },
  {
    heading: "管理",
    items: [
      { to: "/sources", label: "出典・取り込み管理", icon: "🛠️" },
      { to: "/audit", label: "監査ログ", icon: "📋" },
      { to: "/settings", label: "設定", icon: "⚙️" },
    ],
  },
];

function SidebarNav() {
  return (
    <nav
      aria-label="メイン"
      className="flex flex-1 flex-col gap-[1px] overflow-y-auto px-3 pt-2.5 pb-3.5"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.heading} className="contents">
          <div className="px-2 pt-[13px] pb-1.5 text-[10px] font-semibold tracking-[1px] text-nav-head">
            {group.heading}
          </div>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex cursor-pointer items-center gap-2.5 rounded-[7px] px-[11px] py-2 text-[13px] font-medium focus:outline-2 focus:outline-offset-2 focus:outline-link ${
                  isActive ? "bg-chip text-ink" : "text-sub"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span aria-hidden className="w-[18px] shrink-0 text-center">
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  <span
                    aria-hidden
                    className={`absolute top-2 bottom-2 left-0 w-[3px] rounded-[2px] ${
                      isActive ? "bg-brand" : "bg-transparent"
                    }`}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Topbar() {
  const meta = useTopbarMeta();
  const [environment, setEnvironment] = useState<"fixtures" | "database" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSystemInfo()
      .then((response) => {
        if (!cancelled) setEnvironment(response.data.environment);
      })
      .catch(() => {
        // ピルは補助情報 — 取得失敗時は表示しない
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="flex h-[62px] shrink-0 items-center gap-4 border-b border-line bg-white px-[22px]">
      <div>
        <h1 className="text-[16px] leading-tight font-semibold text-ink">
          {meta.title}
        </h1>
        <div className="text-[11.5px] text-faint">{meta.sub}</div>
      </div>
      <div className="flex-1" />
      {environment !== null && (
        <div className="flex shrink-0 items-center gap-1.5 rounded-[7px] bg-ok-soft px-2.5 py-1.5 text-[12px] font-semibold text-ok">
          <span
            aria-hidden
            className="h-[7px] w-[7px] rounded-full bg-ok-dot shadow-[0_0_0_3px_rgba(46,158,107,.18)]"
          />
          {environment === "fixtures" ? "fixtures モード" : "database モード"}
        </div>
      )}
    </header>
  );
}

export function App() {
  return (
    <TopbarProvider>
      <CompareProvider>
        <div className="flex h-screen w-full overflow-hidden bg-canvas text-[14px] text-ink">
          <aside className="flex w-[250px] shrink-0 flex-col border-r border-line bg-white text-sub">
            <div className="flex items-center gap-[11px] border-b border-line px-[18px] pt-[18px] pb-4">
              <span
                aria-hidden
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-brand text-[17px]"
              >
                🧭
              </span>
              <div className="leading-tight">
                <div className="text-[14.5px] font-semibold tracking-[.2px] text-ink">
                  openBIM/CIM 辞書アシスタント
                </div>
                <div className="text-[11px] text-faint">MVP プロトタイプ</div>
              </div>
            </div>
            <SidebarNav />
            <div className="border-t border-line px-3.5 py-[13px] text-[11px] leading-relaxed text-faint">
              公開情報の検索・理解・教育を支援します。仕様適合・契約・設計上の判断は保証しません。
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-auto p-[22px]">
              <div className="mx-auto flex max-w-[1080px] flex-col gap-[18px]">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/concepts/:id" element={<ConceptDetailPage />} />
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="/learn" element={<LearnPage />} />
                  <Route path="/ai" element={<AiPage />} />
                  <Route path="/sources" element={<SourcesPage />} />
                  <Route path="/audit" element={<AuditLogPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </div>
            </main>
          </div>
        </div>
      </CompareProvider>
    </TopbarProvider>
  );
}
