// Extracted from HomeScreen.handleSync() so the actual fix — not just the
// reasoning behind it — has a permanent regression test. Real bug, found on
// a fresh read-through and confirmed with a simulation before fixing: the
// backend's "pending page" query (backend/api/plaid/sync.ts) has no
// offset/cursor, it's always "the current top 100 pending rows by date". A
// transaction that fails mid-sync stays "pending" server-side, so a LATER
// page within the same multi-page loop can re-fetch and re-attempt the
// exact same transaction. A plain array accumulator pushed a duplicate
// entry for it — simulating 150 pending transactions with 10 failures on
// page 1 produced 160 pushes for only 150 distinct ids. Two visible
// consequences: FlatList's `keyExtractor={(txn) => txn.id}` sees duplicate
// keys (undefined React reconciliation, not just a console warning), and
// the accumulated count — used for both the live progress counter and the
// final "X of Y couldn't sync" summary — overcounted real attempts (e.g.
// "Syncing 160 of 150…", a visibly broken progress bar).
//
// Keyed by id instead: a later re-attempt's outcome simply overwrites the
// earlier one for that same transaction, matching what actually happened
// (its last real outcome) — which also means a transaction that failed on
// its first attempt but succeeded on a same-sync retry is correctly
// reported as synced, not permanently misreported as failed.
export function createSyncAccumulator<T extends { id: string }>() {
  const byId = new Map<string, T>();
  return {
    record(item: T): void {
      byId.set(item.id, item);
    },
    get size(): number {
      return byId.size;
    },
    toArray(): T[] {
      return Array.from(byId.values());
    },
  };
}
