/**
 * Last-known-good workspace snapshot.
 *
 * Firestore can exhaust its free daily read quota; when that happens the app
 * must keep working with the data it already loaded instead of hammering the
 * API with retries. The snapshot is only written after a successful full read.
 * Financial mutations are never written here — they patch live state directly.
 */
import type {
  BusinessSettings, Customer, Product, ProductFamily, FamilyPricing,
  Invoice, Payment, PaymentAllocation, LedgerEntry, Expense, AuditLog,
} from "./types";

const KEY = "maph_workspace_snapshot_v1";

export interface WorkspaceSnapshot {
  v: 1;
  at: number;
  settings: BusinessSettings | null;
  customers: Customer[];
  families: ProductFamily[];
  pricing: FamilyPricing[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  allocations: PaymentAllocation[];
  ledger: LedgerEntry[];
  expenses: Expense[];
  audit: AuditLog[];
}

export type SnapshotData = Omit<WorkspaceSnapshot, "v" | "at">;

export function readSnapshot(maxAgeMs = 12 * 60 * 60 * 1000): WorkspaceSnapshot | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceSnapshot;
    if (parsed?.v !== 1 || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot(data: SnapshotData): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEY, JSON.stringify({ v: 1, at: Date.now(), ...data } satisfies WorkspaceSnapshot));
  } catch {
    // Storage can be full or unavailable; the live in-memory state is authoritative.
  }
}
