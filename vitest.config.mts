import { defineConfig } from "vitest/config";

process.env.TZ = "Europe/Amsterdam";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
