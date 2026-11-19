import assert from "node:assert/strict";
import test from "node:test";

import { readSnapshot, writeSnapshot } from "../src/lib/snapshotCache.ts";

function stubStorage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
  };
  return store;
}

test("workspace snapshot round-trips without touching Firestore", () => {
  stubStorage();
  writeSnapshot({
    settings: null,
    customers: [],
    families: [],
    pricing: [],
    products: [{ id: "p1" } as any],
    invoices: [],
    payments: [],
    allocations: [],
    ledger: [],
    expenses: [],
    audit: [],
  });

  const cached = readSnapshot();
  assert.ok(cached);
  assert.equal(cached.v, 1);
  assert.equal(cached.products[0].id, "p1");
  assert.equal(readSnapshot(-1), null, "a negative max age rejects an existing snapshot");
});
