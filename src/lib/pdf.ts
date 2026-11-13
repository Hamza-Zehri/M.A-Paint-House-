// Professional, print-ready HTML documents.
//
// Every document is rendered as a self-contained HTML page with embedded CSS.
// The browser's print dialog can save it as a pixel-perfect PDF, and the same
// page can be downloaded as a standalone .html file for archiving or email.
//
// Credit: Engr. Hamza Asad

import { formatMoney } from "./money";

type Money = number;

const BRAND = {
  navy: "#0b1f3a",
  navy2: "#143b6b",
  teal: "#0d9488",
  teal2: "#14b8a6",
  gold: "#c9a227",
  coral: "#e85d4a",
  ink: "#16233a",
  muted: "#66758a",
  line: "#e3e9f1",
  soft: "#f6f8fb",
};

const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (paisa: Money, currency = "Rs") => formatMoney(Number(paisa) || 0, currency);

const prettyDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return esc(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const safeFile = (name: string) =>
  name.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "document";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "MA";

/* ------------------------------------------------------------------ */
/* Amount in words (Pakistani numbering: crore / lakh / thousand)      */
/* ------------------------------------------------------------------ */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(n: number): string {
  let out = "";
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n) out += " ";
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10) out += ` ${ONES[n % 10]}`;
  } else if (n > 0) {
    out += ONES[n];
  }
  return out;
}

export function amountInWords(paisa: number, currency = "Rupees"): string {
  const total = Math.max(0, Math.round(Number(paisa) || 0));
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (rupees === 0 && paise === 0) return `${currency} Zero Only`;

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${belowThousand(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));

  let words = `${currency} ${parts.join(" ")}`.replace(/\s+/g, " ").trim();
  if (paise) words += ` and ${belowThousand(paise)} Paisa`;
  return `${words} Only`;
}

/* ------------------------------------------------------------------ */
/* Shared document shell                                               */
/* ------------------------------------------------------------------ */

interface ShellOptions {
  title: string;
  subtitle: string;
  accent: string;
  accent2: string;
  settings: any;
  badge?: string;
  badgeTone?: "ok" | "warn" | "danger";
  landscape?: boolean;
  watermark?: string;
  heroPills?: string;
  body: string;
}

function shell({
  title,
  subtitle,
  accent,
  accent2,
  settings,
  badge,
  badgeTone = "ok",
  landscape = false,
  watermark,
  heroPills,
  body,
}: ShellOptions): string {
  const shop = settings?.name || "M.A PAINT HOUSE";
  const currency = settings?.currency || "Rs";
  const address = settings?.address || "Main Bazaar, Khuzdar, Balochistan";
  const phone = settings?.phone || "";
  const whatsapp = settings?.whatsapp || "";
  const footer = settings?.footer || "Thank you for your business.";
  const mark = initials(shop);
  const badgeClass = badgeTone === "danger" ? "badge danger" : badgeTone === "warn" ? "badge warn" : "badge ok";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} • ${esc(shop)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --navy:${BRAND.navy}; --navy2:${BRAND.navy2}; --teal:${BRAND.teal}; --teal2:${BRAND.teal2};
    --gold:${BRAND.gold}; --coral:${BRAND.coral}; --ink:${BRAND.ink}; --muted:${BRAND.muted};
    --line:${BRAND.line}; --soft:${BRAND.soft}; --accent:${accent}; --accent2:${accent2};
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#e9eef5;color:var(--ink);font-family:"Manrope",Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .toolbar{position:sticky;top:0;z-index:20;display:flex;gap:10px;justify-content:center;align-items:center;padding:14px;background:#0b1f3a;box-shadow:0 6px 24px #0b1f3a33}
  .toolbar button{border:0;border-radius:10px;padding:10px 16px;font:700 13px "Manrope",Arial,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:8px}
  .toolbar .primary{background:linear-gradient(135deg,var(--teal),var(--teal2));color:#fff}
  .toolbar .ghost{background:#ffffff1a;color:#fff;border:1px solid #ffffff33}
  .toolbar .hint{color:#c9d6e6;font-size:12px;margin-left:6px}
  .sheet{width:${landscape ? "297mm" : "210mm"};min-height:${landscape ? "210mm" : "297mm"};margin:26px auto 44px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 24px 70px #0b1f3a26;position:relative}
  .hero{position:relative;overflow:hidden;padding:30px 34px 26px;background:linear-gradient(125deg,var(--navy) 0%,var(--navy2) 58%,var(--accent) 140%);color:#fff}
  .hero:before,.hero:after{content:"";position:absolute;border-radius:50%;pointer-events:none}
  .hero:before{width:320px;height:320px;right:-110px;top:-180px;background:radial-gradient(circle,#ffffff2b,transparent 68%)}
  .hero:after{width:260px;height:260px;right:110px;bottom:-190px;background:radial-gradient(circle,${accent}55,transparent 70%)}
  .hero-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;position:relative;z-index:2}
  .brand{display:flex;gap:14px;align-items:center;min-width:0}
  .mark{width:58px;height:58px;border-radius:16px;background:linear-gradient(140deg,var(--accent2),var(--accent));display:grid;place-items:center;font-weight:800;font-size:20px;letter-spacing:.5px;box-shadow:0 12px 26px #0000003d;border:1px solid #ffffff2e;flex:none}
  .brand h1{margin:0;font-size:22px;letter-spacing:.4px;line-height:1.15}
  .brand p{margin:4px 0 0;color:#d7e3f2;font-size:11.5px;line-height:1.5}
  .doc-meta{text-align:right;flex:none}
  .doc-meta .kind{font-size:10.5px;letter-spacing:3px;text-transform:uppercase;color:#c9d9ec;font-weight:700}
  .doc-meta h2{margin:3px 0 6px;font-size:24px;letter-spacing:.4px}
  .doc-meta .no{font-size:13px;font-weight:700;color:#fff;background:#ffffff1c;border:1px solid #ffffff2e;border-radius:8px;padding:5px 10px;display:inline-block}
  .badge{display:inline-block;margin-top:8px;padding:5px 11px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.7px;text-transform:uppercase}
  .badge.ok{background:#d9f7ee;color:#08745f}
  .badge.warn{background:#fff0c7;color:#8a6100}
  .badge.danger{background:#ffe0dc;color:#a52c22}
  .hero-bottom{display:flex;gap:14px;flex-wrap:wrap;margin-top:24px;position:relative;z-index:2}
  .pill{display:flex;flex-direction:column;gap:2px;background:#ffffff12;border:1px solid #ffffff24;border-radius:11px;padding:10px 14px;min-width:140px;backdrop-filter:blur(4px)}
  .pill span{font-size:9.5px;text-transform:uppercase;letter-spacing:1.3px;color:#bcd0e6;font-weight:700}
  .pill b{font-size:13px;color:#fff;font-weight:700}
  .body{padding:28px 34px 26px}
  .info-grid{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:12px;margin-bottom:20px}
  .info{padding:14px 16px;border:1px solid var(--line);border-radius:13px;background:linear-gradient(180deg,#fff,var(--soft))}
  .info .label{font-size:9.5px;text-transform:uppercase;letter-spacing:1.3px;color:var(--muted);font-weight:800;margin-bottom:6px}
  .info .big{font-size:14.5px;font-weight:800;line-height:1.35}
  .info .sub{font-size:11.5px;color:var(--muted);margin-top:3px;line-height:1.45}
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:11.5px}
  .items thead th{background:var(--navy);color:#fff;text-align:left;padding:10px 11px;font-size:10px;letter-spacing:1.1px;text-transform:uppercase;font-weight:800}
  .items thead th:first-child{border-radius:10px 0 0 10px}
  .items thead th:last-child{border-radius:0 10px 10px 0;text-align:right}
  .items tbody td{padding:10px 11px;border-bottom:1px solid var(--line);vertical-align:top}
  .items tbody tr:nth-child(even) td{background:#fbfcfe}
  .items tbody td:first-child{font-weight:700}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .items tbody td.num{font-weight:600}
  .code{display:inline-block;margin-top:2px;font-size:10px;color:var(--muted);background:#eef2f7;border-radius:5px;padding:1px 5px;font-weight:600}
  .totals-wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;margin-top:18px;align-items:start}
  .words{font-size:11.5px;line-height:1.6;color:var(--ink)}
  .words .label{font-size:9.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-weight:800;margin-bottom:5px}
  .words b{color:var(--accent)}
  .totals{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}
  .totals .row{display:flex;justify-content:space-between;gap:18px;padding:9px 15px;font-size:11.5px;border-bottom:1px solid #eef2f7}
  .totals .row:last-child{border-bottom:0}
  .totals .row span{color:var(--muted);font-weight:600}
  .totals .row b{font-variant-numeric:tabular-nums;font-weight:700}
  .totals .net{background:linear-gradient(120deg,var(--navy),var(--navy2));color:#fff;padding:14px 15px}
  .totals .net span{color:#cddcef;font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:800}
  .totals .net b{color:#fff;font-size:19px;display:block;margin-top:2px}
  .totals .due{background:#fff7e6}
  .totals .due b{color:#a56a00}
  .totals .paid{background:#ecfdf7}
  .totals .paid b{color:#08745f}
  .note{margin-top:18px;padding:12px 15px;border-left:4px solid var(--accent);background:linear-gradient(90deg,#f4fbfa,#fff);border-radius:0 10px 10px 0;font-size:11.5px;color:#33465e;line-height:1.6}
  .note b{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);margin-bottom:3px}
  .sign-row{display:flex;justify-content:space-between;gap:30px;margin-top:38px;align-items:flex-end}
  .sign{width:190px;text-align:center;font-size:11px;color:var(--muted)}
  .sign .line{border-top:1.5px solid #a9b6c6;margin-bottom:6px;height:30px}
  .sign b{display:block;color:var(--ink);font-size:11.5px}
  .footer{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:16px;font-size:10px;color:var(--muted)}
  .footer .credit{font-weight:800;color:var(--accent)}
  .watermark{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:1}
  .watermark span{transform:rotate(-24deg);font-size:86px;font-weight:800;letter-spacing:10px;color:#c9414114;border:5px solid #c941411a;border-radius:18px;padding:10px 28px}
  .statement-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
  .stat{padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:linear-gradient(180deg,#fff,var(--soft))}
  .stat span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:1.1px;color:var(--muted);font-weight:800;margin-bottom:4px}
  .stat b{font-size:15px;font-variant-numeric:tabular-nums}
  .stat.teal b{color:var(--teal)}
  .stat.red b{color:var(--coral)}
  .stat.navy{background:linear-gradient(125deg,var(--navy),var(--navy2));border-color:transparent}
  .stat.navy span{color:#c6d6e9}
  .stat.navy b{color:#fff}
  .ledger thead th{background:#eef3fa;color:var(--navy);text-align:left;padding:9px 10px;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;font-weight:800;border-bottom:2px solid #dbe5f0}
  .ledger tbody td{padding:8px 10px;border-bottom:1px solid #edf1f6;font-size:11px;vertical-align:top}
  .ledger tbody tr:nth-child(even) td{background:#fafcff}
  .tag{display:inline-block;padding:2px 7px;border-radius:999px;background:#e8f6f2;color:#08745f;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
  .tag.debit{background:#fdeceb;color:#b33a2f}
  .tag.adjust{background:#fff4d6;color:#8a6100}
  .report-title{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;gap:20px}
  .report-title h3{margin:0;font-size:19px;color:var(--navy)}
  .report-title p{margin:4px 0 0;color:var(--muted);font-size:11.5px}
  .report-table thead th{background:linear-gradient(120deg,var(--accent),var(--accent2));color:#fff;padding:9px 10px;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;text-align:left;font-weight:800}
  .report-table tbody td{padding:8px 10px;border-bottom:1px solid #edf1f6;font-size:11px}
  .report-table tbody tr:nth-child(even) td{background:#fafcff}
  @media (max-width:900px){.sheet{width:100%;border-radius:0}.body{padding:20px}.hero{padding:22px}.info-grid{grid-template-columns:1fr}.totals-wrap{grid-template-columns:1fr}.statement-summary{grid-template-columns:repeat(2,1fr)}}
  @page{size:${landscape ? "A4 landscape" : "A4"};margin:0}
  @media print{
    html,body{background:#fff}
    .toolbar{display:none!important}
    .sheet{width:auto;min-height:auto;margin:0;border-radius:0;box-shadow:none}
    .hero,.totals .net,.report-table thead th,.items thead th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .body{padding:22px 24px}
    .info-grid{break-inside:avoid}
    tr,.totals,.note,.sign-row{break-inside:avoid}
  }
</style>
</head>
<body>
<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <button class="ghost" onclick="downloadReport()">⬇️ Download HTML</button>
  <button class="ghost" onclick="window.close()">✕ Close</button>
  <span class="hint">Tip: choose “Save as PDF” in the print dialog.</span>
</div>
<div class="sheet">
  ${watermark ? `<div class="watermark"><span>${esc(watermark)}</span></div>` : ""}
  <header class="hero">
    <div class="hero-top">
      <div class="brand">
        <div class="mark">${esc(mark)}</div>
        <div>
          <h1>${esc(shop)}</h1>
          <p>${esc(address)}${phone ? ` · ${esc(phone)}` : ""}${whatsapp && whatsapp !== phone ? ` · WhatsApp ${esc(whatsapp)}` : ""}</p>
        </div>
      </div>
      <div class="doc-meta">
        <div class="kind">${esc(subtitle)}</div>
        <h2>${esc(title)}</h2>
        ${badge ? `<div class="${badgeClass}">${esc(badge)}</div>` : ""}
      </div>
    </div>
    <div class="hero-bottom">${heroPills || ""}</div>
  </header>
  <main class="body">
    ${body}
    <div class="footer">
      <span>${esc(footer)} &nbsp;·&nbsp; Generated ${esc(new Date().toLocaleString("en-GB"))}</span>
      <span class="credit">Credit: Engr. Hamza Asad</span>
    </div>
  </main>
</div>
<script>
  function downloadReport(){
    var clone = document.documentElement.cloneNode(true);
    var bar = clone.querySelector('.toolbar');
    if (bar) bar.remove();
    var html = '<!doctype html>' + clone.outerHTML;
    var blob = new Blob([html], {type:'text/html;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ${JSON.stringify(safeFile(title) + ".html")};
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  window.addEventListener('load', function(){
    setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 700);
  });
</script>
</body>
</html>`;
}

function openDocument(html: string, filename: string) {
  const win = window.open("", "_blank");
  if (!win) {
    downloadHtml(html, filename);
    return;
  }
  win.opener = null;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFile(filename)}.html`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 400);
}

/* ------------------------------------------------------------------ */
/* Invoice                                                             */
/* ------------------------------------------------------------------ */

export function generateInvoicePDF(inv: any, settings: any, returnBlob = false): any {
  const currency = settings?.currency || "Rs";
  const due = Math.max(0, (inv.netPayable || 0) - (inv.paymentReceived || 0));
  const isCancelled = inv.status === "cancelled" || inv.status === "void";
  const statusTone = isCancelled ? "danger" : inv.status === "draft" ? "warn" : "ok";
  const statusLabel = isCancelled ? "Cancelled" : inv.status === "draft" ? "Draft" : due > 0 ? "Partially paid" : "Paid";

  const pills = `
    <div class="pill"><span>Invoice no.</span><b>${esc(inv.number)}</b></div>
    <div class="pill"><span>Invoice date</span><b>${esc(prettyDate(inv.date))}</b></div>
    <div class="pill"><span>Items</span><b>${(inv.items || []).length}</b></div>
    <div class="pill"><span>Amount due</span><b>${esc(money(due, currency))}</b></div>`;

  const rows = (inv.items || [])
    .map(
      (it: any, index: number) => `
      <tr>
        <td>${index + 1}. ${esc(it.productName)}${it.productCode ? `<br><span class="code">${esc(it.productCode)}</span>` : ""}</td>
        <td>${esc(it.unit || "—")}</td>
        <td class="num">${esc(it.qty)}</td>
        <td class="num">${esc(money(it.unitPrice, currency))}</td>
        <td class="num">${esc(money(it.lineTotal, currency))}</td>
      </tr>`
    )
    .join("");

  const body = `
    <div class="info-grid">
      <div class="info">
        <div class="label">Bill to</div>
        <div class="big">${esc(inv.customerName)}</div>
        <div class="sub">Customer account${inv.previousBalance ? ` · Previous balance ${esc(money(inv.previousBalance, currency))}` : ""}</div>
      </div>
      <div class="info">
        <div class="label">Invoice details</div>
        <div class="big">${esc(inv.number)}</div>
        <div class="sub">Issued ${esc(prettyDate(inv.date))}<br>Status: ${esc(statusLabel)}</div>
      </div>
      <div class="info">
        <div class="label">Payment summary</div>
        <div class="big">${esc(money(inv.paymentReceived || 0, currency))} received</div>
        <div class="sub">${due > 0 ? `${esc(money(due, currency))} balance due` : "Account settled in full"}</div>
      </div>
    </div>

    <table class="items">
      <thead><tr><th style="width:44%">Item / description</th><th>Unit</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#66758a;padding:22px">No items on this invoice</td></tr>`}</tbody>
    </table>

    <div class="totals-wrap">
      <div class="words">
        <div class="label">Amount in words</div>
        <b>${esc(amountInWords(inv.netPayable || 0, currency === "Rs" ? "Rupees" : currency))}</b>
        ${inv.notes ? `<div class="note" style="margin-top:14px"><b>Notes</b>${esc(inv.notes)}</div>` : ""}
      </div>
      <div class="totals">
        <div class="row"><span>Subtotal</span><b>${esc(money(inv.subtotal, currency))}</b></div>
        <div class="row"><span>Discount (${esc(inv.discountPercent || 0)}%)</span><b>− ${esc(money(inv.discountAmount, currency))}</b></div>
        <div class="row"><span>Net payable</span><b>${esc(money(inv.netPayable, currency))}</b></div>
        <div class="row paid"><span>Payment received</span><b>${esc(money(inv.paymentReceived || 0, currency))}</b></div>
        <div class="row ${due > 0 ? "due" : "paid"}"><span>Balance due</span><b>${esc(money(due, currency))}</b></div>
        <div class="net"><span>Total payable</span><b>${esc(money(inv.netPayable, currency))}</b></div>
      </div>
    </div>

    <div class="sign-row">
      <div class="sign"><div class="line"></div><b>Customer signature</b>Received goods in good condition</div>
      <div class="sign"><div class="line"></div><b>Authorised signature</b>For ${esc(settings?.name || "M.A Paint House")}</div>
    </div>`;

  const html = shell({
    title: "Invoice",
    subtitle: "Sales invoice",
    accent: BRAND.teal,
    accent2: BRAND.teal2,
    settings,
    badge: statusLabel,
    badgeTone: statusTone as any,
    watermark: isCancelled ? "CANCELLED" : inv.status === "draft" ? "DRAFT" : undefined,
    heroPills: pills,
    body,
  });

  if (returnBlob) return new Blob([html], { type: "text/html;charset=utf-8" });
  openDocument(html, `${inv.number || "invoice"}.html`);
  return null;
}

/** Opens the invoice HTML in a new tab and triggers the browser print dialog. */
export function printInvoiceHtml(inv: any, settings: any) {
  const blob = generateInvoicePDF(inv, settings, true) as Blob;
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.onload = () => { win.focus(); win.print(); };
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ------------------------------------------------------------------ */
/* Payment receipt                                                     */
/* ------------------------------------------------------------------ */

export function generateReceiptPDF(pay: any, settings: any) {
  const currency = settings?.currency || "Rs";
  const body = `
    <div class="info-grid">
      <div class="info">
        <div class="label">Received from</div>
        <div class="big">${esc(pay.customerName)}</div>
        <div class="sub">Customer payment${pay.reference ? ` · Ref ${esc(pay.reference)}` : ""}</div>
      </div>
      <div class="info">
        <div class="label">Receipt details</div>
        <div class="big">${esc(pay.receiptNumber)}</div>
        <div class="sub">${esc(prettyDate(pay.date))}<br>Method: ${esc(pay.method || "Cash")}</div>
      </div>
      <div class="info">
        <div class="label">Amount received</div>
        <div class="big" style="color:${BRAND.teal};font-size:20px">${esc(money(pay.amount, currency))}</div>
        <div class="sub">${esc(amountInWords(pay.amount || 0, currency === "Rs" ? "Rupees" : currency))}</div>
      </div>
    </div>

    <table class="items">
      <thead><tr><th>Description</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
      <tbody>
        <tr>
          <td>Payment received${pay.notes ? `<br><span class="code">${esc(pay.notes)}</span>` : ""}</td>
          <td>${esc(pay.method || "Cash")}</td>
          <td>${esc(pay.reference || "—")}</td>
          <td class="num" style="font-size:14px">${esc(money(pay.amount, currency))}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals-wrap">
      <div class="words">
        <div class="label">Amount in words</div>
        <b>${esc(amountInWords(pay.amount || 0, currency === "Rs" ? "Rupees" : currency))}</b>
        <div class="note" style="margin-top:14px"><b>Thank you</b>This receipt is issued as proof of payment. Please retain it for your records.</div>
      </div>
      <div class="totals">
        <div class="row"><span>Payment method</span><b>${esc(pay.method || "Cash")}</b></div>
        <div class="row"><span>Reference</span><b>${esc(pay.reference || "—")}</b></div>
        <div class="net"><span>Total received</span><b>${esc(money(pay.amount, currency))}</b></div>
      </div>
    </div>

    <div class="sign-row">
      <div class="sign"><div class="line"></div><b>Received by</b>${esc(settings?.name || "M.A Paint House")}</div>
      <div class="sign"><div class="line"></div><b>Authorised signature</b>Official receipt</div>
    </div>`;

  const html = shell({
    title: "Payment Receipt",
    subtitle: "Official receipt",
    accent: BRAND.teal,
    accent2: "#34d399",
    settings,
    badge: "Paid",
    badgeTone: "ok",
    body,
  });
  openDocument(html, `${pay.receiptNumber || "receipt"}.html`);
}

/* ------------------------------------------------------------------ */
/* Customer statement                                                  */
/* ------------------------------------------------------------------ */

export function generateStatementPDF(customer: any, entries: any[], settings: any) {
  const currency = settings?.currency || "Rs";
  const debits = entries.reduce((s, e) => s + (e.debit || 0), 0);
  const credits = entries.reduce((s, e) => s + (e.credit || 0), 0);
  const closing = entries.length ? entries[entries.length - 1].balance : customer?.openingBalance || 0;

  const rows = entries
    .map((e) => {
      const tone = e.type === "payment" ? "" : e.type === "adjustment" ? "adjust" : "debit";
      return `<tr>
        <td>${esc(prettyDate(e.date))}</td>
        <td><span class="tag ${tone}">${esc(e.type)}</span></td>
        <td>${esc(e.reference || "—")}</td>
        <td>${esc(e.description || "—")}</td>
        <td class="num">${e.debit ? esc(money(e.debit, currency)) : "—"}</td>
        <td class="num" style="color:${BRAND.teal}">${e.credit ? esc(money(e.credit, currency)) : "—"}</td>
        <td class="num"><b>${esc(money(e.balance, currency))}</b></td>
      </tr>`;
    })
    .join("");

  const body = `
    <div class="report-title">
      <div>
        <h3>Account statement — ${esc(customer.name)}</h3>
        <p>${esc(customer.phone || "")}${customer.city ? ` · ${esc(customer.city)}` : ""}${customer.address ? ` · ${esc(customer.address)}` : ""}</p>
      </div>
      <div style="text-align:right">
        <div class="label" style="font-size:9.5px;letter-spacing:1.1px;color:var(--muted);font-weight:800">Statement date</div>
        <b>${esc(prettyDate(new Date().toISOString()))}</b>
      </div>
    </div>

    <div class="statement-summary">
      <div class="stat"><span>Opening balance</span><b>${esc(money(customer.openingBalance || 0, currency))}</b></div>
      <div class="stat red"><span>Total debits</span><b>${esc(money(debits, currency))}</b></div>
      <div class="stat teal"><span>Total credits</span><b>${esc(money(credits, currency))}</b></div>
      <div class="stat navy"><span>Closing balance</span><b>${esc(money(closing, currency))}</b></div>
    </div>

    <table class="ledger">
      <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" style="text-align:center;color:#66758a;padding:22px">No transactions in this statement</td></tr>`}</tbody>
    </table>

    <div class="note" style="margin-top:16px">
      <b>Statement summary</b>
      Closing balance of <b style="display:inline;text-transform:none;letter-spacing:0;color:${BRAND.teal};font-size:11.5px">${esc(money(closing, currency))}</b>
      is payable as per the ledger above. Please contact us if you believe any entry is incorrect.
    </div>

    <div class="sign-row">
      <div class="sign"><div class="line"></div><b>Prepared by</b>${esc(settings?.name || "M.A Paint House")}</div>
      <div class="sign"><div class="line"></div><b>Authorised signature</b>Accounts department</div>
    </div>`;

  const html = shell({
    title: "Account Statement",
    subtitle: "Customer ledger",
    accent: "#3b6fd4",
    accent2: "#6aa7ff",
    settings,
    badge: "Statement",
    badgeTone: "ok",
    body,
  });
  openDocument(html, `statement-${customer.name}.html`);
}

/* ------------------------------------------------------------------ */
/* Generic report                                                      */
/* ------------------------------------------------------------------ */

export function generateReportPDF(title: string, rows: any[], headers: string[], settings: any) {
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell: any, i: number) => `<td class="${i === 0 ? "" : "num"}">${esc(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");

  const body = `
    <div class="report-title">
      <div>
        <h3>${esc(title)}</h3>
        <p>${rows.length} row${rows.length === 1 ? "" : "s"} · prepared ${esc(prettyDate(new Date().toISOString()))}</p>
      </div>
      <div style="text-align:right;font-size:11px;color:var(--muted)">
        <b style="color:var(--navy);font-size:13px">${esc(settings?.name || "M.A Paint House")}</b><br>
        ${esc(settings?.address || "")}
      </div>
    </div>

    <table class="report-table">
      <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${bodyRows || `<tr><td colspan="${headers.length}" style="text-align:center;color:#66758a;padding:22px">No data for this period</td></tr>`}</tbody>
    </table>

    <div class="sign-row">
      <div class="sign"><div class="line"></div><b>Prepared by</b>${esc(settings?.name || "M.A Paint House")}</div>
      <div class="sign"><div class="line"></div><b>Authorised signature</b>Management</div>
    </div>`;

  const html = shell({
    title,
    subtitle: "Business report",
    accent: BRAND.gold,
    accent2: "#f0c95c",
    settings,
    badge: "Report",
    badgeTone: "ok",
    landscape: true,
    body,
  });
  openDocument(html, `${title}.html`);
}
