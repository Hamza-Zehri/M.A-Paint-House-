import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { runTransaction, type Transaction } from "firebase/firestore";
import { db, docRef, balanceRef, commitWrites, type WriteOp } from "../lib/db";
import { firestore } from "../lib/firebase";
import { seedIfEmpty, cleanupLegacySeededData } from "../lib/seed";
import { toPaisa, uid, percentOf } from "../lib/money";
import { currentUser, logout as doLogout, waitForAuth, isDefaultAdminEmail } from "../lib/auth";
import { measured } from "../lib/perf";
import { withTimeout, retry } from "../lib/asyncUtils";
import {
  idempotentId,
  indexById,
  indexBy,
  latestBalancesByCustomer,
  paidByInvoice,
  recalculateLedgerBalances,
  sumBy,
} from "../lib/selectors";
import type { BusinessSettings, Customer, Product, ProductFamily, FamilyPricing, Invoice, InvoiceItem, Payment, PaymentAllocation, LedgerEntry, Expense, User, AuditLog } from "../lib/types";

interface Ctx {
  ready: boolean;
  user: User | null;
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
  /** Pre-built indexes — O(1) lookups instead of repeated array scans. */
  customerById: ReadonlyMap<string, Customer>;
  productById: ReadonlyMap<string, Product>;
  familyById: ReadonlyMap<string, ProductFamily>;
  pricingByFamily: ReadonlyMap<string, FamilyPricing>;
  ledgerByCustomer: ReadonlyMap<string, LedgerEntry[]>;
  balancesByCustomer: ReadonlyMap<string, number>;
  paidByInvoiceMap: ReadonlyMap<string, number>;
  invoicesByCustomer: ReadonlyMap<string, Invoice[]>;
  paymentsByCustomer: ReadonlyMap<string, Payment[]>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  doLogout: () => void;
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Promise<Customer>;
  updateCustomer: (c: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  addFamily: (name: string, description?: string) => Promise<ProductFamily>;
  updateFamily: (f: ProductFamily) => Promise<void>;
  deleteFamily: (id: string) => Promise<void>;
  updateFamilyPricing: (familyId: string, drum: number, gallon: number, quartar: number) => Promise<{ affected: number }>;
  addProduct: (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  updateProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  toggleProduct: (id: string) => Promise<void>;
  importProducts: (rows: any[]) => Promise<{
    imported: number; families: number; duplicates: number; missing: number;
    review: number; pricesUpdated: number; totalRows: number;
  }>;
  createInvoice: (input: { customerId: string; date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; paymentReceived?: number; notes?: string; status?: "draft" | "finalized"; bonus?: boolean; idempotencyKey?: string }) => Promise<Invoice>;
  updateInvoice: (inv: Invoice) => Promise<void>;
  editInvoice: (id: string, input: { date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; notes?: string; bonus?: boolean }) => Promise<Invoice>;
  cancelInvoice: (id: string) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  recordPayment: (input: { customerId: string; date: string; amount: number; method: string; reference?: string; notes?: string; allocations?: { invoiceId: string; amount: number }[]; idempotencyKey?: string }) => Promise<Payment>;
  updatePayment: (p: Payment) => Promise<void>;
  reversePayment: (id: string) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  updateExpense: (e: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateSettings: (s: BusinessSettings) => Promise<void>;
  log: (action: string, entity: string, entityId: string, details: string) => Promise<void>;
  customerBalance: (customerId: string) => number;
  invoiceBalance: (invoiceId: string) => number;
  familyPricing: (familyId: string) => FamilyPricing | undefined;
  productsByFamily: (familyId: string) => Product[];
}

const Context = createContext<Ctx | null>(null);

const isoNow = () => new Date().toISOString();
const setOp = (name: string, id: string, data: unknown): WriteOp => ({ type: "set", ref: docRef(name, id), data });
const delOp = (name: string, id: string): WriteOp => ({ type: "delete", ref: docRef(name, id) });
/** Keeps the transaction-safe balance document in sync with ledger mutations. */
const balanceOp = (customerId: string, amount: number): WriteOp => ({
  type: "set",
  ref: balanceRef(customerId),
  data: { amount, updatedAt: isoNow() },
});

function makeAudit(user: User | null, action: string, entity: string, entityId: string, details: string) {
  const entry: AuditLog = {
    id: uid(), action, entity, entityId, details,
    user: user?.name || "system", createdAt: isoNow(),
  };
  return { entry, op: setOp("audit", entry.id, entry) };
}

/** Timeout protects the UI from hung requests; never assume a timeout = failure. */
const MUTATION_TIMEOUT = 15000;
function guard<T>(name: string, work: () => Promise<T>): Promise<T> {
  return measured(name, "data", () => withTimeout(work(), MUTATION_TIMEOUT, name));
}
/** Only used where an idempotency key makes a retry safe. */
function guardIdempotent<T>(name: string, work: () => Promise<T>): Promise<T> {
  return measured(name, "data", () =>
    retry(() => withTimeout(work(), MUTATION_TIMEOUT, name), { retries: 1, baseDelay: 500, label: name }),
  );
}

/** Reads the canonical balance document, falling back to the ledger-derived value on first use. */
async function txBalance(tx: Transaction, customerId: string, fallback: number): Promise<number> {
  const snap = await tx.get(balanceRef(customerId));
  const data = snap.data() as { amount?: unknown } | undefined;
  return typeof data?.amount === "number" && Number.isFinite(data.amount) ? data.amount : fallback;
}

/** Releases paidAmount on invoices when a payment is reversed or deleted. */
async function unapplyInvoiceOps(allocs: PaymentAllocation[]): Promise<WriteOp[]> {
  const totals = new Map<string, number>();
  for (const alloc of allocs) totals.set(alloc.invoiceId, (totals.get(alloc.invoiceId) || 0) + (Number(alloc.amount) || 0));
  const invoices = await Promise.all([...totals].map(([id]) => db.invoices.get(id)));
  const ops: WriteOp[] = [];
  for (const inv of invoices) {
    if (!inv) continue;
    const paid = Number(inv.paidAmount ?? inv.paymentReceived ?? 0) || 0;
    ops.push(setOp("invoices", inv.id, {
      ...inv,
      paidAmount: Math.max(0, paid - (totals.get(inv.id) || 0)),
      updatedAt: isoNow(),
    }));
  }
  return ops;
}

interface InvoiceTxResult {
  inv: Invoice;
  entries: LedgerEntry[];
  payment?: Payment;
  allocation?: PaymentAllocation;
  settings?: BusinessSettings;
  audit?: AuditLog;
}

interface PaymentTxResult {
  payment: Payment;
  allocations: PaymentAllocation[];
  entry?: LedgerEntry;
  audit?: AuditLog;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [pricing, setPricing] = useState<FamilyPricing[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);

  // Derived indexes are rebuilt only when their source array changes.
  const customerById = useMemo(() => indexById(customers), [customers]);
  const productById = useMemo(() => indexById(products), [products]);
  const familyById = useMemo(() => indexById(families), [families]);
  const invoiceById = useMemo(() => indexById(invoices), [invoices]);
  const pricingByFamily = useMemo(() => new Map(pricing.map((p) => [p.familyId, p])), [pricing]);
  const ledgerByCustomer = useMemo(() => indexBy(ledger, (l) => l.customerId), [ledger]);
  const balancesByCustomer = useMemo(() => latestBalancesByCustomer(ledger, customers), [ledger, customers]);
  const paidByInvoiceMap = useMemo(() => paidByInvoice(allocations), [allocations]);
  const invoicesByCustomer = useMemo(() => indexBy(invoices, (i) => i.customerId), [invoices]);
  const paymentsByCustomer = useMemo(() => indexBy(payments, (p) => p.customerId), [payments]);
  const productsByFamilyMap = useMemo(() => indexBy(products, (p) => p.familyId), [products]);

  const refresh = useCallback(async () => {
    return measured("data.refresh", "data", async () => {
      const [s, cust, fam, pr, prod, inv, pay, alloc, ledg, exp, aud, u] = await Promise.all([
        db.settings.get("main"),
        db.customers.toArray(),
        db.families.toArray(),
        db.pricing.toArray(),
        db.products.toArray(),
        db.invoices.toArray(),
        db.payments.toArray(),
        db.allocations.toArray(),
        db.ledger.toArray(),
        db.expenses.toArray(),
        db.audit.toArray(),
        currentUser(),
      ]);
      setSettings(s || null);
      setCustomers(cust);
      setFamilies(fam);
      setPricing(pr);
      setProducts(prod);
      setInvoices(inv);
      setPayments(pay);
      setAllocations(alloc);
      setLedger(ledg);
      setExpenses(exp);
      setAudit(aud);
      setUser(u);
    });
  }, []);

  useEffect(() => { (async () => {
    const fbUser = await waitForAuth();
    if (fbUser && isDefaultAdminEmail(fbUser.email)) {
      await doLogout();
      setReady(true);
      return;
    }
    if (fbUser) {
      try {
        localStorage.setItem("maph_session", fbUser.uid);
        if (!localStorage.getItem("maph_profile")) {
          localStorage.setItem("maph_profile", JSON.stringify({
            id: fbUser.uid,
            username: fbUser.email?.split("@")[0] || "user",
            passwordHash: "",
            name: fbUser.displayName || fbUser.email?.split("@")[0] || "User",
            role: (fbUser.email?.split("@")[0] || "").toLowerCase() === "admin" ? "admin" : "staff",
            active: true,
            createdAt: new Date().toISOString(),
          }));
        }
        try { await fbUser.getIdToken(true); } catch (e) { console.error(e); }
        if (!localStorage.getItem("maph_seeded")) {
          try {
            await seedIfEmpty();
            localStorage.setItem("maph_seeded", "1");
          } catch (e) { console.error(e); }
        }
        try { await cleanupLegacySeededData(); } catch (e) { console.error(e); }
        await refresh();
      } catch (e) { console.error(e); }
    }
    setReady(true);
  })(); }, [refresh]);

  const log = useCallback(async (action: string, entity: string, entityId: string, details: string) => {
    const a = makeAudit(user, action, entity, entityId, details);
    await guard("audit.write", () => commitWrites([a.op]));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  // ── customers ────────────────────────────────────────────────────────────
  const addCustomer = useCallback(async (c: Omit<Customer, "id" | "createdAt">) => {
    const cust: Customer = { ...c, id: uid(), createdAt: isoNow() };
    const ops: WriteOp[] = [setOp("customers", cust.id, cust), balanceOp(cust.id, cust.openingBalance)];
    const newEntries: LedgerEntry[] = [];
    if (cust.openingBalance !== 0) {
      const entry: LedgerEntry = {
        id: uid(), customerId: cust.id, date: isoNow().slice(0, 10), type: "opening", reference: "OPEN",
        description: "Opening balance", debit: cust.openingBalance > 0 ? cust.openingBalance : 0,
        credit: cust.openingBalance < 0 ? -cust.openingBalance : 0, balance: cust.openingBalance, createdAt: isoNow(),
      };
      ops.push(setOp("ledger", entry.id, entry));
      newEntries.push(entry);
    }
    const a = makeAudit(user, "create", "customer", cust.id, `Created customer ${cust.name}`);
    ops.push(a.op);
    await guard("customer.create", () => commitWrites(ops));
    setCustomers((prev) => [cust, ...prev]);
    if (newEntries.length) setLedger((prev) => [...prev, ...newEntries]);
    setAudit((prev) => [a.entry, ...prev]);
    return cust;
  }, [user]);

  const updateCustomer = useCallback(async (c: Customer) => {
    const a = makeAudit(user, "update", "customer", c.id, `Updated customer ${c.name}`);
    await guard("customer.update", () => commitWrites([setOp("customers", c.id, c), a.op]));
    setCustomers((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const deleteCustomer = useCallback(async (id: string) => {
    const c = customerById.get(id);
    if (!c) return;
    const [invs, pays, allAlloc, entries] = await Promise.all([
      db.invoices.where("customerId").equals(id).toArray(),
      db.payments.where("customerId").equals(id).toArray(),
      db.allocations.toArray(),
      db.ledger.where("customerId").equals(id).toArray(),
    ]);
    const invoiceIds = new Set(invs.map((x) => x.id));
    const paymentIds = new Set(pays.map((x) => x.id));
    const allocs = allAlloc.filter((a) => invoiceIds.has(a.invoiceId) || paymentIds.has(a.paymentId));
    const a = makeAudit(user, "delete", "customer", id, `Deleted customer ${c.name} with ${invs.length} invoice(s) and ${pays.length} payment(s)`);
    const ops: WriteOp[] = [
      ...allocs.map((x) => delOp("allocations", x.id)),
      ...invs.map((x) => delOp("invoices", x.id)),
      ...pays.map((x) => delOp("payments", x.id)),
      ...entries.map((x) => delOp("ledger", x.id)),
      delOp("customerBalances", id), delOp("customers", id), a.op,
    ];
    await guard("customer.delete", () => commitWrites(ops));
    setCustomers((prev) => prev.filter((x) => x.id !== id));
    setInvoices((prev) => prev.filter((x) => !invoiceIds.has(x.id)));
    setPayments((prev) => prev.filter((x) => !paymentIds.has(x.id)));
    setAllocations((prev) => prev.filter((x) => !allocs.some((y) => y.id === x.id)));
    setLedger((prev) => prev.filter((x) => x.customerId !== id));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, customerById]);

  // ── families / pricing / products ────────────────────────────────────────
  const addFamily = useCallback(async (name: string, description = "") => {
    const f: ProductFamily = { id: uid(), name, description, status: "active", createdAt: isoNow() };
    const fp: FamilyPricing = { familyId: f.id, drumPrice: 0, gallonPrice: 0, quartarPrice: 0, updatedAt: isoNow() };
    const a = makeAudit(user, "create", "family", f.id, `Created family ${name}`);
    await guard("family.create", () => commitWrites([setOp("families", f.id, f), setOp("pricing", f.id, fp), a.op]));
    setFamilies((prev) => [f, ...prev]);
    setPricing((prev) => [fp, ...prev]);
    setAudit((prev) => [a.entry, ...prev]);
    return f;
  }, [user]);

  const updateFamily = useCallback(async (f: ProductFamily) => {
    const a = makeAudit(user, "update", "family", f.id, `Updated family ${f.name}`);
    await guard("family.update", () => commitWrites([setOp("families", f.id, f), a.op]));
    setFamilies((prev) => prev.map((x) => (x.id === f.id ? f : x)));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const deleteFamily = useCallback(async (id: string) => {
    const f = familyById.get(id);
    if (!f) return;
    const famProducts = await db.products.where("familyId").equals(id).toArray();
    const a = makeAudit(user, "delete", "family", id, `Deleted family ${f.name} and ${famProducts.length} product(s)`);
    const ops: WriteOp[] = [
      ...famProducts.map((p) => delOp("products", p.id)),
      delOp("pricing", id), delOp("families", id), a.op,
    ];
    await guard("family.delete", () => commitWrites(ops));
    const removed = new Set(famProducts.map((p) => p.id));
    setProducts((prev) => prev.filter((p) => !removed.has(p.id)));
    setPricing((prev) => prev.filter((p) => p.familyId !== id));
    setFamilies((prev) => prev.filter((x) => x.id !== id));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, familyById]);

  const updateFamilyPricing = useCallback(async (familyId: string, drum: number, gallon: number, quartar: number) => {
    const fp: FamilyPricing = {
      familyId, drumPrice: toPaisa(drum), gallonPrice: toPaisa(gallon), quartarPrice: toPaisa(quartar), updatedAt: isoNow(),
    };
    const nowIso = isoNow();
    const affectedProducts: Product[] = [];
    for (const p of productsByFamilyMap.get(familyId) || []) {
      if (p.override) continue;
      const price = p.size === "Drum" ? fp.drumPrice : p.size === "Gallon" ? fp.gallonPrice : p.size === "Quartar" ? fp.quartarPrice : 0;
      if (!price && p.size === "Other") continue;
      affectedProducts.push({ ...p, price, updatedAt: nowIso });
    }
    const a = makeAudit(user, "update-pricing", "family", familyId, `Updated pricing; affected ${affectedProducts.length} products`);
    const ops: WriteOp[] = [
      setOp("pricing", familyId, fp),
      ...affectedProducts.map((p) => setOp("products", p.id, p)),
      a.op,
    ];
    await guard("pricing.update", () => commitWrites(ops));
    const changed = new Map(affectedProducts.map((p) => [p.id, p]));
    setPricing((prev) => [fp, ...prev.filter((p) => p.familyId !== familyId)]);
    setProducts((prev) => prev.map((p) => changed.get(p.id) || p));
    setAudit((prev) => [a.entry, ...prev]);
    return { affected: affectedProducts.length };
  }, [user, productsByFamilyMap]);

  const addProduct = useCallback(async (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    const fp = pricingByFamily.get(p.familyId);
    let price = p.price;
    if (!p.override && fp) {
      if (p.size === "Drum") price = fp.drumPrice;
      else if (p.size === "Gallon") price = fp.gallonPrice;
      else if (p.size === "Quartar") price = fp.quartarPrice;
    }
    const prod: Product = { ...p, id: uid(), price, createdAt: isoNow(), updatedAt: isoNow() };
    const a = makeAudit(user, "create", "product", prod.id, `Created product ${prod.name}`);
    await guard("product.create", () => commitWrites([setOp("products", prod.id, prod), a.op]));
    setProducts((prev) => [prod, ...prev]);
    setAudit((prev) => [a.entry, ...prev]);
    return prod;
  }, [user, pricingByFamily]);

  const updateProduct = useCallback(async (p: Product) => {
    const next = { ...p, updatedAt: isoNow() };
    const a = makeAudit(user, "update", "product", p.id, `Updated product ${p.name}`);
    await guard("product.update", () => commitWrites([setOp("products", p.id, next), a.op]));
    setProducts((prev) => prev.map((x) => (x.id === p.id ? next : x)));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const deleteProduct = useCallback(async (id: string) => {
    const p = productById.get(id);
    if (!p) return;
    const a = makeAudit(user, "delete", "product", id, `Deleted product ${p.name}`);
    await guard("product.delete", () => commitWrites([delOp("products", id), a.op]));
    setProducts((prev) => prev.filter((x) => x.id !== id));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, productById]);

  const toggleProduct = useCallback(async (id: string) => {
    const p = productById.get(id);
    if (!p) return;
    const next = { ...p, active: !p.active, updatedAt: isoNow() };
    await guard("product.toggle", () => commitWrites([setOp("products", id, next)]));
    setProducts((prev) => prev.map((x) => (x.id === id ? next : x)));
  }, [productById]);

  const importProducts = useCallback(async (rows: any[]) => {
    const nowIso = isoNow();
    const familyByName = new Map(families.map((f) => [f.name.trim().toLowerCase(), f]));
    const productKeys = new Set(
      products.map((p) => `${p.familyId}|${(p.colourCode || "").toLowerCase()}|${p.size}`),
    );
    const pricingCache = new Map<string, FamilyPricing>();
    for (const fp of pricing) pricingCache.set(fp.familyId, fp);

    const pick = (row: any, ...keys: string[]): string => {
      for (const key of keys) {
        const direct = row[key];
        if (direct !== undefined && direct !== null && String(direct).trim() !== "") return String(direct).trim();
        const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        const alternate = row[snake];
        if (alternate !== undefined && alternate !== null && String(alternate).trim() !== "") return String(alternate).trim();
      }
      return "";
    };

    let imported = 0, familiesCreated = 0, duplicates = 0, missing = 0, review = 0, pricesUpdated = 0;
    const pricedFamilies = new Set<string>();
    const ops: WriteOp[] = [];
    const newFamilies: ProductFamily[] = [];
    const newPricing: FamilyPricing[] = [];
    const newProducts: Product[] = [];

    for (const row of rows) {
      const familyName = pick(row, "family", "familyName", "productFamily", "category", "productCategory");
      if (!familyName) { review++; continue; }

      let family = familyByName.get(familyName.toLowerCase());
      if (!family) {
        family = {
          id: uid(), name: familyName, description: pick(row, "familyDescription", "description"),
          status: "active", createdAt: nowIso,
        };
        ops.push(setOp("families", family.id, family));
        newFamilies.push(family);
        familyByName.set(familyName.toLowerCase(), family);
        familiesCreated++;
      }

      if (!pricedFamilies.has(family.id)) {
        const drum = parseFloat(pick(row, "drumPrice", "drum"));
        const gallon = parseFloat(pick(row, "gallonPrice", "gallon"));
        const quartar = parseFloat(pick(row, "quartarPrice", "quartar", "quart"));
        if (!Number.isNaN(drum) || !Number.isNaN(gallon) || !Number.isNaN(quartar)) {
          const current = pricingCache.get(family.id);
          const next: FamilyPricing = {
            familyId: family.id,
            drumPrice: Number.isNaN(drum) ? current?.drumPrice || 0 : toPaisa(drum),
            gallonPrice: Number.isNaN(gallon) ? current?.gallonPrice || 0 : toPaisa(gallon),
            quartarPrice: Number.isNaN(quartar) ? current?.quartarPrice || 0 : toPaisa(quartar),
            updatedAt: nowIso,
          };
          ops.push(setOp("pricing", family.id, next));
          pricingCache.set(family.id, next);
          newPricing.push(next);
          pricedFamilies.add(family.id);
          pricesUpdated++;
        }
      }

      if (!pricingCache.has(family.id)) {
        const current: FamilyPricing = pricingCache.get(family.id) || {
          familyId: family.id, drumPrice: 0, gallonPrice: 0, quartarPrice: 0, updatedAt: nowIso,
        };
        pricingCache.set(family.id, current);
      }
      const pricingForFamily = pricingCache.get(family.id)!;

      const colourCode = pick(row, "colourCode", "colorCode", "colour", "color", "shadeCode", "shade");
      const sizeRaw = pick(row, "size", "packaging", "unit", "pack");
      const sizeKey = sizeRaw.toLowerCase();
      const size = (sizeKey.includes("drum") ? "Drum" : sizeKey.includes("gallon") ? "Gallon" : sizeKey.includes("quart") ? "Quartar" : "Other") as Product["size"];
      const name = pick(row, "name", "productName", "colourName", "colorName", "shadeName", "product") || `${familyName}${colourCode ? ` ${colourCode}` : ""}`;
      const code = pick(row, "code", "sku", "productCode", "itemCode") || `${familyName.slice(0, 3).toUpperCase()}-${colourCode || size}`;
      const key = `${family.id}|${colourCode.toLowerCase()}|${size}`;
      if (productKeys.has(key)) { duplicates++; continue; }

      const explicitPrice = parseFloat(pick(row, "price", "rate", "retailPrice", "sellingPrice", "unitPrice"));
      const familyPrice = size === "Drum" ? pricingForFamily.drumPrice : size === "Gallon" ? pricingForFamily.gallonPrice : size === "Quartar" ? pricingForFamily.quartarPrice : 0;
      const price = !Number.isNaN(explicitPrice) ? toPaisa(explicitPrice) : familyPrice;
      if (!price) missing++;

      const product: Product = {
        id: uid(), name, colourCode, familyId: family.id, size, price, override: size === "Other", code,
        category: pick(row, "productCategory", "category") || familyName,
        brand: pick(row, "brand", "company") || familyName,
        description: pick(row, "description", "notes"),
        active: !["false", "0", "no", "inactive"].includes(pick(row, "active").toLowerCase()),
        createdAt: nowIso, updatedAt: nowIso,
      };
      ops.push(setOp("products", product.id, product));
      productKeys.add(key);
      newProducts.push(product);
      imported++;
    }

    const a = makeAudit(user, "import", "product", "bulk", `Imported ${imported} products, ${familiesCreated} new families, ${pricesUpdated} family price sets`);
    ops.push(a.op);
    await guard("product.import", () => commitWrites(ops));
    setFamilies((prev) => [...newFamilies, ...prev]);
    setPricing((prev) => {
      const map = new Map(prev.map((p) => [p.familyId, p]));
      for (const fp of newPricing) map.set(fp.familyId, fp);
      return [...map.values()];
    });
    setProducts((prev) => [...newProducts, ...prev]);
    setAudit((prev) => [a.entry, ...prev]);
    return { imported, families: familiesCreated, duplicates, missing, review, pricesUpdated, totalRows: rows.length };
  }, [user, families, products, pricing]);

  // ── helper: O(1) balances ────────────────────────────────────────────────
  const customerBalance = useCallback((customerId: string) => balancesByCustomer.get(customerId) || 0, [balancesByCustomer]);
  const invoiceBalance = useCallback((invoiceId: string) => {
    const inv = invoiceById.get(invoiceId);
    return inv ? (Number(inv.netPayable) || 0) - (paidByInvoiceMap.get(invoiceId) || 0) : 0;
  }, [invoiceById, paidByInvoiceMap]);

  // ── invoices ─────────────────────────────────────────────────────────────
  const createInvoice = useCallback(async (input: { customerId: string; date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; paymentReceived?: number; notes?: string; status?: "draft" | "finalized"; bonus?: boolean; idempotencyKey?: string }) => {
    const key = input.idempotencyKey || uid();
    const invoiceId = idempotentId("inv", key);
    const ledgerIds = { invoice: idempotentId("led", key), payment: idempotentId("ledpay", key) };
    const paymentId = idempotentId("pay", key);
    const allocationId = idempotentId("alloc", key);
    const a = makeAudit(user, "create", "invoice", invoiceId, "Created invoice");

    return guardIdempotent("invoice.create", async () => {
      // Resolve prices from the in-memory index; only fetch products missing
      // from local state (rare — e.g. another tab imported a catalogue).
      const invItems: InvoiceItem[] = [];
      for (const it of input.items) {
        const prod = productById.get(it.productId) || await db.products.get(it.productId);
        if (!prod) continue;
        const unitPrice = it.unitPrice !== undefined ? toPaisa(it.unitPrice) : prod.price;
        invItems.push({
          id: uid(), productId: prod.id, productName: prod.name, productCode: prod.code,
          unit: prod.size, unitPrice, qty: it.qty, lineTotal: unitPrice * it.qty,
        });
      }
      const subtotal = sumBy(invItems, (i) => i.lineTotal);
      const status = input.status || "finalized";
      const bonus = input.bonus || false;

      const result = await runTransaction(firestore, async (tx): Promise<InvoiceTxResult> => {
        const duplicateSnap = await tx.get(docRef("invoices", invoiceId));
        if (duplicateSnap.exists()) return { inv: duplicateSnap.data() as Invoice, entries: [] };

        const custSnap = await tx.get(docRef("customers", input.customerId));
        const cust = custSnap.data() as Customer | undefined;
        if (!cust) throw new Error("Customer not found");
        const stSnap = await tx.get(docRef("settings", "main"));
        const st = stSnap.data() as BusinessSettings | undefined;
        const counter = (Number(st?.invoiceCounter) || 1000) + 1;
        const number = `${st?.invoicePrefix || "INV"}-${counter}`;

        const discountPercent = input.discountPercent !== undefined ? input.discountPercent : cust.discount;
        const discountAmount = percentOf(subtotal, discountPercent);
        const netPayable = subtotal - discountAmount;
        const received = status === "finalized" ? toPaisa(input.paymentReceived || 0) : 0;
        const balanceDue = netPayable - received;

        const currentBal = await txBalance(tx, cust.id, Number(balancesByCustomer.get(cust.id) ?? cust.openingBalance) || 0);

        const inv: Invoice = {
          id: invoiceId, number, customerId: cust.id, customerName: cust.name, customerDiscount: cust.discount,
          date: input.date, items: invItems, subtotal, discountPercent, discountAmount, netPayable,
          paymentReceived: received, balanceDue, previousBalance: currentBal, notes: input.notes || "", bonus, status,
          createdAt: isoNow(), updatedAt: isoNow(), idempotencyKey: key, paidAmount: received,
        };
        tx.set(docRef("invoices", inv.id), inv as any);
        tx.set(balanceRef(cust.id), { amount: status === "finalized" ? currentBal + netPayable - received : currentBal, updatedAt: isoNow() } as any);
        if (st) tx.set(docRef("settings", "main"), { ...st, invoiceCounter: counter } as any);

        const entries: LedgerEntry[] = [];
        let payment: Payment | undefined;
        let allocation: PaymentAllocation | undefined;
        if (status === "finalized") {
          const newBal = currentBal + netPayable;
          const invoiceEntry: LedgerEntry = {
            id: ledgerIds.invoice, customerId: cust.id, date: input.date, type: "invoice", reference: number,
            description: bonus ? `Bonus invoice ${number}` : `Invoice ${number}`,
            debit: netPayable, credit: 0, balance: newBal, bonus, createdAt: isoNow(),
          };
          tx.set(docRef("ledger", invoiceEntry.id), invoiceEntry as any);
          entries.push(invoiceEntry);
          if (received > 0) {
            payment = {
              id: paymentId, receiptNumber: `RCPT-${counter}`, customerId: cust.id, customerName: cust.name,
              date: input.date, amount: received, method: "Cash", reference: number,
              notes: "Initial payment on invoice", createdAt: isoNow(), idempotencyKey: `${key}:payment`,
            };
            allocation = { id: allocationId, paymentId: payment.id, invoiceId: inv.id, amount: received, createdAt: isoNow() };
            const paymentEntry: LedgerEntry = {
              id: ledgerIds.payment, customerId: cust.id, date: input.date, type: "payment",
              reference: payment.receiptNumber, description: `Payment ${payment.receiptNumber}`,
              debit: 0, credit: received, balance: newBal - received, createdAt: isoNow(),
            };
            tx.set(docRef("payments", payment.id), payment as any);
            tx.set(docRef("allocations", allocation.id), allocation as any);
            tx.set(docRef("ledger", paymentEntry.id), paymentEntry as any);
            entries.push(paymentEntry);
          }
        }
        a.entry.entityId = inv.id;
        a.entry.details = `Created invoice ${number}`;
        tx.set(docRef("audit", a.entry.id), a.entry as any);
        return { inv, entries, payment, allocation, settings: st ? { ...st, invoiceCounter: counter } : undefined, audit: a.entry };
      });

      // Optimistic/persisted state update — no 12-collection refresh.
      setInvoices((prev) => [result.inv, ...prev.filter((x) => x.id !== result.inv.id)]);
      if (result.settings) setSettings(result.settings);
      if (result.entries.length) setLedger((prev) => [...prev, ...result.entries]);
      if (result.payment) setPayments((prev) => [result.payment!, ...prev]);
      if (result.allocation) setAllocations((prev) => [...prev, result.allocation!]);
      if (result.audit) setAudit((prev) => [result.audit!, ...prev]);
      return result.inv;
    });
  }, [user, productById, balancesByCustomer]);

  const updateInvoice = useCallback(async (inv: Invoice) => {
    const next = { ...inv, updatedAt: isoNow() };
    const a = makeAudit(user, "update", "invoice", inv.id, `Updated invoice ${inv.number}`);
    await guard("invoice.update", () => commitWrites([setOp("invoices", inv.id, next), a.op]));
    setInvoices((prev) => prev.map((x) => (x.id === inv.id ? next : x)));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const editInvoice = useCallback(async (id: string, input: { date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; notes?: string; bonus?: boolean }) => {
    const invItems: InvoiceItem[] = [];
    for (const it of input.items) {
      const prod = productById.get(it.productId) || await db.products.get(it.productId);
      if (!prod) continue;
      const unitPrice = it.unitPrice !== undefined ? toPaisa(it.unitPrice) : prod.price;
      invItems.push({
        id: uid(), productId: prod.id, productName: prod.name, productCode: prod.code,
        unit: prod.size, unitPrice, qty: it.qty, lineTotal: unitPrice * it.qty,
      });
    }
    const subtotal = sumBy(invItems, (i) => i.lineTotal);
    const a = makeAudit(user, "update", "invoice", id, "Edited invoice");

    const result = await guard("invoice.edit", () => runTransaction(firestore, async (tx) => {
      const snap = await tx.get(docRef("invoices", id));
      const current = snap.data() as Invoice | undefined;
      if (!current) throw new Error("Invoice not found");
      if (current.status === "cancelled" || current.status === "void") throw new Error("Cancelled invoices cannot be edited.");
      const oldNet = Number(current.netPayable) || 0;
      const discountPercent = input.discountPercent !== undefined ? input.discountPercent : current.discountPercent;
      const discountAmount = percentOf(subtotal, discountPercent);
      const netPayable = subtotal - discountAmount;
      const paid = Math.min(Number(current.paymentReceived) || 0, netPayable);
      const next: Invoice = {
        ...current, date: input.date, items: invItems, subtotal, discountPercent, discountAmount,
        netPayable, paymentReceived: paid, balanceDue: netPayable - paid,
        paidAmount: Number(current.paidAmount ?? current.paymentReceived ?? 0) || 0,
        notes: input.notes ?? current.notes, bonus: input.bonus !== undefined ? input.bonus : current.bonus,
        updatedAt: isoNow(),
      };
      tx.set(docRef("invoices", id), next as any);

      let adjustment: LedgerEntry | undefined;
      if (next.status === "finalized" && netPayable !== oldNet) {
        const delta = netPayable - oldNet;
        const bal = await txBalance(tx, current.customerId, Number(balancesByCustomer.get(current.customerId) ?? current.previousBalance) || 0);
        tx.set(balanceRef(current.customerId), { amount: bal + delta, updatedAt: isoNow() } as any);
        adjustment = {
          id: uid(), customerId: current.customerId, date: input.date, type: "adjustment",
          reference: current.number, description: `Adjusted invoice ${current.number}`,
          debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0,
          balance: bal + delta, createdAt: isoNow(),
        };
        tx.set(docRef("ledger", adjustment.id), adjustment as any);
      }
      a.entry.details = `Edited invoice ${current.number}`;
      tx.set(docRef("audit", a.entry.id), a.entry as any);
      return { next, adjustment };
    }));

    setInvoices((prev) => prev.map((x) => (x.id === id ? result.next : x)));
    if (result.adjustment) setLedger((prev) => [...prev, result.adjustment!]);
    setAudit((prev) => [a.entry, ...prev]);
    return result.next;
  }, [user, productById, balancesByCustomer]);

  const cancelInvoice = useCallback(async (id: string) => {
    const inv = invoiceById.get(id) || await db.invoices.get(id);
    if (!inv) return;
    const a = makeAudit(user, "cancel", "invoice", id, `Cancelled invoice ${inv.number}`);
    const nextBalance = customerBalance(inv.customerId) - (Number(inv.netPayable) || 0);
    const adjustment: LedgerEntry = {
      id: uid(), customerId: inv.customerId, date: isoNow().slice(0, 10), type: "adjustment",
      reference: inv.number, description: `Cancelled invoice ${inv.number}`,
      debit: 0, credit: Number(inv.netPayable) || 0,
      balance: nextBalance, createdAt: isoNow(),
    };
    const next = { ...inv, status: "cancelled" as const, updatedAt: isoNow() };
    const ops = [setOp("invoices", id, next), setOp("ledger", adjustment.id, adjustment), balanceOp(inv.customerId, nextBalance), a.op];
    await guard("invoice.cancel", () => commitWrites(ops));
    setInvoices((prev) => prev.map((x) => (x.id === id ? next : x)));
    setLedger((prev) => [...prev, adjustment]);
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, invoiceById, customerBalance]);

  const deleteInvoice = useCallback(async (id: string) => {
    const inv = invoiceById.get(id) || await db.invoices.get(id);
    if (!inv) return;
    const [allocs, entries] = await Promise.all([
      db.allocations.where("invoiceId").equals(id).toArray(),
      db.ledger.where("customerId").equals(inv.customerId).toArray(),
    ]);
    const removed = entries.filter((e) => e.reference === inv.number && (e.type === "invoice" || e.type === "adjustment"));
    const remaining = entries.filter((e) => !removed.some((r) => r.id === e.id));
    const recalculated = recalculateLedgerBalances(remaining);
    const a = makeAudit(user, "delete", "invoice", id, `Deleted invoice ${inv.number}`);
    const finalBalance = recalculated.length ? Number(recalculated[recalculated.length - 1].balance) || 0 : 0;
    const ops: WriteOp[] = [
      ...allocs.map((x) => delOp("allocations", x.id)),
      ...removed.map((x) => delOp("ledger", x.id)),
      ...recalculated.map((x) => setOp("ledger", x.id, x)),
      balanceOp(inv.customerId, finalBalance),
      delOp("invoices", id), a.op,
    ];
    await guard("invoice.delete", () => commitWrites(ops));
    const allocIds = new Set(allocs.map((x) => x.id));
    setInvoices((prev) => prev.filter((x) => x.id !== id));
    setAllocations((prev) => prev.filter((x) => !allocIds.has(x.id)));
    setLedger((prev) => [...prev.filter((x) => x.customerId !== inv.customerId), ...recalculated]);
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, invoiceById]);

  // ── payments ─────────────────────────────────────────────────────────────
  const recordPayment = useCallback(async (input: { customerId: string; date: string; amount: number; method: string; reference?: string; notes?: string; allocations?: { invoiceId: string; amount: number }[]; idempotencyKey?: string }) => {
    const key = input.idempotencyKey || uid();
    const paymentId = idempotentId("pay", key);
    const entryId = idempotentId("ledpay", key);
    const receiptNumber = `RCPT-${key.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || Date.now().toString().slice(-6)}`;
    const a = makeAudit(user, "create", "payment", paymentId, "Recorded payment");

    return guardIdempotent("payment.record", async () => {
      const amountPaisa = toPaisa(input.amount);

      // One query outside the transaction supplies candidate invoices; the
      // transaction then reads their current paidAmount atomically.
      const candidates = input.allocations?.length
        ? (await Promise.all(input.allocations.map((x) => db.invoices.get(x.invoiceId)))).filter((x): x is Invoice => !!x)
        : (await db.invoices.where("customerId").equals(input.customerId).toArray())
            .filter((i) => i.status === "finalized")
            .sort((x, y) => String(x.date).localeCompare(String(y.date)));

      const result = await guard("payment.transaction", () => runTransaction(firestore, async (tx): Promise<PaymentTxResult> => {
        const dupSnap = await tx.get(docRef("payments", paymentId));
        if (dupSnap.exists()) return { payment: dupSnap.data() as Payment, allocations: [] };
        const custSnap = await tx.get(docRef("customers", input.customerId));
        const cust = custSnap.data() as Customer | undefined;
        if (!cust) throw new Error("Customer not found");

        const snaps = await Promise.all(candidates.map((inv) => tx.get(docRef("invoices", inv.id))));
        const currentInvoices = snaps.flatMap((snap) => (snap.exists() ? [snap.data() as Invoice] : []));
        const invById = new Map(currentInvoices.map((inv) => [inv.id, inv]));
        const invoiceUpdates = new Map<string, Invoice>();
        const paidOf = (inv: Invoice) => {
          const updated = invoiceUpdates.get(inv.id);
          if (updated) return Number(updated.paidAmount) || 0;
          return Number(inv.paidAmount ?? inv.paymentReceived ?? 0) || 0;
        };
        const applyToInvoice = (inv: Invoice, amount: number) => {
          const paid = paidOf(inv);
          const available = Math.max(0, (Number(inv.netPayable) || 0) - paid);
          if (amount > available) throw new Error(`Allocation exceeds the outstanding balance of invoice ${inv.number}`);
          if (amount <= 0) return;
          const base = invoiceUpdates.get(inv.id) || inv;
          invoiceUpdates.set(inv.id, { ...base, paidAmount: paid + amount, updatedAt: isoNow() });
        };

        const newAllocations: PaymentAllocation[] = [];
        if (input.allocations && input.allocations.length > 0) {
          for (let index = 0; index < input.allocations.length; index++) {
            const requested = input.allocations[index];
            const inv = invById.get(requested.invoiceId);
            if (!inv) throw new Error("Invoice not found");
            const amount = toPaisa(requested.amount);
            applyToInvoice(inv, amount);
            newAllocations.push({ id: idempotentId("alloc", `${key}:${index}`), paymentId, invoiceId: inv.id, amount, createdAt: isoNow() });
          }
        } else {
          let remaining = amountPaisa;
          for (const inv of currentInvoices) {
            if (remaining <= 0) break;
            const paid = paidOf(inv);
            const available = Math.max(0, (Number(inv.netPayable) || 0) - paid);
            const alloc = Math.min(available, remaining);
            applyToInvoice(inv, alloc);
            if (alloc > 0) {
              newAllocations.push({ id: idempotentId("alloc", `${key}:${newAllocations.length}`), paymentId, invoiceId: inv.id, amount: alloc, createdAt: isoNow() });
              remaining -= alloc;
            }
          }
        }

        const bal = await txBalance(tx, cust.id, Number(balancesByCustomer.get(cust.id) ?? cust.openingBalance) || 0);
        const entry: LedgerEntry = {
          id: entryId, customerId: cust.id, date: input.date, type: "payment", reference: receiptNumber,
          description: `Payment ${receiptNumber} (${input.method})`,
          debit: 0, credit: amountPaisa, balance: bal - amountPaisa, createdAt: isoNow(),
        };
        const pay: Payment = {
          id: paymentId, idempotencyKey: key, receiptNumber, customerId: cust.id, customerName: cust.name,
          date: input.date, amount: amountPaisa, method: input.method, reference: input.reference || "",
          notes: input.notes || "", createdAt: isoNow(),
        };
        tx.set(docRef("payments", pay.id), pay as any);
        for (const updated of invoiceUpdates.values()) tx.set(docRef("invoices", updated.id), updated as any);
        for (const alloc of newAllocations) tx.set(docRef("allocations", alloc.id), alloc as any);
        tx.set(balanceRef(cust.id), { amount: bal - amountPaisa, updatedAt: isoNow() } as any);
        tx.set(docRef("ledger", entry.id), entry as any);
        a.entry.details = `Recorded payment ${receiptNumber}`;
        tx.set(docRef("audit", a.entry.id), a.entry as any);
        return { payment: pay, allocations: newAllocations, entry, audit: a.entry };
      }));

      setPayments((prev) => [result.payment, ...prev.filter((p) => p.id !== result.payment.id)]);
      if (result.allocations.length) setAllocations((prev) => [...prev, ...result.allocations]);
      if (result.entry) setLedger((prev) => [...prev, result.entry!]);
      if (result.audit) setAudit((prev) => [result.audit!, ...prev]);
      return result.payment;
    });
  }, [user, balancesByCustomer]);

  const updatePayment = useCallback(async (p: Payment) => {
    const old = payments.find((x) => x.id === p.id) || await db.payments.get(p.id);
    if (!old) return;
    const updated: Payment = { ...old, date: p.date, method: p.method, reference: p.reference, notes: p.notes };
    const matched = ledger.filter((e) => e.reference === old.receiptNumber).map((e) => ({
      ...e, date: p.date, description: `Payment ${old.receiptNumber} (${p.method})`,
    }));
    const a = makeAudit(user, "update", "payment", p.id, `Updated payment ${old.receiptNumber}`);
    const ops: WriteOp[] = [
      setOp("payments", p.id, updated),
      ...matched.map((e) => setOp("ledger", e.id, e)),
      a.op,
    ];
    await guard("payment.update", () => commitWrites(ops));
    setPayments((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
    const ids = new Set(matched.map((e) => e.id));
    setLedger((prev) => prev.map((e) => (ids.has(e.id) ? matched.find((m) => m.id === e.id)! : e)));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, payments, ledger]);

  const reversePayment = useCallback(async (id: string) => {
    const pay = payments.find((x) => x.id === id) || await db.payments.get(id);
    if (!pay) return;
    const allocs = await db.allocations.where("paymentId").equals(id).toArray();
    const nextBalance = customerBalance(pay.customerId) + (Number(pay.amount) || 0);
    const adjustment: LedgerEntry = {
      id: uid(), customerId: pay.customerId, date: isoNow().slice(0, 10), type: "adjustment",
      reference: pay.receiptNumber, description: `Reversed payment ${pay.receiptNumber}`,
      debit: Number(pay.amount) || 0, credit: 0,
      balance: nextBalance, createdAt: isoNow(),
    };
    const a = makeAudit(user, "reverse", "payment", id, `Reversed payment ${pay.receiptNumber}`);
    const unapply = await unapplyInvoiceOps(allocs);
    const ops: WriteOp[] = [
      ...allocs.map((x) => delOp("allocations", x.id)),
      ...unapply,
      balanceOp(pay.customerId, nextBalance),
      delOp("payments", id), setOp("ledger", adjustment.id, adjustment), a.op,
    ];
    await guard("payment.reverse", () => commitWrites(ops));
    const allocIds = new Set(allocs.map((x) => x.id));
    setPayments((prev) => prev.filter((x) => x.id !== id));
    setAllocations((prev) => prev.filter((x) => !allocIds.has(x.id)));
    const updatedInvoices = new Map(unapply.filter((o) => o.type === "set").map((o) => [o.ref.id, o.data as Invoice]));
    if (updatedInvoices.size) setInvoices((prev) => prev.map((inv) => updatedInvoices.get(inv.id) || inv));
    setLedger((prev) => [...prev, adjustment]);
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, payments, customerBalance]);

  const deletePayment = useCallback(async (id: string) => {
    const pay = payments.find((x) => x.id === id) || await db.payments.get(id);
    if (!pay) return;
    const [allocs, entries] = await Promise.all([
      db.allocations.where("paymentId").equals(id).toArray(),
      db.ledger.where("customerId").equals(pay.customerId).toArray(),
    ]);
    const removed = entries.filter((e) => e.reference === pay.receiptNumber && e.type === "payment");
    const remaining = entries.filter((e) => !removed.some((r) => r.id === e.id));
    const recalculated = recalculateLedgerBalances(remaining);
    const a = makeAudit(user, "delete", "payment", id, `Deleted payment ${pay.receiptNumber}`);
    const unapply = await unapplyInvoiceOps(allocs);
    const finalBalance = recalculated.length ? Number(recalculated[recalculated.length - 1].balance) || 0 : 0;
    const ops: WriteOp[] = [
      ...allocs.map((x) => delOp("allocations", x.id)),
      ...unapply,
      ...removed.map((x) => delOp("ledger", x.id)),
      ...recalculated.map((x) => setOp("ledger", x.id, x)),
      balanceOp(pay.customerId, finalBalance),
      delOp("payments", id), a.op,
    ];
    await guard("payment.delete", () => commitWrites(ops));
    const allocIds = new Set(allocs.map((x) => x.id));
    setPayments((prev) => prev.filter((x) => x.id !== id));
    setAllocations((prev) => prev.filter((x) => !allocIds.has(x.id)));
    const updatedInvoices = new Map(unapply.filter((o) => o.type === "set").map((o) => [o.ref.id, o.data as Invoice]));
    if (updatedInvoices.size) setInvoices((prev) => prev.map((inv) => updatedInvoices.get(inv.id) || inv));
    setLedger((prev) => [...prev.filter((x) => x.customerId !== pay.customerId), ...recalculated]);
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, payments]);

  // ── expenses / settings ──────────────────────────────────────────────────
  const addExpense = useCallback(async (e: Omit<Expense, "id" | "createdAt">) => {
    const ex: Expense = { ...e, id: uid(), createdAt: isoNow() };
    const a = makeAudit(user, "create", "expense", ex.id, `Created expense ${ex.description}`);
    await guard("expense.create", () => commitWrites([setOp("expenses", ex.id, ex), a.op]));
    setExpenses((prev) => [ex, ...prev]);
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const updateExpense = useCallback(async (e: Expense) => {
    const a = makeAudit(user, "update", "expense", e.id, `Updated expense ${e.description}`);
    await guard("expense.update", () => commitWrites([setOp("expenses", e.id, e), a.op]));
    setExpenses((prev) => prev.map((x) => (x.id === e.id ? e : x)));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const deleteExpense = useCallback(async (id: string) => {
    const e = expenses.find((x) => x.id === id);
    if (!e) return;
    const a = makeAudit(user, "delete", "expense", id, `Deleted expense ${e.description}`);
    await guard("expense.delete", () => commitWrites([delOp("expenses", id), a.op]));
    setExpenses((prev) => prev.filter((x) => x.id !== id));
    setAudit((prev) => [a.entry, ...prev]);
  }, [user, expenses]);

  const updateSettings = useCallback(async (s: BusinessSettings) => {
    const a = makeAudit(user, "update", "settings", "main", "Updated settings");
    await guard("settings.update", () => commitWrites([setOp("settings", "main", s), a.op]));
    setSettings(s);
    setAudit((prev) => [a.entry, ...prev]);
  }, [user]);

  const doLogoutFn = useCallback(() => {
    setUser(null);
    void doLogout().finally(() => window.location.reload());
  }, []);

  const familyPricing = useCallback((familyId: string) => pricingByFamily.get(familyId), [pricingByFamily]);
  const productsByFamily = useCallback((familyId: string) => productsByFamilyMap.get(familyId) || [], [productsByFamilyMap]);

  const value: Ctx = {
    ready, user, settings, customers, families, pricing, products, invoices, payments, allocations, ledger, expenses, audit,
    customerById, productById, familyById, pricingByFamily, ledgerByCustomer, balancesByCustomer,
    paidByInvoiceMap, invoicesByCustomer, paymentsByCustomer,
    refresh, setUser, doLogout: doLogoutFn,
    addCustomer, updateCustomer, deleteCustomer,
    addFamily, updateFamily, deleteFamily, updateFamilyPricing, addProduct, updateProduct, deleteProduct, toggleProduct, importProducts,
    createInvoice, updateInvoice, editInvoice, cancelInvoice, deleteInvoice,
    recordPayment, updatePayment, reversePayment, deletePayment,
    addExpense, updateExpense, deleteExpense, updateSettings, log,
    customerBalance, invoiceBalance, familyPricing, productsByFamily,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp() {
  const c = useContext(Context);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
