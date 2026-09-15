import { describe, expect, it } from "vitest";
import { isCacheEntryStale } from "../../lib/plaidWebhookVerify";

// Covers the fix for a real gap: an unbounded webhook-verification-key cache
// meant a kid Plaid retired *after* we'd already cached it as valid (the
// literal "suspected compromise" scenario expired_at exists to catch) would
// keep validating signatures for as long as the instance stayed warm. This
// TTL is what bounds that exposure instead of leaving it unbounded.
describe("isCacheEntryStale", () => {
  const ttlMs = 60 * 60 * 1000;

  it("is not stale immediately after fetching", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(isCacheEntryStale(now, now, ttlMs)).toBe(false);
  });

  it("is not stale partway through the TTL window", () => {
    const fetchedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const now = fetchedAt + ttlMs / 2;
    expect(isCacheEntryStale(fetchedAt, now, ttlMs)).toBe(false);
  });

  it("is stale once the TTL has fully elapsed", () => {
    const fetchedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const now = fetchedAt + ttlMs + 1;
    expect(isCacheEntryStale(fetchedAt, now, ttlMs)).toBe(true);
  });

  it("treats exactly-at-the-TTL-boundary as stale, not still-fresh", () => {
    const fetchedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const now = fetchedAt + ttlMs;
    expect(isCacheEntryStale(fetchedAt, now, ttlMs)).toBe(true);
  });
});
