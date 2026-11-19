import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";
import { invoicePdfBlob, invoicePdfName } from "../lib/pdfFile";
import { printInvoiceHtml, getInvoiceHtml } from "../lib/pdf";
import { sharePdf } from "../lib/share";
import { appConfirm, toast } from "../lib/dialog";

export default function InvoiceHistory({ onEdit }: { onEdit?: (inv: any) => void }) {
  const { invoices, settings, customers, allocations, cancelInvoice, deleteInvoice, invoiceBalance } = useApp();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewing, setViewing] = useState<any>(null);
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
                      <button onClick={() => setViewing(i)} title="View invoice"><Icon name="eye" size={16} /></button>
                      <button onClick={() => printInvoiceHtml(i, settings, customer, paid)} title="Print invoice"><Icon name="printer" size={16} /></button>
                      <button onClick={() => shareInvoice(i)} title="Share on WhatsApp"><Icon name="share" size={16} /></button>
                      <button onClick={() => onEdit?.(i)} title="Edit invoice"><Icon name="edit" size={16} /></button>
                      {i.status === "finalized" && <button onClick={() => cancel(i)} title="Cancel invoice"><Icon name="minus" size={16} /></button>}
                      <button onClick={() => remove(i)} title="Delete invoice"><Icon name="trash" size={16} /></button>
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
      return (
        <div
          onClick={() => setViewing(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(11,31,58,0.55)",
            backdropFilter: "blur(4px)", zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(960px, 96vw)", height: "88vh", background: "#fff",
              borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 70px rgba(11,31,58,0.35)",
              display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #e3e9f1", background: "#f6f8fb" }}>
              <b style={{ color: "#0b1f3a" }}>Invoice {viewing.number}</b>
              <button onClick={() => setViewing(null)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4 }} aria-label="Close">
                <Icon name="close" size={20} />
              </button>
            </div>
            <iframe title={`Invoice ${viewing.number}`} srcDoc={html} style={{ flex: 1, border: "none", width: "100%" }} />
          </div>
        </div>
      );
    })()}
    </>
  );
}