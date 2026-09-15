import { defineConfig } from "vitest/config";

// Deliberately scoped to pure, RN-import-free logic only — matches
// backend/vitest.config.mts's own posture. This app's real runtime behavior
// (calendar writes, Plaid Link, AsyncStorage, network calls) needs an actual
// device/Simulator to mean anything; trying to fake all of that with mocks
// under plain Vitest would prove far less than it looks like it proves. What
// belongs here is exactly the kind of logic this session found real, subtle
// bugs in — date/timezone math, currency formatting, percentage rounding,
// dedup/accumulation logic — extracted out of the screens that used to embed
// it inline specifically so it's testable without mocking React Native at
// all. See src/lib/*.ts for what's been pulled out and why.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
