import { useState, useRef, useMemo, useDeferredValue, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";
import { invoicePdfBlob, invoicePdfName } from "../lib/pdfLazy";
import { printInvoiceHtml, getInvoiceHtml } from "../lib/pdf";
import { sharePdf } from "../lib/share";
import { appConfirm, toast } from "../lib/dialog";
import { useActionLock } from "../hooks/useActionLock";

export default function InvoiceHistory({ onEdit }: { onEdit?: (inv: any) => void }) {
  const { invoices, settings, cancelInvoice, deleteInvoice, customerById, paidByInvoiceMap } = useApp();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewing, setViewing] = useState<any>(null);
  const [previewBusy, setPreviewBusy] = useState<string | null>(null);
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { isBusy, lock } = useActionLock();
  const deferredQuery = useDeferredValue(query);
  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return invoices
      .filter((i) => {
        if (statusFilter !== "all" && i.status !== statusFilter) return false;
        return !q || i.number.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [invoices, statusFilter, deferredQuery]);

  useEffect(() => setVisibleCount(100), [deferredQuery, statusFilter]);

  const paidFor = (invoice: any) => Math.max(paidByInvoiceMap.get(invoice.id) || 0, invoice.paymentReceived || 0);
  const balanceFor = (invoice: any) => (Number(invoice.netPayable) || 0) - (paidByInvoiceMap.get(invoice.id) || 0);

  const shareInvoice = async (invoice: any) => {
    const customer = customerById.get(invoice.customerId);
    const paid = paidFor(invoice);
    const due = Math.max(0, invoice.netPayable - paid);
    try {
      const blob = await invoicePdfBlob(invoice, settings, customer, paid);
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
              {shown.slice(0, visibleCount).map((i) => {
                const customer = customerById.get(i.customerId);
                const paid = paidFor(i);
                const balance = balanceFor(i);

                return (
                  <tr key={i.id}>
                    <td><b>{i.number}</b></td><td>{i.customerName}</td><td>{i.date}</td><td>{formatMoneyShort(i.subtotal)}</td>
                    <td className="teal-text">{i.discountPercent}%</td><td><b>{formatMoneyShort(i.netPayable)}</b></td>
                    <td className={balance > 0 ? "red-text" : ""}>{formatMoneyShort(balance)}</td><td>{i.status}{i.bonus && <span title="Bonus invoice" style={{ marginLeft: 6, color: "#f59e0b" }}>★</span>}</td>
                    <td><div className="row-actions">
                      <button onClick={() => { setViewing(i); setFrameHeight(null); }} title="View invoice"><Icon name="eye" size={16} /></button>
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
              {shown.length > visibleCount && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: 12 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setVisibleCount((n) => n + 100)}>
                      Show more invoices ({shown.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    {viewing && (() => {
      const vCustomer = customerById.get(viewing.customerId);
      const vPaid = paidFor(viewing);
      const html = getInvoiceHtml(viewing, settings, false, vCustomer, vPaid, true);
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
              <div className="invoice-preview-meta" style={{ marginLeft: "auto" }}>
                <span>Scroll to view full invoice</span>
              </div>
            </header>
            <div className="invoice-preview-actions">
              {onEdit && (
                <button type="button" disabled={!!previewBusy} onClick={() => { onEdit(viewing); setViewing(null); }}>
                  Edit invoice
                </button>
              )}
              <button type="button" disabled={!!previewBusy} onClick={async () => { setPreviewBusy("print"); try { printInvoiceHtml(viewing, settings, vCustomer, vPaid); } finally { setPreviewBusy(null); } }}>
                {previewBusy === "print" ? "Printing..." : "Print"}
              </button>
              <button type="button" disabled={!!previewBusy} onClick={async () => {
                setPreviewBusy("download");
                try {
                  const blob = await invoicePdfBlob(viewing, settings, vCustomer, vPaid);
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
              <iframe
                ref={iframeRef}
                title={`Invoice ${viewing.number}`}
                srcDoc={html}
                className="invoice-preview-frame"
                onLoad={() => {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc) {
                    const height = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0);
                    setFrameHeight(height + 24);
                  }
                }}
                style={{ height: frameHeight ? `${frameHeight}px` : undefined }}
              />
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}