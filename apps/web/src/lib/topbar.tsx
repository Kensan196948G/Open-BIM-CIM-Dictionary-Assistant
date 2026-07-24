/** トップバーの見出し（タイトル/サブタイトル）をページ側から設定する仕組み。 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PageMeta = { title: string; sub: string };

type TopbarContextValue = {
  meta: PageMeta;
  setMeta: (meta: PageMeta) => void;
};

const TopbarContext = createContext<TopbarContextValue | null>(null);

export function TopbarProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({ title: "", sub: "" });
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <TopbarContext.Provider value={value}>{children}</TopbarContext.Provider>;
}

export function useTopbarMeta(): PageMeta {
  const value = useContext(TopbarContext);
  if (!value) throw new Error("useTopbarMeta must be used within TopbarProvider");
  return value.meta;
}

/** ページから呼ぶ: マウント/更新時にトップバー見出しを反映する。 */
export function usePageMeta(title: string, sub: string): void {
  const value = useContext(TopbarContext);
  if (!value) throw new Error("usePageMeta must be used within TopbarProvider");
  const { setMeta } = value;
  useEffect(() => {
    setMeta({ title, sub });
  }, [setMeta, title, sub]);
}
