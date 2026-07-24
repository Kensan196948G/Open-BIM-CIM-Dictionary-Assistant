/**
 * 比較対象の選択状態（最大4件・§dc「比較」画面）。セッション内で保持し、
 * リロードでも維持されるよう sessionStorage に置く（端末外へは出ない）。
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const COMPARE_MAX = 4;

const STORAGE_KEY = "obcda.compare.v1";

type CompareContextValue = {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  isFull: boolean;
};

const CompareContext = createContext<CompareContextValue | null>(null);

function loadIds(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((v): v is string => typeof v === "string");
    return [...new Set(ids)].slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(loadIds);

  const update = useCallback((next: string[]) => {
    setIds(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable (private mode) — in-memory state still works
    }
  }, []);

  const value = useMemo<CompareContextValue>(() => {
    const has = (id: string) => ids.includes(id);
    return {
      ids,
      has,
      toggle: (id) => {
        if (has(id)) update(ids.filter((v) => v !== id));
        else if (ids.length < COMPARE_MAX) update([...ids, id]);
      },
      add: (id) => {
        if (!has(id) && ids.length < COMPARE_MAX) update([...ids, id]);
      },
      remove: (id) => update(ids.filter((v) => v !== id)),
      isFull: ids.length >= COMPARE_MAX,
    };
  }, [ids, update]);

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare(): CompareContextValue {
  const value = useContext(CompareContext);
  if (!value) throw new Error("useCompare must be used within CompareProvider");
  return value;
}
