import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", environment: "node", include: ["tests/**/*.test.ts"] }
      },
      {
        extends: true,
        test: { name: "ui", environment: "jsdom", include: ["tests/**/*.test.tsx"] }
      }
    ]
  }
});
