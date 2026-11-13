import { useMemo, useRef, useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";
import { downloadBlob } from "../lib/whatsapp";
import { toast } from "../lib/dialog";

const TEMPLATE_HEADERS = [
  "family",
  "colour_code",
  "colour_name",
  "size",
  "price",
  "code",
  "category",
  "brand",
  "description",
  "drum_price",
  "gallon_price",
  "quartar_price",
];

const TEMPLATE_ROWS = [
  ["Aqua Matt", "401", "Aqua Matt 401", "Gallon", "5700", "AQUA-401", "Aqua Matt", "Aqua Matt", "Premium matt emulsion", "21500", "5700", "1500"],
  ["Aqua Matt", "402", "Aqua Matt 402", "Drum", "21500", "AQUA-402", "Aqua Matt", "Aqua Matt", "", "", "", ""],
  ["Super Emulsion", "101", "Super Emulsion 101", "Quartar", "1300", "SUP-101", "Super Emulsion", "Super Emulsion", "", "18000", "4800", "1300"],
];

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function templateCsv() {
  const lines = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_ROWS.map((row) => row.map(csvEscape).join(","))];
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** RFC-4180 friendly CSV parser: supports quotes, escaped quotes and newlines inside cells. */
function parseCsv(raw: string): Record<string, string>[] {
  const text = raw.replace(/^\ufeff/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmpty = rows.filter((entry) => entry.some((value) => value.trim() !== ""));
  if (!nonEmpty.length) return [];

  const headers = nonEmpty[0].map(normalizeHeader);
  return nonEmpty.slice(1).map((entry) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (entry[index] || "").trim();
    });
    return record;
  });
}

interface ImportSummary {
  imported: number;
  families: number;
  duplicates: number;
  missing: number;
  review: number;
  pricesUpdated: number;
  totalRows: number;
}

export default function ImportProducts({
  onNavigate,
}: {
  onNavigate?: (page: "pricing" | "families" | "allproducts") => void;
}) {
  const { importProducts, families, familyPricing } = useApp();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const headers = rows.length ? Object.keys(rows[0]) : [];

  const familySummary = useMemo(() => {
    const map = new Map<string, { name: string; products: number; codes: Set<string>; sizes: Set<string> }>();
    for (const row of rows) {
      const name = (row.family || row.family_name || row.product_family || row.category || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, products: 0, codes: new Set(), sizes: new Set() });
      const entry = map.get(key)!;
      entry.products += 1;
      const code = row.colour_code || row.color_code || row.colour || row.color || row.shade_code || "";
      if (code) entry.codes.add(code);
      const size = row.size || row.packaging || row.unit || "";
      if (size) entry.sizes.add(size);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const downloadTemplate = () => {
    downloadBlob(new Blob([templateCsv()], { type: "text/csv;charset=utf-8;" }), "product-import-template.csv");
    toast("CSV template downloaded. Fill it in and import it below.", "success");
  };

  const readFile = async (file: File) => {
    setError("");
    setResult(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file. Excel files can be exported as CSV first.");
      return;
    }
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.length) {
        setError("No product rows were found in this file.");
        return;
      }
      setRows(parsed);
      setFileName(file.name);
      toast(`${parsed.length} row(s) loaded from ${file.name}`, "success");
    } catch (err: any) {
      setError(err?.message || "Could not read this CSV file.");
    }
  };

  const doImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    setError("");
    try {
      const summary = await importProducts(rows);
      setResult(summary);
      toast(`Imported ${summary.imported} product(s) with ${summary.families} new family group(s).`, "success");
    } catch (err: any) {
      setError(err?.message || "Import failed.");
      toast(err?.message || "Import failed.", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="page">
      <div className="card data-card import-card">
        <div className="import-head">
          <div>
            <span className="import-kicker">Catalogue setup</span>
            <h2>Import products from CSV</h2>
            <p>
              Download the template, fill in one row per colour/size variant, then import the whole list.
              Families, colour codes, categories and family prices are created automatically.
            </p>
          </div>
          <button className="btn btn-primary" onClick={downloadTemplate}>
            <Icon name="download" size={16} /> Download CSV template
          </button>
        </div>

        <div className="import-steps">
          <div className="import-step">
            <span>1</span>
            <div><b>Download the template</b><small>Columns cover family, colour code, size, price and optional family prices.</small></div>
          </div>
          <div className="import-step">
            <span>2</span>
            <div><b>Choose your CSV</b><small>Drop the completed file below or browse from your computer.</small></div>
          </div>
          <div className="import-step">
            <span>3</span>
            <div><b>Import &amp; review</b><small>All products are created, then review the family and price summary.</small></div>
          </div>
        </div>

        <div
          className={`import-drop ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void readFile(file);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
          }}
        >
          <div className="import-drop-icon"><Icon name="download" size={24} /></div>
          <b>{fileName || "Drop your CSV file here"}</b>
          <small>{fileName ? `${rows.length} product row(s) ready to import` : "or click to browse — .csv files only"}</small>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="import-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
        </div>

        {error && (
          <div className="import-error">
            <Icon name="bell" size={15} />
            <span>{error}</span>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="import-preview-head">
              <div>
                <h3>Preview</h3>
                <p>{rows.length} row(s) · {familySummary.length} family group(s) · {headers.length} columns detected</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => { setRows([]); setFileName(""); setResult(null); }}>
                  Clear file
                </button>
                <button className="btn btn-primary" onClick={doImport} disabled={importing}>
                  <Icon name="check" size={16} /> {importing ? "Importing..." : `Import all ${rows.length} products`}
                </button>
              </div>
            </div>

            <div className="table-wrap import-preview">
              <table className="large-table">
                <thead>
                  <tr>{headers.slice(0, 9).map((header) => <th key={header}>{header.replace(/_/g, " ")}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((row, index) => (
                    <tr key={index}>
                      {headers.slice(0, 9).map((header) => (
                        <td key={header}>{row[header] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 8 && <p className="import-more">Showing the first 8 of {rows.length} rows. All rows will be imported.</p>}
            </div>
          </>
        )}

        {result && (
          <div className="import-result">
            <div className="import-result-head">
              <div>
                <h3>Import complete</h3>
                <p>The catalogue has been updated. Existing products were not overwritten.</p>
              </div>
              <button className="btn btn-secondary" onClick={() => onNavigate?.("allproducts")}>
                <Icon name="file" size={16} /> View all products
              </button>
            </div>
            <div className="import-metrics">
              <div><span>Products imported</span><b>{result.imported}</b></div>
              <div><span>New families</span><b>{result.families}</b></div>
              <div><span>Family prices saved</span><b>{result.pricesUpdated}</b></div>
              <div><span>Duplicates skipped</span><b>{result.duplicates}</b></div>
              <div><span>Missing prices</span><b>{result.missing}</b></div>
              <div><span>Rows for review</span><b>{result.review}</b></div>
            </div>
            {result.missing > 0 && (
              <p className="import-hint">
                Rows without a price were imported at Rs 0. Set their family prices in Price Management or edit the product directly.
              </p>
            )}
          </div>
        )}

        {familySummary.length > 0 && (
          <div className="family-review">
            <div className="import-result-head">
              <div>
                <h3>Family, colour code &amp; price review</h3>
                <p>The import maps these CSV groups to product families and keeps their family prices in sync.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => onNavigate?.("families")}>
                  <Icon name="box" size={16} /> Manage families
                </button>
                <button className="btn btn-primary" onClick={() => onNavigate?.("pricing")}>
                  <Icon name="wallet" size={16} /> Manage family prices
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="large-table">
                <thead>
                  <tr><th>Family / category</th><th>Rows</th><th>Colour codes</th><th>Sizes</th><th>Drum</th><th>Gallon</th><th>Quartar</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {familySummary.map((entry) => {
                    const family = families.find((item) => item.name.trim().toLowerCase() === entry.name.trim().toLowerCase());
                    const price = family ? familyPricing(family.id) : undefined;
                    return (
                      <tr key={entry.name}>
                        <td><b>{entry.name}</b></td>
                        <td>{entry.products}</td>
                        <td>{entry.codes.size}</td>
                        <td>{[...entry.sizes].join(", ") || "—"}</td>
                        <td>{price ? formatMoneyShort(price.drumPrice) : "—"}</td>
                        <td>{price ? formatMoneyShort(price.gallonPrice) : "—"}</td>
                        <td>{price ? formatMoneyShort(price.quartarPrice) : "—"}</td>
                        <td>{family ? "In catalogue" : "Will be created"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!rows.length && (
          <div className="import-help">
            <h3>CSV column guide</h3>
            <p>Use these headings in the first row. Only <b>family</b> is required; other columns may be left blank.</p>
            <div className="import-columns">
              {[
                ["family", "Product family / category, e.g. Aqua Matt"],
                ["colour_code", "Colour or shade code, e.g. 401"],
                ["colour_name", "Product display name (optional)"],
                ["size", "Drum, Gallon, Quartar or Other"],
                ["price", "Retail price in rupees"],
                ["code", "SKU / product code (optional)"],
                ["category", "Category label (optional; defaults to family)"],
                ["brand", "Brand label (optional; defaults to family)"],
                ["drum_price / gallon_price / quartar_price", "Optional family-level prices applied to all matching products"],
              ].map(([name, description]) => (
                <div key={name}><code>{name}</code><span>{description}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
