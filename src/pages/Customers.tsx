import { useDeferredValue, useMemo, useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, toPaisa } from "../lib/money";
import { appConfirm, toast } from "../lib/dialog";
import type { Customer } from "../lib/types";

export default function Customers() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, customerBalance, invoicesByCustomer, paymentsByCustomer } = useApp();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", whatsapp: "", address: "", city: "", openingBalance: "", discount: "0", notes: "", active: true });

  const deferredQuery = useDeferredValue(query);

  const customerSearch = useMemo(
    () => customers.map((c) => ({ customer: c, name: c.name.toLowerCase(), phone: c.phone })),
    [customers],
  );
  const shown = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return customerSearch
      .filter((entry) => entry.name.includes(q) || entry.phone.includes(deferredQuery))
      .map((entry) => entry.customer);
  }, [customerSearch, deferredQuery]);

  const viewingId = viewing?.id ?? null;
  const custInvoices = useMemo(
    () => (viewingId ? invoicesByCustomer.get(viewingId) || [] : []),
    [viewingId, invoicesByCustomer],
  );
  const custPayments = useMemo(
    () => (viewingId ? paymentsByCustomer.get(viewingId) || [] : []),
    [viewingId, paymentsByCustomer],
  );
  const viewingTotals = useMemo(() => ({
    totalInvoiced: custInvoices.reduce((s, i) => s + i.netPayable, 0),
    totalDiscount: custInvoices.reduce((s, i) => s + i.discountAmount, 0),
    totalPaid: custPayments.reduce((s, p) => s + p.amount, 0),
  }), [custInvoices, custPayments]);

  const resetForm = () => setForm({ name: "", phone: "", whatsapp: "", address: "", city: "", openingBalance: "", discount: "0", notes: "", active: true });

  const openNew = () => { resetForm(); setEditing(null); setShowForm(true); };
  const openEdit = (c: Customer) => {
    setForm({ name: c.name, phone: c.phone, whatsapp: c.whatsapp, address: c.address, city: c.city, openingBalance: String(c.openingBalance / 100), discount: String(c.discount), notes: c.notes, active: c.active });
    setEditing(c); setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast("Customer name is required.", "error"); return; }
    const data = { name: form.name.trim(), phone: form.phone, whatsapp: form.whatsapp || form.phone, address: form.address, city: form.city, openingBalance: toPaisa(parseFloat(form.openingBalance) || 0), discount: parseFloat(form.discount) || 0, notes: form.notes, active: form.active };
    try {
      if (editing) await updateCustomer({ ...editing, ...data }); else await addCustomer(data);
      toast(editing ? "Customer updated." : "Customer created.", "success");
      setShowForm(false); resetForm();
    } catch (e: any) {
      toast(e?.message || "Could not save customer.", "error");
    }
  };

  const remove = async (c: Customer) => {
    const invoiceCount = (invoicesByCustomer.get(c.id) || []).length;
    const paymentCount = (paymentsByCustomer.get(c.id) || []).length;
    const related = invoiceCount || paymentCount
      ? `\n\nThis will also permanently delete ${invoiceCount} invoice(s), ${paymentCount} payment(s) and all ledger entries for this customer.`
      : "\n\nThis will remove the customer and their ledger entries.";
    const confirmed = await appConfirm(`Delete ${c.name}?${related}`, {
      title: "Delete customer",
      confirmText: "Delete customer",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteCustomer(c.id);
      toast(`${c.name} and related records deleted.`, "success");
    } catch (e: any) {
      toast(e?.message || "Could not delete customer.", "error");
    }
  };

  if (viewing) {
    const c = viewing;
    const { totalInvoiced, totalDiscount, totalPaid } = viewingTotals;
    const bal = customerBalance(c.id);
    return (
      <div className="page">
        <button className="btn btn-secondary" onClick={() => setViewing(null)}><Icon name="arrow" size={16} /> Back</button>
        <div className="card" style={{ marginTop: 12, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>{c.name}</h2>
          <p style={{ color: "var(--muted)" }}>{c.phone} • {c.city} • {c.address}</p>
          <div className="mini-metrics" style={{ marginTop: 12 }}>
            <div><span>Opening balance</span><b>{formatMoneyShort(c.openingBalance)}</b></div>
            <div><span>Total invoiced</span><b>{formatMoneyShort(totalInvoiced)}</b></div>
            <div><span>Total discount</span><b>{formatMoneyShort(totalDiscount)}</b></div>
            <div><span>Total payments</span><b>{formatMoneyShort(totalPaid)}</b></div>
            <div><span>Outstanding</span><b className={bal > 0 ? "red-text" : ""}>{formatMoneyShort(bal)}</b></div>
            <div><span>Invoices</span><b>{custInvoices.length}</b></div>
            <div><span>Discount</span><b>{c.discount}%</b></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div className="toolbar-search"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers..." /></div>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={16} /> Add customer</button>
        </div>
        {showForm && (
          <div className="card" style={{ margin: 16, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>{editing ? "Edit customer" : "New customer"}</h3>
            <div className="form-row">
              <label>Name<input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Phone<input className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            </div>
            <div className="form-row">
              <label>WhatsApp<input className="field" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></label>
              <label>City<input className="field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            </div>
            <label>Address<input className="field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
            <div className="form-row">
              <label>Opening balance (Rs)<input className="field" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></label>
              <label>Discount %<input className="field" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></label>
            </div>
            <label>Notes<textarea className="field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <label className="toggle-row"><span>Active</span><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></label>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save}>Save</button>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
            </div>
          </div>
        )}
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Name</th><th>Phone</th><th>City</th><th>Opening Bal.</th><th>Discount</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shown.map((c) => {
                const balance = customerBalance(c.id);
                return (
                  <tr key={c.id}>
                    <td><b>{c.name}</b></td>
                    <td>{c.phone}</td>
                    <td>{c.city}</td>
                    <td className={c.openingBalance > 0 ? "red-text" : ""}>{formatMoneyShort(c.openingBalance)}</td>
                    <td>{c.discount}%</td>
                    <td className={balance > 0 ? "red-text" : ""}>{formatMoneyShort(balance)}</td>
                    <td>{c.active ? "Active" : "Inactive"}</td>
                    <td><div className="row-actions">
                      <button onClick={() => setViewing(c)} title="View"><Icon name="arrow" size={16} /></button>
                      <button onClick={() => openEdit(c)} title="Edit"><Icon name="edit" size={16} /></button>
                      <button onClick={() => remove(c)} title="Delete customer"><Icon name="trash" size={16} /></button>
                    </div></td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20 }}>No customers</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}