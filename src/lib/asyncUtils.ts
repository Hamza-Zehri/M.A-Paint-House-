/** Small async helpers used across slow-network paths. */

export class OperationTimeoutError extends Error {
  code = "TIMEOUT";
  operation: string;
  ms: number;
  constructor(operation: string, ms: number) {
    super(`${operation} timed out after ${ms}ms. Check the transaction status before retrying.`);
    this.name = "OperationTimeoutError";
    this.operation = operation;
    this.ms = ms;
  }
}

/** Let the browser paint pending UI before starting expensive synchronous work. */
export function nextPaint(): Promise<void> {
  if (typeof requestAnimationFrame === "undefined") return new Promise((r) => setTimeout(r, 0));
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Run non-urgent work when the main thread is idle. */
export function onIdle(callback: () => void, timeout = 1500): void {
  const idle = (window as any).requestIdleCallback;
  if (typeof idle === "function") idle(callback, { timeout });
  else window.setTimeout(callback, 1);
}

/**
 * Bound an operation in time. Callers must use an idempotency key for any
 * mutation wrapped in this helper: a timeout does NOT mean the server failed.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OperationTimeoutError(operation, ms)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export interface RetryOptions {
  retries?: number;
  baseDelay?: number;
  label?: string;
  /** Only retry when this returns true. Default: retry network/timeouts only. */
  shouldRetry?: (error: any, attempt: number) => boolean;
}

const RETRYABLE_CODES = [
  "TIMEOUT",
  "unavailable",
  "deadline-exceeded",
  "internal",
  "network-request-failed",
];

const QUOTA_KEY = "maph_firestore_quota_cooldown";
const QUOTA_RETRY_AFTER_KEY = "maph_firestore_quota_retry_after";
const QUOTA_ATTEMPT_KEY = "maph_firestore_quota_attempt";
const QUOTA_COOLDOWN_MS = 60_000;
const MAX_QUOTA_COOLDOWN_MS = 5 * 60_000;

/** Quota exhaustion is not a transient network fault — retrying makes it worse. */
export function isQuotaExhausted(error: any): boolean {
  const code = String(error?.code || "").toLowerCase();
  return code === "resource-exhausted" || code === "429" || Number(error?.status) === 429;
}

export function shouldRetryNetworkError(error: any): boolean {
  if (isQuotaExhausted(error)) return false;
  const code = String(error?.code || "").toLowerCase();
  if (code === "permission-denied" || code === "not-found" || code === "invalid-argument") return false;
  return RETRYABLE_CODES.includes(code) || /network|offline|temporar|timeout|failed to fetch/i.test(String(error?.message || ""));
}

/**
 * Remember a quota failure so a page reload or another component does not
 * immediately retry it. A Retry-After header (when the transport exposes one)
 * extends the cooldown, but never beyond a sane maximum.
 */
export function noteQuotaExhausted(retryAfterMs = 0): void {
  try {
    if (typeof localStorage === "undefined") return;
    const fromServer = Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? Math.min(retryAfterMs, MAX_QUOTA_COOLDOWN_MS)
      : 0;
    // Consecutive quota failures back off exponentially; a fresh incident
    // after the cooldown expired starts again at the base delay.
    const wasCoolingDown = Number(localStorage.getItem(QUOTA_KEY) || 0) > Date.now();
    const attempt = wasCoolingDown ? Math.max(0, Number(localStorage.getItem(QUOTA_ATTEMPT_KEY) || 0)) : 0;
    const cooldown = Math.min(MAX_QUOTA_COOLDOWN_MS, Math.max(fromServer, quotaBackoffWithJitter(attempt)));
    localStorage.setItem(QUOTA_KEY, String(Date.now() + cooldown));
    localStorage.setItem(QUOTA_ATTEMPT_KEY, String(attempt + 1));
    if (fromServer) localStorage.setItem(QUOTA_RETRY_AFTER_KEY, String(Date.now() + fromServer));
  } catch { /* storage can be unavailable in private mode */ }
}

export function isQuotaCoolingDown(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return Number(localStorage.getItem(QUOTA_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

/** Remaining server-advertised Retry-After delay, if any. */
export function quotaRetryAfterMs(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    return Math.max(0, Number(localStorage.getItem(QUOTA_RETRY_AFTER_KEY) || 0) - Date.now());
  } catch {
    return 0;
  }
}

/**
 * Exponential backoff with jitter for quota exhaustion. This is a cooldown
 * policy, not an immediate retry: new requests stay blocked until it expires.
 * `Retry-After` (when supplied) always wins over the computed delay.
 */
export function quotaBackoffWithJitter(attempt: number): number {
  const step = Math.max(0, Math.min(attempt, 3));
  const base = Math.min(QUOTA_COOLDOWN_MS * 2 ** step, MAX_QUOTA_COOLDOWN_MS);
  const jitter = Math.round(Math.random() * Math.min(base * 0.2, 15_000));
  return Math.min(MAX_QUOTA_COOLDOWN_MS, base + jitter);
}

/** Call before starting any new Firestore work during a quota event. */
export function assertQuotaAvailable(): void {
  if (isQuotaCoolingDown()) {
    throw new Error("Firestore quota cooldown is active. The saved data is shown from cache; please retry shortly.");
  }
}

export function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/** Exponential backoff with jitter so concurrent clients do not resume together. */
export function backoffWithJitter(attempt: number, base = 400): number {
  return Math.round(base * 2 ** Math.max(0, attempt) + Math.random() * base * 0.5);
}

/**
 * Serializes async work per key. Financial transactions for the same customer
 * queue instead of racing on the canonical balance document, which removes
 * ABORTED transaction retries (and their repeated BatchGetDocuments reads).
 */
export function createKeyedMutex<K>(_label = "keyed") {
  const tails = new Map<K, Promise<void>>();
  return {
    async run<T>(key: K, work: () => Promise<T>): Promise<T> {
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const tail = previous.catch(() => undefined).then(() => gate);
      tails.set(key, tail);
      try {
        await previous.catch(() => undefined);
        return await work();
      } finally {
        release();
        if (tails.get(key) === tail) tails.delete(key);
      }
    },
    pending(): number { return tails.size; },
  };
}

/**
 * Collapse duplicate callers of one logical operation into a single promise.
 * Mutating callers must key this with an idempotency key (or the entity id),
 * so a second click, a component remount, or an outer timeout retry cannot
 * open a second transaction for the same financial record.
 */
export function dedupePromise<K, T>(
  map: Map<K, Promise<T>>,
  key: K,
  work: () => Promise<T>,
  onDedup?: () => void,
): Promise<T> {
  const existing = map.get(key);
  if (existing) {
    onDedup?.();
    return existing;
  }
  const promise = Promise.resolve().then(work).finally(() => {
    if (map.get(key) === promise) map.delete(key);
  });
  map.set(key, promise);
  return promise;
}

/**
 * Retry with exponential backoff and jitter. Use ONLY for idempotent work —
 * invoice/payment mutations carry an idempotency key so a retry is safe.
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelay = 400, label = "operation", shouldRetry = shouldRetryNetworkError } = options;
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error, attempt)) throw error;
      const delay = baseDelay * 2 ** attempt + Math.floor(Math.random() * 120);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Human-readable message for toasts; keeps timeout/idempotency context. */
export function friendlyError(error: any): string {
  if (isQuotaExhausted(error)) {
    return "Firestore's free daily quota is exhausted. Anything already saved is safe; the app is showing the last cached data. Retries are paused with backoff — please wait a minute or check Firebase usage before trying again.";
  }
  if (error instanceof OperationTimeoutError) {
    return `${error.operation} is taking longer than expected. We will check whether it already completed — please do not repeat the action.`;
  }
  return String(error?.message || error || "Something went wrong. Please try again.");
}
