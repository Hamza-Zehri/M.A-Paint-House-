import assert from "node:assert/strict";
import test from "node:test";

import {
  friendlyError,
  OperationTimeoutError,
  retry,
  shouldRetryNetworkError,
  withTimeout,
} from "../src/lib/asyncUtils.ts";
import { clearPerf, measured, perfSummary } from "../src/lib/perf.ts";

test("withTimeout rejects with a typed timeout error", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, "invoice.create"),
    (error: unknown) => {
      assert.ok(error instanceof OperationTimeoutError);
      assert.match(friendlyError(error), /do not repeat the action/);
      return true;
    },
  );
});

test("timeout of an already-completed operation does not fail", async () => {
  assert.equal(await withTimeout(Promise.resolve("saved"), 50, "save"), "saved");
});

test("retry repeats transient failures and preserves the first successful result", async () => {
  let attempts = 0;
  const result = await retry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error: any = new Error("temporarily unavailable");
        error.code = "unavailable";
        throw error;
      }
      return { id: "inv_42" };
    },
    { retries: 2, baseDelay: 1, label: "invoice.create" },
  );
  assert.equal(attempts, 3);
  assert.deepEqual(result, { id: "inv_42" });
});

test("retry does not repeat validation errors", async () => {
  let attempts = 0;
  await assert.rejects(
    retry(
      async () => {
        attempts += 1;
        throw new Error("Customer not found");
      },
      { retries: 3, baseDelay: 1 },
    ),
    /Customer not found/,
  );
  assert.equal(attempts, 1);
});

test("network error classification covers offline and Firestore retryable codes", () => {
  assert.equal(shouldRetryNetworkError({ code: "network-request-failed" }), true);
  assert.equal(shouldRetryNetworkError({ message: "Failed to fetch" }), true);
  assert.equal(shouldRetryNetworkError({ code: "permission-denied", message: "Permission denied" }), false);
});

test("measured records real durations and failures without estimates", async () => {
  clearPerf();
  await measured("test.operation", "data", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return true;
  });
  await assert.rejects(measured("test.failure", "data", async () => { throw new Error("boom"); }), /boom/);

  const summary = perfSummary();
  const operation = summary.find((x) => x.name === "test.operation");
  const failure = summary.find((x) => x.name === "test.failure");
  assert.equal(operation?.count, 1);
  assert.ok((operation?.avg ?? 0) >= 4);
  assert.equal(failure?.failures, 1);
  clearPerf();
});
