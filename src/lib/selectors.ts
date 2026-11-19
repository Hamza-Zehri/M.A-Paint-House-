/**
 * Pure, allocation-light selectors shared by the store and pages.
 * These are synchronous, O(n) where previously callers did repeated O(n) scans
 * and sorts on every render. They live in a dependency-free module so they can
 * be exercised by Node's test runner.
 */

import type { BusinessSettings, Customer, Invoice, LedgerEntry, PaymentAllocation, Product } from "./types";

export function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return map;
}

export function indexBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function sumBy<T>(items: readonly T[], valueOf: (item: T) => number): number {
  let sum = 0;
  for (const item of items) sum += Number(valueOf(item)) || 0;
  return sum;
}

/** Mirrors the store's previous customerBalance(): newest entry by createdAt wins. */
export function latestBalancesByCustomer(
  ledger: readonly LedgerEntry[],
  customers: readonly Customer[],
): Map<string, number> {
  const latest = new Map<string, LedgerEntry>();
  for (const entry of ledger) {
    const current = latest.get(entry.customerId);
    if (!current || String(entry.createdAt || "") >= String(current.createdAt || "")) {
      latest.set(entry.customerId, entry);
    }
  }
  const balances = new Map<string, number>();
  for (const customer of customers) {
    const entry = latest.get(customer.id);
    balances.set(customer.id, entry ? Number(entry.balance) || 0 : Number(customer.openingBalance) || 0);
  }
  // Ledger rows for deleted customers still need a sensible balance.
  for (const [customerId, entry] of latest) {
    if (!balances.has(customerId)) balances.set(customerId, Number(entry.balance) || 0);
  }
  return balances;
}

export function invoiceBalances(
  invoices: readonly Invoice[],
  allocations: readonly PaymentAllocation[],
): Map<string, number> {
  const paid = new Map<string, number>();
  for (const allocation of allocations) {
    paid.set(allocation.invoiceId, (paid.get(allocation.invoiceId) || 0) + (Number(allocation.amount) || 0));
  }
  const balances = new Map<string, number>();
  for (const invoice of invoices) {
    balances.set(invoice.id, (Number(invoice.netPayable) || 0) - (paid.get(invoice.id) || 0));
  }
  return balances;
}

export function paidByInvoice(allocations: readonly PaymentAllocation[]): Map<string, number> {
  const paid = new Map<string, number>();
  for (const allocation of allocations) {
    paid.set(allocation.invoiceId, (paid.get(allocation.invoiceId) || 0) + (Number(allocation.amount) || 0));
  }
  return paid;
}

/** Stable running-balance rebuild used after entries are removed. */
export function recalculateLedgerBalances(entries: LedgerEntry[]): LedgerEntry[] {
  const sorted = [...entries].sort(
    (a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
  );
  let balance = 0;
  return sorted.map((entry) => {
    balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
    return { ...entry, balance };
  });
}

export interface ProductSearchEntry {
  product: Product;
  haystack: string;
}

export function buildProductSearchIndex(products: readonly Product[], familyNameById: ReadonlyMap<string, string>): ProductSearchEntry[] {
  return products.map((product) => ({
    product,
    haystack: `${product.name} ${product.colourCode} ${familyNameById.get(product.familyId) || ""} ${product.category} ${product.code} ${product.brand}`.toLowerCase(),
  }));
}

export function matchProduct(entry: ProductSearchEntry, query: string, familyId: string | null): boolean {
  if (familyId && entry.product.familyId !== familyId) return false;
  if (!query) return true;
  return entry.haystack.includes(query.toLowerCase());
}

export function nextInvoiceNumber(settings: BusinessSettings | null): string {
  const counter = (Number(settings?.invoiceCounter) || 1000) + 1;
  return `${settings?.invoicePrefix || "INV"}-${counter}`;
}

export function topByCreatedAt<T extends { createdAt?: string }>(items: readonly T[], count: number): T[] {
  return [...items].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, count);
}

/** Deterministic Firestore document ID used by retried financial saves. */
export function idempotentId(prefix: string, key: string): string {
  return `${prefix}_${String(key).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
