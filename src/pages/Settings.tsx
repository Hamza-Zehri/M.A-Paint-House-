import { useState, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { Icon } from "../components/Icon";
import { clearAll, db } from "../lib/db";
import { seedIfEmpty } from "../lib/seed";
import { changePassword } from "../lib/auth";
import { appConfirm, toast } from "../lib/dialog";

export default function Settings() {
  const { settings, updateSettings, customers, products, invoices, payments, ledger, expenses, audit, user } = useApp();
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  useEffect(() => { if (settings) setS({ ...settings }); }, [settings]);

  if (!settings || !s) return <div>Loading...</div>;

  const save = async () => { await updateSettings(s); setMsg("Settings saved"); };

  const downloadBackup = () => {
    const data = { settings, customers, products, invoices, payments, ledger, expenses, audit, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url); setMsg("Backup downloaded");
  };

  const restoreBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data: any = JSON.parse(String(e.target?.result));
        const confirmed = await appConfirm(
          "Restore will replace all current data with the contents of this backup. Continue?",
          { title: "Restore backup", confirmText: "Restore data", danger: true },
        );
        if (!confirmed) return;
        await clearAll();
        if (data.settings) await db.settings.put(data.settings);
        for (const c of data.customers || []) await db.customers.put(c);
        for (const p of data.products || []) await db.products.put(p);
        for (const i of data.invoices || []) await db.invoices.put(i);
        for (const p of data.payments || []) await db.payments.put(p);
        for (const l of data.ledger || []) await db.ledger.put(l);
        for (const ex of data.expenses || []) await db.expenses.put(ex);
        for (const a of data.audit || []) await db.audit.put(a);
        if (data.allocations) for (const a of data.allocations) await db.allocations.put(a);
        setMsg("Restored. Reloading...");
        toast("Backup restored. Reloading...", "success");
        setTimeout(() => location.reload(), 1000);
      } catch {
        setMsg("Invalid backup file");
        toast("Invalid backup file.", "error");
      }
    };
    reader.readAsText(file);
  };

  const resetData = async () => {
    const confirmed = await appConfirm(
      "This will permanently delete ALL customers, invoices, payments and products, then reseed the default catalogue. Continue?",
      { title: "Reset all data", confirmText: "Reset everything", danger: true },
    );
    if (!confirmed) return;
    try {
      await clearAll();
      await seedIfEmpty();
      toast("Data reset. Reloading...", "success");
      location.reload();
    } catch (e: any) {
      toast(e?.message || "Could not reset data.", "error");
    }
  };

  const changePw = async () => {
    setPwError("");
    if (!user) {
      setPwError("You are not signed in. Sign in again and retry.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("Use at least 8 characters.");
      return;
    }
    if (!/[a-z]/.test(newPw) || !/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setPwError("Include an uppercase letter, a lowercase letter and a number.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("The two passwords do not match.");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(user.id, newPw);
      setMsg("Password changed successfully.");
      toast("Password changed successfully.", "success");
      setPwOpen(false);
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      setPwError(e?.message || "Could not change password. Sign in again and retry.");
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="page settings-grid">
      <section className="card settings-card">
        <div className="settings-title"><span><Icon name="book" /></span><div><h3>Business settings</h3><p>M.A Paint House details</p></div></div>
        <label>Shop name<input className="field" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
        <div className="form-row">
          <label>Phone<input className="field" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></label>
          <label>WhatsApp<input className="field" value={s.whatsapp} onChange={(e) => setS({ ...s, whatsapp: e.target.value })} /></label>
        </div>
        <label>Address<textarea className="field" value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} /></label>
        <div className="form-row">
          <label>Invoice prefix<input className="field" value={s.invoicePrefix} onChange={(e) => setS({ ...s, invoicePrefix: e.target.value })} /></label>
          <label>Default discount %<input className="field" type="number" value={s.defaultDiscount} onChange={(e) => setS({ ...s, defaultDiscount: parseFloat(e.target.value) || 0 })} /></label>
        </div>
        <label>Invoice footer<textarea className="field" value={s.footer} onChange={(e) => setS({ ...s, footer: e.target.value })} /></label>
        <button className="btn btn-primary" onClick={save}><Icon name="check" /> Save settings</button>
      </section>
      <section className="card settings-card backup-card">
        <div className="settings-title"><span><Icon name="download" /></span><div><h3>Backup & restore</h3><p>Keep your accounting records safe</p></div></div>
        <div className="backup-actions">
          <button className="btn btn-primary" onClick={downloadBackup}><Icon name="download" /> Download backup</button>
          <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
            <Icon name="file" /> Restore data
            <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreBackup(f); }} />
          </label>
          <button className="btn btn-secondary" onClick={resetData}>Reset all data</button>
        </div>
        {msg && <p style={{ color: "var(--teal)", marginTop: 8 }}>{msg}</p>}
      </section>
      <section className="card settings-card">
        <div className="settings-title"><span><Icon name="shield" /></span><div><h3>Security</h3><p>Your signed-in account</p></div></div>
        <p style={{ color: "var(--muted)", fontSize: 12, lineHeight: 1.6, marginTop: 0 }}>
          Change the password for the Firebase account you are signed in with. The legacy
          default <b>admin</b> account is disabled inside this app for security; only real
          Firebase Authentication accounts can sign in.
        </p>
        {user && (
          <p style={{ color: "var(--muted)", fontSize: 11, margin: "0 0 10px" }}>
            Signed in as <b>{user.username}</b>
          </p>
        )}
        {!pwOpen ? (
          <button className="btn btn-secondary" onClick={() => { setPwOpen(true); setPwError(""); }}>
            <Icon name="lock" size={15} /> Change my password
          </button>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            <label>
              New password
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(event) => setNewPw(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            <label>
              Confirm new password
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(event) => setConfirmPw(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void changePw(); }}
              />
            </label>
            {pwError && <p style={{ margin: 0, color: "var(--red)", fontSize: 10.5, fontWeight: 700 }}>{pwError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={changePw} disabled={pwSaving}>
                <Icon name="check" size={15} /> {pwSaving ? "Updating..." : "Update password"}
              </button>
              <button className="btn btn-secondary" onClick={() => { setPwOpen(false); setNewPw(""); setConfirmPw(""); setPwError(""); }}>
                Cancel
              </button>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 10, margin: 0, lineHeight: 1.6 }}>
              Must be at least 8 characters and include uppercase, lowercase and a number.
            </p>
          </div>
        )}
        <p style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.6, marginBottom: 0 }}>
          To permanently remove the old account, open Firebase Console → Authentication → Users
          and delete or disable <b>admin@mapainthouse.app</b>.
        </p>
      </section>

      {/* ── Developer Credit ── */}
      <section className="settings-section settings-credit-section">
        <div className="settings-credit-card">
          <div className="settings-credit-avatar">HA</div>
          <div className="settings-credit-info">
            <small>Designed &amp; Developed by</small>
            <b>Engr. Hamza Asad</b>
            <small className="settings-credit-sub">Full-Stack Software Engineer · M.A Paint House Account Manager</small>
          </div>
          <div className="settings-credit-badge">v1.0</div>
        </div>
        <p className="settings-credit-note">
          Built with React, Firebase &amp; Tailwind CSS. All rights reserved © {new Date().getFullYear()} M.A Paint House, Khuzdar.
        </p>
      </section>
    </div>
  );
}