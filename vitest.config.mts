import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          // Talks to the development database: permissions and security rules.
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/db/load-env.ts"],
          globalSetup: ["tests/db/global-setup.ts"],
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
