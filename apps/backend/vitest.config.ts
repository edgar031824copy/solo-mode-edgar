import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    // maxWorkers=1 runs test files sequentially so shared DB state doesn't cause races
    maxWorkers: 1,
    setupFiles: ["./src/tests/setup-env.ts"],
  },
});
