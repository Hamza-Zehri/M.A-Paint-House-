import { useCallback, useMemo, useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, formatMoney } from "../lib/money";
import { statementPdfBlob, statementPdfName } from "../lib/pdfLazy";
import { sharePdf } from "../lib/share";
import { toast } from "../lib/dialog";

export default function Ledger() {
  const { customers, customerById, ledgerByCustomer, customerBalance, settings } = useApp();
  const [customerId, setCustomerId] = useState(customers[0]?.id || "");
  const [monthFilter, setMonthFilter] = useState("all");

  const customer = customerById.get(customerId);

  const baseEntries = useMemo(
    () => [...(ledgerByCustomer.get(customerId) || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [ledgerByCustomer, customerId],
  );
  const monthOptions = useMemo(
    () => Array.from(new Set(baseEntries.map((l) => (l.date || "").slice(0, 7)))).filter(Boolean).sort().reverse(),
    [baseEntries],
  );
  const entries = useMemo(
    () => (monthFilter === "all" ? baseEntries : baseEntries.filter((l) => (l.date || "").startsWith(monthFilter))),
    [baseEntries, monthFilter],
  );
  // Shared balance service — display only, no per-render Firestore read.
  const bal = customer ? customerBalance(customer.id) : 0;
  const closingBal = monthFilter !== "all" && entries.length ? entries[entries.length - 1].balance : bal;

  const entryTotals = useMemo(
    () => entries.reduce((acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }), { debit: 0, credit: 0 }),
    [entries],
  );

  const shareStatement = useCallback(async () => {
    if (!customer) return;
    try {
      const blob = await statementPdfBlob(customer, entries, settings);
      const result = await sharePdf({
        blob,
        filename: statementPdfName(customer),
        phone: customer.whatsapp || customer.phone,
        title: `Statement — ${customer.name}`,
        message:
          `Account statement for ${customer.name}\n` +
          `Closing balance: ${formatMoneyShort(bal)}\n\n` +
          `M.A Paint House\nCredit: Engr. Hamza Asad`,
      });
      toast(result === "shared" ? "Statement PDF shared." : "Statement PDF downloaded — attach it in the WhatsApp chat.", "success");
    } catch (error: any) {
      toast(error?.message || "Could not create the statement PDF.", "error");
    }
  }, [customer, entries, settings, bal]);

  return (
    <div className="page">
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label>Customer<select className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ marginLeft: 8 }}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="filter-button">
            <option value="all">All months</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={shareStatement}><Icon name="share" size={16} /> Share PDF statement</button>
        </div>
      </div>
      {customer && (
        <section className="ledger-summary">
          <div><span>Opening balance</span><b>{formatMoneyShort(customer.openingBalance)}</b></div>
          <div><span>Total debits</span><b>{formatMoneyShort(entryTotals.debit)}</b></div>
          <div><span>Total credits</span><b className="teal-text">{formatMoneyShort(entryTotals.credit)}</b></div>
          <div className="outstanding"><span>Closing balance</span><b>{formatMoneyShort(closingBal)}</b></div>
        </section>
      )}
      <div className="card data-card">
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Running balance</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td><span className={`status ${e.type === "payment" ? "paid" : "partial"}`}>{e.type}</span></td>
                  <td><b>{e.reference}</b>{e.bonus && <span title="Bonus invoice" style={{ marginLeft: 6, color: "#f59e0b" }}>★</span>}</td>
                  <td>{e.description}</td>
                  <td>{e.debit ? formatMoney(e.debit) : "—"}</td>
                  <td className="teal-text">{e.credit ? formatMoney(e.credit) : "—"}</td>
                  <td><b>{formatMoney(e.balance)}</b></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20 }}>No transactions</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
