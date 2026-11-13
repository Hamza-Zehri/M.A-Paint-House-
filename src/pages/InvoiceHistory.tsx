import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";
import { invoicePdfBlob, invoicePdfName } from "../lib/pdfFile";
import { printInvoiceHtml } from "../lib/pdf";
import { sharePdf } from "../lib/share";
import { appConfirm, toast } from "../lib/dialog";

export default function InvoiceHistory({ onEdit }: { onEdit?: (inv: any) => void }) {
  const { invoices, settings, customers, allocations, cancelInvoice, deleteInvoice, invoiceBalance } = useApp();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
              {shown.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.number}</b></td><td>{i.customerName}</td><td>{i.date}</td><td>{formatMoneyShort(i.subtotal)}</td>
                  <td className="teal-text">{i.discountPercent}%</td><td><b>{formatMoneyShort(i.netPayable)}</b></td>
                  <td className={invoiceBalance(i.id) > 0 ? "red-text" : ""}>{formatMoneyShort(invoiceBalance(i.id))}</td><td>{i.status}</td>
                  <td><div className="row-actions">
                    <button onClick={() => printInvoiceHtml(i, settings)} title="Print invoice"><Icon name="file" size={16} /></button>
                    <button onClick={() => shareInvoice(i)} title="Share on WhatsApp"><Icon name="share" size={16} /></button>
                    <button onClick={() => onEdit?.(i)} title="Edit invoice"><Icon name="edit" size={16} /></button>
                    {i.status === "finalized" && <button onClick={() => cancel(i)} title="Cancel invoice"><Icon name="minus" size={16} /></button>}
                    <button onClick={() => remove(i)} title="Delete invoice"><Icon name="trash" size={16} /></button>
                  </div></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={9} style={{ textAlign: "center", padding: 20 }}>No invoices</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}