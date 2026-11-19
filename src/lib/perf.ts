/**
 * Lightweight, zero-dependency performance instrumentation.
 *
 * Records real durations (never estimated) for UI actions, data operations and
 * page navigation. The rolling buffer is intentionally small so long sessions
 * cannot grow memory. Inspect results in the console with `__maphPerf.summary()`.
 */

export type PerfKind = "ui" | "data" | "navigation" | "render" | "pdf";

export interface PerfEntry {
  name: string;
  kind: PerfKind;
  duration: number;
  at: number;
  ok: boolean;
}

const MAX_ENTRIES = 300;
const entries: PerfEntry[] = [];

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function mark(name: string, kind: PerfKind = "ui", startedAt?: number, ok = true): number {
  const t = now();
  if (startedAt !== undefined) {
    const duration = Math.max(0, t - startedAt);
    entries.push({ name, kind, duration: Math.round(duration * 100) / 100, at: Date.now(), ok });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  }
  return t;
}

/** Time a synchronous or asynchronous operation and record its real duration. */
export async function measured<T>(name: string, kind: PerfKind, fn: () => Promise<T> | T): Promise<T> {
  const start = now();
  try {
    const result = await fn();
    mark(name, kind, start, true);
    return result;
  } catch (error) {
    mark(name, kind, start, false);
    throw error;
  }
}

export interface PerfSummaryEntry {
  name: string;
  kind: PerfKind;
  count: number;
  avg: number;
  p95: number;
  max: number;
  failures: number;
}

export function perfSummary(): PerfSummaryEntry[] {
  const groups = new Map<string, PerfEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.name) || [];
    list.push(entry);
    groups.set(entry.name, list);
  }
  return [...groups.entries()]
    .map(([name, list]) => {
      const durations = list.map((e) => e.duration).sort((a, b) => a - b);
      const total = durations.reduce((sum, d) => sum + d, 0);
      return {
        name,
        kind: list[0].kind,
        count: list.length,
        avg: Math.round((total / list.length) * 100) / 100,
        p95: durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))],
        max: durations[durations.length - 1],
        failures: list.filter((e) => !e.ok).length,
      };
    })
    .sort((a, b) => b.p95 - a.p95);
}

export function perfEntries(): readonly PerfEntry[] {
  return entries;
}

export function clearPerf() {
  entries.length = 0;
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "__maphPerf", {
    configurable: true,
    value: Object.freeze({ entries: perfEntries, summary: perfSummary, clear: clearPerf, mark }),
  });
}
