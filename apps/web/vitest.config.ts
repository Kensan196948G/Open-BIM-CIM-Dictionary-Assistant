import { defineConfig } from "vitest/config";

/** Web 単体/コンポーネントテスト（Q4）。jsdom で lib・画面ロジックを検証する。 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    // localStorage は opaque origin（about:blank）では利用不可のため URL を固定
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
  },
});
