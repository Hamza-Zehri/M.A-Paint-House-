import { useState, useMemo } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoney, formatMoneyShort, toPaisa } from "../lib/money";
import { invoicePdfBlob, invoicePdfName } from "../lib/pdfFile";
import { printInvoiceHtml } from "../lib/pdf";
import { sharePdf } from "../lib/share";
import { toast } from "../lib/dialog";
import type { Customer, Invoice, Product } from "../lib/types";

interface Line { productId: string; qty: number; unitPrice: number; }

export default function InvoiceBuilder({ initial = null, onDone }: { initial?: Invoice | null; onDone?: () => void }) {
  const { customers, products, families, createInvoice, editInvoice, settings, customerBalance } = useApp();
  const [customerId, setCustomerId] = useState(initial?.customerId || customers[0]?.id || "");
  const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(
    initial ? initial.items.map((it) => ({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })) : []
  );
  const [discountPercent, setDiscountPercent] = useState<number | null>(initial ? initial.discountPercent : null);
  const [paymentReceived, setPaymentReceived] = useState("");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const editing = initial;

  const customer = customers.find((c) => c.id === customerId);
  const effectiveDiscount = discountPercent !== null ? discountPercent : (customer?.discount ?? 0);

  const filtered = products.filter((p) => p.active && (!selectedFamily || p.familyId === selectedFamily) && (p.name.toLowerCase().includes(query.toLowerCase()) || p.category.toLowerCase().includes(query.toLowerCase()) || p.code.toLowerCase().includes(query.toLowerCase())));

  const addProduct = (p: Product) => {
    setLines((cur) => {
      const existing = cur.find((l) => l.productId === p.id);
      if (existing) return cur.map((l) => l.productId === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...cur, { productId: p.id, qty: 1, unitPrice: p.price }];
    });
  };

  const updateQty = (pid: string, qty: number) => setLines((cur) => cur.map((l) => l.productId === pid ? { ...l, qty: Math.max(1, qty) } : l));
  const updatePrice = (pid: string, price: number) => setLines((cur) => cur.map((l) => l.productId === pid ? { ...l, unitPrice: toPaisa(price) } : l));
  const removeLine = (pid: string) => setLines((cur) => cur.filter((l) => l.productId !== pid));

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discountAmount = Math.round((subtotal * effectiveDiscount) / 100);
  const netPayable = subtotal - discountAmount;
  const payPaisa = toPaisa(parseFloat(paymentReceived) || 0);
  const balanceDue = netPayable - payPaisa;

  const shareInvoicePdf = async (invoice: Invoice, owner?: Customer) => {
    const paid = invoice.paymentReceived || 0;
    const due = Math.max(0, invoice.netPayable - paid);
    try {
      const blob = invoicePdfBlob(invoice, settings, owner, paid);
      const result = await sharePdf({
        blob,
        filename: invoicePdfName(invoice),
        phone: owner?.whatsapp || owner?.phone,
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
      toast(error?.message || "Invoice saved, but the PDF could not be shared.", "error");
    }
  };

  const handleSave = async (andShare = false) => {
    if (!customerId) { toast("Select a customer.", "error"); return; }
    if (lines.length === 0) { toast("Add at least one product.", "error"); return; }
    setSaving(true);
    try {
      const items = lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice / 100 }));
      if (editing) {
        const inv = await editInvoice(editing.id, { date, items, discountPercent: effectiveDiscount, notes });
        setLastInvoice(inv);
        toast(`Invoice ${inv.number} updated.`, "success");
        if (andShare) await shareInvoicePdf(inv, customer);
        onDone?.();
      } else {
        const inv = await createInvoice({ customerId, date, items, discountPercent: effectiveDiscount, paymentReceived: parseFloat(paymentReceived) || 0, notes, status: "finalized" });
        setLastInvoice(inv); setLines([]); setPaymentReceived(""); setNotes("");
        toast(`Invoice ${inv.number} saved.`, "success");
        if (andShare) await shareInvoicePdf(inv, customer);
      }
    } catch (e: any) { toast(e?.message || "Could not save the invoice.", "error"); }
    setSaving(false);
  };

  return (
    <div className="invoice-layout">
      <section className="catalogue">
        <div className="catalogue-head"><div><h2>Product catalogue</h2><p>Click a product to add it to the invoice</p></div><span>{filtered.length} products</span></div>
        <div className="product-search"><Icon name="search" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product name or category..." /></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 0" }}>
          <button className={`btn ${selectedFamily === null ? "btn-primary" : "btn-secondary"}`} onClick={() => setSelectedFamily(null)}>All families</button>
          {families.filter((f) => f.status === "active").map((f) => (
            <button className={`btn ${selectedFamily === f.id ? "btn-primary" : "btn-secondary"}`} key={f.id} onClick={() => setSelectedFamily(f.id)}>{f.name}</button>
          ))}
        </div>
        <div className="product-grid">
          {filtered.map((p) => (
            <button className="product-card" key={p.id} onClick={() => addProduct(p)}>
              <div className="paint-can" style={{ "--paint": "#16796f" } as React.CSSProperties}><span /></div>
              <div className="product-info"><small>{p.category}</small><h3>{p.name}</h3><span>{p.code} • {p.size}</span><strong>{formatMoneyShort(p.price)}</strong></div>
              <span className="add-circle"><Icon name="plus" size={16} /></span>
            </button>
          ))}
        </div>
      </section>
      <aside className="invoice-panel">
        <div className="invoice-top-pane">
          <div className="invoice-top">
            <div><span>{editing ? "Editing invoice" : "Current invoice"}</span><h2>{editing ? editing.number : `${settings?.invoicePrefix || "INV"}-${(settings?.invoiceCounter || 1000) + 1}`}</h2></div>
            <div className="date-control"><Icon name="calendar" size={15} /><div><small>Invoice date</small><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ border: "none", background: "transparent", fontWeight: 700 }} /></div></div>
          </div>
          {editing && (
            <div className="edit-banner">
              <span><Icon name="edit" size={14} /> You are editing {editing.number}. Ledger balances update automatically.</span>
              <button onClick={() => onDone?.()}>Cancel edit</button>
            </div>
          )}
          <div className="invoice-customer">
            <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setDiscountPercent(null); }} style={{ flex: 1, padding: 6, borderRadius: 8, border: "1px solid var(--line)" }}>
              <option value="">Select customer...</option>
              {customers.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.discount}% discount)</option>)}
            </select>
            {customer && <span className="discount-tag">{effectiveDiscount}% discount</span>}
          </div>
          {customer && <div style={{ fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>Previous balance: {formatMoneyShort(customerBalance(customer.id))}</div>}
          <div style={{ padding: "6px 0" }}>
            <label style={{ fontSize: 12 }}>Discount % (override) <input type="number" value={effectiveDiscount} onChange={(e) => setDiscountPercent(parseFloat(e.target.value))} style={{ width: 70, marginLeft: 8, padding: 4, borderRadius: 6, border: "1px solid var(--line)" }} /></label>
          </div>
          <div className="line-heading"><b>Invoice items</b><span>{lines.length} line items</span></div>
        </div>
        <div className="line-items">
          {lines.length === 0 ? (<div className="empty"><Icon name="box" size={30} /><b>No items added</b><span>Select products from the catalogue</span></div>) : (
            lines.map((line) => {
              const p = products.find((x) => x.id === line.productId)!;
              return (
                <div className="line-item" key={line.productId}>
                  <div className="line-title"><div><b>{p.name}</b><span>{p.size} • {formatMoney(line.unitPrice)} each</span></div><button onClick={() => removeLine(line.productId)}><Icon name="trash" size={16} /></button></div>
                  <div className="line-bottom">
                    <div className="stepper"><button onClick={() => updateQty(line.productId, line.qty - 1)}><Icon name="minus" size={13} /></button><input type="number" value={line.qty} onChange={(e) => updateQty(line.productId, parseInt(e.target.value) || 1)} style={{ width: 40, textAlign: "center", border: "none", fontWeight: 700 }} /><button onClick={() => updateQty(line.productId, line.qty + 1)}><Icon name="plus" size={13} /></button></div>
                    <input type="number" value={line.unitPrice / 100} onChange={(e) => updatePrice(line.productId, parseFloat(e.target.value) || 0)} style={{ width: 90, padding: 4, borderRadius: 6, border: "1px solid var(--line)" }} />
                    <strong>{formatMoney(line.unitPrice * line.qty)}</strong>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="invoice-bottom-pane">
          <div className="invoice-totals">
            <div><span>Subtotal</span><b>{formatMoney(subtotal)}</b></div>
            <div className="discount-row"><span>Customer discount <small>{effectiveDiscount}%</small></span><b>− {formatMoney(discountAmount)}</b></div>
            <div className="net-total"><span>Net payable</span><strong>{formatMoney(netPayable)}</strong></div>
          </div>
          <div style={{ padding: "6px 0" }}>
            {!editing && (
              <>
                <label style={{ fontSize: 12, display: "block", marginBottom: 3 }}>Payment received now (Rs)</label>
                <input className="field" type="number" value={paymentReceived} onChange={(e) => setPaymentReceived(e.target.value)} placeholder="0" />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Balance after: {formatMoney(balanceDue)}</div>
              </>
            )}
            {editing && (
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Payment received stays at {formatMoney(editing.paymentReceived)}. Record additional payments from the Payments page.</div>
            )}
          </div>
          <label style={{ fontSize: 11.5 }}>Notes<textarea className="field" style={{ minHeight: 46 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Invoice notes..." /></label>
          <div className="invoice-buttons">
            <button className="btn btn-primary save-wide" disabled={saving} onClick={() => handleSave(false)}>{saving ? "Saving..." : editing ? "Update invoice" : "Save invoice"}</button>
            <button className="btn btn-secondary" disabled={saving} onClick={() => handleSave(true)}><Icon name="share" /> {editing ? "Update & WhatsApp" : "Save & WhatsApp"}</button>
            <button className="btn btn-secondary" disabled={!lastInvoice && !editing} onClick={() => { const inv = lastInvoice || editing; if (inv) printInvoiceHtml(inv, settings); }}><Icon name="printer" /> Print</button>
            <button className="clear-btn" onClick={() => { if (editing) { onDone?.(); return; } setLines([]); setPaymentReceived(""); setNotes(""); }}>{editing ? "Cancel edit" : "Clear invoice"}</button>
          </div>
          {lastInvoice && (<div style={{ marginTop: 8, padding: 8, background: "var(--teal-soft)", borderRadius: 8, fontSize: 12 }}><b>Last saved: {lastInvoice.number}</b></div>)}
        </div>
      </aside>
    </div>
  );
}