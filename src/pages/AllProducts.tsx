import { useState } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { formatMoneyShort, toPaisa } from "../lib/money";
import { appConfirm, toast } from "../lib/dialog";
import type { Product, Size } from "../lib/types";

const SIZES: Size[] = ["Drum", "Gallon", "Quartar", "Other"];

export default function AllProducts() {
  const { products, families, toggleProduct, addProduct, updateProduct, deleteProduct } = useApp();
  const [query, setQuery] = useState("");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const blank = () => ({
    name: "", colourCode: "", familyId: families[0]?.id || "", size: "Drum" as Size,
    price: "", override: false, code: "", category: "", brand: "", description: "", active: true,
  });
  const [form, setForm] = useState(blank());

  const openNew = () => { setEditing(null); setForm(blank()); setShowForm(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, colourCode: p.colourCode, familyId: p.familyId, size: p.size, price: String(p.price / 100), override: p.override, code: p.code, category: p.category, brand: p.brand, description: p.description, active: p.active });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast("Product name is required.", "error"); return; }
    if (!form.familyId) { toast("Select a product family.", "error"); return; }
    const fam = families.find((f) => f.id === form.familyId);
    const data = {
      name: form.name.trim(), colourCode: form.colourCode.trim(), familyId: form.familyId,
      size: form.size, price: toPaisa(parseFloat(form.price) || 0), override: form.override,
      code: form.code.trim() || `${(fam?.name || "PRD").slice(0, 3).toUpperCase()}-${form.colourCode.trim()}`,
      category: form.category.trim() || fam?.name || "", brand: form.brand.trim() || fam?.name || "",
      description: form.description, active: form.active,
    };
    try {
      if (editing) await updateProduct({ ...editing, ...data });
      else await addProduct(data);
      toast(editing ? "Product updated." : "Product created.", "success");
      setShowForm(false); setEditing(null);
    } catch (e: any) {
      toast(e?.message || "Could not save product.", "error");
    }
  };

  const remove = async (p: Product) => {
    const confirmed = await appConfirm(`Delete ${p.name}? This removes the product from the catalogue and invoice picker.`, {
      title: "Delete product",
      confirmText: "Delete product",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteProduct(p.id);
      toast(`${p.name} deleted.`, "success");
    } catch (e: any) {
      toast(e?.message || "Could not delete product.", "error");
    }
  };

  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const shown = products.filter((p) => {
    if (familyFilter !== "all" && p.familyId !== familyFilter) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (sizeFilter !== "all" && p.size !== sizeFilter) return false;
    const fam = families.find((f) => f.id === p.familyId);
    const hay = `${p.name} ${p.colourCode} ${fam?.name || ""} ${p.category} ${p.code}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  return (
    <div className="page">
      <div className="card data-card">
        <div className="page-toolbar">
          <div className="toolbar-search"><Icon name="search" size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or colour code..." /></div>
          <select value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value)} className="filter-button">
            <option value="all">All families</option>
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="filter-button">
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} className="filter-button">
            <option value="all">All sizes</option>
            <option value="Drum">Drum</option>
            <option value="Gallon">Gallon</option>
            <option value="Quartar">Quartar</option>
            <option value="Other">Other</option>
          </select>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={16} /> Add product</button>
        </div>
        {showForm && (
          <div className="card" style={{ margin: 16, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>{editing ? `Edit ${editing.name}` : "New product"}</h3>
            <div className="form-row">
              <label>Product name<input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Product family<select className="field" value={form.familyId} onChange={(e) => setForm({ ...form, familyId: e.target.value })}>{families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>Colour code<input className="field" value={form.colourCode} onChange={(e) => setForm({ ...form, colourCode: e.target.value })} /></label>
              <label>Size<select className="field" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value as Size })}>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label>Price (Rs)<input className="field" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
              <label>Product code<input className="field" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
            </div>
            <div className="form-row">
              <label>Category<input className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
              <label>Brand<input className="field" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label>
            </div>
            <label>Description<textarea className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
              <label className="toggle-row" style={{ margin: 0 }}><span>Custom price override</span><input type="checkbox" checked={form.override} onChange={(e) => setForm({ ...form, override: e.target.checked })} /></label>
              <label className="toggle-row" style={{ margin: 0 }}><span>Active</span><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /></label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save}>{editing ? "Update product" : "Save product"}</button>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
            </div>
          </div>
        )}
        <div className="table-wrap">
          <table className="large-table">
            <thead><tr><th>Product</th><th>Family</th><th>Category</th><th>Colour code</th><th>Size</th><th>Price</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {shown.map((p) => {
                const fam = families.find((f) => f.id === p.familyId);
                return (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td>
                    <td>{fam?.name}</td>
                    <td>{p.category || "—"}</td>
                    <td>{p.colourCode || "—"}</td>
                    <td>{p.size}</td>
                    <td><b>{formatMoneyShort(p.price)}</b>{p.override && <small style={{ color: "var(--muted)" }}> (override)</small>}</td>
                    <td>{p.active ? "Active" : "Inactive"}</td>
                    <td><div className="row-actions">
                      <button className="table-action" onClick={() => toggleProduct(p.id)} title="Toggle active"><Icon name="check" size={16} /></button>
                      <button className="table-action" onClick={() => openEdit(p)} title="Edit"><Icon name="edit" size={16} /></button>
                      <button className="table-action" onClick={() => remove(p)} title="Delete"><Icon name="trash" size={16} /></button>
                    </div></td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", padding: 20 }}>No products</td></tr>}
            </tbody>
          </table>
          <p style={{ padding: 8, color: "var(--muted)", fontSize: 9 }}>{shown.length} product(s) shown</p>
        </div>
      </div>
    </div>
  );
}