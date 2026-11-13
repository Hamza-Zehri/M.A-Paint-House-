// Money helpers: store amounts as integer paisa to avoid floating point.

export const toPaisa = (rupees: number | string): number => {
  const n = typeof rupees === "string" ? parseFloat(rupees) : rupees;
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
};

export const toRupees = (paisa: number): number => paisa / 100;

export const formatMoney = (paisa: number, currency = "Rs"): string => {
  const r = paisa / 100;
  return `${currency} ${r.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatMoneyShort = (paisa: number, currency = "Rs"): string => {
  const r = paisa / 100;
  return `${currency} ${Math.round(r).toLocaleString("en-PK")}`;
};

// Percentage calc in paisa
export const percentOf = (amount: number, percent: number): number => {
  return Math.round((amount * percent) / 100);
};

export const calcLineTotal = (unitPrice: number, qty: number): number => {
  return unitPrice * qty;
};

export const calcDiscount = (subtotal: number, percent: number): number => {
  return Math.round((subtotal * percent) / 100);
};

export const uid = (): string => {
  // simple unique id
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Returns today's date in local YYYY-MM-DD format (avoids UTC timezone day shifting). */
export const todayLocalISO = (d = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};