import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/__mocks__/**", "src/main.ts"],
    },
  },
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./src/__mocks__/obsidian.ts", import.meta.url)),
    },
  },
});
