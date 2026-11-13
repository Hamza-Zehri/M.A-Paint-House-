import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { db } from "../lib/db";
import { seedIfEmpty } from "../lib/seed";
import { toPaisa, uid, percentOf } from "../lib/money";
import { currentUser, logout as doLogout, waitForAuth, isDefaultAdminEmail } from "../lib/auth";
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
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  doLogout: () => void;
  // customers
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Promise<Customer>;
  updateCustomer: (c: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  // products/families
  addFamily: (name: string, description?: string) => Promise<ProductFamily>;
  updateFamily: (f: ProductFamily) => Promise<void>;
  deleteFamily: (id: string) => Promise<void>;
  updateFamilyPricing: (familyId: string, drum: number, gallon: number, quartar: number) => Promise<{ affected: number }>;
  addProduct: (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  updateProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  toggleProduct: (id: string) => Promise<void>;
  importProducts: (rows: any[]) => Promise<{
    imported: number;
    families: number;
    duplicates: number;
    missing: number;
    review: number;
    pricesUpdated: number;
    totalRows: number;
  }>;
  // invoices
  createInvoice: (input: { customerId: string; date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; paymentReceived?: number; notes?: string; status?: "draft" | "finalized" }) => Promise<Invoice>;
  updateInvoice: (inv: Invoice) => Promise<void>;
  editInvoice: (id: string, input: { date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; notes?: string }) => Promise<Invoice>;
  cancelInvoice: (id: string) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  // payments
  recordPayment: (input: { customerId: string; date: string; amount: number; method: string; reference?: string; notes?: string; allocations?: { invoiceId: string; amount: number }[] }) => Promise<Payment>;
  updatePayment: (p: Payment) => Promise<void>;
  reversePayment: (id: string) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  // expenses
  addExpense: (e: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  updateExpense: (e: Expense) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  // settings
  updateSettings: (s: BusinessSettings) => Promise<void>;
  // audit
  log: (action: string, entity: string, entityId: string, details: string) => Promise<void>;
  // helpers
  customerBalance: (customerId: string) => number;
  invoiceBalance: (invoiceId: string) => number;
  familyPricing: (familyId: string) => FamilyPricing | undefined;
  productsByFamily: (familyId: string) => Product[];
}

const Context = createContext<Ctx | null>(null);

/**
 * Recompute the running balance of a customer's ledger after entries have
 * been removed. This keeps the statement consistent when an invoice, payment
 * or whole customer is deleted.
 */
async function recalcCustomerLedger(customerId: string): Promise<void> {
  const entries = await db.ledger.where("customerId").equals(customerId).toArray();
  entries.sort(
    (a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
  );
  let balance = 0;
  for (const entry of entries) {
    balance += (Number(entry.debit) || 0) - (Number(entry.credit) || 0);
    entry.balance = balance;
    await db.ledger.put(entry);
  }
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

  const refresh = useCallback(async () => {
    // Load all collections in parallel so start-up only pays one round-trip,
    // not one per collection.
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
  }, []);

  useEffect(() => { (async () => {
    const fbUser = await waitForAuth();
    if (fbUser && isDefaultAdminEmail(fbUser.email)) {
      // Kill any existing session belonging to the disabled bootstrap account.
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
        await refresh();
      } catch (e) { console.error(e); }
    }
    setReady(true);
  })(); }, [refresh]);

  const log = useCallback(async (action: string, entity: string, entityId: string, details: string) => {
    const u = await currentUser();
    const entry: AuditLog = { id: uid(), action, entity, entityId, details, user: u?.name || "system", createdAt: new Date().toISOString() };
    await db.audit.put(entry);
    setAudit((prev) => [entry, ...prev]);
  }, []);

  // customers
  const addCustomer = useCallback(async (c: Omit<Customer, "id" | "createdAt">) => {
    const cust: Customer = { ...c, id: uid(), createdAt: new Date().toISOString() };
    await db.customers.put(cust);
    if (cust.openingBalance !== 0) {
      await db.ledger.put({ id: uid(), customerId: cust.id, date: new Date().toISOString().slice(0, 10), type: "opening", reference: "OPEN", description: "Opening balance", debit: cust.openingBalance > 0 ? cust.openingBalance : 0, credit: cust.openingBalance < 0 ? -cust.openingBalance : 0, balance: cust.openingBalance, createdAt: new Date().toISOString() });
    }
    await log("create", "customer", cust.id, `Created customer ${cust.name}`);
    await refresh();
    return cust;
  }, [log, refresh]);

  const updateCustomer = useCallback(async (c: Customer) => { await db.customers.put(c); await log("update", "customer", c.id, `Updated customer ${c.name}`); await refresh(); }, [log, refresh]);

  const deleteCustomer = useCallback(async (id: string) => {
    const c = await db.customers.get(id);
    if (!c) return;

    // Full cascade: invoices, payments, their allocations and the complete
    // customer ledger are removed together, otherwise Firestore would keep
    // orphaned records and the customer could never be deleted.
    const invs = await db.invoices.where("customerId").equals(id).toArray();
    const pays = await db.payments.where("customerId").equals(id).toArray();
    const allocations = await db.allocations.toArray();
    const invoiceIds = new Set(invs.map((invoice) => invoice.id));
    const paymentIds = new Set(pays.map((payment) => payment.id));

    for (const allocation of allocations) {
      if (invoiceIds.has(allocation.invoiceId) || paymentIds.has(allocation.paymentId)) {
        await db.allocations.delete(allocation.id);
      }
    }
    for (const invoice of invs) await db.invoices.delete(invoice.id);
    for (const payment of pays) await db.payments.delete(payment.id);

    const entries = await db.ledger.where("customerId").equals(id).toArray();
    for (const entry of entries) await db.ledger.delete(entry.id);

    await db.customers.delete(id);
    await log(
      "delete",
      "customer",
      id,
      `Deleted customer ${c.name} with ${invs.length} invoice(s) and ${pays.length} payment(s)`,
    );
    await refresh();
  }, [log, refresh]);

  // families
  const addFamily = useCallback(async (name: string, description = "") => {
    const f: ProductFamily = { id: uid(), name, description, status: "active", createdAt: new Date().toISOString() };
    await db.families.put(f);
    await db.pricing.put({ familyId: f.id, drumPrice: 0, gallonPrice: 0, quartarPrice: 0, updatedAt: new Date().toISOString() });
    await log("create", "family", f.id, `Created family ${name}`);
    await refresh();
    return f;
  }, [log, refresh]);

  const updateFamily = useCallback(async (f: ProductFamily) => { await db.families.put(f); await log("update", "family", f.id, `Updated family ${f.name}`); await refresh(); }, [log, refresh]);

  const deleteFamily = useCallback(async (id: string) => {
    const f = await db.families.get(id);
    if (!f) return;

    // Cascade the family's catalogue so the delete always completes.
    const famProducts = await db.products.where("familyId").equals(id).toArray();
    for (const product of famProducts) await db.products.delete(product.id);
    await db.pricing.delete(id);
    await db.families.delete(id);
    await log("delete", "family", id, `Deleted family ${f.name} and ${famProducts.length} product(s)`);
    await refresh();
  }, [log, refresh]);

  const updateFamilyPricing = useCallback(async (familyId: string, drum: number, gallon: number, quartar: number) => {
    const fp: FamilyPricing = { familyId, drumPrice: toPaisa(drum), gallonPrice: toPaisa(gallon), quartarPrice: toPaisa(quartar), updatedAt: new Date().toISOString() };
    await db.pricing.put(fp);
    const famProducts = await db.products.where("familyId").equals(familyId).toArray();
    let affected = 0;
    for (const p of famProducts) {
      if (p.override) continue;
      if (p.size === "Drum") p.price = fp.drumPrice;
      else if (p.size === "Gallon") p.price = fp.gallonPrice;
      else if (p.size === "Quartar") p.price = fp.quartarPrice;
      else continue;
      p.updatedAt = new Date().toISOString();
      await db.products.put(p);
      affected++;
    }
    await log("update-pricing", "family", familyId, `Updated pricing; affected ${affected} products`);
    await refresh();
    return { affected };
  }, [log, refresh]);

  // products
  const addProduct = useCallback(async (p: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    const fp = await db.pricing.get(p.familyId);
    let price = p.price;
    if (!p.override && fp) {
      if (p.size === "Drum") price = fp.drumPrice;
      else if (p.size === "Gallon") price = fp.gallonPrice;
      else if (p.size === "Quartar") price = fp.quartarPrice;
    }
    const prod: Product = { ...p, id: uid(), price, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.products.put(prod);
    await log("create", "product", prod.id, `Created product ${prod.name}`);
    await refresh();
    return prod;
  }, [log, refresh]);

  const updateProduct = useCallback(async (p: Product) => { p.updatedAt = new Date().toISOString(); await db.products.put(p); await log("update", "product", p.id, `Updated product ${p.name}`); await refresh(); }, [log, refresh]);

  const deleteProduct = useCallback(async (id: string) => {
    const p = await db.products.get(id);
    if (!p) return;
    await db.products.delete(id);
    await log("delete", "product", id, `Deleted product ${p.name}`);
    await refresh();
  }, [log, refresh]);

  const toggleProduct = useCallback(async (id: string) => {
    const p = await db.products.get(id);
    if (!p) return;
    p.active = !p.active;
    p.updatedAt = new Date().toISOString();
    await db.products.put(p);
    await refresh();
  }, [refresh]);

  const importProducts = useCallback(async (rows: any[]) => {
    // Prepare lookup maps once. The previous version queried Firestore for
    // every single row, which made a 700+ product import very slow.
    const existingFamilies = await db.families.toArray();
    const familyByName = new Map(existingFamilies.map((family) => [family.name.trim().toLowerCase(), family]));
    const existingProducts = await db.products.toArray();
    const productKeys = new Set(
      existingProducts.map((product) => `${product.familyId}|${(product.colourCode || "").toLowerCase()}|${product.size}`),
    );
    const pricingCache = new Map<string, { drumPrice: number; gallonPrice: number; quartarPrice: number; updatedAt: string }>();

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

    let imported = 0;
    let familiesCreated = 0;
    let duplicates = 0;
    let missing = 0;
    let review = 0;
    let pricesUpdated = 0;
    const pricedFamilies = new Set<string>();

    for (const row of rows) {
      const familyName = pick(row, "family", "familyName", "productFamily", "category", "productCategory");
      if (!familyName) {
        review++;
        continue;
      }

      let family = familyByName.get(familyName.toLowerCase());
      if (!family) {
        family = {
          id: uid(),
          name: familyName,
          description: pick(row, "familyDescription", "description"),
          status: "active",
          createdAt: new Date().toISOString(),
        };
        await db.families.put(family);
        await db.pricing.put({
          familyId: family.id,
          drumPrice: 0,
          gallonPrice: 0,
          quartarPrice: 0,
          updatedAt: new Date().toISOString(),
        });
        familyByName.set(familyName.toLowerCase(), family);
        familiesCreated++;
      }

      // Optional family-level prices can be supplied in the CSV. They are
      // written once per family and then used for rows that omit a price.
      if (!pricedFamilies.has(family.id)) {
        const drum = parseFloat(pick(row, "drumPrice", "drum"));
        const gallon = parseFloat(pick(row, "gallonPrice", "gallon"));
        const quartar = parseFloat(pick(row, "quartarPrice", "quartar", "quart"));
        if (!Number.isNaN(drum) || !Number.isNaN(gallon) || !Number.isNaN(quartar)) {
          const current = await db.pricing.get(family.id);
          const next = {
            familyId: family.id,
            drumPrice: Number.isNaN(drum) ? current?.drumPrice || 0 : toPaisa(drum),
            gallonPrice: Number.isNaN(gallon) ? current?.gallonPrice || 0 : toPaisa(gallon),
            quartarPrice: Number.isNaN(quartar) ? current?.quartarPrice || 0 : toPaisa(quartar),
            updatedAt: new Date().toISOString(),
          };
          await db.pricing.put(next);
          pricingCache.set(family.id, next);
          pricedFamilies.add(family.id);
          pricesUpdated++;
        }
      }

      if (!pricingCache.has(family.id)) {
        const current = await db.pricing.get(family.id);
        pricingCache.set(
          family.id,
          current || { drumPrice: 0, gallonPrice: 0, quartarPrice: 0, updatedAt: new Date().toISOString() },
        );
      }
      const pricing = pricingCache.get(family.id)!;

      const colourCode = pick(row, "colourCode", "colorCode", "colour", "color", "shadeCode", "shade");
      const sizeRaw = pick(row, "size", "packaging", "unit", "pack");
      const sizeKey = sizeRaw.toLowerCase();
      const size = (sizeKey.includes("drum")
        ? "Drum"
        : sizeKey.includes("gallon")
          ? "Gallon"
          : sizeKey.includes("quart")
            ? "Quartar"
            : "Other") as Product["size"];

      const name =
        pick(row, "name", "productName", "colourName", "colorName", "shadeName", "product") ||
        `${familyName}${colourCode ? ` ${colourCode}` : ""}`;
      const code = pick(row, "code", "sku", "productCode", "itemCode") || `${familyName.slice(0, 3).toUpperCase()}-${colourCode || size}`;
      const key = `${family.id}|${colourCode.toLowerCase()}|${size}`;
      if (productKeys.has(key)) {
        duplicates++;
        continue;
      }

      const explicitPrice = parseFloat(pick(row, "price", "rate", "retailPrice", "sellingPrice", "unitPrice"));
      const familyPrice = size === "Drum" ? pricing.drumPrice : size === "Gallon" ? pricing.gallonPrice : size === "Quartar" ? pricing.quartarPrice : 0;
      const price = !Number.isNaN(explicitPrice) ? toPaisa(explicitPrice) : familyPrice;
      if (!price) missing++;

      const product: Product = {
        id: uid(),
        name,
        colourCode,
        familyId: family.id,
        size,
        price,
        override: size === "Other",
        code,
        category: pick(row, "productCategory", "category") || familyName,
        brand: pick(row, "brand", "company") || familyName,
        description: pick(row, "description", "notes"),
        active: !["false", "0", "no", "inactive"].includes(pick(row, "active").toLowerCase()),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.products.put(product);
      productKeys.add(key);
      imported++;
    }

    await log(
      "import",
      "product",
      "bulk",
      `Imported ${imported} products, ${familiesCreated} new families, ${pricesUpdated} family price sets`,
    );
    await refresh();
    return { imported, families: familiesCreated, duplicates, missing, review, pricesUpdated, totalRows: rows.length };
  }, [log, refresh]);

  // invoices
  const customerBalance = useCallback((customerId: string): number => {
    const entries = ledger.filter((l) => l.customerId === customerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (entries.length === 0) { const c = customers.find((x) => x.id === customerId); return c?.openingBalance || 0; }
    return entries[entries.length - 1].balance;
  }, [ledger, customers]);

  const invoiceBalance = useCallback((invoiceId: string): number => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return 0;
    const allocs = allocations.filter((a) => a.invoiceId === invoiceId);
    const paid = allocs.reduce((s, a) => s + a.amount, 0);
    return inv.netPayable - paid;
  }, [invoices, allocations]);

  const createInvoice = useCallback(async (input: { customerId: string; date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; paymentReceived?: number; notes?: string; status?: "draft" | "finalized" }) => {
    const cust = await db.customers.get(input.customerId);
    if (!cust) throw new Error("Customer not found");
    const st = await db.settings.get("main");
    const counter = (st?.invoiceCounter || 1000) + 1;
    if (st) { st.invoiceCounter = counter; await db.settings.put(st); }
    const number = `${st?.invoicePrefix || "INV"}-${counter}`;

    const invItems: InvoiceItem[] = [];
    let subtotal = 0;
    for (const it of input.items) {
      const prod = await db.products.get(it.productId);
      if (!prod) continue;
      const unitPrice = it.unitPrice !== undefined ? toPaisa(it.unitPrice) : prod.price;
      const lineTotal = unitPrice * it.qty;
      subtotal += lineTotal;
      invItems.push({ id: uid(), productId: prod.id, productName: prod.name, productCode: prod.code, unit: prod.size, unitPrice, qty: it.qty, lineTotal });
    }

    const discountPercent = input.discountPercent !== undefined ? input.discountPercent : cust.discount;
    const discountAmount = percentOf(subtotal, discountPercent);
    const netPayable = subtotal - discountAmount;
    const paymentReceived = toPaisa(input.paymentReceived || 0);
    const balanceDue = netPayable - paymentReceived;

    const custEntries = ledger.filter((l) => l.customerId === input.customerId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const currentBal = custEntries.length ? custEntries[custEntries.length - 1].balance : (cust.openingBalance || 0);

    const status = input.status || "finalized";
    const inv: Invoice = { id: uid(), number, customerId: cust.id, customerName: cust.name, customerDiscount: cust.discount, date: input.date, items: invItems, subtotal, discountPercent, discountAmount, netPayable, paymentReceived, balanceDue, previousBalance: currentBal, notes: input.notes || "", status, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await db.invoices.put(inv);

    if (status === "finalized") {
      const newBal = currentBal + netPayable;
      await db.ledger.put({ id: uid(), customerId: cust.id, date: input.date, type: "invoice", reference: number, description: `Invoice ${number}`, debit: netPayable, credit: 0, balance: newBal, createdAt: new Date().toISOString() });
      if (paymentReceived > 0) {
        const pay: Payment = { id: uid(), receiptNumber: `RCPT-${counter}`, customerId: cust.id, customerName: cust.name, date: input.date, amount: paymentReceived, method: "Cash", reference: number, notes: "Initial payment on invoice", createdAt: new Date().toISOString() };
        await db.payments.put(pay);
        await db.allocations.put({ id: uid(), paymentId: pay.id, invoiceId: inv.id, amount: paymentReceived, createdAt: new Date().toISOString() });
        await db.ledger.put({ id: uid(), customerId: cust.id, date: input.date, type: "payment", reference: pay.receiptNumber, description: `Payment ${pay.receiptNumber}`, debit: 0, credit: paymentReceived, balance: newBal - paymentReceived, createdAt: new Date().toISOString() });
        inv.paymentReceived = paymentReceived;
        inv.balanceDue = netPayable - paymentReceived;
        await db.invoices.put(inv);
      }
    }

    await log("create", "invoice", inv.id, `Created invoice ${number}`);
    await refresh();
    return inv;
  }, [log, refresh, ledger]);

  const updateInvoice = useCallback(async (inv: Invoice) => { inv.updatedAt = new Date().toISOString(); await db.invoices.put(inv); await log("update", "invoice", inv.id, `Updated invoice ${inv.number}`); await refresh(); }, [log, refresh]);

  const editInvoice = useCallback(async (id: string, input: { date: string; items: { productId: string; qty: number; unitPrice?: number }[]; discountPercent?: number; notes?: string }) => {
    const inv = await db.invoices.get(id);
    if (!inv) throw new Error("Invoice not found");
    if (inv.status === "cancelled" || inv.status === "void") throw new Error("Cancelled invoices cannot be edited.");

    const invItems: InvoiceItem[] = [];
    let subtotal = 0;
    for (const it of input.items) {
      const prod = await db.products.get(it.productId);
      if (!prod) continue;
      const unitPrice = it.unitPrice !== undefined ? toPaisa(it.unitPrice) : prod.price;
      const lineTotal = unitPrice * it.qty;
      subtotal += lineTotal;
      invItems.push({ id: uid(), productId: prod.id, productName: prod.name, productCode: prod.code, unit: prod.size, unitPrice, qty: it.qty, lineTotal });
    }

    const oldNet = inv.netPayable;
    const discountPercent = input.discountPercent !== undefined ? input.discountPercent : inv.discountPercent;
    const discountAmount = percentOf(subtotal, discountPercent);
    const netPayable = subtotal - discountAmount;
    const paid = Math.min(inv.paymentReceived, netPayable);

    inv.date = input.date;
    inv.items = invItems;
    inv.subtotal = subtotal;
    inv.discountPercent = discountPercent;
    inv.discountAmount = discountAmount;
    inv.netPayable = netPayable;
    inv.paymentReceived = paid;
    inv.balanceDue = netPayable - paid;
    inv.notes = input.notes ?? inv.notes;
    inv.updatedAt = new Date().toISOString();
    await db.invoices.put(inv);

    // Keep the customer ledger consistent: append an adjustment for the
    // difference instead of rewriting historical entries.
    if (inv.status === "finalized" && netPayable !== oldNet) {
      const delta = netPayable - oldNet;
      const bal = customerBalance(inv.customerId);
      await db.ledger.put({
        id: uid(), customerId: inv.customerId, date: input.date, type: "adjustment",
        reference: inv.number, description: `Adjusted invoice ${inv.number}`,
        debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0,
        balance: bal + delta, createdAt: new Date().toISOString(),
      });
    }

    await log("update", "invoice", id, `Edited invoice ${inv.number}`);
    await refresh();
    return inv;
  }, [log, refresh, customerBalance]);

  const deleteInvoice = useCallback(async (id: string) => {
    const inv = await db.invoices.get(id);
    if (!inv) return;

    // Delete the invoice, its payment allocations and the ledger rows that
    // belong to it, then rebuild the running balances. Payments themselves are
    // kept as unallocated credit so the customer's money is never lost.
    const allocs = await db.allocations.where("invoiceId").equals(id).toArray();
    for (const allocation of allocs) await db.allocations.delete(allocation.id);

    const entries = await db.ledger.where("customerId").equals(inv.customerId).toArray();
    for (const entry of entries) {
      if (entry.reference === inv.number && (entry.type === "invoice" || entry.type === "adjustment")) {
        await db.ledger.delete(entry.id);
      }
    }

    await db.invoices.delete(id);
    await recalcCustomerLedger(inv.customerId);
    await log("delete", "invoice", id, `Deleted invoice ${inv.number}`);
    await refresh();
  }, [log, refresh]);

  const cancelInvoice = useCallback(async (id: string) => {
    const inv = await db.invoices.get(id);
    if (!inv) return;
    inv.status = "cancelled"; inv.updatedAt = new Date().toISOString(); await db.invoices.put(inv);
    const bal = customerBalance(inv.customerId);
    await db.ledger.put({ id: uid(), customerId: inv.customerId, date: new Date().toISOString().slice(0, 10), type: "adjustment", reference: inv.number, description: `Cancelled invoice ${inv.number}`, debit: 0, credit: inv.netPayable, balance: bal - inv.netPayable, createdAt: new Date().toISOString() });
    await log("cancel", "invoice", id, `Cancelled invoice ${inv.number}`);
    await refresh();
  }, [log, refresh, customerBalance]);

  const recordPayment = useCallback(async (input: { customerId: string; date: string; amount: number; method: string; reference?: string; notes?: string; allocations?: { invoiceId: string; amount: number }[] }) => {
    const cust = await db.customers.get(input.customerId);
    if (!cust) throw new Error("Customer not found");
    const receiptNumber = `RCPT-${Date.now().toString().slice(-6)}`;
    const amountPaisa = toPaisa(input.amount);
    const pay: Payment = { id: uid(), receiptNumber, customerId: cust.id, customerName: cust.name, date: input.date, amount: amountPaisa, method: input.method, reference: input.reference || "", notes: input.notes || "", createdAt: new Date().toISOString() };
    await db.payments.put(pay);
    if (input.allocations && input.allocations.length > 0) {
      for (const a of input.allocations) await db.allocations.put({ id: uid(), paymentId: pay.id, invoiceId: a.invoiceId, amount: toPaisa(a.amount), createdAt: new Date().toISOString() });
    } else {
      const custInvs = invoices.filter((i) => i.customerId === cust.id && i.status === "finalized").sort((a, b) => a.date.localeCompare(b.date));
      let remaining = amountPaisa;
      for (const inv of custInvs) {
        const bal = invoiceBalance(inv.id);
        if (bal <= 0) continue;
        const alloc = Math.min(bal, remaining);
        if (alloc > 0) { await db.allocations.put({ id: uid(), paymentId: pay.id, invoiceId: inv.id, amount: alloc, createdAt: new Date().toISOString() }); remaining -= alloc; if (remaining <= 0) break; }
      }
    }
    const bal = customerBalance(cust.id);
    await db.ledger.put({ id: uid(), customerId: cust.id, date: input.date, type: "payment", reference: receiptNumber, description: `Payment ${receiptNumber} (${input.method})`, debit: 0, credit: amountPaisa, balance: bal - amountPaisa, createdAt: new Date().toISOString() });
    await log("create", "payment", pay.id, `Recorded payment ${receiptNumber}`);
    await refresh();
    return pay;
  }, [log, refresh, invoices, allocations, ledger, customerBalance, invoiceBalance]);

  const updatePayment = useCallback(async (p: Payment) => {
    const old = await db.payments.get(p.id);
    if (!old) return;
    const updated: Payment = { ...old, date: p.date, method: p.method, reference: p.reference, notes: p.notes };
    await db.payments.put(updated);
    // Keep the matching ledger row's date/description in sync. Amount and
    // running balances are intentionally immutable here.
    const entries = await db.ledger.where("customerId").equals(old.customerId).toArray();
    for (const e of entries) {
      if (e.reference === old.receiptNumber) {
        e.date = p.date;
        e.description = `Payment ${old.receiptNumber} (${p.method})`;
        await db.ledger.put(e);
      }
    }
    await log("update", "payment", p.id, `Updated payment ${old.receiptNumber}`);
    await refresh();
  }, [log, refresh]);

  const reversePayment = useCallback(async (id: string) => {
    const pay = await db.payments.get(id);
    if (!pay) return;
    const allocs = await db.allocations.where("paymentId").equals(id).toArray();
    for (const a of allocs) await db.allocations.delete(a.id);
    await db.payments.delete(id);
    const bal = customerBalance(pay.customerId);
    await db.ledger.put({ id: uid(), customerId: pay.customerId, date: new Date().toISOString().slice(0, 10), type: "adjustment", reference: pay.receiptNumber, description: `Reversed payment ${pay.receiptNumber}`, debit: pay.amount, credit: 0, balance: bal + pay.amount, createdAt: new Date().toISOString() });
    await log("reverse", "payment", id, `Reversed payment ${pay.receiptNumber}`);
    await refresh();
  }, [log, refresh, customerBalance]);

  const deletePayment = useCallback(async (id: string) => {
    const pay = await db.payments.get(id);
    if (!pay) return;

    const allocs = await db.allocations.where("paymentId").equals(id).toArray();
    for (const allocation of allocs) await db.allocations.delete(allocation.id);

    const entries = await db.ledger.where("customerId").equals(pay.customerId).toArray();
    for (const entry of entries) {
      if (entry.reference === pay.receiptNumber && entry.type === "payment") {
        await db.ledger.delete(entry.id);
      }
    }

    await db.payments.delete(id);
    await recalcCustomerLedger(pay.customerId);
    await log("delete", "payment", id, `Deleted payment ${pay.receiptNumber}`);
    await refresh();
  }, [log, refresh]);

  const addExpense = useCallback(async (e: Omit<Expense, "id" | "createdAt">) => {
    const ex: Expense = { ...e, id: uid(), createdAt: new Date().toISOString() };
    await db.expenses.put(ex);
    await log("create", "expense", ex.id, `Created expense ${ex.description}`);
    await refresh();
  }, [log, refresh]);

  const updateExpense = useCallback(async (e: Expense) => {
    await db.expenses.put(e);
    await log("update", "expense", e.id, `Updated expense ${e.description}`);
    await refresh();
  }, [log, refresh]);

  const deleteExpense = useCallback(async (id: string) => {
    const e = await db.expenses.get(id);
    if (!e) return;
    await db.expenses.delete(id);
    await log("delete", "expense", id, `Deleted expense ${e.description}`);
    await refresh();
  }, [log, refresh]);

  const updateSettings = useCallback(async (s: BusinessSettings) => { await db.settings.put(s); await log("update", "settings", "main", "Updated settings"); await refresh(); }, [log, refresh]);

  const doLogoutFn = useCallback(() => {
    setUser(null);
    // Reload after sign-out so the Firestore client is recreated cleanly on
    // the next sign-in instead of reusing a stale, signed-out connection.
    void doLogout().finally(() => window.location.reload());
  }, []);

  const familyPricing = useCallback((familyId: string) => pricing.find((p) => p.familyId === familyId), [pricing]);
  const productsByFamily = useCallback((familyId: string) => products.filter((p) => p.familyId === familyId), [products]);

  const value: Ctx = {
    ready, user, settings, customers, families, pricing, products, invoices, payments, allocations, ledger, expenses, audit,
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