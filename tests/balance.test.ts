import assert from "node:assert/strict";
import test from "node:test";

import {
  assertQuotaAvailable,
  createKeyedMutex,
  dedupePromise,
  isQuotaCoolingDown,
  noteQuotaExhausted,
  quotaBackoffWithJitter,
  quotaRetryAfterMs,
} from "../src/lib/asyncUtils.ts";
import {
  diagSnapshot,
  recordBalanceRead,
  recordFirestoreCall,
  recordOperationDedup,
  resetDiag,
  tokenFor,
} from "../src/lib/firestoreDiagnostics.ts";
import { withReadsBeforeWrites } from "../src/lib/transactionUtils.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

test("keyed mutex serializes work for one customer but not across customers", async () => {
  const mutex = createKeyedMutex<string>("test");
  const order: string[] = [];

  const first = mutex.run("cust-a", async () => {
    order.push("a:start");
    await new Promise((resolve) => setTimeout(resolve, 15));
    order.push("a:end");
    return 1;
  });
  const second = mutex.run("cust-a", async () => {
    order.push("b:start");
    order.push("b:end");
    return 2;
  });
  const other = mutex.run("cust-b", async () => {
    order.push("other:start");
    order.push("other:end");
    return 3;
  });

  assert.deepEqual(await Promise.all([first, second, other]), [1, 2, 3]);
  assert.deepEqual(order, ["a:start", "other:start", "other:end", "a:end", "b:start", "b:end"]);
  assert.equal(mutex.pending(), 0);
});

test("keyed mutex releases its slot when work fails", async () => {
  const mutex = createKeyedMutex<string>("test");
  await assert.rejects(mutex.run("cust", async () => { throw new Error("failed"); }), /failed/);
  assert.equal(mutex.pending(), 0);
  assert.equal(await mutex.run("cust", async () => "ok"), "ok");
});

test("duplicate financial actions share one in-flight promise", async () => {
  const inFlight = new Map<string, Promise<number>>();
  let runs = 0;
  let dedupHits = 0;
  const work = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return 7;
  };

  const results = await Promise.all([
    dedupePromise(inFlight, "invoice-key", work, () => { dedupHits += 1; }),
    dedupePromise(inFlight, "invoice-key", work, () => { dedupHits += 1; }),
  ]);

  assert.deepEqual(results, [7, 7]);
  assert.equal(runs, 1);
  assert.equal(dedupHits, 1);
  // The map is released after settlement, so a later intentional action runs.
  assert.equal(await dedupePromise(inFlight, "invoice-key", work), 7);
  assert.equal(runs, 2);
});

test("quota backoff grows exponentially with jitter and never retries immediately", () => {
  const first = quotaBackoffWithJitter(0);
  const second = quotaBackoffWithJitter(1);
  const third = quotaBackoffWithJitter(2);

  assert.ok(first >= 60_000 && first < 72_000);
  assert.ok(second >= 120_000 && second < 138_000);
  assert.ok(third >= 240_000 && third <= 300_000);

  const storage = memoryStorage();
  (globalThis as any).localStorage = storage;
  try {
    noteQuotaExhausted();
    assert.equal(isQuotaCoolingDown(), true);
    assert.throws(assertQuotaAvailable, /cooldown is active/);
  } finally {
    delete (globalThis as any).localStorage;
  }
});

test("quota cooldown blocks new work and honours Retry-After", () => {
  const storage = memoryStorage();
  (globalThis as any).localStorage = storage;
  try {
    assert.equal(isQuotaCoolingDown(), false);
    noteQuotaExhausted(120_000);
    assert.equal(isQuotaCoolingDown(), true);
    assert.ok(quotaRetryAfterMs() > 100_000);
    assert.throws(assertQuotaAvailable, /cooldown is active/);
  } finally {
    delete (globalThis as any).localStorage;
  }
});

test("diagnostics hash customer ids and flag repeated identical reads", () => {
  resetDiag();
  const id = "mwnfpsgj-qbw0xlmy";
  const token = tokenFor(id);
  assert.match(token, /^[0-9a-f]{8}$/);
  assert.equal(token, tokenFor(id));
  assert.ok(!JSON.stringify(diagSnapshot()).includes(id));

  recordBalanceRead(id, "transaction", "invoice.create");
  recordBalanceRead(id, "transaction", "payment.record");
  recordFirestoreCall("runTransaction");
  recordOperationDedup();
  const snapshot = diagSnapshot();
  assert.equal(snapshot.totals.balanceReads, 2);
  assert.equal(snapshot.totals.duplicateBalanceReads, 1);
  assert.equal(snapshot.readsPerCustomer[token], 2);
  assert.equal(snapshot.recentReads[1].operation, "payment.record");
  assert.equal(snapshot.totals.operationDedupHits, 1);
  assert.equal(snapshot.totals.activeListeners, 0);
  resetDiag();
  assert.equal(diagSnapshot().totals.balanceReads, 0);
});

test("transaction writes are staged until every read is finished", async () => {
  const events: string[] = [];
  let wrote = false;

  const tx: any = {
    get: async (_ref: unknown) => {
      assert.equal(wrote, false, "Firestore saw a read after a write");
      events.push("get");
      return { exists: () => false };
    },
    set: (..._args: unknown[]) => {
      wrote = true;
      events.push("set");
      return tx;
    },
    update: (..._args: unknown[]) => {
      wrote = true;
      events.push("update");
      return tx;
    },
    delete: (..._args: unknown[]) => {
      wrote = true;
      events.push("delete");
      return tx;
    },
  };

  const result = await withReadsBeforeWrites(tx, async (deferred) => {
    deferred.set("invoice" as any, {} as any);
    await deferred.get("balance" as any);
    deferred.update("ledger" as any, {} as any);
    await deferred.get("audit" as any);
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(events, ["get", "get", "set", "update"]);
});

test("failed transaction work never applies staged writes", async () => {
  const events: string[] = [];
  const tx: any = {
    get: async () => { events.push("get"); return { exists: () => false }; },
    set: () => { events.push("set"); return tx; },
    update: () => { events.push("update"); return tx; },
    delete: () => { events.push("delete"); return tx; },
  };

  await assert.rejects(
    withReadsBeforeWrites(tx, async (deferred) => {
      deferred.set("invoice" as any, {} as any);
      await deferred.get("balance" as any);
      throw new Error("abort");
    }),
    /abort/,
  );
  assert.deepEqual(events, ["get"]);
});
