/**
 * Bounded, privacy-safe Firestore diagnostics.
 *
 * This module records request *shape* (operation name, hashed customer token,
 * timestamps, error codes) — never names, phone numbers, amounts or ledger
 * content. It has no Firebase imports so every data module can use it without
 * creating an import cycle.
 *
 * Inspect a live session with `window.__maphFirestoreDiag.snapshot()`.
 */

export type BalanceSource = "cache" | "server" | "transaction" | "ledger" | "local" | "listener";

export interface BalanceReadEvent {
  /** Epoch ms. */
  t: number;
  /** Short, stable, non-reversible-looking token for the customer id. */
  token: string;
  source: BalanceSource;
  /** Call-site label such as "invoice.create" — no customer data. */
  operation: string;
}

const MAX_EVENTS = 240;
const MAX_REQUEST_TIMES = 240;
const DUPLICATE_WINDOW_MS = 2_000;

const readsPerCustomer = new Map<string, number>();
const writesPerCustomer = new Map<string, number>();
const lastServerReadAt = new Map<string, number>();
const readEvents: BalanceReadEvent[] = [];
const requestTimes: number[] = [];
const calls: Record<string, number> = Object.create(null);
const failures: Record<string, number> = Object.create(null);
const retriesByOperation: Record<string, number> = Object.create(null);

let duplicateReads = 0;
let inFlightDedupHits = 0;
let operationDedupHits = 0;
let cacheHits = 0;
let localCacheHits = 0;
let activeListeners = 0;
let quotaEvents = 0;
const startedAt = Date.now();

/** FNV-1a — a short, deterministic token that does not expose a raw customer id. */
export function tokenFor(customerId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < customerId.length; i += 1) {
    hash ^= customerId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

export function recordFirestoreCall(operation: string): void {
  bump(calls, operation || "unknown");
  requestTimes.push(Date.now());
  if (requestTimes.length > MAX_REQUEST_TIMES) requestTimes.splice(0, requestTimes.length - MAX_REQUEST_TIMES);
}

export function recordBalanceRead(customerId: string, source: BalanceSource, operation: string): void {
  const token = tokenFor(customerId);
  readsPerCustomer.set(token, (readsPerCustomer.get(token) || 0) + 1);
  const now = Date.now();
  if (source === "server" || source === "transaction") {
    const previous = lastServerReadAt.get(token);
    if (previous !== undefined && now - previous < DUPLICATE_WINDOW_MS) duplicateReads += 1;
    lastServerReadAt.set(token, now);
  }
  readEvents.push({ t: now, token, source, operation: operation || "unknown" });
  if (readEvents.length > MAX_EVENTS) readEvents.splice(0, readEvents.length - MAX_EVENTS);
}

export function recordBalanceWrite(customerId: string, operation = "write"): void {
  const token = tokenFor(customerId);
  writesPerCustomer.set(token, (writesPerCustomer.get(token) || 0) + 1);
  bump(calls, `balance.${operation}`);
}

export function recordFailure(code: string, operation: string): void {
  bump(failures, `${code || "unknown"}@${operation || "unknown"}`);
}

export function recordQuota(operation: string): void {
  quotaEvents += 1;
  bump(failures, `resource-exhausted@${operation || "unknown"}`);
}

export function recordRetry(operation: string): void {
  bump(retriesByOperation, operation || "unknown");
}

export function recordInFlightDedup(): void { inFlightDedupHits += 1; }
/** A duplicate invoice/payment action was collapsed before it reached Firestore. */
export function recordOperationDedup(): void { operationDedupHits += 1; }
export function recordCacheHit(): void { cacheHits += 1; }
export function recordLocalCacheHit(): void { localCacheHits += 1; }
export function recordListenerDelta(delta: number): void {
  activeListeners = Math.max(0, activeListeners + delta);
}

function top(map: Map<string, number>, count = 10): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, count));
}

export interface FirestoreDiagSnapshot {
  uptimeMs: number;
  totals: {
    firestoreCalls: number;
    balanceReads: number;
    duplicateBalanceReads: number;
    inFlightDedupHits: number;
    operationDedupHits: number;
    displayCacheHits: number;
    persistentCacheHits: number;
    activeListeners: number;
    quotaEvents: number;
  };
  readsPerCustomer: Record<string, number>;
  writesPerCustomer: Record<string, number>;
  recentReads: readonly BalanceReadEvent[];
  calls: Record<string, number>;
  failures: Record<string, number>;
  retries: Record<string, number>;
  /** Timestamps of the last requests, for requests-per-second checks. */
  requestFrequency: readonly number[];
}

export function diagSnapshot(): FirestoreDiagSnapshot {
  let balanceReads = 0;
  for (const count of readsPerCustomer.values()) balanceReads += count;
  let firestoreCalls = 0;
  for (const count of Object.values(calls)) firestoreCalls += count;
  return {
    uptimeMs: Date.now() - startedAt,
    totals: {
      firestoreCalls,
      balanceReads,
      duplicateBalanceReads: duplicateReads,
      inFlightDedupHits,
      operationDedupHits,
      displayCacheHits: cacheHits,
      persistentCacheHits: localCacheHits,
      activeListeners,
      quotaEvents,
    },
    readsPerCustomer: top(readsPerCustomer),
    writesPerCustomer: top(writesPerCustomer),
    recentReads: [...readEvents],
    calls: { ...calls },
    failures: { ...failures },
    retries: { ...retriesByOperation },
    requestFrequency: [...requestTimes],
  };
}

export function resetDiag(): void {
  readsPerCustomer.clear();
  writesPerCustomer.clear();
  lastServerReadAt.clear();
  readEvents.length = 0;
  requestTimes.length = 0;
  for (const key of Object.keys(calls)) delete calls[key];
  for (const key of Object.keys(failures)) delete failures[key];
  for (const key of Object.keys(retriesByOperation)) delete retriesByOperation[key];
  duplicateReads = 0;
  inFlightDedupHits = 0;
  operationDedupHits = 0;
  cacheHits = 0;
  localCacheHits = 0;
  activeListeners = 0;
  quotaEvents = 0;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "__maphFirestoreDiag", {
    configurable: true,
    value: Object.freeze({
      snapshot: diagSnapshot,
      reset: resetDiag,
      tokenFor,
    }),
  });
}
