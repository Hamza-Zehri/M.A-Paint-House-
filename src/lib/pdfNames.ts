/** Lightweight filename helpers, safe to import without loading jsPDF. */
const safe = (value: string) =>
  value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export const invoicePdfName = (invoice: any) => `${safe(invoice?.number || "invoice")}.pdf`;
export const receiptPdfName = (payment: any) => `${safe(payment?.receiptNumber || "receipt")}.pdf`;
export const statementPdfName = (customer: any) => `statement-${safe(customer?.name || "customer")}.pdf`;
export const reportPdfName = (title: string) => `${safe(title || "report")}.pdf`;
