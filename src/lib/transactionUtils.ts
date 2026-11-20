import type { Transaction } from "firebase/firestore";

type DeferredWrite = () => void;

/**
 * Firestore rejects a transaction if `get()` is called after `set()`/`update()`/
 * `delete()`. Complex financial handlers can easily grow a write before a late
 * conditional balance read, so stage every write until the update function has
 * finished all of its reads. Firestore already buffers writes until commit;
 * this only guarantees the SDK never observes a read-after-write order.
 */
export function withReadsBeforeWrites<T>(
  tx: Transaction,
  updateFunction: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const staged: DeferredWrite[] = [];

  const deferred = new Proxy(tx, {
    get(target, property) {
      if (property === "set" || property === "update" || property === "delete") {
        return (...args: any[]) => {
          staged.push(() => (target as any)[property](...args));
          return deferred;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Transaction;

  return (async () => {
    const result = await updateFunction(deferred);
    for (const write of staged) write();
    return result;
  })();
}
