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
  "resource-exhausted",
  "network-request-failed",
];

export function shouldRetryNetworkError(error: any): boolean {
  const code = String(error?.code || "").toLowerCase();
  return RETRYABLE_CODES.includes(code) || /network|offline|temporar|timeout|failed to fetch/i.test(String(error?.message || ""));
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
  if (error instanceof OperationTimeoutError) {
    return `${error.operation} is taking longer than expected. We will check whether it already completed — please do not repeat the action.`;
  }
  return String(error?.message || error || "Something went wrong. Please try again.");
}
