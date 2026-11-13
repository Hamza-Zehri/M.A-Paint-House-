import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort } from "../lib/money";

export default function PriceManagement() {
  const { families, pricing, familyPricing, updateFamilyPricing, products } = useApp();
  const [edits, setEdits] = useState<Record<string, { drum: string; gallon: string; quartar: string }>>({});
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<{ familyId: string; name: string; affected: number } | null>(null);
  const [msg, setMsg] = useState("");

  const getEdit = (famId: string) => {
    if (edits[famId]) return edits[famId];
    const fp = familyPricing(famId);
    return { drum: String((fp?.drumPrice || 0) / 100), gallon: String((fp?.gallonPrice || 0) / 100), quartar: String((fp?.quartarPrice || 0) / 100) };
  };

  const setEdit = (famId: string, field: string, value: string) => {
    const cur = getEdit(famId);
    setEdits({ ...edits, [famId]: { ...cur, [field]: value } });
  };

  const countAffected = (familyId: string) => products.filter((p) => p.familyId === familyId && !p.override && (p.size === "Drum" || p.size === "Gallon" || p.size === "Quartar")).length;

  const requestSave = (familyId: string, name: string) => {
    setConfirm({ familyId, name, affected: countAffected(familyId) });
  };

  const doSave = async () => {
    if (!confirm) return;
    const e = getEdit(confirm.familyId);
    await updateFamilyPricing(confirm.familyId, parseFloat(e.drum) || 0, parseFloat(e.gallon) || 0, parseFloat(e.quartar) || 0);
    setMsg(`Updated ${confirm.name}. ${confirm.affected} products affected.`);
    setConfirm(null);
    setTimeout(() => setMsg(""), 3000);
  };

  const shown = families.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div className="toolbar-search"><Icon name="search" size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search family..." /></div>
        </div>
        {msg && <p style={{ color: "var(--teal)", padding: "8px 16px" }}>{msg}</p>}
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Product family</th><th>Drum price</th><th>Gallon price</th><th>Quartar price</th><th>Affected products</th><th>Action</th></tr></thead>
            <tbody>
              {shown.map((f) => {
                const e = getEdit(f.id);
                return (
                  <tr key={f.id}>
                    <td><b>{f.name}</b></td>
                    <td><input type="number" className="field" style={{ width: 110 }} value={e.drum} onChange={(ev) => setEdit(f.id, "drum", ev.target.value)} /></td>
                    <td><input type="number" className="field" style={{ width: 110 }} value={e.gallon} onChange={(ev) => setEdit(f.id, "gallon", ev.target.value)} /></td>
                    <td><input type="number" className="field" style={{ width: 110 }} value={e.quartar} onChange={(ev) => setEdit(f.id, "quartar", ev.target.value)} /></td>
                    <td>{countAffected(f.id)}</td>
                    <td><button className="btn btn-primary" onClick={() => requestSave(f.id, f.name)}><Icon name="check" size={14} /> Save</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="card" style={{ padding: 24, width: 400 }}>
            <h3 style={{ marginTop: 0 }}>Confirm price update</h3>
            <p>Update prices for <b>{confirm.name}</b>?</p>
            <p style={{ color: "var(--muted)" }}>This will affect {confirm.affected} products (Drum/Gallon/Quartar variants). Other families and sizes remain unchanged.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={doSave}>Confirm</button>
              <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}