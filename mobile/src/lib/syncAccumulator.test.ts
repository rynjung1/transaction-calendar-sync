import { describe, expect, it } from "vitest";
import { createSyncAccumulator } from "./syncAccumulator";

interface FakeTxn {
  id: string;
  status: "synced" | "failed";
}

describe("createSyncAccumulator", () => {
  it("records each distinct item once", () => {
    const acc = createSyncAccumulator<FakeTxn>();
    acc.record({ id: "a", status: "synced" });
    acc.record({ id: "b", status: "synced" });
    expect(acc.size).toBe(2);
    expect(acc.toArray().map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("a later record for the same id overwrites the earlier one, not duplicates it", () => {
    const acc = createSyncAccumulator<FakeTxn>();
    acc.record({ id: "a", status: "failed" });
    acc.record({ id: "a", status: "synced" });
    expect(acc.size).toBe(1);
    expect(acc.toArray()).toEqual([{ id: "a", status: "synced" }]);
  });

  // Reproduces the real, previously-shipped bug end-to-end: the backend's
  // "pending page" query has no offset/cursor (always "the current top 100
  // pending rows by date"), so a transaction that fails on page 1 (and so
  // stays "pending" server-side) can be re-fetched and re-attempted on
  // page 2 of the same multi-page sync. A plain array accumulator pushed a
  // duplicate entry for it; this test simulates exactly that server
  // behavior and asserts the fix's actual guarantee: the final count
  // matches the real distinct transaction count, and each transaction's
  // FINAL outcome (not its first) is what's reported.
  it("across a simulated multi-page sync with partial failures, reports each transaction once with its final outcome", () => {
    // Order matters here (mimics the real query's ORDER BY date DESC), not
    // the exact date values themselves.
    let serverPending = Array.from({ length: 150 }, (_, i) => ({ id: `txn-${i}` }));

    function serverFetchPage() {
      const page = serverPending.slice(0, 100);
      return { transactions: page, total: serverPending.length, hasMore: serverPending.length > page.length };
    }
    function serverConfirm(id: string) {
      serverPending = serverPending.filter((t) => t.id !== id);
    }

    const acc = createSyncAccumulator<FakeTxn>();
    let hasMore = true;
    while (hasMore) {
      const response = serverFetchPage();
      let pageSucceeded = 0;
      response.transactions.forEach((txn, idx) => {
        // First 90 of every page succeed and leave "pending"; the last 10
        // fail and stay "pending" — so they reappear on the next page.
        if (idx < 90) {
          serverConfirm(txn.id);
          acc.record({ id: txn.id, status: "synced" });
          pageSucceeded++;
        } else {
          acc.record({ id: txn.id, status: "failed" });
        }
      });
      hasMore = response.hasMore && (pageSucceeded > 0 || response.transactions.length === 0);
    }

    // The real assertion: exactly 150 distinct transactions, not 160 (the
    // array-based bug's actual observed count for this exact scenario).
    expect(acc.size).toBe(150);
    expect(acc.toArray()).toHaveLength(150);

    // And each of the 10 that failed on their first attempt but succeeded
    // on the same-sync retry is correctly reported as synced — its FINAL
    // outcome — not permanently misreported as failed.
    const failedCount = acc.toArray().filter((t) => t.status === "failed").length;
    expect(failedCount).toBe(0);
  });

  it("correctly reports a transaction as failed when every attempt fails, not just the first", () => {
    const acc = createSyncAccumulator<FakeTxn>();
    acc.record({ id: "stuck", status: "failed" });
    acc.record({ id: "stuck", status: "failed" });
    expect(acc.toArray()).toEqual([{ id: "stuck", status: "failed" }]);
  });
});
