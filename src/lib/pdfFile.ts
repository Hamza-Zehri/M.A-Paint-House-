// Real PDF documents (jsPDF) used for WhatsApp sharing and downloads.
//
// The older HTML report engine remains available for on-screen print previews,
// but sharing now produces a genuine application/pdf file that can be attached
// to WhatsApp on devices that support the Web Share API.

import { jsPDF } from "jspdf";
import { formatMoney } from "./money";
import { amountInWords } from "./pdf";

type RGB = [number, number, number];

const NAVY: RGB = [11, 31, 58];
const NAVY_SOFT: RGB = [30, 60, 95];
const TEAL: RGB = [13, 148, 136];
const TEAL2: RGB = [20, 184, 166];
const GOLD: RGB = [201, 162, 39];
const CORAL: RGB = [232, 93, 74];
const INK: RGB = [22, 35, 58];
const MUTED: RGB = [102, 117, 138];
const LINE: RGB = [227, 233, 241];
const SOFT: RGB = [248, 250, 253];
const WHITE: RGB = [255, 255, 255];
const PALE: RGB = [205, 220, 239];

const PAGE_MARGIN = 40;

const fill = (doc: jsPDF, colour: RGB) => doc.setFillColor(colour[0], colour[1], colour[2]);
const stroke = (doc: jsPDF, colour: RGB) => doc.setDrawColor(colour[0], colour[1], colour[2]);
const ink = (doc: jsPDF, colour: RGB) => doc.setTextColor(colour[0], colour[1], colour[2]);

const money = (paisa: number, currency = "Rs") => formatMoney(Number(paisa) || 0, currency);

const prettyDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "MA";

const safe = (value: string) => value.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

interface TextOptions {
  size?: number;
  bold?: boolean;
  colour?: RGB;
  align?: "left" | "right" | "center";
  maxWidth?: number;
}

function text(doc: jsPDF, value: unknown, x: number, y: number, options: TextOptions = {}): number {
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setFontSize(options.size ?? 9);
  ink(doc, options.colour ?? INK);
  const raw = String(value ?? "");
  if (options.maxWidth) {
    const lines = doc.splitTextToSize(raw, options.maxWidth);
    doc.text(lines, x, y, { align: options.align ?? "left" });
    return lines.length;
  }
  doc.text(raw, x, y, { align: options.align ?? "left" });
  return 1;
}

function pageWidth(doc: jsPDF) {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc: jsPDF) {
  return doc.internal.pageSize.getHeight();
}

function divider(doc: jsPDF, x1: number, y: number, x2: number, colour: RGB = LINE, width = 0.7) {
  stroke(doc, colour);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

interface HeaderOptions {
  kind: string;
  title: string;
  reference?: string;
  pills: [string, string][];
}

function drawHeader(doc: jsPDF, settings: any, options: HeaderOptions): number {
  const W = pageWidth(doc);
  const shop = settings?.name || "M.A PAINT HOUSE";
  const address = settings?.address || "Main Bazaar, Khuzdar, Balochistan";
  const phone = settings?.phone || "";
  const whatsapp = settings?.whatsapp || "";

  fill(doc, NAVY);
  doc.rect(0, 0, W, 160, "F");
  fill(doc, [17, 45, 82]);
  doc.circle(W - 18, 0, 118, "F");
  fill(doc, [20, 59, 107]);
  doc.circle(W - 132, 154, 80, "F");

  // Brand mark
  fill(doc, TEAL);
  doc.roundedRect(PAGE_MARGIN, 26, 48, 48, 13, 13, "F");
  stroke(doc, [255, 255, 255]);
  doc.setLineWidth(1);
  doc.circle(PAGE_MARGIN + 24, 50, 15, "S");
  text(doc, initials(shop), PAGE_MARGIN + 24, 55, { size: 14, bold: true, colour: WHITE, align: "center" });

  text(doc, shop, PAGE_MARGIN + 62, 44, { size: 15, bold: true, colour: WHITE });
  text(doc, address, PAGE_MARGIN + 62, 58, { size: 7.8, colour: PALE, maxWidth: W - PAGE_MARGIN - 300 });
  const contact = [phone && `Phone ${phone}`, whatsapp && whatsapp !== phone ? `WhatsApp ${whatsapp}` : ""].filter(Boolean).join("  ·  ");
  if (contact) text(doc, contact, PAGE_MARGIN + 62, 70, { size: 7.4, colour: PALE, maxWidth: W - PAGE_MARGIN - 300 });

  // Document title on the right
  text(doc, options.kind.toUpperCase(), W - PAGE_MARGIN, 33, { size: 8, bold: true, colour: [169, 197, 225], align: "right" });
  text(doc, options.title, W - PAGE_MARGIN, 56, { size: 22, bold: true, colour: WHITE, align: "right" });
  if (options.reference) {
    const badgeW = 142;
    const badgeX = W - PAGE_MARGIN - badgeW;
    fill(doc, NAVY_SOFT);
    doc.roundedRect(badgeX, 66, badgeW, 22, 7, 7, "F");
    text(doc, options.reference, badgeX + badgeW / 2, 81, { size: 9.4, bold: true, colour: WHITE, align: "center" });
  }

  // Colour strip — a nod to the paint shop palette.
  const palette: RGB[] = [CORAL, GOLD, TEAL2, [74, 143, 231], [155, 108, 242]];
  const segment = (W - PAGE_MARGIN * 2) / palette.length;
  palette.forEach((colour, index) => {
    fill(doc, colour);
    doc.rect(PAGE_MARGIN + index * segment, 154, segment, 6, "F");
  });

  // Hero pills
  const pills = options.pills.slice(0, 4);
  const gap = 8;
  const pillW = (W - PAGE_MARGIN * 2 - gap * (pills.length - 1)) / pills.length;
  pills.forEach(([label, value], index) => {
    const x = PAGE_MARGIN + index * (pillW + gap);
    fill(doc, NAVY_SOFT);
    doc.roundedRect(x, 100, pillW, 40, 8, 8, "F");
    text(doc, label.toUpperCase(), x + 10, 115, { size: 6.6, bold: true, colour: [176, 200, 224] });
    text(doc, value, x + 10, 130, { size: 9.4, bold: true, colour: WHITE, maxWidth: pillW - 20 });
  });

  return 178;
}

function drawInfoCards(doc: jsPDF, y: number, cards: { label: string; big: string; sub?: string }[]): number {
  const W = pageWidth(doc);
  const gap = 10;
  const available = W - PAGE_MARGIN * 2 - gap * (cards.length - 1);
  const ratios = cards.length === 3 ? [0.42, 0.29, 0.29] : cards.map(() => 1 / cards.length);
  let x = PAGE_MARGIN;

  cards.forEach((card, index) => {
    const width = available * (ratios[index] ?? 1 / cards.length);
    fill(doc, SOFT);
    stroke(doc, LINE);
    doc.setLineWidth(0.7);
    doc.roundedRect(x, y, width, 66, 10, 10, "FD");
    text(doc, card.label.toUpperCase(), x + 12, y + 17, { size: 6.6, bold: true, colour: MUTED });
    text(doc, card.big, x + 12, y + 32, { size: 10.2, bold: true, colour: INK, maxWidth: width - 24 });
    if (card.sub) text(doc, card.sub, x + 12, y + 47, { size: 7.4, colour: MUTED, maxWidth: width - 24 });
    x += width + gap;
  });

  return y + 66;
}

function newPage(doc: jsPDF, settings: any): number {
  doc.addPage();
  const W = pageWidth(doc);
  fill(doc, NAVY);
  doc.rect(0, 0, W, 62, "F");
  text(doc, settings?.name || "M.A PAINT HOUSE", PAGE_MARGIN, 27, { size: 11, bold: true, colour: WHITE });
  text(doc, "Document continued", W - PAGE_MARGIN, 27, { size: 8, colour: PALE, align: "right" });
  fill(doc, TEAL);
  doc.rect(PAGE_MARGIN, 56, W - PAGE_MARGIN * 2, 4, "F");
  return 84;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, settings: any): number {
  if (y + needed > pageHeight(doc) - 66) {
    return newPage(doc, settings);
  }
  return y;
}

function drawInvoiceItems(doc: jsPDF, y: number, items: any[], currency: string, settings: any): number {
  const W = pageWidth(doc);
  const H = pageHeight(doc);
  const descX = 48;
  const descW = 214;
  const unitX = 280;
  const qtyX = 382;
  const rateX = 470;
  const amountX = W - 48;

  const heading = () => {
    fill(doc, NAVY);
    doc.roundedRect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 22, 6, 6, "F");
    text(doc, "ITEM / DESCRIPTION", descX, y + 14, { size: 6.8, bold: true, colour: WHITE });
    text(doc, "UNIT", unitX, y + 14, { size: 6.8, bold: true, colour: WHITE });
    text(doc, "QTY", qtyX, y + 14, { size: 6.8, bold: true, colour: WHITE, align: "right" });
    text(doc, "RATE", rateX, y + 14, { size: 6.8, bold: true, colour: WHITE, align: "right" });
    text(doc, "AMOUNT", amountX, y + 14, { size: 6.8, bold: true, colour: WHITE, align: "right" });
    y += 22;
  };

  heading();

  if (!items.length) {
    text(doc, "No items on this invoice", W / 2, y + 24, { size: 8.5, colour: MUTED, align: "center" });
    return y + 36;
  }

  items.forEach((item, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    const nameLines = doc.splitTextToSize(String(item.productName || ""), descW);
    const codeLines = item.productCode ? doc.splitTextToSize(String(item.productCode), descW) : [];
    const rowHeight = Math.max(24, 13 + nameLines.length * 9.4 + (codeLines.length ? 8.5 : 0));

    if (y + rowHeight > H - 70) {
      y = newPage(doc, settings);
      heading();
    }

    if (index % 2 === 0) {
      fill(doc, [250, 252, 255]);
      doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, rowHeight, "F");
    }

    ink(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text(nameLines, descX, y + 12);

    let subY = y + 12 + nameLines.length * 9.4;
    if (codeLines.length) {
      ink(doc, MUTED);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(codeLines, descX, subY);
    }

    text(doc, item.unit || "—", unitX, y + 12, { size: 8 });
    text(doc, item.qty, qtyX, y + 12, { size: 8, align: "right" });
    text(doc, money(item.unitPrice, currency), rateX, y + 12, { size: 8, align: "right" });
    text(doc, money(item.lineTotal, currency), amountX, y + 12, { size: 8.4, bold: true, align: "right" });

    divider(doc, PAGE_MARGIN, y + rowHeight, W - PAGE_MARGIN, LINE, 0.5);
    y += rowHeight;
  });

  return y + 10;
}

interface TotalsOptions {
  wordsLabel: string;
  words: string;
  rows: [string, string, RGB?][];
  netLabel: string;
  netValue: string;
  note?: string;
}

function drawTotals(doc: jsPDF, y: number, options: TotalsOptions, settings: any): number {
  const W = pageWidth(doc);
  const H = pageHeight(doc);
  const boxW = 210;
  const boxX = W - PAGE_MARGIN - boxW;
  const leftW = boxX - PAGE_MARGIN - 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  const wordLines = doc.splitTextToSize(options.words, leftW);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  const noteLines = options.note ? doc.splitTextToSize(options.note, leftW) : [];

  const leftHeight = 18 + wordLines.length * 10.5 + (options.note ? 16 + noteLines.length * 9 : 0);
  const boxHeight = options.rows.length * 20 + 40;
  const needed = Math.max(leftHeight, boxHeight);

  if (y + needed > H - 82) {
    y = newPage(doc, settings);
  }

  // Amount in words
  text(doc, options.wordsLabel.toUpperCase(), PAGE_MARGIN, y + 8, { size: 6.8, bold: true, colour: MUTED });
  text(doc, options.words, PAGE_MARGIN, y + 22, { size: 8.4, bold: true, colour: TEAL, maxWidth: leftW });
  if (options.note) {
    const noteY = y + 22 + wordLines.length * 10.5 + 12;
    text(doc, "NOTES", PAGE_MARGIN, noteY, { size: 6.5, bold: true, colour: MUTED });
    text(doc, options.note, PAGE_MARGIN, noteY + 10, { size: 7.2, colour: [51, 70, 94], maxWidth: leftW });
  }

  // Totals card
  fill(doc, WHITE);
  stroke(doc, LINE);
  doc.setLineWidth(0.7);
  doc.roundedRect(boxX, y, boxW, boxHeight, 10, 10, "FD");

  let rowY = y;
  options.rows.forEach(([label, value, colour], index) => {
    text(doc, label, boxX + 14, rowY + 13.5, { size: 7.5, colour: MUTED });
    text(doc, value, boxX + boxW - 14, rowY + 13.5, { size: 8.2, bold: true, colour: colour ?? INK, align: "right" });
    rowY += 20;
    if (index < options.rows.length - 1) divider(doc, boxX + 14, rowY, boxX + boxW - 14, [238, 242, 247], 0.5);
  });

  // Net total band
  const netY = y + options.rows.length * 20;
  const netH = boxHeight - options.rows.length * 20;
  fill(doc, NAVY);
  doc.roundedRect(boxX, netY, boxW, netH, 8, 8, "F");
  text(doc, options.netLabel.toUpperCase(), boxX + 14, netY + 14, { size: 6.6, bold: true, colour: [195, 213, 235] });
  text(doc, options.netValue, boxX + boxW - 14, netY + 28, { size: 14, bold: true, colour: WHITE, align: "right" });

  return Math.max(y + leftHeight, y + boxHeight);
}

function drawSignatures(doc: jsPDF, y: number, settings: any): number {
  const W = pageWidth(doc);
  const H = pageHeight(doc);
  if (y + 78 > H - 58) {
    y = newPage(doc, settings);
  }

  const gap = 30;
  const width = (W - PAGE_MARGIN * 2 - gap * 2) / 3;

  for (let index = 0; index < 3; index += 1) {
    const x = PAGE_MARGIN + index * (width + gap);
    divider(doc, x, y + 28, x + width, [169, 182, 198], 1);
    const labels = ["Prepared by", "Authorised signature", "Customer signature"];
    const subs = [settings?.name || "M.A Paint House", "For M.A Paint House", "Received goods in good condition"];
    text(doc, labels[index], x + width / 2, y + 40, { size: 7.4, bold: true, colour: INK, align: "center" });
    text(doc, subs[index], x + width / 2, y + 51, { size: 6.6, colour: MUTED, align: "center" });
  }

  return y + 62;
}

function drawFooter(doc: jsPDF, settings: any) {
  const W = pageWidth(doc);
  const H = pageHeight(doc);
  divider(doc, PAGE_MARGIN, H - 44, W - PAGE_MARGIN, LINE, 0.8);
  text(doc, settings?.footer || "Thank you for your business.", PAGE_MARGIN, H - 30, {
    size: 7.2,
    colour: MUTED,
    maxWidth: W - PAGE_MARGIN * 2 - 180,
  });
  text(doc, "Credit: Engr. Hamza Asad", W - PAGE_MARGIN, H - 30, {
    size: 7.4,
    bold: true,
    colour: TEAL,
    align: "right",
  });
}

/* ------------------------------------------------------------------ */
/* Invoice                                                             */
/* ------------------------------------------------------------------ */

export function invoicePdfBlob(invoice: any, settings: any, customer?: any, paidOverride?: number): Blob {
  const currency = settings?.currency || "Rs";
  const paid = paidOverride !== undefined ? paidOverride : Number(invoice.paymentReceived) || 0;
  const due = Math.max(0, (Number(invoice.netPayable) || 0) - paid);
  const cancelled = invoice.status === "cancelled" || invoice.status === "void";
  const status = cancelled
    ? "Cancelled"
    : invoice.status === "draft"
      ? "Draft"
      : due > 0
        ? "Partially paid"
        : "Paid";
  const shop = settings?.name || "M.A Paint House";

  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = drawHeader(doc, settings, {
    kind: "Sales invoice",
    title: "Invoice",
    reference: invoice.number || "Invoice",
    pills: [
      ["Invoice no.", invoice.number || "—"],
      ["Invoice date", prettyDate(invoice.date)],
      ["Items", String((invoice.items || []).length)],
      ["Status", status],
    ],
  });

  y = drawInfoCards(doc, y + 16, [
    {
      label: "Bill to",
      big: invoice.customerName || customer?.name || "Customer",
      sub: [customer?.phone, customer?.city, customer?.address].filter(Boolean).join(" · ") || "Customer account",
    },
    {
      label: "Invoice details",
      big: invoice.number || "—",
      sub: `Issued ${prettyDate(invoice.date)} · ${status}`,
    },
    {
      label: "Payment summary",
      big: `${money(paid, currency)} received`,
      sub: due > 0 ? `${money(due, currency)} balance due` : "Account settled in full",
    },
  ]);

  y = drawInvoiceItems(doc, y + 18, invoice.items || [], currency, settings);
  y = drawTotals(
    doc,
    y + 6,
    {
      wordsLabel: "Amount in words",
      words: amountInWords(Number(invoice.netPayable) || 0, currency === "Rs" ? "Rupees" : currency),
      rows: [
        ["Subtotal", money(invoice.subtotal, currency)],
        [`Discount (${invoice.discountPercent || 0}%)`, `− ${money(invoice.discountAmount, currency)}`],
        ["Net payable", money(invoice.netPayable, currency)],
        ["Payment received", money(paid, currency), TEAL],
        ["Balance due", money(due, currency), due > 0 ? CORAL : TEAL],
      ],
      netLabel: "Total payable",
      netValue: money(invoice.netPayable, currency),
      note: invoice.notes || undefined,
    },
    settings,
  );

  y = drawSignatures(doc, y + 18, settings);

  // Stamp cancelled/draft invoices.
  if (cancelled || invoice.status === "draft") {
    const W = pageWidth(doc);
    const H = pageHeight(doc);
    ink(doc, [245, 205, 201]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.text(cancelled ? "CANCELLED" : "DRAFT", W / 2, H / 2, { align: "center", angle: 24 });
  }

  // Keep the credit on every page.
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, settings);
    ink(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const W = pageWidth(doc);
    doc.text(`${shop} · ${invoice.number || "Invoice"} · Page ${page} of ${totalPages}`, W / 2, pageHeight(doc) - 14, { align: "center" });
  }

  return doc.output("blob");
}

/* ------------------------------------------------------------------ */
/* Payment receipt                                                     */
/* ------------------------------------------------------------------ */

export function receiptPdfBlob(payment: any, settings: any, customer?: any): Blob {
  const currency = settings?.currency || "Rs";
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  let y = drawHeader(doc, settings, {
    kind: "Official receipt",
    title: "Payment Receipt",
    reference: payment.receiptNumber || "Receipt",
    pills: [
      ["Receipt no.", payment.receiptNumber || "—"],
      ["Date", prettyDate(payment.date)],
      ["Method", payment.method || "Cash"],
      ["Amount", money(payment.amount, currency)],
    ],
  });

  y = drawInfoCards(doc, y + 16, [
    {
      label: "Received from",
      big: payment.customerName || customer?.name || "Customer",
      sub: [customer?.phone, customer?.city].filter(Boolean).join(" · ") || "Customer account",
    },
    {
      label: "Receipt details",
      big: payment.receiptNumber || "—",
      sub: `${prettyDate(payment.date)} · ${payment.method || "Cash"}`,
    },
    {
      label: "Amount received",
      big: money(payment.amount, currency),
      sub: amountInWords(Number(payment.amount) || 0, currency === "Rs" ? "Rupees" : currency),
    },
  ]);

  // Single-line payment table
  fill(doc, NAVY);
  doc.roundedRect(PAGE_MARGIN, y + 18, pageWidth(doc) - PAGE_MARGIN * 2, 22, 6, 6, "F");
  text(doc, "DESCRIPTION", 48, y + 32, { size: 6.8, bold: true, colour: WHITE });
  text(doc, "METHOD", 340, y + 32, { size: 6.8, bold: true, colour: WHITE });
  text(doc, "REFERENCE", 430, y + 32, { size: 6.8, bold: true, colour: WHITE });
  text(doc, "AMOUNT", pageWidth(doc) - 48, y + 32, { size: 6.8, bold: true, colour: WHITE, align: "right" });
  y += 40;

  fill(doc, [250, 252, 255]);
  doc.rect(PAGE_MARGIN, y, pageWidth(doc) - PAGE_MARGIN * 2, 36, "F");
  text(doc, `Payment received${payment.notes ? ` — ${payment.notes}` : ""}`, 48, y + 15, { size: 8.4, bold: true, maxWidth: 270 });
  text(doc, payment.method || "Cash", 340, y + 15, { size: 8.2 });
  text(doc, payment.reference || "—", 430, y + 15, { size: 8.2, maxWidth: 80 });
  text(doc, money(payment.amount, currency), pageWidth(doc) - 48, y + 15, { size: 9, bold: true, align: "right" });
  divider(doc, PAGE_MARGIN, y + 36, pageWidth(doc) - PAGE_MARGIN, LINE, 0.5);
  y += 46;

  y = drawTotals(
    doc,
    y,
    {
      wordsLabel: "Amount in words",
      words: amountInWords(Number(payment.amount) || 0, currency === "Rs" ? "Rupees" : currency),
      rows: [
        ["Payment method", payment.method || "Cash"],
        ["Reference", payment.reference || "—"],
      ],
      netLabel: "Total received",
      netValue: money(payment.amount, currency),
      note: "This receipt is issued as proof of payment. Please retain it for your records.",
    },
    settings,
  );

  drawSignatures(doc, y + 20, settings);
  drawFooter(doc, settings);

  ink(doc, MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.text(
    `${settings?.name || "M.A Paint House"} · ${payment.receiptNumber || "Receipt"} · Credit: Engr. Hamza Asad`,
    pageWidth(doc) / 2,
    pageHeight(doc) - 14,
    { align: "center" },
  );

  return doc.output("blob");
}

/* ------------------------------------------------------------------ */
/* Customer statement                                                  */
/* ------------------------------------------------------------------ */

function drawStats(doc: jsPDF, y: number, stats: [string, string, RGB][]): number {
  const W = pageWidth(doc);
  const gap = 8;
  const width = (W - PAGE_MARGIN * 2 - gap * (stats.length - 1)) / stats.length;
  stats.forEach(([label, value, colour], index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    fill(doc, SOFT);
    stroke(doc, LINE);
    doc.setLineWidth(0.7);
    doc.roundedRect(x, y, width, 48, 9, 9, "FD");
    text(doc, label.toUpperCase(), x + 10, y + 14, { size: 6.3, bold: true, colour: MUTED });
    text(doc, value, x + 10, y + 32, { size: 11, bold: true, colour: colour, maxWidth: width - 20 });
  });
  return y + 48;
}

export function statementPdfBlob(customer: any, entries: any[], settings: any): Blob {
  const currency = settings?.currency || "Rs";
  const sorted = [...entries].sort(
    (a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
  );
  const debits = sorted.reduce((sum, entry) => sum + (Number(entry.debit) || 0), 0);
  const credits = sorted.reduce((sum, entry) => sum + (Number(entry.credit) || 0), 0);
  const closing = sorted.length ? Number(sorted[sorted.length - 1].balance) || 0 : Number(customer?.openingBalance) || 0;
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

  let y = drawHeader(doc, settings, {
    kind: "Customer ledger",
    title: "Account Statement",
    reference: customer?.name || "Statement",
    pills: [
      ["Statement date", prettyDate(new Date().toISOString())],
      ["Entries", String(sorted.length)],
      ["Total debit", money(debits, currency)],
      ["Closing balance", money(closing, currency)],
    ],
  });

  y = drawInfoCards(doc, y + 16, [
    {
      label: "Customer",
      big: customer?.name || "Customer",
      sub: [customer?.phone, customer?.city, customer?.address].filter(Boolean).join(" · ") || "Customer account",
    },
    {
      label: "Statement period",
      big: sorted.length ? `${prettyDate(sorted[0].date)} — ${prettyDate(sorted[sorted.length - 1].date)}` : "No entries",
      sub: `${sorted.length} ledger entries`,
    },
    {
      label: "Credit terms",
      big: `${customer?.discount ?? 0}% customer discount`,
      sub: "Closing balance is payable as per the ledger.",
    },
  ]);

  y = drawStats(doc, y + 16, [
    ["Opening balance", money(customer?.openingBalance || 0, currency), INK],
    ["Total debits", money(debits, currency), CORAL],
    ["Total credits", money(credits, currency), TEAL],
    ["Closing balance", money(closing, currency), NAVY],
  ]);

  y += 18;

  const W = pageWidth(doc);
  const H = pageHeight(doc);
  const columns = [
    { label: "DATE", x: 48, align: "left" as const },
    { label: "TYPE", x: 105, align: "left" as const },
    { label: "REFERENCE", x: 168, align: "left" as const },
    { label: "DESCRIPTION", x: 250, align: "left" as const },
    { label: "DEBIT", x: 420, align: "right" as const },
    { label: "CREDIT", x: 488, align: "right" as const },
    { label: "BALANCE", x: W - 48, align: "right" as const },
  ];

  const heading = () => {
    fill(doc, NAVY);
    doc.roundedRect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 22, 6, 6, "F");
    columns.forEach((column) => {
      text(doc, column.label, column.x, y + 14, { size: 6.5, bold: true, colour: WHITE, align: column.align });
    });
    y += 22;
  };

  heading();

  if (!sorted.length) {
    text(doc, "No transactions in this statement", W / 2, y + 24, { size: 8.5, colour: MUTED, align: "center" });
    y += 36;
  }

  sorted.forEach((entry, index) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    const descriptionLines = doc.splitTextToSize(String(entry.description || "—"), 155);
    const rowHeight = Math.max(21, 13 + descriptionLines.length * 8.8);

    if (y + rowHeight > H - 70) {
      y = newPage(doc, settings);
      heading();
    }

    if (index % 2 === 0) {
      fill(doc, [250, 252, 255]);
      doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, rowHeight, "F");
    }

    text(doc, prettyDate(entry.date), 48, y + 13, { size: 7.4 });
    text(doc, String(entry.type || "—").toUpperCase(), 105, y + 13, { size: 6.6, bold: true, colour: TEAL });
    text(doc, entry.reference || "—", 168, y + 13, { size: 7.2, bold: true, maxWidth: 76 });
    ink(doc, INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.text(descriptionLines, 250, y + 13);
    text(doc, entry.debit ? money(entry.debit, currency) : "—", 420, y + 13, { size: 7.4, align: "right" });
    text(doc, entry.credit ? money(entry.credit, currency) : "—", 488, y + 13, { size: 7.4, colour: TEAL, align: "right" });
    text(doc, money(entry.balance, currency), W - 48, y + 13, { size: 7.4, bold: true, align: "right" });

    divider(doc, PAGE_MARGIN, y + rowHeight, W - PAGE_MARGIN, LINE, 0.4);
    y += rowHeight;
  });

  y += 18;
  const note =
    `Closing balance of ${money(closing, currency)} is payable as per the ledger above. ` +
    "Please contact us if you believe any entry is incorrect.";
  const noteLines = doc.splitTextToSize(note, W - PAGE_MARGIN * 2 - 24);
  const noteHeight = 26 + noteLines.length * 10;
  y = ensureSpace(doc, y, noteHeight + 80, settings);
  fill(doc, [244, 251, 250]);
  stroke(doc, [198, 231, 226]);
  doc.setLineWidth(0.7);
  doc.roundedRect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, noteHeight, 9, 9, "FD");
  text(doc, "STATEMENT SUMMARY", PAGE_MARGIN + 12, y + 14, { size: 6.5, bold: true, colour: TEAL });
  text(doc, note, PAGE_MARGIN + 12, y + 26, { size: 7.4, colour: [51, 70, 94], maxWidth: W - PAGE_MARGIN * 2 - 24 });

  y = drawSignatures(doc, y + noteHeight + 8, settings);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, settings);
    ink(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(
      `${settings?.name || "M.A Paint House"} · Statement for ${customer?.name || "customer"} · Page ${page} of ${totalPages}`,
      W / 2,
      pageHeight(doc) - 14,
      { align: "center" },
    );
  }

  return doc.output("blob");
}

/* ------------------------------------------------------------------ */
/* Generic report                                                      */
/* ------------------------------------------------------------------ */

export function reportPdfBlob(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  settings: any,
  subtitle = "Business report",
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });
  const W = pageWidth(doc);
  const H = pageHeight(doc);
  const currency = settings?.currency || "Rs";

  let y = drawHeader(doc, settings, {
    kind: subtitle,
    title,
    reference: prettyDate(new Date().toISOString()),
    pills: [
      ["Rows", String(rows.length)],
      ["Prepared", prettyDate(new Date().toISOString())],
      ["Shop", settings?.name || "M.A Paint House"],
      ["Currency", currency],
    ],
  });

  y += 18;

  const available = W - PAGE_MARGIN * 2;
  const firstWidth = available * 0.27;
  const otherWidth = (available - firstWidth) / Math.max(1, headers.length - 1);
  const columnX: number[] = [];
  const columnW: number[] = [];
  let cursor = PAGE_MARGIN;
  headers.forEach((_, index) => {
    const width = index === 0 ? firstWidth : otherWidth;
    columnX.push(cursor);
    columnW.push(width);
    cursor += width;
  });

  const heading = () => {
    fill(doc, NAVY);
    doc.roundedRect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, 24, 6, 6, "F");
    headers.forEach((header, index) => {
      const align = index === 0 ? "left" : "right";
      text(doc, String(header).toUpperCase(), index === 0 ? columnX[index] + 4 : columnX[index] + columnW[index] - 4, y + 15, {
        size: 6.8,
        bold: true,
        colour: WHITE,
        align,
      });
    });
    y += 24;
  };

  heading();

  rows.forEach((row, rowIndex) => {
    let maxLines = 1;
    const cells = row.map((cell, index) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.4);
      const lines = doc.splitTextToSize(String(cell ?? ""), columnW[index] - 10);
      maxLines = Math.max(maxLines, lines.length);
      return lines;
    });
    const rowHeight = Math.max(20, 10 + maxLines * 9);

    if (y + rowHeight > H - 60) {
      y = newPage(doc, settings);
      heading();
    }

    if (rowIndex % 2 === 0) {
      fill(doc, [250, 252, 255]);
      doc.rect(PAGE_MARGIN, y, W - PAGE_MARGIN * 2, rowHeight, "F");
    }

    cells.forEach((lines, index) => {
      ink(doc, INK);
      doc.setFont("helvetica", index === 0 ? "bold" : "normal");
      doc.setFontSize(7.4);
      const align = index === 0 ? "left" : "right";
      doc.text(lines, index === 0 ? columnX[index] + 4 : columnX[index] + columnW[index] - 4, y + 12, { align });
    });

    divider(doc, PAGE_MARGIN, y + rowHeight, W - PAGE_MARGIN, LINE, 0.4);
    y += rowHeight;
  });

  if (!rows.length) {
    text(doc, "No data for this period", W / 2, y + 24, { size: 8.5, colour: MUTED, align: "center" });
    y += 36;
  }

  y = drawSignatures(doc, y + 20, settings);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawFooter(doc, settings);
    ink(doc, MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`${settings?.name || "M.A Paint House"} · ${title} · Page ${page} of ${totalPages}`, W / 2, H - 14, {
      align: "center",
    });
  }

  return doc.output("blob");
}

/* ------------------------------------------------------------------ */
/* Filenames                                                           */
/* ------------------------------------------------------------------ */

export function invoicePdfName(invoice: any) {
  return `${safe(invoice?.number || "invoice")}.pdf`;
}
export function receiptPdfName(payment: any) {
  return `${safe(payment?.receiptNumber || "receipt")}.pdf`;
}
export function statementPdfName(customer: any) {
  return `statement-${safe(customer?.name || "customer")}.pdf`;
}
export function reportPdfName(title: string) {
  return `${safe(title || "report")}.pdf`;
}
