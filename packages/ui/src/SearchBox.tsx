import { useEffect, useState } from "react";

export type SearchBoxProps = {
  /** Callback with the trimmed query on submit. Router-agnostic by design. */
  onSearch: (query: string) => void;
  initialQuery?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

/** Accessible search form: visible label (sr-only), keyboard-first submit. */
export function SearchBox({
  onSearch,
  initialQuery = "",
  autoFocus = false,
  placeholder = "例: IfcAlignment、属性情報、LOD",
}: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);

  // keep the input in sync when the caller's query changes (e.g. back/forward)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  return (
    <form
      role="search"
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (trimmed.length === 0) return;
        onSearch(trimmed);
      }}
    >
      <label htmlFor="search-input" className="sr-only">
        用語を検索
      </label>
      <input
        id="search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-base focus:outline-2 focus:outline-offset-1 focus:outline-blue-600"
      />
      <button
        type="submit"
        className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
      >
        🔎 検索
      </button>
    </form>
  );
}
