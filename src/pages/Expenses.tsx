import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, toPaisa, todayLocalISO } from "../lib/money";
import type { Expense } from "../lib/types";

const CATS = ["Rent", "Electricity", "Transport", "Staff salary", "Shop maintenance", "Other"];
const METHODS = ["Cash", "Bank transfer", "JazzCash", "EasyPaisa", "Cheque", "Other"];

export default function Expenses() {
  const { expenses, addExpense, updateExpense, deleteExpense } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState({ date: todayLocalISO(), category: "Rent", description: "", amount: "", method: "Cash", reference: "", notes: "" });

  const blank = () => ({ date: todayLocalISO(), category: "Rent", description: "", amount: "", method: "Cash", reference: "", notes: "" });

  const openNew = () => { setEditing(null); setForm(blank()); setShowForm(true); };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({ date: e.date, category: e.category, description: e.description, amount: String(e.amount / 100), method: e.method, reference: e.reference, notes: e.notes });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.description.trim() || !form.amount) { alert("Description and amount required"); return; }
    const data = { date: form.date, category: form.category, description: form.description, amount: toPaisa(parseFloat(form.amount)), method: form.method, reference: form.reference, notes: form.notes };
    if (editing) await updateExpense({ ...editing, ...data });
    else await addExpense(data);
    setShowForm(false);
    setEditing(null);
    setForm(blank());
  };

  const remove = async (e: Expense) => {
    if (!confirm(`Delete the expense "${e.description}"?`)) return;
    await deleteExpense(e.id);
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div><b>Total expenses: {formatMoneyShort(total)}</b></div>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={16} /> Add expense</button>
        </div>
        {showForm && (
          <div style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>{editing ? "Edit expense" : "New expense"}</h3>
            <div className="form-row">
              <label>Date<input type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
              <label>Category<select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
            <label>Description<input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div className="form-row">
              <label>Amount (Rs)<input className="field" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
              <label>Method<select className="field" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>Reference<input className="field" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>
              <label>Notes<input className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={save}>{editing ? "Update expense" : "Save expense"}</button>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            </div>
          </div>
        )}
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Method</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {expenses.sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td><td>{e.category}</td><td>{e.description}</td><td>{e.method}</td><td>{formatMoneyShort(e.amount)}</td>
                  <td><div className="row-actions">
                    <button onClick={() => openEdit(e)} title="Edit"><Icon name="edit" size={16} /></button>
                    <button onClick={() => remove(e)} title="Delete"><Icon name="trash" size={16} /></button>
                  </div></td>
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 20 }}>No expenses</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}