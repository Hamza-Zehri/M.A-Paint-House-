import { useDeferredValue, useMemo, useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";
import { appConfirm, toast } from "../lib/dialog";
import type { Product, ProductFamily } from "../lib/types";

export default function ProductFamilies() {
  const { families, productsByFamily, familyPricing, addFamily, updateFamily, deleteFamily, updateFamilyPricing } = useApp();
  const [priceEditor, setPriceEditor] = useState<string | null>(null);
  const [priceForm, setPriceForm] = useState({ drum: "", gallon: "", quartar: "" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductFamily | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const deferredQuery = useDeferredValue(query);

  const familySearch = useMemo(
    () => families.map((f) => ({ family: f, name: f.name.toLowerCase() })),
    [families],
  );
  const shown = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return familySearch.filter((entry) => entry.name.includes(q)).map((entry) => entry.family);
  }, [familySearch, deferredQuery]);

  const familyCatalogue = useMemo(() => {
    const catalogue = new Map<string, {
      famProds: Product[];
      codes: string[];
      byCode: Map<string, { first: Product; bySize: Map<string, Product> }>;
    }>();
    for (const f of families) {
      const famProds = productsByFamily(f.id);
      const byCode = new Map<string, { first: Product; bySize: Map<string, Product> }>();
      const codes: string[] = [];
      for (const p of famProds) {
        const code = p.colourCode;
        if (!code) continue;
        let entry = byCode.get(code);
        if (!entry) {
          entry = { first: p, bySize: new Map<string, Product>() };
          byCode.set(code, entry);
          codes.push(code);
        }
        if (!entry.bySize.has(p.size)) entry.bySize.set(p.size, p);
      }
      catalogue.set(f.id, { famProds, codes, byCode });
    }
    return catalogue;
  }, [families, productsByFamily]);

  const openNew = () => { setEditing(null); setName(""); setDesc(""); setStatus("active"); setShowForm(true); };
  const openEdit = (f: ProductFamily) => { setEditing(f); setName(f.name); setDesc(f.description || ""); setStatus(f.status); setShowForm(true); };

  const save = async () => {
    if (!name.trim()) return;
    if (editing) {
      await updateFamily({ ...editing, name: name.trim(), description: desc, status });
    } else {
      await addFamily(name.trim(), desc);
    }
    setName(""); setDesc(""); setEditing(null); setShowForm(false);
  };

  const openPrices = (family: ProductFamily) => {
    const price = familyPricing(family.id);
    setPriceEditor(family.id);
    setPriceForm({
      drum: String((price?.drumPrice || 0) / 100),
      gallon: String((price?.gallonPrice || 0) / 100),
      quartar: String((price?.quartarPrice || 0) / 100),
    });
  };

  const savePrices = async (family: ProductFamily) => {
    try {
      const result = await updateFamilyPricing(
        family.id,
        parseFloat(priceForm.drum) || 0,
        parseFloat(priceForm.gallon) || 0,
        parseFloat(priceForm.quartar) || 0,
      );
      toast(`${family.name} prices updated. ${result.affected} product(s) affected.`, "success");
      setPriceEditor(null);
    } catch (e: any) {
      toast(e?.message || "Could not update family prices.", "error");
    }
  };

  const remove = async (f: ProductFamily) => {
    const count = productsByFamily(f.id).length;
    const extra = count
      ? `\n\nThis will permanently delete ${count} product(s) in this family, including their colour codes and prices.`
      : "";
    const confirmed = await appConfirm(`Delete the ${f.name} family?${extra}`, {
      title: "Delete product family",
      confirmText: "Delete family",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteFamily(f.id);
      toast(`${f.name} family deleted.`, "success");
    } catch (e: any) {
      toast(e?.message || "Could not delete family.", "error");
    }
  };

  return (
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div className="toolbar-search"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search families..." /></div>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={16} /> Add family</button>
        </div>
        {showForm && (
          <div style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>{editing ? `Edit ${editing.name}` : "New product family"}</h3>
            <div className="form-row">
              <label>Family name<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label>Description<input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
            </div>
            <label>Status
              <select className="field" value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={save}>{editing ? "Update family" : "Save family"}</button>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            </div>
          </div>
        )}
        <div style={{ padding: 8 }}>
          {shown.map((f) => {
            const fp = familyPricing(f.id);
            const catalogue = familyCatalogue.get(f.id) || {
              famProds: [] as Product[],
              codes: [] as string[],
              byCode: new Map<string, { first: Product; bySize: Map<string, Product> }>(),
            };
            const famProds = catalogue.famProds;
            const codes = catalogue.codes;
            const isOpen = expanded === f.id;
            return (
              <div key={f.id} className="card" style={{ marginBottom: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : f.id)}>
                  <div><b style={{ fontSize: 16 }}>{f.name}</b><span style={{ marginLeft: 12, color: "var(--muted)", fontSize: 13 }}>{codes.length} colour codes • {famProds.length} products</span></div>
                  <div style={{ display: "flex", gap: 12, fontSize: 13, alignItems: "center" }}>
                    <span>Drum: <b>{fp ? formatMoneyShort(fp.drumPrice) : "—"}</b></span>
                    <span>Gallon: <b>{fp ? formatMoneyShort(fp.gallonPrice) : "—"}</b></span>
                    <span>Quartar: <b>{fp ? formatMoneyShort(fp.quartarPrice) : "—"}</b></span>
                    <button className="table-action" title="Family prices" onClick={(e) => { e.stopPropagation(); openPrices(f); }}><Icon name="wallet" size={15} /></button>
                    <button className="table-action" title="Edit family" onClick={(e) => { e.stopPropagation(); openEdit(f); }}><Icon name="edit" size={15} /></button>
                    <button className="table-action" title="Delete family" onClick={(e) => { e.stopPropagation(); remove(f); }}><Icon name="trash" size={15} /></button>
                    <Icon name={isOpen ? "minus" : "plus"} size={16} />
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 12 }}>
                    {priceEditor === f.id && (
                      <div className="card" style={{ padding: 14, marginBottom: 12, background: "#f8fbfd" }}>
                        <b style={{ fontSize: 13 }}>Family price management</b>
                        <p style={{ margin: "4px 0 10px", color: "var(--muted)", fontSize: 11 }}>
                          These prices are applied automatically to all non-override Drum, Gallon and Quartar products in {f.name}.
                        </p>
                        <div className="form-row">
                          <label>Drum price (Rs)<input className="field" type="number" value={priceForm.drum} onChange={(e) => setPriceForm({ ...priceForm, drum: e.target.value })} /></label>
                          <label>Gallon price (Rs)<input className="field" type="number" value={priceForm.gallon} onChange={(e) => setPriceForm({ ...priceForm, gallon: e.target.value })} /></label>
                        </div>
                        <label>Quartar price (Rs)<input className="field" type="number" value={priceForm.quartar} onChange={(e) => setPriceForm({ ...priceForm, quartar: e.target.value })} /></label>
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="btn btn-primary" onClick={() => savePrices(f)}><Icon name="check" size={14} /> Save family prices</button>
                          <button className="btn btn-secondary" onClick={() => setPriceEditor(null)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    <div className="table-wrap">
                      <table className="large-table">
                        <thead><tr><th>Colour code</th><th>Drum</th><th>Gallon</th><th>Quartar</th><th>Status</th></tr></thead>
                        <tbody>
                          {codes.map((code) => {
                            const entry = catalogue.byCode.get(code);
                            const drum = entry?.bySize.get("Drum");
                            const gal = entry?.bySize.get("Gallon");
                            const q = entry?.bySize.get("Quartar");
                            return (<tr key={code}><td><b>{code}</b></td><td>{drum ? formatMoneyShort(drum.price) : "—"}</td><td>{gal ? formatMoneyShort(gal.price) : "—"}</td><td>{q ? formatMoneyShort(q.price) : "—"}</td><td>{entry?.first.active ? "Active" : "Inactive"}</td></tr>);
                          })}
                          {codes.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: 12 }}>No colour codes</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {shown.length === 0 && <p style={{ padding: 16, color: "var(--muted)" }}>No families</p>}
        </div>
      </div>
    </div>
  );
}