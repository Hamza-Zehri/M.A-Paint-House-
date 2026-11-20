import { useState, useMemo, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, toPaisa, todayLocalISO } from "../lib/money";
import { receiptPdfBlob, receiptPdfName } from "../lib/pdfLazy";
import { sharePdf } from "../lib/share";
import { appConfirm, toast } from "../lib/dialog";
import { useActionLock } from "../hooks/useActionLock";
import type { Payment } from "../lib/types";

const METHODS = ["Cash", "Bank transfer", "JazzCash", "EasyPaisa", "Cheque", "Other"];
const DRAFT_KEY = "maph_payment_draft_v1";

export default function Payments() {
  const { customers, payments, recordPayment, updatePayment, deletePayment, settings, customerById, customerBalance } = useApp();
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [date, setDate] = useState(todayLocalISO());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptNumber, setReceiptNumber] = useState(`RCPT-${Date.now().toString().slice(-6)}`);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [editForm, setEditForm] = useState({ date: "", method: "Cash", reference: "", notes: "" });
  const [monthFilter, setMonthFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(100);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const { isBusy, lock } = useActionLock();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d) {
          if (d.customerId) setCustomerId(d.customerId);
          if (d.date) setDate(d.date);
          if (d.amount) setAmount(d.amount);
          if (d.method) setMethod(d.method);
          if (d.reference) setReference(d.reference);
          if (d.notes) setNotes(d.notes);
        }
      }
    } catch { /* ignore a corrupt draft */ }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ customerId, date, amount, method, reference, notes }));
    } catch { /* storage can be unavailable */ }
  }, [draftLoaded, customerId, date, amount, method, reference, notes]);

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
    const owner = customerById.get(payment.customerId);
    try {
      const blob = await receiptPdfBlob(payment, settings, owner);
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

  const customer = customerById.get(customerId);
  const bal = customer ? customerBalance(customer.id) : 0;
  const payPaisa = toPaisa(parseFloat(amount) || 0);
  const after = bal - payPaisa;
  const activeCustomers = useMemo(() => customers.filter((c) => c.active), [customers]);
  const monthOptions = useMemo(
    () => Array.from(new Set(payments.map((p) => (p.date || "").slice(0, 7)))).filter(Boolean).sort().reverse(),
    [payments],
  );
  const shownPayments = useMemo(() => {
    const filtered = monthFilter === "all" ? payments : payments.filter((p) => (p.date || "").startsWith(monthFilter));
    return [...filtered].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [payments, monthFilter]);
  const totalReceived = useMemo(() => shownPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0), [shownPayments]);
  useEffect(() => setVisibleCount(100), [monthFilter]);

  const handleSave = async () => {
    if (!customerId) { toast("Select a customer.", "error"); return; }
    if (!amount || parseFloat(amount) <= 0) { toast("Enter a payment amount.", "error"); return; }
    try {
      const pay = await recordPayment({
        customerId, date, amount: parseFloat(amount), method, reference, notes,
        idempotencyKey: `pay-${receiptNumber}`,
      });
      toast(`Payment ${pay.receiptNumber} recorded.`, "success");
      setAmount(""); setReference(""); setNotes("");
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      setReceiptNumber(`RCPT-${Date.now().toString().slice(-6)}`);
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
            {activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
        <button className="btn btn-primary full" disabled={isBusy("save-payment")} onClick={() => lock("save-payment", handleSave)}><Icon name="check" /> {isBusy("save-payment") ? "Saving..." : "Save payment & issue receipt"}</button>
      </section>
      <section className="card payments-list">
        <div className="section-head" style={{ flexWrap: "wrap", gap: 8 }}>
          <div><h3>Payment history</h3><p>All customer receipts</p></div>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="filter-button">
            <option value="all">All months</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </option>
            ))}
          </select>
        </div>
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
        <div className="payment-total"><div><small>Total received</small><b>{formatMoneyShort(totalReceived)}</b></div></div>
        {shownPayments.slice(0, visibleCount).map((x) => (
          <div className="payment-row" key={x.id}>
            <span className="receipt-icon"><Icon name="check" size={16} /></span>
            <div><b>{x.receiptNumber}</b><small>{x.customerName} • {x.date} • {x.method}</small></div>
            <strong>{formatMoneyShort(x.amount)}</strong>
            <button className="table-action" onClick={() => startEdit(x)} title="Edit"><Icon name="edit" size={16} /></button>
            <button className="table-action" onClick={() => shareReceipt(x)} title="Share PDF receipt"><Icon name="share" size={16} /></button>
            <button className="table-action" disabled={isBusy(`delete-${x.id}`)} onClick={() => lock(`delete-${x.id}`, () => removePayment(x))} title="Delete payment"><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {shownPayments.length > visibleCount && (
          <button className="btn btn-secondary" style={{ margin: 12 }} onClick={() => setVisibleCount((n) => n + 100)}>
            Show more payments ({shownPayments.length - visibleCount} remaining)
          </button>
        )}
        {shownPayments.length === 0 && <p style={{ padding: 12, color: "var(--muted)" }}>No payments yet</p>}
      </section>
    </div>
  );
}