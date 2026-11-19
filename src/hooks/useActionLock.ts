import { useCallback, useState } from "react";

/**
 * Lightweight, reusable guard against duplicate clicks / submissions.
 * Tracks a set of busy keys so individual buttons can be disabled
 * while their operation is running.
 */
export function useActionLock() {
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const isBusy = useCallback((key: string) => busy.has(key), [busy]);

  const lock = useCallback(
    async (key: string, action: () => Promise<void> | void) => {
      if (busy.has(key)) return;
      setBusy((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      try {
        await action();
      } finally {
        setBusy((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [busy],
  );

  const anyBusy = busy.size > 0;

  return { isBusy, lock, anyBusy };
}