import { useCallback, useRef, useState } from "react";
import { mark } from "../lib/perf";

/**
 * Guards against duplicate clicks / submissions.
 *
 * The authoritative busy set lives in a ref so two clicks in the same tick can
 * never both start an operation (the old state-based version could). React
 * state is kept only to drive button disabled/loading visuals.
 */
export function useActionLock() {
  const busyRef = useRef<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const isBusy = useCallback((key: string) => busy.has(key) || busyRef.current.has(key), [busy]);

  const lock = useCallback(async (key: string, action: () => Promise<void> | void) => {
    if (busyRef.current.has(key)) return;
    const started = mark(`action.${key}`, "ui");
    busyRef.current.add(key);
    setBusy(new Set(busyRef.current));
    try {
      await action();
    } finally {
      busyRef.current.delete(key);
      setBusy(new Set(busyRef.current));
      mark(`action.${key}`, "ui", started);
    }
  }, []);

  /** Locked operation that also returns a value (e.g. a saved invoice). */
  const lockResult = useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current.has(key)) return undefined;
    const started = mark(`action.${key}`, "ui");
    busyRef.current.add(key);
    setBusy(new Set(busyRef.current));
    try {
      return await action();
    } finally {
      busyRef.current.delete(key);
      setBusy(new Set(busyRef.current));
      mark(`action.${key}`, "ui", started);
    }
  }, []);

  return { isBusy, lock, lockResult, anyBusy: busy.size > 0 };
}
