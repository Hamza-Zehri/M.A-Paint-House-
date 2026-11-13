import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, toPaisa } from "../lib/money";
import { receiptPdfBlob, receiptPdfName } from "../lib/pdfFile";
import { sharePdf } from "../lib/share";
import { appConfirm, toast } from "../lib/dialog";
import type { Payment } from "../lib/types";

const METHODS = ["Cash", "Bank transfer", "JazzCash", "EasyPaisa", "Cheque", "Other"];

export default function Payments() {
  const { customers, payments, recordPayment, updatePayment, deletePayment, customerBalance, settings } = useApp();
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptNumber] = useState(`RCPT-${Date.now().toString().slice(-6)}`);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [editForm, setEditForm] = useState({ date: "", method: "Cash", reference: "", notes: "" });

  const startEdit = (p: Payment) => {
    setEditing(p);
    setEditForm({ date: p.date, method: p.method, reference: p.reference, notes: p.notes });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updatePayment({ ...editing, ...editForm });
      toast("Payment updated.", "success");
      setEditing(null);
    } catch (error: any) {
      toast(error?.message || "Could not update payment.", "error");
    }
  };

  const shareReceipt = async (payment: Payment) => {
    const owner = customers.find((item) => item.id === payment.customerId);
    try {
      const blob = receiptPdfBlob(payment, settings, owner);
      const result = await sharePdf({
        blob,
        filename: receiptPdfName(payment),
        phone: owner?.whatsapp || owner?.phone,
        title: `Receipt ${payment.receiptNumber}`,
        message: `Payment receipt ${payment.receiptNumber}\n${payment.customerName}\nAmount received: ${formatMoneyShort(payment.amount)}\n\nM.A Paint House`,
      });
      toast(result === "shared" ? "Receipt shared." : "Receipt downloaded — attach it in the WhatsApp chat.", "success");
    } catch (error: any) {
      toast(error?.message || "Could not create the receipt PDF.", "error");
    }
  };

  const removePayment = async (payment: Payment) => {
    const confirmed = await appConfirm(
      `Delete payment ${payment.receiptNumber} of ${formatMoneyShort(payment.amount)}?\n\nThis removes its ledger credit and any invoice allocations.`,
      { title: "Delete payment", confirmText: "Delete payment", danger: true },
    );
    if (!confirmed) return;
    try {
      await deletePayment(payment.id);
      toast("Payment deleted and ledger updated.", "success");
    } catch (error: any) {
      toast(error?.message || "Could not delete payment.", "error");
    }
  };

  const customer = customers.find((c) => c.id === customerId);
  const bal = customer ? customerBalance(customer.id) : 0;
  const payPaisa = toPaisa(parseFloat(amount) || 0);
  const after = bal - payPaisa;

  const handleSave = async () => {
    if (!customerId) { toast("Select a customer.", "error"); return; }
    if (!amount || parseFloat(amount) <= 0) { toast("Enter a payment amount.", "error"); return; }
    try {
      const pay = await recordPayment({ customerId, date, amount: parseFloat(amount), method, reference, notes });
      toast(`Payment ${pay.receiptNumber} recorded.`, "success");
      setAmount(""); setReference(""); setNotes("");
    } catch (e: any) { toast(e?.message || "Could not record payment.", "error"); }
  };

  return (
    <div className="page two-col-page">
      <section className="card payment-form-card">
        <div className="form-title"><span><Icon name="wallet" /></span><div><h2>Record a payment</h2><p>Add a payment received from customer</p></div></div>
        <div className="balance-callout"><span>Current outstanding balance</span><b>{formatMoneyShort(bal)}</b></div>
        <label>Customer
          <select className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select customer...</option>
            {customers.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Payment date<div className="input-box"><Icon name="calendar" size={17} /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></label>
        <label>Payment amount<div className="amount-input"><span>Rs</span><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div></label>
        <label>Payment method<div className="method-grid">{METHODS.map((m) => (<button key={m} className={method === m ? "active" : ""} onClick={() => setMethod(m)}>{m}</button>))}</div></label>
        <div className="form-row">
          <label>Reference number<input className="field" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRX-84521" /></label>
          <label>Receipt number<input className="field" value={receiptNumber} readOnly /></label>
        </div>
        <label>Notes<textarea className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add optional payment notes..." /></label>
        <div className="after-payment"><span>Balance after payment</span><b>{formatMoneyShort(after)}</b></div>
        <button className="btn btn-primary full" onClick={handleSave}><Icon name="check" /> Save payment & issue receipt</button>
      </section>
      <section className="card payments-list">
        <div className="section-head"><div><h3>Payment history</h3><p>All customer receipts</p></div></div>
        {editing && (
          <div className="card" style={{ margin: 12, padding: 16 }}>
            <h4 style={{ marginTop: 0 }}>Edit {editing.receiptNumber}</h4>
            <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: 12 }}>Amount and ledger balance cannot be changed here. Reverse the payment if the amount is wrong.</p>
            <div className="form-row">
              <label>Date<input type="date" className="field" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} /></label>
              <label>Method<select className="field" value={editForm.method} onChange={(e) => setEditForm({ ...editForm, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
            <label>Reference<input className="field" value={editForm.reference} onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })} /></label>
            <label>Notes<textarea className="field" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={saveEdit}>Update payment</button>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}
        <div className="payment-total"><div><small>Total received</small><b>{formatMoneyShort(payments.reduce((s, p) => s + p.amount, 0))}</b></div></div>
        {[...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => (
          <div className="payment-row" key={x.id}>
            <span className="receipt-icon"><Icon name="check" size={16} /></span>
            <div><b>{x.receiptNumber}</b><small>{x.customerName} • {x.date} • {x.method}</small></div>
            <strong>{formatMoneyShort(x.amount)}</strong>
            <button className="table-action" onClick={() => startEdit(x)} title="Edit"><Icon name="edit" size={16} /></button>
            <button className="table-action" onClick={() => shareReceipt(x)} title="Share PDF receipt"><Icon name="share" size={16} /></button>
            <button className="table-action" onClick={() => removePayment(x)} title="Delete payment"><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {payments.length === 0 && <p style={{ padding: 12, color: "var(--muted)" }}>No payments yet</p>}
      </section>
    </div>
  );
}