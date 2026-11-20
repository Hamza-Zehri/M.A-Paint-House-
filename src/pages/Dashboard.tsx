import { useMemo } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";

const HERO_COLOURS = ["#f97362", "#f4b740", "#1fbf9c", "#4a8fe7", "#9b6cf2"];

export default function Dashboard({ go }: { go: (p: any) => void }) {
  const { customers, invoices, payments, customerBalance } = useApp();

  const stats = useMemo(() => {
    let activeCustomers = 0;
    let accountsWithBalance = 0;
    let totalOutstanding = 0;
    for (const c of customers) {
      if (c.active) activeCustomers++;
      // Shared balance service lookup; no Firestore read on render.
      const balance = customerBalance(c.id);
      if (balance > 0) accountsWithBalance++;
      totalOutstanding += Math.max(0, balance);
    }

    let totalInvoiced = 0;
    for (const i of invoices) {
      if (i.status === "finalized") totalInvoiced += i.netPayable;
    }

    let totalPayments = 0;
    for (const p of payments) totalPayments += p.amount;

    return { activeCustomers, accountsWithBalance, totalOutstanding, totalInvoiced, totalPayments };
  }, [customers, invoices, payments, customerBalance]);

  const recentInvoices = useMemo(
    () => [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [invoices],
  );
  const recentPayments = useMemo(
    () => [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [payments],
  );

  return (
    <div className="page">

      {/* ══════════════════════════════════════════════
          MERGED HERO — New Invoice (top priority CTA)
      ══════════════════════════════════════════════ */}
      <section className="dash-hero">
        <div className="dash-hero-blob dash-hero-blob-a" />
        <div className="dash-hero-blob dash-hero-blob-b" />
        <div className="dash-hero-blob dash-hero-blob-c" />

        <div className="dash-hero-copy">
          {/* Badge + eyebrow combined */}
          <div className="dash-hero-top-row">
            <span className="dash-nih-badge">
              <span className="dash-nih-pulse" />
              Most-used action
            </span>
            <span className="dash-eyebrow">
              <i /> M.A Paint House · Khuzdar
            </span>
          </div>

          {/* Merged heading */}
          <h2 className="dash-hero-merged-title">
            <span className="dash-hero-title-gradient">New Invoice</span>
            <br />
            <span className="dash-hero-title-sub">Ready to write the next one?</span>
          </h2>

          <p>
            Start a sale in one tap, share a branded PDF directly on WhatsApp, and keep every
            customer ledger in perfect colour.
          </p>

          <div className="dash-hero-actions">
            <button className="dash-cta" onClick={() => go("invoice")}>
              <span className="dash-cta-icon"><Icon name="plus" size={21} /></span>
              <span className="dash-cta-copy">
                <b>Create Invoice</b>
                <small>Fastest way to start a sale</small>
              </span>
              <Icon name="arrow" size={18} />
            </button>
            <button className="dash-ghost-btn" onClick={() => go("payments")}>
              <Icon name="wallet" size={16} /> Receive Payment
            </button>
          </div>

          <div className="dash-paint-strip" aria-hidden="true">
            {HERO_COLOURS.map((colour) => <span key={colour} style={{ background: colour }} />)}
          </div>
        </div>

        <div className="dash-hero-panel">
          <div className="dash-hero-stat dash-hero-stat-wide">
            <span>Outstanding receivables</span>
            <b>{formatMoneyShort(stats.totalOutstanding)}</b>
            <small>{stats.accountsWithBalance} account(s) with a balance</small>
          </div>
          <div className="dash-hero-stat">
            <span>Invoices</span>
            <b>{invoices.length}</b>
          </div>
          <div className="dash-hero-stat">
            <span>Customers</span>
            <b>{stats.activeCustomers}</b>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          METRIC CARDS
      ══════════════════════════════════════════════ */}
      <section className="metrics-grid">
        <div className="metric-card navy"><div className="metric-head"><span className="metric-icon"><Icon name="file" size={20} /></span></div><p>Total invoiced</p><h3>{formatMoneyShort(stats.totalInvoiced)}</h3></div>
        <div className="metric-card teal"><div className="metric-head"><span className="metric-icon"><Icon name="wallet" size={20} /></span></div><p>Payments received</p><h3>{formatMoneyShort(stats.totalPayments)}</h3></div>
        <div className="metric-card red"><div className="metric-head"><span className="metric-icon"><Icon name="clock" size={20} /></span></div><p>Outstanding receivables</p><h3>{formatMoneyShort(stats.totalOutstanding)}</h3></div>
        <div className="metric-card blue"><div className="metric-head"><span className="metric-icon"><Icon name="users" size={20} /></span></div><p>Active customers</p><h3>{stats.activeCustomers}</h3></div>
      </section>

      {/* ══════════════════════════════════════════════
          RECENT TABLES
      ══════════════════════════════════════════════ */}
      <section className="dashboard-grid">
        <div className="card recent-card">
          <div className="section-head"><div><h3>Recent invoices</h3><p>Latest transactions</p></div><button onClick={() => go("history")}>View all <Icon name="arrow" size={15} /></button></div>
          <div className="table-wrap">
            <table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead>
            <tbody>
              {recentInvoices.map((i) => (<tr key={i.id}><td><b>{i.number}</b></td><td>{i.customerName}</td><td>{i.date}</td><td><span className={`status ${i.status === "finalized" ? "paid" : "partial"}`}>{i.status}</span></td><td><b>{formatMoneyShort(i.netPayable)}</b></td></tr>))}
              {recentInvoices.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 20 }}>No invoices yet</td></tr>}
            </tbody></table>
          </div>
        </div>
        <div className="card activity-card">
          <div className="section-head"><div><h3>Recent payments</h3><p>Latest receipts</p></div><button onClick={() => go("payments")}>View all <Icon name="arrow" size={15} /></button></div>
          {recentPayments.map((x) => (<div className="activity" key={x.id}><span className="activity-icon"><Icon name="arrow" size={16} /></span><div><b>{formatMoneyShort(x.amount)}</b><small>{x.method} • {x.receiptNumber}</small></div><time>{x.date}</time></div>))}
          {recentPayments.length === 0 && <p style={{ padding: 12, color: "var(--muted)" }}>No payments yet</p>}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SHORTCUTS
      ══════════════════════════════════════════════ */}
      <section className="dash-shortcuts">
        <div className="dash-shortcuts-head">
          <div>
            <span className="dash-eyebrow dark"><i /> Everyday shortcuts</span>
            <h3>Keep the counter moving</h3>
          </div>
        </div>
        <div className="dash-shortcut-grid">
          <button onClick={() => go("customers")}><span className="dash-shortcut-icon coral"><Icon name="users" size={18} /></span><b>Add Customer</b><small>Open a new khata</small></button>
          <button onClick={() => go("payments")}><span className="dash-shortcut-icon amber"><Icon name="wallet" size={18} /></span><b>Receive Payment</b><small>Issue a receipt</small></button>
          <button onClick={() => go("allproducts")}><span className="dash-shortcut-icon emerald"><Icon name="box" size={18} /></span><b>Add Product</b><small>Colours &amp; pack prices</small></button>
          <button onClick={() => go("ledger")}><span className="dash-shortcut-icon azure"><Icon name="book" size={18} /></span><b>View Ledger</b><small>Customer balances</small></button>
          <button onClick={() => go("import")}><span className="dash-shortcut-icon violet"><Icon name="download" size={18} /></span><b>Import Products</b><small>Bulk CSV catalogue</small></button>
        </div>
      </section>
    </div>
  );
}
