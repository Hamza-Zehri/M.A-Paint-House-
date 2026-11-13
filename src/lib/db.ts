import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { firestore } from "./firebase";
import type { BusinessSettings, Customer, Product, ProductFamily, FamilyPricing, Invoice, Payment, PaymentAllocation, LedgerEntry, Expense, AuditLog, User } from "./types";

export const COLLECTIONS = [
  "settings", "customers", "families", "pricing", "products", "invoices",
  "payments", "allocations", "ledger", "expenses", "audit", "users",
] as const;

class FirestoreTable<T> {
  constructor(public name: string, private idOf: (x: T) => string) {}

  async get(id: string): Promise<T | undefined> {
    const snap = await getDoc(doc(firestore, this.name, id));
    return snap.exists() ? (snap.data() as T) : undefined;
  }

  async put(x: T): Promise<void> {
    await setDoc(doc(firestore, this.name, this.idOf(x)), x as any);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(firestore, this.name, id));
  }

  async toArray(): Promise<T[]> {
    const snap = await getDocs(collection(firestore, this.name));
    return snap.docs.map((d) => d.data() as T);
  }

  async count(): Promise<number> {
    const snap = await getDocs(collection(firestore, this.name));
    return snap.size;
  }

  where(field: string) {
    const self = this;
    return {
      equals(val: any) {
        return {
          async toArray(): Promise<T[]> {
            const q = query(collection(firestore, self.name), where(field, "==", val));
            const snap = await getDocs(q);
            return snap.docs.map((d) => d.data() as T);
          },
          async first(): Promise<T | undefined> {
            const q = query(collection(firestore, self.name), where(field, "==", val));
            const snap = await getDocs(q);
            return snap.docs.length ? (snap.docs[0].data() as T) : undefined;
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
    const snap = await getDocs(collection(firestore, name));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
}