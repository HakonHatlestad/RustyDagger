import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    // Rules tests need no DOM; the interface tests do, and asking for it per-file keeps the
    // rules suite honest about not touching the browser.
    environmentMatchGlobs: [["test/ui/**", "jsdom"]],
  },
});
