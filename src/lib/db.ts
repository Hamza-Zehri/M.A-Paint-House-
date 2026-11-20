import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  setDoc,
  getDocs,
  getCountFromServer,
  deleteDoc,
  query,
  where,
  limit,
  writeBatch,
  type DocumentReference,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { chunk } from "./selectors";
import { recordFailure, recordFirestoreCall, recordQuota } from "./firestoreDiagnostics";
import type { BusinessSettings, Customer, Product, ProductFamily, FamilyPricing, Invoice, Payment, PaymentAllocation, LedgerEntry, Expense, AuditLog, User } from "./types";

/** Bounded diagnostics: operation name + error code only, never document data. */
function tracked<T>(operation: string, work: () => Promise<T>): Promise<T> {
  recordFirestoreCall(operation);
  return work().catch((error: unknown) => {
    const code = String((error as any)?.code || (error as any)?.name || "unknown");
    recordFailure(code, operation);
    if (code === "resource-exhausted") recordQuota(operation);
    throw error;
  });
}

export const COLLECTIONS = [
  "settings", "customers", "families", "pricing", "products", "invoices",
  "payments", "allocations", "ledger", "customerBalances", "expenses", "audit", "users",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

export function docRef(name: string, id: string): DocumentReference {
  return doc(firestore, name, id);
}

/**
 * One canonical balance document per customer. Financial transactions read and
 * write this document inside a Firestore transaction, so concurrent invoices
 * and payments on the same customer conflict and retry instead of racing on a
 * stale "latest ledger row" query (queries are not allowed in web transactions).
 */
export function balanceRef(customerId: string): DocumentReference {
  return doc(firestore, "customerBalances", customerId);
}

/**
 * Read a document from Firestore's persistent local cache only. Used to avoid
 * another network round trip when the workspace already holds the document.
 */
export async function getCachedDoc<T>(name: string, id: string): Promise<T | undefined> {
  try {
    const snap = await tracked(`getDocFromCache.${name}`, () => getDocFromCache(docRef(name, id)));
    return snap.exists() ? (snap.data() as T) : undefined;
  } catch {
    return undefined;
  }
}

export type WriteOp =
  | { type: "set"; ref: DocumentReference; data: unknown }
  | { type: "delete"; ref: DocumentReference };

/**
 * Commit many writes in the fewest possible round trips.
 * Firestore allows 500 operations per batch; 450 leaves headroom.
 */
export async function commitWrites(ops: WriteOp[]): Promise<void> {
  if (!ops.length) return;
  for (const group of chunk(ops, 450)) {
    const batch = writeBatch(firestore);
    for (const op of group) {
      if (op.type === "set") batch.set(op.ref, op.data as any);
      else batch.delete(op.ref);
    }
    await tracked("batch.commit", () => batch.commit());
  }
}

/** Cheap count: reads one aggregate instead of downloading every document. */
export async function countDocs(name: string): Promise<number> {
  const snap = await tracked(`count.${name}`, () => getCountFromServer(collection(firestore, name)));
  return snap.data().count;
}

class FirestoreTable<T> {
  constructor(public name: string, private idOf: (x: T) => string) {}

  async get(id: string): Promise<T | undefined> {
    const snap = await tracked(`getDoc.${this.name}`, () => getDoc(docRef(this.name, id)));
    return snap.exists() ? (snap.data() as T) : undefined;
  }

  async put(x: T): Promise<void> {
    await tracked(`setDoc.${this.name}`, () => setDoc(docRef(this.name, this.idOf(x)), x as any));
  }

  async delete(id: string): Promise<void> {
    await tracked(`deleteDoc.${this.name}`, () => deleteDoc(docRef(this.name, id)));
  }

  async toArray(): Promise<T[]> {
    const snap = await tracked(`getDocs.${this.name}`, () => getDocs(collection(firestore, this.name)));
    return snap.docs.map((d) => d.data() as T);
  }

  async count(): Promise<number> {
    return countDocs(this.name);
  }

  where(field: string) {
    const self = this;
    return {
      equals(val: any) {
        return {
          async toArray(): Promise<T[]> {
            const snap = await tracked(`query.${self.name}.${field}`, () => getDocs(query(collection(firestore, self.name), where(field, "==", val))));
            return snap.docs.map((d) => d.data() as T);
          },
          async first(): Promise<T | undefined> {
            const snap = await tracked(`query.${self.name}.${field}.first`, () => getDocs(query(collection(firestore, self.name), where(field, "==", val), limit(1))));
            return snap.empty ? undefined : (snap.docs[0].data() as T);
          },
        };
      },
    };
  }
}

export class AppDB {
  settings = new FirestoreTable<BusinessSettings>("settings", (x) => x.id);
  customers = new FirestoreTable<Customer>("customers", (x) => x.id);
  families = new FirestoreTable<ProductFamily>("families", (x) => x.id);
  pricing = new FirestoreTable<FamilyPricing>("pricing", (x) => x.familyId);
  products = new FirestoreTable<Product>("products", (x) => x.id);
  invoices = new FirestoreTable<Invoice>("invoices", (x) => x.id);
  payments = new FirestoreTable<Payment>("payments", (x) => x.id);
  allocations = new FirestoreTable<PaymentAllocation>("allocations", (x) => x.id);
  ledger = new FirestoreTable<LedgerEntry>("ledger", (x) => x.id);
  expenses = new FirestoreTable<Expense>("expenses", (x) => x.id);
  audit = new FirestoreTable<AuditLog>("audit", (x) => x.id);
  users = new FirestoreTable<User>("users", (x) => x.id);
}

export const db = new AppDB();

export async function clearAll() {
  for (const name of COLLECTIONS) {
    if (name === "users") continue; // profiles are never managed from the browser
    const snap = await tracked(`clearAll.${name}`, () => getDocs(collection(firestore, name)));
    await commitWrites(snap.docs.map((d) => ({ type: "delete", ref: d.ref })));
  }
}
