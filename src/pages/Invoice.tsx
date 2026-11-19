import { useState, useMemo, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoney, formatMoneyShort, toPaisa, todayLocalISO } from "../lib/money";
import { invoicePdfBlob, invoicePdfName } from "../lib/pdfFile";
import { printInvoiceHtml } from "../lib/pdf";
import { sharePdf } from "../lib/share";
import { toast } from "../lib/dialog";
import { useActionLock } from "../hooks/useActionLock";
import type { Customer, Invoice, Product } from "../lib/types";

interface Line { productId: string; qty: number; unitPrice: number; }

export default function InvoiceBuilder({ initial = null, onDone }: { initial?: Invoice | null; onDone?: () => void }) {
  const { customers, products, families, createInvoice, editInvoice, settings, customerBalance } = useApp();
  const [customerId, setCustomerId] = useState(initial?.customerId || customers[0]?.id || "");
  const [date, setDate] = useState(initial?.date || todayLocalISO());
  const [query, setQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(
    initial ? initial.items.map((it) => ({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })) : []
  );
  const [discountPercent, setDiscountPercent] = useState<number | null>(initial ? initial.discountPercent : null);
  const [bonus, setBonus] = useState<boolean>(initial?.bonus || false);
  const [paymentReceived, setPaymentReceived] = useState("");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"catalogue" | "invoice">(initial ? "invoice" : "catalogue");
  const editing = initial;
  const { isBusy, lock } = useActionLock();

  useEffect(() => {
    if (initial) {
      setCustomerId(initial.customerId);
      setDate(initial.date);
      setLines(initial.items.map((it) => ({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })));
      setDiscountPercent(initial.discountPercent);
      setBonus(initial.bonus || false);
      setNotes(initial.notes || "");
      setActiveTab("invoice");
    } else {
      setDate(todayLocalISO());
    }
  }, [initial]);

  const customer = customers.find((c) => c.id === customerId);
  const effectiveDiscount = bonus ? 100 : (discountPercent !== null ? discountPercent : (customer?.discount ?? 0));

  const filtered = products.filter((p) => p.active && (!selectedFamily || p.familyId === selectedFamily) && (p.name.toLowerCase().includes(query.toLowerCase()) || p.category.toLowerCase().includes(query.toLowerCase()) || p.code.toLowerCase().includes(query.toLowerCase())));

  const addProduct = (p: Product) => {
    setLines((cur) => {
      const existing = cur.find((l) => l.productId === p.id);
      if (existing) return cur.map((l) => l.productId === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...cur, { productId: p.id, qty: 1, unitPrice: p.price }];
    });
    toast(`Added ${p.name}`, "info");
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
    if (!customerId) {
      setActiveTab("invoice");
      toast("Select a customer.", "error");
      return;
    }
    if (lines.length === 0) {
      setActiveTab("catalogue");
      toast("Add at least one product.", "error");
      return;
    }
    setSaving(true);
    try {
      const items = lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice / 100 }));
      if (editing) {
        const inv = await editInvoice(editing.id, { date, items, discountPercent: effectiveDiscount, notes, bonus });
        setLastInvoice(inv);
        toast(`Invoice ${inv.number} updated.`, "success");
        if (andShare) await shareInvoicePdf(inv, customer);
        onDone?.();
      } else {
        const inv = await createInvoice({ customerId, date, items, discountPercent: effectiveDiscount, paymentReceived: parseFloat(paymentReceived) || 0, notes, status: "finalized", bonus });
        setLastInvoice(inv); setLines([]); setPaymentReceived(""); setNotes(""); setDate(todayLocalISO());
        toast(`Invoice ${inv.number} saved.`, "success");
        if (andShare) await shareInvoicePdf(inv, customer);
      }
    } catch (e: any) { toast(e?.message || "Could not save the invoice.", "error"); }
    setSaving(false);
  };

  return (
    <div className="invoice-container">
      {/* Mobile view switcher tabs */}
      <div className="invoice-mobile-tabs" role="tablist" aria-label="Invoice navigation">
        <button
          role="tab"
          aria-selected={activeTab === "catalogue"}
          className={`invoice-tab-btn ${activeTab === "catalogue" ? "active" : ""}`}
          onClick={() => setActiveTab("catalogue")}
        >
          <Icon name="box" size={17} />
          <span>Product Catalogue ({filtered.length})</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "invoice"}
          className={`invoice-tab-btn ${activeTab === "invoice" ? "active" : ""}`}
          onClick={() => setActiveTab("invoice")}
        >
          <Icon name="receipt" size={17} />
          <span>Current Invoice</span>
          {lines.length > 0 && (
            <span className="invoice-tab-badge">{lines.length} · {formatMoneyShort(netPayable)}</span>
          )}
        </button>
      </div>

      <div className={`invoice-layout ${activeTab === "invoice" ? "show-invoice-only" : "show-catalogue-only"}`}>
        {/* Left Side: Product Catalogue */}
        <section className="catalogue">
          <div className="catalogue-head">
            <div>
              <h2>Product catalogue</h2>
              <p>Click any product to add it directly to current invoice</p>
            </div>
            <span className="catalogue-count-badge">{filtered.length} products</span>
          </div>

          <div className="product-search">
            <Icon name="search" size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product name, category, or code..."
              aria-label="Search products"
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="catalogue-families-scroll">
            <button
              type="button"
              className={`family-pill ${selectedFamily === null ? "active" : ""}`}
              onClick={() => setSelectedFamily(null)}
            >
              All families
            </button>
            {families.filter((f) => f.status === "active").map((f) => (
              <button
                type="button"
                className={`family-pill ${selectedFamily === f.id ? "active" : ""}`}
                key={f.id}
                onClick={() => setSelectedFamily(f.id)}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div className="product-grid">
            {filtered.map((p) => {
              const inCart = lines.find((l) => l.productId === p.id);
              return (
                <button
                  type="button"
                  className={`product-card ${inCart ? "in-cart" : ""}`}
                  key={p.id}
                  onClick={() => addProduct(p)}
                >
                  <div className="paint-can" style={{ "--paint": "#16796f" } as React.CSSProperties}>
                    <span />
                  </div>
                  <div className="product-info">
                    <small>{p.category || p.brand}</small>
                    <h3>{p.name}</h3>
                    <span>{p.code} • {p.size}</span>
                    <strong>{formatMoneyShort(p.price)}</strong>
                  </div>
                  <span className="add-circle">
                    {inCart ? <b>{inCart.qty}</b> : <Icon name="plus" size={16} />}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="catalogue-empty">
                <Icon name="search" size={32} />
                <p>No products matching &ldquo;{query}&rdquo;</p>
                <button className="btn btn-secondary" onClick={() => { setQuery(""); setSelectedFamily(null); }}>
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Current Invoice Panel */}
        <aside className="invoice-panel">
          <div className="invoice-top-pane">
            <div className="invoice-top">
              <div>
                <span className="invoice-panel-label">{editing ? "Editing invoice" : "Current invoice"}</span>
                <h2>{editing ? editing.number : `${settings?.invoicePrefix || "INV"}-${(settings?.invoiceCounter || 1000) + 1}`}</h2>
              </div>
              <div className="date-control">
                <Icon name="calendar" size={15} />
                <div>
                  <small>Date</small>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Invoice date"
                  />
                </div>
              </div>
            </div>

            {editing && (
              <div className="edit-banner">
                <span><Icon name="edit" size={14} /> Editing {editing.number}. Ledgers update automatically.</span>
                <button onClick={() => onDone?.()}>Cancel edit</button>
              </div>
            )}

            <div className="invoice-customer-box">
              <label htmlFor="inv-customer-select">Customer</label>
              <div className="invoice-customer-row">
                <select
                  id="inv-customer-select"
                  value={customerId}
                  onChange={(e) => { setCustomerId(e.target.value); setDiscountPercent(null); }}
                  className="invoice-customer-select"
                >
                  <option value="">Select customer...</option>
                  {customers.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.discount}% discount)</option>
                  ))}
                </select>
                {customer && <span className="discount-tag">{effectiveDiscount}% discount</span>}
              </div>
              {customer && (
                <div className="customer-prev-balance">
                  Previous balance: <b>{formatMoneyShort(customerBalance(customer.id))}</b>
                </div>
              )}
            </div>

            <div className="discount-override-row" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
              <label style={{ flex: 1 }}>
                Discount % override
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={effectiveDiscount}
                  disabled={bonus}
                  onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                />
              </label>
              <button
                type="button"
                className={bonus ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => setBonus((v) => !v)}
                style={{ height: 36 }}
                title="Mark this invoice as bonus (products free for customer)"
              >
                {bonus ? "Bonus: ON" : "Bonus"}
              </button>
            </div>

            <div className="line-heading">
              <b>Invoice items</b>
              <span>{lines.length} {lines.length === 1 ? "item" : "items"}</span>
            </div>
          </div>

          <div className="line-items">
            {lines.length === 0 ? (
              <div className="empty">
                <Icon name="box" size={22} />
                <b>No items added yet</b>
                <span>Click any product from catalogue to add</span>
                <button
                  type="button"
                  className="btn btn-secondary invoice-mobile-browse-btn"
                  onClick={() => setActiveTab("catalogue")}
                >
                  Browse Products Catalogue
                </button>
              </div>
            ) : (
              lines.map((line) => {
                const p = products.find((x) => x.id === line.productId);
                if (!p) return null;
                return (
                  <div className="line-item" key={line.productId}>
                    <div className="line-title">
                      <div>
                        <b>{p.name}</b>
                        <span>{p.size} • {formatMoney(line.unitPrice)} each</span>
                      </div>
                      <button
                        type="button"
                        className="line-delete-btn"
                        onClick={() => removeLine(line.productId)}
                        aria-label={`Remove ${p.name}`}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>

                    <div className="line-bottom">
                      <div className="stepper">
                        <button
                          type="button"
                          onClick={() => updateQty(line.productId, line.qty - 1)}
                          aria-label="Decrease quantity"
                        >
                          <Icon name="minus" size={13} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={line.qty}
                          onChange={(e) => updateQty(line.productId, parseInt(e.target.value) || 1)}
                          aria-label="Quantity"
                        />
                        <button
                          type="button"
                          onClick={() => updateQty(line.productId, line.qty + 1)}
                          aria-label="Increase quantity"
                        >
                          <Icon name="plus" size={13} />
                        </button>
                      </div>

                      <div className="line-price-edit">
                        <small>Price</small>
                        <input
                          type="number"
                          value={line.unitPrice / 100}
                          onChange={(e) => updatePrice(line.productId, parseFloat(e.target.value) || 0)}
                          aria-label="Unit price"
                        />
                      </div>

                      <strong className="line-total-amount">
                        {formatMoney(line.unitPrice * line.qty)}
                      </strong>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="invoice-bottom-pane">
            <div className="invoice-totals">
              <div>
                <span>Subtotal</span>
                <b>{formatMoney(subtotal)}</b>
              </div>
              <div className="discount-row">
                <span>Customer discount <small>{effectiveDiscount}%</small></span>
                <b>− {formatMoney(discountAmount)}</b>
              </div>
              <div className="net-total">
                <span>Net payable</span>
                <strong>{formatMoney(netPayable)}</strong>
              </div>
            </div>

            <div className="invoice-payment-block">
              {!editing && (
                <>
                  <label htmlFor="payment-received-input">Payment received now (Rs)</label>
                  <input
                    id="payment-received-input"
                    className="field"
                    type="number"
                    value={paymentReceived}
                    onChange={(e) => setPaymentReceived(e.target.value)}
                    placeholder="0"
                  />
                  <div className="balance-after-pill">
                    Balance after invoice: <b>{formatMoney(balanceDue)}</b>
                  </div>
                </>
              )}
              {editing && (
                <div className="editing-payment-note">
                  Payment received remains at {formatMoney(editing.paymentReceived)}.
                </div>
              )}
            </div>

            <div className="invoice-notes-block">
              <label htmlFor="invoice-notes-input">Notes &amp; comments</label>
              <textarea
                id="invoice-notes-input"
                className="field invoice-notes-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional invoice notes, delivery remarks..."
                rows={1}
              />
            </div>

            <div className="invoice-buttons">
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || isBusy("save-invoice")}
                onClick={() => lock("save-invoice", () => handleSave(false))}
              >
                <Icon name="check" size={15} />
                <span>{saving || isBusy("save-invoice") ? "Saving..." : editing ? "Update Invoice" : "Save Invoice"}</span>
              </button>
              <button
                type="button"
                className="btn btn-whatsapp"
                disabled={saving || isBusy("save-share")}
                onClick={() => lock("save-share", () => handleSave(true))}
              >
                <Icon name="share" size={15} />
                <span>{editing ? "Update & WhatsApp" : "Save & WhatsApp"}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!lastInvoice && !editing}
                onClick={() => { const inv = lastInvoice || editing; if (inv) printInvoiceHtml(inv, settings); }}
              >
                <Icon name="printer" size={15} />
                <span>Print</span>
              </button>
              <button
                type="button"
                className="clear-btn"
                onClick={() => {
                  if (editing) { onDone?.(); return; }
                  setLines([]);
                  setPaymentReceived("");
                  setNotes("");
                  setDate(todayLocalISO());
                }}
              >
                {editing ? "Cancel Edit" : "Clear All"}
              </button>
            </div>

            {lastInvoice && (
              <div className="invoice-last-saved">
                <b>Saved: {lastInvoice.number}</b> · {formatMoneyShort(lastInvoice.netPayable)}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Floating cart bar on mobile when viewing catalogue */}
      {activeTab === "catalogue" && lines.length > 0 && (
        <div className="invoice-floating-cart">
          <div className="floating-cart-summary">
            <span className="floating-cart-badge">{lines.length}</span>
            <div>
              <b>{lines.length} {lines.length === 1 ? "item" : "items"} added</b>
              <small>Net: {formatMoney(netPayable)}</small>
            </div>
          </div>
          <button
            type="button"
            className="floating-cart-btn"
            onClick={() => setActiveTab("invoice")}
          >
            <span>Current Invoice</span>
            <Icon name="arrow" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
