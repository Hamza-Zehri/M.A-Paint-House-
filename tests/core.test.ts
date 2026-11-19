import assert from "node:assert/strict";
import test from "node:test";

import { calcDiscount, calcLineTotal, formatMoney, percentOf, toPaisa, toRupees } from "../src/lib/money.ts";
import {
  buildProductSearchIndex,
  idempotentId,
  indexBy,
  indexById,
  invoiceBalances,
  latestBalancesByCustomer,
  matchProduct,
  paidByInvoice,
  recalculateLedgerBalances,
  sumBy,
} from "../src/lib/selectors.ts";
import type {
  Customer,
  Invoice,
  LedgerEntry,
  PaymentAllocation,
  Product,
} from "../src/lib/types.ts";

const customer = (id: string, openingBalance = 0): Customer => ({
  id,
  name: `Customer ${id}`,
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  openingBalance,
  discount: 0,
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  active: true,
});

const entry = (
  id: string,
  customerId: string,
  type: LedgerEntry["type"],
  debit: number,
  credit: number,
  balance: number,
  createdAt: string,
): LedgerEntry => ({
  id,
  customerId,
  type,
  date: createdAt.slice(0, 10),
  reference: id,
  description: id,
  debit,
  credit,
  balance,
  createdAt,
});

const invoice = (id: string, netPayable: number): Invoice => ({
  id,
  number: `INV-${id}`,
  customerId: "c1",
  customerName: "Customer c1",
  customerDiscount: 0,
  date: "2026-01-01",
  items: [],
  subtotal: netPayable,
  discountPercent: 0,
  discountAmount: 0,
  netPayable,
  paymentReceived: 0,
  balanceDue: netPayable,
  previousBalance: 0,
  notes: "",
  status: "finalized",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const allocation = (id: string, invoiceId: string, amount: number): PaymentAllocation => ({
  id,
  paymentId: `pay-${id}`,
  invoiceId,
  amount,
  createdAt: "2026-01-02T00:00:00.000Z",
});

const product = (index: number): Product => ({
  id: `p${index}`,
  name: `Aqua Matt ${index}`,
  colourCode: `C${index}`,
  familyId: index % 2 === 0 ? "fam-aqua" : "fam-enamel",
  size: "Gallon",
  price: 1000 + index,
  override: false,
  code: `AM-${index}`,
  category: index % 2 === 0 ? "Aqua Matt" : "Super Enamel",
  brand: "M.A Paint House",
  description: "",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

test("money helpers keep integer paisa calculations exact", () => {
  assert.equal(toPaisa("1234.56"), 123456);
  assert.equal(toRupees(123456), 1234.56);
  assert.equal(percentOf(123456, 10), 12346);
  assert.equal(calcDiscount(123456, 10), 12346);
  assert.equal(calcLineTotal(1999, 3), 5997);
  assert.equal(formatMoney(123456), "Rs 1,234.56");
});

test("derived indexes turn repeated scans into O(1) lookups", () => {
  const invoices = Array.from({ length: 100 }, (_, i) => invoice(`i${i}`, 10000 + i));
  const byId = indexById(invoices);
  assert.equal(byId.size, 100);
  assert.equal(byId.get("i42")?.netPayable, 10042);

  const byCustomer = indexBy(invoices, (x) => x.customerId);
  assert.equal(byCustomer.get("c1")?.length, 100);
  assert.equal(sumBy(invoices, (x) => x.netPayable), 1_004_950);
});

test("latest ledger balance wins, including customers with no ledger row", () => {
  const customers = [customer("c1", 5000), customer("c2", 2500)];
  const ledger = [
    entry("l1", "c1", "invoice", 10000, 0, 15000, "2026-01-01T10:00:00.000Z"),
    entry("l2", "c1", "payment", 0, 2000, 13000, "2026-01-02T10:00:00.000Z"),
    entry("l3", "c3", "opening", 700, 0, 700, "2026-01-03T10:00:00.000Z"),
  ];
  const balances = latestBalancesByCustomer(ledger, customers);
  assert.equal(balances.get("c1"), 13000);
  assert.equal(balances.get("c2"), 2500);
  assert.equal(balances.get("c3"), 700);
});

test("payment allocations determine invoice balances correctly", () => {
  const invoices = [invoice("i1", 10000), invoice("i2", 5000)];
  const allocations = [allocation("a1", "i1", 4000), allocation("a2", "i1", 1000)];
  const paid = paidByInvoice(allocations);
  const balances = invoiceBalances(invoices, allocations);
  assert.equal(paid.get("i1"), 5000);
  assert.equal(paid.get("i2"), undefined);
  assert.equal(balances.get("i1"), 5000);
  assert.equal(balances.get("i2"), 5000);
});

test("ledger rebuild preserves running balances after a deletion", () => {
  const ledger = [
    entry("l1", "c1", "opening", 5000, 0, 5000, "2026-01-01T00:00:00.000Z"),
    entry("l2", "c1", "invoice", 7000, 0, 12000, "2026-01-02T00:00:00.000Z"),
    entry("l3", "c1", "payment", 0, 2000, 10000, "2026-01-03T00:00:00.000Z"),
  ];
  const rebuilt = recalculateLedgerBalances([ledger[0], ledger[2]]);
  assert.deepEqual(rebuilt.map((x) => x.balance), [5000, 3000]);
  assert.equal(rebuilt[1].id, "l3");
});

test("idempotency IDs are deterministic for retries", () => {
  const key = "inv:2026-11-20 abc/123";
  assert.equal(idempotentId("inv", key), idempotentId("inv", key));
  assert.equal(idempotentId("inv", key), "inv_inv_2026-11-20_abc_123");
  assert.notEqual(idempotentId("inv", key), idempotentId("pay", key));
});

test("100 invoices: index build and balance derivation stay sub-100ms", () => {
  const invoices = Array.from({ length: 100 }, (_, i) => invoice(`i${i}`, 10000 + i));
  const allocations = invoices.map((inv, i) => allocation(`a${i}`, inv.id, i % 2 === 0 ? 1000 : 0));

  const started = performance.now();
  const byId = indexById(invoices);
  const byCustomer = indexBy(invoices, (x) => x.customerId);
  const balances = invoiceBalances(invoices, allocations);
  const paid = paidByInvoice(allocations);
  const elapsed = performance.now() - started;

  assert.equal(byId.size, 100);
  assert.equal(byCustomer.get("c1")?.length, 100);
  assert.equal(balances.size, 100);
  assert.equal(paid.size, 100);
  assert.ok(elapsed < 100, `100-invoice selectors took ${elapsed.toFixed(2)}ms`);
});

test("100 products: search index build and filtered lookup stay sub-100ms", () => {
  const products = Array.from({ length: 100 }, (_, i) => product(i));
  const families = new Map([
    ["fam-aqua", "Aqua Matt"],
    ["fam-enamel", "Super Enamel"],
  ]);

  const started = performance.now();
  const index = buildProductSearchIndex(products, families);
  const matches = index.filter((x) => matchProduct(x, "aqua", "fam-aqua"));
  const elapsed = performance.now() - started;

  assert.equal(index.length, 100);
  assert.equal(matches.length, 50);
  assert.ok(elapsed < 100, `100-product search took ${elapsed.toFixed(2)}ms`);
});

test("rapid duplicate clicks resolve to a single deterministic document id", () => {
  const key = "payment-key-42";
  const ids = Array.from({ length: 20 }, () => idempotentId("pay", key));
  assert.equal(new Set(ids).size, 1);
});
