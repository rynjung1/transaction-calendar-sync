import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Deliberately not testing lib/plaidSync.ts's applyRemoved/applyModified
    // or the cursor compare-and-swap here, even though they were the most
    // load-bearing things verified this session — they're real integration
    // behavior against the live Supabase test database, and turning that
    // into a repeatable suite needs its own decision (a real test-database/
    // fixture strategy, not just "point at production and hope"). This
    // suite starts with the pure, DB-independent logic; the DB-dependent
    // half is a deliberate, separate follow-up, not an oversight.
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
