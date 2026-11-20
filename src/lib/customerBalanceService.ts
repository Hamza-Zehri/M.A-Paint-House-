/**
 * Centralized customer-balance data service.
 *
 * Every Firestore read of `customerBalances/{customerId}`, every transaction
 * that writes it, and every batched balance-write operation goes through this
 * module. It provides:
 *
 *  - a short-lived in-memory cache for *display* (never used to authorize a
 *    financial write);
 *  - single-flight de-duplication of identical in-flight reads;
 *  - a per-customer mutex so two transactions for one customer queue instead
 *    of conflicting on the same document (the SDK retries ABORTED transactions
 *    up to 5 times, re-reading the balance on every attempt);
 *  - server reads for authoritative values, with bounded, jittered backoff and
 *    a global quota gate — a 429 immediately blocks all further balance reads;
 *  - one place to invalidate/prime balances after a transaction;
 *  - privacy-safe read diagnostics.
 *
 * Transaction reads deliberately bypass the cache: `readBalanceInTransaction`
 * always calls `tx.get()`, so a financial decision is based on the committed
 * server value, never on a stale cache entry.
 */

import {
  getDoc,
  getDocFromCache,
  onSnapshot,
  runTransaction,
  type DocumentSnapshot,
  type Transaction,
  type Unsubscribe,
} from "firebase/firestore";
import { balanceRef, type WriteOp } from "./db";
import { firestore } from "./firebase";
import {
  assertQuotaAvailable,
  backoffWithJitter,
  createKeyedMutex,
  isQuotaExhausted,
  noteQuotaExhausted,
  quotaRetryAfterMs,
  shouldRetryNetworkError,
  sleep,
} from "./asyncUtils";
import {
  recordBalanceRead,
  recordBalanceWrite,
  recordCacheHit,
  recordFailure,
  recordFirestoreCall,
  recordInFlightDedup,
  recordListenerDelta,
  recordLocalCacheHit,
  recordQuota,
  recordRetry,
} from "./firestoreDiagnostics";
import type { BalanceSource } from "./firestoreDiagnostics";
import { withReadsBeforeWrites } from "./transactionUtils";

export type { BalanceSource };

/** Display-only freshness window. Financial paths never trust this value. */
const DISPLAY_TTL_MS = 10_000;
const MAX_READ_ATTEMPTS = 2;

interface CacheEntry {
  amount: number;
  at: number;
  source: BalanceSource;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<number>>();
const mutex = createKeyedMutex<string>("customer-balance");
interface ListenerRecord {
  unsubscribe: Unsubscribe;
  callbacks: Set<(amount: number) => void>;
}
const listeners = new Map<string, ListenerRecord>();

function amountOf(snap: DocumentSnapshot): number | undefined {
  const data = snap.data() as { amount?: unknown } | undefined;
  return typeof data?.amount === "number" && Number.isFinite(data.amount) ? data.amount : undefined;
}

function noteError(error: unknown, operation: string): void {
  const quota = isQuotaExhausted(error);
  recordFailure(String((error as any)?.code || (error as any)?.name || "unknown"), operation);
  if (quota) {
    recordQuota(operation);
    noteQuotaExhausted(quotaRetryAfterMs());
  }
}

/** Canonical write operation for non-transaction balance patches. */
export function balanceWriteOp(customerId: string, amount: number): WriteOp {
  return {
    type: "set",
    ref: balanceRef(customerId),
    data: { amount, updatedAt: new Date().toISOString() },
  };
}

/** Synchronous, O(1) display cache read. Returns undefined when stale/absent. */
export function peekBalance(customerId: string): number | undefined {
  const entry = cache.get(customerId);
  if (!entry) return undefined;
  if (Date.now() - entry.at > DISPLAY_TTL_MS) return undefined;
  return entry.amount;
}

/** Store a value already known from a committed write or the workspace snapshot. */
export function primeBalance(customerId: string, amount: number, source: BalanceSource = "local"): void {
  if (!customerId || !Number.isFinite(amount)) return;
  const previous = cache.get(customerId);
  // A ledger-derived value must never overwrite a newer authoritative value.
  if (source === "ledger" && previous && previous.source !== "ledger" && Date.now() - previous.at < DISPLAY_TTL_MS) return;
  cache.set(customerId, { amount, at: Date.now(), source });
}

export function primeBalances(amounts: ReadonlyMap<string, number>, source: BalanceSource = "ledger"): void {
  for (const [customerId, amount] of amounts) primeBalance(customerId, Number(amount) || 0, source);
}

export function invalidateBalance(customerId: string): void {
  cache.delete(customerId);
}

export function invalidateAllBalances(): void {
  cache.clear();
}

/** Single-flight authoritative server read. Quota failures are never cached. */
export function getFreshBalance(customerId: string, operation = "balance.read"): Promise<number> {
  const existing = inFlight.get(customerId);
  if (existing) {
    recordInFlightDedup();
    return existing;
  }

  const request = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
      assertQuotaAvailable();
      try {
        recordFirestoreCall("getDoc.balance");
        const snap = await getDoc(balanceRef(customerId));
        recordBalanceRead(customerId, "server", operation);
        const amount = amountOf(snap) ?? 0;
        primeBalance(customerId, amount, "server");
        return amount;
      } catch (error) {
        lastError = error;
        noteError(error, operation);
        if (isQuotaExhausted(error)) throw error;
        if (attempt === MAX_READ_ATTEMPTS - 1 || !shouldRetryNetworkError(error)) throw error;
        recordRetry(operation);
        await sleep(Math.max(backoffWithJitter(attempt, 300), quotaRetryAfterMs()));
      }
    }
    throw lastError;
  })();

  inFlight.set(customerId, request);
  return request.finally(() => {
    if (inFlight.get(customerId) === request) inFlight.delete(customerId);
  });
}

/**
 * Display read: fresh memory cache, then Firestore's persistent local cache,
 * then one deduplicated server read. Force `getFreshBalance` for decisions.
 */
export async function getDisplayBalance(customerId: string, operation = "balance.display"): Promise<number> {
  const fresh = peekBalance(customerId);
  if (fresh !== undefined) {
    recordCacheHit();
    return fresh;
  }
  try {
    recordFirestoreCall("getDocFromCache.balance");
    const snap = await getDocFromCache(balanceRef(customerId));
    if (snap.exists()) {
      const amount = amountOf(snap);
      if (amount !== undefined) {
        recordBalanceRead(customerId, "cache", operation);
        recordLocalCacheHit();
        primeBalance(customerId, amount, "cache");
        return amount;
      }
    }
  } catch {
    // Document not present in local persistence — fall through to the server.
  }
  return getFreshBalance(customerId, operation);
}

/** Authoritative read inside a Firestore transaction. Never cached. */
export async function readBalanceInTransaction(
  tx: Transaction,
  customerId: string,
  fallback: number,
  operation: string,
): Promise<number> {
  const snap = await tx.get(balanceRef(customerId));
  recordBalanceRead(customerId, "transaction", operation);
  return amountOf(snap) ?? fallback;
}

/**
 * Runs a financial transaction for one customer:
 *  - queued behind any other transaction for that customer (no ABORTED storm);
 *  - SDK retries capped at one attempt, so a 429 cannot re-read the balance 5x;
 *  - bounded app-level retry with jitter only for genuinely retryable faults;
 *  - quota gate checked before every attempt, including queued work.
 */
export async function runCustomerTransaction<T>(
  customerId: string,
  operation: string,
  updateFunction: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return mutex.run(customerId, async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
      assertQuotaAvailable();
      try {
        recordFirestoreCall("runTransaction");
        return await runTransaction(
          firestore,
          (tx) => withReadsBeforeWrites(tx, updateFunction),
          { maxAttempts: 1 },
        );
      } catch (error) {
        lastError = error;
        noteError(error, operation);
        if (isQuotaExhausted(error)) throw error;
        const code = String((error as any)?.code || "").toLowerCase();
        const retryable = code === "aborted" || code === "failed-precondition" || shouldRetryNetworkError(error);
        if (attempt === MAX_READ_ATTEMPTS - 1 || !retryable) throw error;
        recordRetry(operation);
        await sleep(Math.max(backoffWithJitter(attempt, 250), quotaRetryAfterMs()));
      }
    }
    throw lastError;
  });
}

/**
 * Optional shared listener for live balance display. The current UI does not
 * subscribe (mutations prime/invalidate the cache instead), but any future
 * listener must go through here so it is tracked and can be released.
 */
export function watchBalance(
  customerId: string,
  callback: (amount: number) => void,
  operation = "balance.watch",
): Unsubscribe {
  let record = listeners.get(customerId);
  if (!record) {
    recordFirestoreCall("onSnapshot.balance");
    const callbacks = new Set<(amount: number) => void>();
    const unsubscribe = onSnapshot(
      balanceRef(customerId),
      (snap) => {
        recordBalanceRead(customerId, "listener", operation);
        const amount = amountOf(snap) ?? 0;
        primeBalance(customerId, amount, "listener");
        for (const notify of callbacks) notify(amount);
      },
      (error) => noteError(error, operation),
    );
    record = { unsubscribe, callbacks };
    listeners.set(customerId, record);
    recordListenerDelta(1);
  }
  const owned = record;
  owned.callbacks.add(callback);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    // Only release the shared listener when its last subscriber leaves.
    if (listeners.get(customerId) !== owned) return;
    owned.callbacks.delete(callback);
    if (owned.callbacks.size === 0) {
      owned.unsubscribe();
      listeners.delete(customerId);
      recordListenerDelta(-1);
    }
  };
}

export function activeBalanceListeners(): number {
  return listeners.size;
}

export const balanceService = {
  peek: peekBalance,
  writeOp: balanceWriteOp,
  prime: primeBalance,
  primeMany: primeBalances,
  invalidate: invalidateBalance,
  invalidateAll: invalidateAllBalances,
  getDisplay: getDisplayBalance,
  getFresh: getFreshBalance,
  readInTransaction: readBalanceInTransaction,
  runTransaction: runCustomerTransaction,
  watch: watchBalance,
  listeners: activeBalanceListeners,
  writes: recordBalanceWrite,
};
