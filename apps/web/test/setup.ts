/**
 * jsdom 26 + vitest の組み合わせで window.localStorage が不完全なため、
 * 単体テスト用に標準準拠のインメモリ Storage を注入する。
 * （本番コードは変更しない — テスト環境のみのセットアップ）
 */

const store = new Map<string, string>();

const storage: Storage = {
  get length() {
    return store.size;
  },
  clear: () => {
    store.clear();
  },
  getItem: (key: string) => store.get(key) ?? null,
  key: (index: number) => [...store.keys()][index] ?? null,
  removeItem: (key: string) => {
    store.delete(key);
  },
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
};

Object.defineProperty(window, "localStorage", {
  value: storage,
  configurable: true,
  writable: true,
});
