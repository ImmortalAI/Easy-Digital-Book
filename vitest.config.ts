import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/services/book/**/*.ts",
        "src/services/edb/**/*.ts",
        "src/services/epub/**/*.ts",
        "src/services/export/**/*.ts",
        "src/services/azw3/**/*.ts",
        "src/services/search/**/*.ts",
        "src/services/checks/**/*.ts",
        "src/stores/**/*.ts",
      ],
      thresholds: { lines: 80, functions: 75, branches: 70, statements: 80 },
    },
  },
});
