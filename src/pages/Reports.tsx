import { useMemo, useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, formatMoney } from "../lib/money";
import { reportPdfBlob, reportPdfName } from "../lib/pdfFile";
import { sharePdf } from "../lib/share";
import { toast } from "../lib/dialog";

export default function Reports() {
  const { invoices, payments, settings, customers, customerBalance } = useApp();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [monthFilter, setMonthFilter] = useState("all");

  const daily = useMemo(() => {
    const map: Record<string, { date: string; count: number; gross: number; discount: number; net: number; payments: number }> = {};
    for (const inv of invoices.filter((i) => i.status === "finalized")) {
      if (monthFilter !== "all") {
        if (!(inv.date || "").startsWith(monthFilter)) continue;
      } else {
        if (from && inv.date < from) continue;
        if (to && inv.date > to) continue;
      }
      if (!map[inv.date]) map[inv.date] = { date: inv.date, count: 0, gross: 0, discount: 0, net: 0, payments: 0 };
      const d = map[inv.date];
      d.count += 1; d.gross += inv.subtotal; d.discount += inv.discountAmount; d.net += inv.netPayable;
    }
    for (const p of payments) {
      if (monthFilter !== "all") {
        if (!(p.date || "").startsWith(monthFilter)) continue;
      } else {
        if (from && p.date < from) continue;
        if (to && p.date > to) continue;
      }
      if (!map[p.date]) map[p.date] = { date: p.date, count: 0, gross: 0, discount: 0, net: 0, payments: 0 };
      map[p.date].payments += p.amount;
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, payments, from, to, monthFilter]);

  const totals = daily.reduce((acc, d) => ({ count: acc.count + d.count, gross: acc.gross + d.gross, discount: acc.discount + d.discount, net: acc.net + d.net, payments: acc.payments + d.payments }), { count: 0, gross: 0, discount: 0, net: 0, payments: 0 });

  const outstandingRows = customers.map((c) => ({ name: c.name, balance: customerBalance(c.id) })).filter((r) => r.balance !== 0);
  const monthOptions = Array.from(new Set([...invoices.map((i) => i.date || ""), ...payments.map((p) => p.date || "")].map((d) => d.slice(0, 7)))).filter(Boolean).sort().reverse();

  const shareDailyReport = async () => {
    const rows = daily.map((d) => [
      d.date,
      d.count,
      formatMoney(d.gross),
      formatMoney(d.discount),
      formatMoney(d.net),
      formatMoney(d.payments),
      formatMoney(d.net - d.payments),
    ]);
    try {
      const blob = reportPdfBlob(
        "Daily Sales Report",
        ["Date", "Invoices", "Gross", "Discount", "Net", "Payments", "Balance"],
        rows,
        settings,
        "Sales & receipts report",
      );
      const result = await sharePdf({
        blob,
        filename: reportPdfName("Daily Sales Report"),
        phone: settings?.whatsapp || settings?.phone,
        title: "Daily Sales Report",
        message: `Daily Sales Report — M.A Paint House\nPeriod: ${monthFilter !== "all" ? monthFilter : `${from || "start"} to ${to || "today"}`}\nNet sales: ${formatMoneyShort(totals.net)}\nPayments: ${formatMoneyShort(totals.payments)}`,
      });
      toast(result === "shared" ? "Sales report PDF shared." : "Sales report PDF downloaded — attach it in the WhatsApp chat.", "success");
    } catch (error: any) {
      toast(error?.message || "Could not create the report PDF.", "error");
    }
  };

  const shareOutstandingReport = async () => {
    const rows = outstandingRows.map((row) => [row.name, formatMoney(row.balance)]);
    try {
      const blob = reportPdfBlob(
        "Customer Outstanding Report",
        ["Customer", "Outstanding balance"],
        rows,
        settings,
        "Receivables report",
      );
      const result = await sharePdf({
        blob,
        filename: reportPdfName("Customer Outstanding Report"),
        phone: settings?.whatsapp || settings?.phone,
        title: "Customer Outstanding Report",
        message: `Customer outstanding report — M.A Paint House\n${outstandingRows.length} customer account(s) with a balance.`,
      });
      toast(result === "shared" ? "Outstanding report PDF shared." : "Outstanding report PDF downloaded — attach it in the WhatsApp chat.", "success");
    } catch (error: any) {
      toast(error?.message || "Could not create the report PDF.", "error");
    }
  };

  return (
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="filter-button">
              <option value="all">All months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} disabled={monthFilter !== "all"} />
            <span>to</span>
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} disabled={monthFilter !== "all"} />
          </div>
          <button className="btn btn-primary" onClick={shareDailyReport}><Icon name="share" size={16} /> Share PDF report</button>
        </div>
        <div className="mini-metrics" style={{ marginBottom: 12 }}>
          <div><span>Total invoices</span><b>{totals.count}</b></div>
          <div><span>Gross sales</span><b>{formatMoneyShort(totals.gross)}</b></div>
          <div><span>Total discount</span><b>{formatMoneyShort(totals.discount)}</b></div>
          <div><span>Net sales</span><b>{formatMoneyShort(totals.net)}</b></div>
          <div><span>Payments received</span><b className="teal-text">{formatMoneyShort(totals.payments)}</b></div>
          <div><span>Outstanding</span><b className="red-text">{formatMoneyShort(totals.net - totals.payments)}</b></div>
        </div>
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Date</th><th>Invoices</th><th>Gross</th><th>Discount</th><th>Net</th><th>Payments</th><th>Daily balance</th></tr></thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date}>
                  <td><b>{d.date}</b></td><td>{d.count}</td><td>{formatMoneyShort(d.gross)}</td>
                  <td className="teal-text">{formatMoneyShort(d.discount)}</td><td><b>{formatMoneyShort(d.net)}</b></td>
                  <td className="teal-text">{formatMoneyShort(d.payments)}</td>
                  <td className={d.net - d.payments > 0 ? "red-text" : ""}>{formatMoneyShort(d.net - d.payments)}</td>
                </tr>
              ))}
              {daily.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: 20 }}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card data-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px 0" }}>
          <h3>Customer outstanding report</h3>
          <button className="btn btn-secondary" onClick={shareOutstandingReport}><Icon name="share" size={16} /> Share PDF</button>
        </div>
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Customer</th><th>Outstanding balance</th></tr></thead>
            <tbody>
              {outstandingRows.map((r, i) => (<tr key={i}><td>{r.name}</td><td className={r.balance > 0 ? "red-text" : ""}>{formatMoneyShort(r.balance)}</td></tr>))}
              {outstandingRows.length === 0 && <tr><td colSpan={2} style={{ textAlign: "center", padding: 20 }}>All clear</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}