import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";
import { invoicePdfBlob, invoicePdfName } from "../lib/pdfFile";
import { printInvoiceHtml, getInvoiceHtml } from "../lib/pdf";
import { sharePdf } from "../lib/share";
import { appConfirm, toast } from "../lib/dialog";
import { useActionLock } from "../hooks/useActionLock";

export default function InvoiceHistory({ onEdit }: { onEdit?: (inv: any) => void }) {
  const { invoices, settings, customers, allocations, cancelInvoice, deleteInvoice, invoiceBalance } = useApp();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewing, setViewing] = useState<any>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const { isBusy, lock } = useActionLock();
  const shown = invoices.filter((i) => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return i.number.toLowerCase().includes(query.toLowerCase()) || i.customerName.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const shareInvoice = async (invoice: any) => {
    const customer = customers.find((item) => item.id === invoice.customerId);
    const allocated = allocations
      .filter((allocation) => allocation.invoiceId === invoice.id)
      .reduce((sum, allocation) => sum + allocation.amount, 0);
    const paid = Math.max(allocated, invoice.paymentReceived || 0);
    const due = Math.max(0, invoice.netPayable - paid);
    try {
      const blob = invoicePdfBlob(invoice, settings, customer, paid);
      const result = await sharePdf({
        blob,
        filename: invoicePdfName(invoice),
        phone: customer?.whatsapp || customer?.phone,
        title: `Invoice ${invoice.number}`,
        message:
          `Invoice ${invoice.number} from M.A Paint House\n` +
          `${invoice.customerName}\n` +
          `Net amount: ${formatMoneyShort(invoice.netPayable)}\n` +
          `Balance due: ${formatMoneyShort(due)}\n\n` +
          `Thank you for your business.`,
      });
      toast(result === "shared" ? "Invoice PDF shared." : "Invoice PDF downloaded — attach it in the WhatsApp chat.", "success");
    } catch (error: any) {
      toast(error?.message || "Could not create the invoice PDF.", "error");
    }
  };

  const remove = async (inv: any) => {
    const finalized = inv.status === "finalized";
    const confirmed = await appConfirm(
      `Delete invoice ${inv.number}?` +
        (finalized ? "\n\nThis is a finalized invoice. Its ledger entry and payment allocations will also be removed." : ""),
      { title: "Delete invoice", confirmText: "Delete invoice", danger: true },
    );
    if (!confirmed) return;
    try {
      await deleteInvoice(inv.id);
      toast(`Invoice ${inv.number} deleted.`, "success");
    } catch (e: any) {
      toast(e?.message || "Could not delete invoice.", "error");
    }
  };

  const cancel = async (inv: any) => {
    const confirmed = await appConfirm(
      `Cancel invoice ${inv.number}? A credit adjustment will be added to the customer ledger so the balance is corrected.`,
      { title: "Cancel invoice", confirmText: "Cancel invoice", danger: true },
    );
    if (!confirmed) return;
    try {
      await cancelInvoice(inv.id);
      toast(`Invoice ${inv.number} cancelled.`, "success");
    } catch (e: any) {
      toast(e?.message || "Could not cancel invoice.", "error");
    }
  };

  return (
    <> 
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div className="toolbar-search"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoices..." /></div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-button">
            <option value="all">All statuses</option>
            <option value="finalized">Finalized</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Subtotal</th><th>Discount</th><th>Net</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shown.map((i) => {
                const customer = customers.find((item) => item.id === i.customerId);
                const allocated = allocations
                  .filter((allocation) => allocation.invoiceId === i.id)
                  .reduce((sum, allocation) => sum + allocation.amount, 0);
                const paid = Math.max(allocated, i.paymentReceived || 0);

                return (
                  <tr key={i.id}>
                    <td><b>{i.number}</b></td><td>{i.customerName}</td><td>{i.date}</td><td>{formatMoneyShort(i.subtotal)}</td>
                    <td className="teal-text">{i.discountPercent}%</td><td><b>{formatMoneyShort(i.netPayable)}</b></td>
                    <td className={invoiceBalance(i.id) > 0 ? "red-text" : ""}>{formatMoneyShort(invoiceBalance(i.id))}</td><td>{i.status}{i.bonus && <span title="Bonus invoice" style={{ marginLeft: 6, color: "#f59e0b" }}>★</span>}</td>
                    <td><div className="row-actions">
                      <button onClick={() => { setViewing(i); setZoom(1); }} title="View invoice"><Icon name="eye" size={16} /></button>
                      <button onClick={() => printInvoiceHtml(i, settings, customer, paid)} title="Print invoice"><Icon name="printer" size={16} /></button>
                      <button onClick={() => shareInvoice(i)} title="Share on WhatsApp"><Icon name="share" size={16} /></button>
                      <button onClick={() => onEdit?.(i)} title="Edit invoice"><Icon name="edit" size={16} /></button>
                      {i.status === "finalized" && <button disabled={isBusy(`cancel-${i.id}`)} onClick={() => lock(`cancel-${i.id}`, () => cancel(i))} title="Cancel invoice"><Icon name="minus" size={16} /></button>}
                      <button disabled={isBusy(`delete-${i.id}`)} onClick={() => lock(`delete-${i.id}`, () => remove(i))} title="Delete invoice"><Icon name="trash" size={16} /></button>
                    </div></td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 20 }}>No invoices</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    {viewing && (() => {
      const vCustomer = customers.find((c) => c.id === viewing.customerId);
      const vAllocated = allocations
        .filter((a) => a.invoiceId === viewing.id)
        .reduce((s, a) => s + a.amount, 0);
      const vPaid = Math.max(vAllocated, viewing.paymentReceived || 0);
      const html = getInvoiceHtml(viewing, settings, false, vCustomer, vPaid);
      const status = viewing.status === "cancelled" || viewing.status === "void" ? "Cancelled" : viewing.status === "draft" ? "Draft" : vPaid >= viewing.netPayable ? "Paid" : "Partially paid";
      return (
        <div className="invoice-preview-backdrop" onClick={() => { if (!previewBusy) setViewing(null); }}>
          <div className="invoice-preview-modal" onClick={(e) => e.stopPropagation()}>
            <header className="invoice-preview-header">
              <div>
                <div className="invoice-preview-title">Invoice {viewing.number}</div>
                <div className="invoice-preview-meta">
                  <span>{viewing.date}</span>
                  <span className={`status-badge ${status.toLowerCase().replace(/\\s+/g, "-")}`}>{status}</span>
                  {viewing.bonus && <span className="bonus-badge">Bonus</span>}
                </div>
              </div>
              <div className="invoice-preview-zoom">
                <button type="button" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(1)))} aria-label="Zoom out">−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))} aria-label="Zoom in">+</button>
              </div>
            </header>
            <div className="invoice-preview-actions">
              <button type="button" disabled={!!previewBusy} onClick={async () => { setPreviewBusy("print"); try { printInvoiceHtml(viewing, settings, vCustomer, vPaid); } finally { setPreviewBusy(null); } }}>
                {previewBusy === "print" ? "Printing..." : "Print"}
              </button>
              <button type="button" disabled={!!previewBusy} onClick={async () => {
                setPreviewBusy("download");
                try {
                  const blob = invoicePdfBlob(viewing, settings, vCustomer, vPaid);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = invoicePdfName(viewing); a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 500);
                } finally { setPreviewBusy(null); }
              }}>
                {previewBusy === "download" ? "Downloading..." : "Download PDF"}
              </button>
              <button type="button" disabled={!!previewBusy} onClick={async () => { setPreviewBusy("share"); try { await shareInvoice(viewing); } finally { setPreviewBusy(null); } }}>
                {previewBusy === "share" ? "Sharing..." : "Share"}
              </button>
              <button type="button" className="close-btn" onClick={() => setViewing(null)} disabled={!!previewBusy}>Close</button>
            </div>
            <div className="invoice-preview-body">
              <div className="invoice-preview-frame-wrap" style={{ transform: `scale(${zoom})` }}>
                <iframe title={`Invoice ${viewing.number}`} srcDoc={html} className="invoice-preview-frame" />
              </div>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}