/**
 * PDF facade. jsPDF is loaded only when a user actually creates a PDF, keeping
 * ~200 KB of PDF code out of the startup bundle. Vite caches the dynamic import,
 * so repeated shares reuse the same module.
 */
const loadPdf = () => import("./pdfFile");

export function prefetchPdf(): void {
  void loadPdf();
}

export async function invoicePdfBlob(invoice: any, settings: any, customer?: any, paidOverride?: number): Promise<Blob> {
  return (await loadPdf()).invoicePdfBlob(invoice, settings, customer, paidOverride);
}

export async function receiptPdfBlob(payment: any, settings: any, customer?: any): Promise<Blob> {
  return (await loadPdf()).receiptPdfBlob(payment, settings, customer);
}

export async function statementPdfBlob(customer: any, entries: any[], settings: any): Promise<Blob> {
  return (await loadPdf()).statementPdfBlob(customer, entries, settings);
}

export async function reportPdfBlob(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  settings: any,
  subtitle?: string,
): Promise<Blob> {
  return (await loadPdf()).reportPdfBlob(title, headers, rows, settings, subtitle);
}

export {
  invoicePdfName,
  receiptPdfName,
  statementPdfName,
  reportPdfName,
} from "./pdfNames";
