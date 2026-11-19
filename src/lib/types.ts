// Core domain types for M.A Paint House (accounting + centralized product pricing)

export type Money = number; // integer paisa

// --- Accounting ---
export interface BusinessSettings {
  id: string;
  name: string;
  logo?: string;
  address: string;
  phone: string;
  whatsapp: string;
  currency: string;
  invoicePrefix: string;
  invoiceCounter: number;
  defaultDiscount: number;
  footer: string;
  paymentMethods: string[];
  taxEnabled: boolean;
  taxRate: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  openingBalance: Money;
  discount: number;
  notes: string;
  createdAt: string;
  active: boolean;
}

export type Size = "Drum" | "Gallon" | "Quartar" | "Other";

export interface ProductFamily {
  id: string;
  name: string;
  description: string;
  status: "active" | "inactive";
  createdAt: string;
}

export interface FamilyPricing {
  familyId: string;
  drumPrice: Money;
  gallonPrice: Money;
  quartarPrice: Money;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  colourCode: string;
  familyId: string;
  size: Size;
  price: Money; // inherited or override
  override: boolean;
  code: string;
  category: string;
  brand: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unit: string;
  unitPrice: Money;
  qty: number;
  lineTotal: Money;
}

export type InvoiceStatus = "draft" | "finalized" | "cancelled" | "void";

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerDiscount: number;
  date: string;
  items: InvoiceItem[];
  subtotal: Money;
  discountPercent: number;
  discountAmount: Money;
  netPayable: Money;
  paymentReceived: Money;
  balanceDue: Money;
  previousBalance: Money;
  notes: string;
  bonus?: boolean;
  status: InvoiceStatus;
  createdAt: string;
  updatedAt: string;
  /** Stable client-generated key so a retried save can never create a duplicate. */
  idempotencyKey?: string;
  /** Amount applied to this invoice inside transactions; avoids allocation races. */
  paidAmount?: Money;
}

export interface Payment {
  id: string;
  idempotencyKey?: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: Money;
  method: string;
  reference: string;
  notes: string;
  createdAt: string;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: Money;
  createdAt: string;
}

export type LedgerType = "opening" | "invoice" | "payment" | "adjustment" | "advance";

export interface LedgerEntry {
  id: string;
  customerId: string;
  date: string;
  type: LedgerType;
  reference: string;
  description: string;
  debit: Money;
  credit: Money;
  balance: Money;
  bonus?: boolean;
  createdAt: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: Money;
  method: string;
  reference: string;
  notes: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  user: string;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: "admin" | "staff";
  active: boolean;
  createdAt: string;
}