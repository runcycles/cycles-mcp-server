import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    environment: "node",
    pool: "threads",
    coverage: {
      include: [
        "src/**/*.ts",
        "examples/grok-bot-paid-media-gateway/gateway.ts",
      ],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 95,
        branches: 85,
      },
    },
  },
});
