import { useState, useEffect } from "react";
import { AppProvider, useApp } from "./store/AppContext";
import { Icon } from "./components/Icon";
import { login } from "./lib/auth";
import type { Invoice } from "./lib/types";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import ProductFamilies from "./pages/ProductFamilies";
import AllProducts from "./pages/AllProducts";
import PriceManagement from "./pages/PriceManagement";
import ImportProducts from "./pages/ImportProducts";
import InvoiceBuilder from "./pages/Invoice";
import InvoiceHistory from "./pages/InvoiceHistory";
import Payments from "./pages/Payments";
import Ledger from "./pages/Ledger";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

type Page = "dashboard" | "customers" | "families" | "allproducts" | "pricing" | "import" | "invoice" | "history" | "payments" | "ledger" | "reports" | "settings";

const nav: { id: Page; label: string; icon: any }[] = [
  { id: "dashboard", label: "Dashboard", icon: "grid" },
  { id: "customers", label: "Customers", icon: "users" },
  { id: "families", label: "Product Families", icon: "box" },
  { id: "allproducts", label: "All Products", icon: "file" },
  { id: "pricing", label: "Price Management", icon: "wallet" },
  { id: "invoice", label: "New Invoice", icon: "plus" },
  { id: "history", label: "Invoice History", icon: "file" },
  { id: "payments", label: "Payments / Receipts", icon: "wallet" },
  { id: "ledger", label: "Customer Ledger", icon: "book" },
  { id: "reports", label: "Reports", icon: "chart" },
  { id: "import", label: "Import Products", icon: "download" },
  { id: "settings", label: "Settings & Backup", icon: "settings" },
];

function Splash({ message = "Preparing your workspace" }: { message?: string }) {
  return (
    <div className="splash-screen">
      <div className="splash-glow splash-glow-a" />
      <div className="splash-glow splash-glow-b" />
      <div className="splash-glow splash-glow-c" />
      <div className="splash-content">
        <div className="splash-logo">
          <span>M</span>
          <i className="splash-ring" />
        </div>
        <p className="splash-eyebrow">PAINT · COLOUR · ACCOUNTS</p>
        <h1>M.A Paint House</h1>
        <p className="splash-message">{message}<span className="splash-dots">...</span></p>
        <div className="splash-bar"><i /></div>
        <div className="splash-swatches">
          <span style={{ background: "#e11d48" }} />
          <span style={{ background: "#f59e0b" }} />
          <span style={{ background: "#14b8a6" }} />
          <span style={{ background: "#3b82f6" }} />
          <span style={{ background: "#8b5cf6" }} />
        </div>
        <p className="splash-credit">Crafted &amp; maintained by <b>Engr. Hamza Asad</b></p>
      </div>
    </div>
  );
}

const PAINT_COLOURS = [
  { name: "Coral", hex: "#f97362" },
  { name: "Amber", hex: "#f4b740" },
  { name: "Emerald", hex: "#1fbf9c" },
  { name: "Azure", hex: "#4a8fe7" },
  { name: "Violet", hex: "#9b6cf2" },
];

function LoginScreen() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!u.trim() || !p) { setErr("Enter your username and password."); return; }
    setLoading(true); setErr("");
    try {
      await login(u, p);
      window.location.reload();
      return;
    } catch (e: any) {
      setErr(e?.message || "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-orb login-orb-a" />
      <div className="login-orb login-orb-b" />
      <div className="login-orb login-orb-c" />

      <section className="login-showcase">
        <div className="showcase-blob showcase-blob-a" />
        <div className="showcase-blob showcase-blob-b" />
        <div className="showcase-blob showcase-blob-c" />

        <div className="showcase-content">
          <div className="login-brand-row">
            <div className="login-logo"><span>M</span></div>
            <div>
              <b>M.A Paint House</b>
              <small>KHUZDAR · BALOCHISTAN</small>
            </div>
          </div>

          <span className="login-eyebrow">Colour · Craft · Accounts</span>
          <h1>Every shade of your business, in one place.</h1>
          <p className="login-lead">
            Invoices, customer ledgers, payments and product pricing — finished in a
            clean, colour-inspired workspace built for the paint trade.
          </p>

          <div className="paint-strip" aria-hidden="true">
            {PAINT_COLOURS.map((c) => (
              <div className="paint-chip" key={c.name}>
                <span style={{ background: c.hex }} />
                <small>{c.name}</small>
              </div>
            ))}
          </div>

          <div className="showcase-features">
            <div className="showcase-feature">
              <span className="feature-dot" style={{ background: "#1fbf9c" }} />
              <b>Fast invoicing</b>
              <small>Branded invoices and receipts in seconds.</small>
            </div>
            <div className="showcase-feature">
              <span className="feature-dot" style={{ background: "#f4b740" }} />
              <b>Live accounts</b>
              <small>Balances, ledgers and payments always in sync.</small>
            </div>
            <div className="showcase-feature">
              <span className="feature-dot" style={{ background: "#9b6cf2" }} />
              <b>Colour catalogue</b>
              <small>Families, shades and pack prices organised.</small>
            </div>
          </div>
        </div>

        <div className="showcase-footer">
          <span>Trusted by M.A Paint House, Khuzdar</span>
          <span className="showcase-badge">Since 2024</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-head">
            <span className="secure-pill"><Icon name="shield" size={13} /> Secure access</span>
            <div className="login-mini-logo"><span>M</span></div>
          </div>

          <h2>Welcome back</h2>
          <p className="login-sub">Sign in to continue to your paint shop dashboard.</p>

          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <label className="login-label" htmlFor="login-username">Email or username</label>
            <div className="login-field">
              <span className="login-field-icon"><Icon name="users" size={17} /></span>
              <input
                id="login-username"
                aria-label="Email or username"
                value={u}
                placeholder="e.g. ceo@admin.com"
                autoComplete="username"
                autoFocus
                onChange={(e) => setU(e.target.value)}
              />
            </div>

            <label className="login-label" htmlFor="login-password">Password</label>
            <div className="login-field">
              <span className="login-field-icon"><Icon name="lock" size={17} /></span>
              <input
                id="login-password"
                aria-label="Password"
                type={showPassword ? "text" : "password"}
                value={p}
                placeholder="Enter your password"
                autoComplete="current-password"
                onChange={(e) => setP(e.target.value)}
              />
              <button
                type="button"
                className="login-eye"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
              >
                <Icon name={showPassword ? "eyeOff" : "eye"} size={17} />
              </button>
            </div>

            {err && (
              <div className="login-error" role="alert">
                <Icon name="bell" size={15} />
                <span>{err}</span>
              </div>
            )}

            <button className="login-submit" type="submit" disabled={loading}>
              <span>{loading ? "Signing you in..." : "Sign in to dashboard"}</span>
              <Icon name={loading ? "clock" : "arrow"} size={17} />
            </button>
          </form>

          <div className="login-note">
            Use the full email for accounts created in Firebase Authentication.
            The legacy default admin account is disabled for security.
          </div>

          <div className="login-trust">
            <Icon name="shield" size={14} />
            <span>Protected by Firebase Authentication &amp; encrypted Firestore</span>
          </div>

          <div className="login-credit">
            <span className="login-credit-line" />
            <small>Designed &amp; developed by</small>
            <b>Engr. Hamza Asad</b>
            <span className="login-credit-line" />
          </div>
        </div>
      </section>
    </div>
  );
}

function Shell() {
  const { ready, user, doLogout } = useApp();
  const [page, setPage] = useState<Page>("dashboard");
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 950);
    return () => clearTimeout(t);
  }, []);

  // Close mobile drawer on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!ready || !splashDone) return <Splash message={ready ? "Almost ready" : "Preparing your workspace"} />;
  if (!user) return <LoginScreen />;

  const go = (next: Page) => {
    if (next === "invoice") setEditingInvoice(null);
    setPage(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const content = () => {
    switch (page) {
      case "dashboard": return <Dashboard go={go} />;
      case "customers": return <Customers />;
      case "families": return <ProductFamilies />;
      case "allproducts": return <AllProducts />;
      case "pricing": return <PriceManagement />;
      case "import": return <ImportProducts onNavigate={(next) => go(next as Page)} />;
      case "invoice": return <InvoiceBuilder initial={editingInvoice} onDone={() => { setEditingInvoice(null); go("history"); }} />;
      case "history": return <InvoiceHistory onEdit={(inv) => { setEditingInvoice(inv); go("invoice"); }} />;
      case "payments": return <Payments />;
      case "ledger": return <Ledger />;
      case "reports": return <Reports />;
      case "settings": return <Settings />;
    }
  };

  return (
    <div className={`app-shell ${mobileMenuOpen ? "drawer-open" : ""}`}>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? "active" : ""}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><span>M</span></div>
          <div className="brand-text">
            <b>M.A Paint House</b>
            <small>Account Manager</small>
            <div className="sidebar-swatches" aria-hidden="true">
              <span style={{ background: "#f97362" }} />
              <span style={{ background: "#f4b740" }} />
              <span style={{ background: "#1fbf9c" }} />
              <span style={{ background: "#4a8fe7" }} />
              <span style={{ background: "#9b6cf2" }} />
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav>
          {nav.map((item) => (
            <button
              className={`${page === item.id ? "active" : ""} ${item.id === "invoice" ? "nav-invoice-btn" : ""}`}
              onClick={() => go(item.id)}
              key={item.id}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.id === "invoice" && <i>+</i>}
            </button>
          ))}
        </nav>

        <div className="profile">
          <div className="profile-avatar">MA</div>
          <div className="profile-info">
            <b>{user?.name || "Admin"}</b>
            <small>{user?.role}</small>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={() => { setMobileMenuOpen(false); doLogout(); }}
            title="Sign out of account"
            aria-label="Sign out"
          >
            <Icon name="more" size={17} />
          </button>
        </div>

        <div className="sidebar-dev-credit">
          <span className="sidebar-dev-dot" />
          <span>Dev · <b>Engr. Hamza Asad</b></span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Icon name="menu" size={22} />
            </button>
            <div className="topbar-title-block">
              <h1>M.A Paint House</h1>
              <p>Business management &amp; customer accounting</p>
            </div>
          </div>

          <div className="top-actions">
            <button
              className="btn top-new-invoice-vivid"
              onClick={() => go("invoice")}
              title="Create a new invoice"
            >
              <Icon name="plus" size={17} />
              <span>New Invoice</span>
            </button>
            <div className="date-pill">
              <Icon name="calendar" size={16} />
              <span>{new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" })}</span>
            </div>
          </div>
        </header>

        <div className="main-content-area">
          {content()}
        </div>

        <footer className="app-footer">
          <span>© {new Date().getFullYear()} M.A Paint House · Khuzdar</span>
          <span className="app-footer-sep">·</span>
          <span className="app-footer-credit">Designed &amp; Developed by <b>Engr. Hamza Asad</b></span>
        </footer>
      </main>

      {/* Mobile Bottom Navigation Bar (Smartphones & Tablets < 768px) */}
      <nav className="mobile-bottom-nav" aria-label="Quick mobile navigation">
        <button
          type="button"
          className={`mobile-nav-item ${page === "dashboard" ? "active" : ""}`}
          onClick={() => go("dashboard")}
        >
          <Icon name="grid" size={20} />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${page === "customers" ? "active" : ""}`}
          onClick={() => go("customers")}
        >
          <Icon name="users" size={20} />
          <span>Customers</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item mobile-nav-invoice ${page === "invoice" ? "active" : ""}`}
          onClick={() => go("invoice")}
          aria-label="New Invoice"
        >
          <div className="mobile-invoice-icon-wrap">
            <Icon name="plus" size={22} />
          </div>
          <span>Invoice</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${page === "history" ? "active" : ""}`}
          onClick={() => go("history")}
        >
          <Icon name="file" size={20} />
          <span>History</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${mobileMenuOpen ? "active" : ""}`}
          onClick={() => setMobileMenuOpen(true)}
        >
          <Icon name="menu" size={20} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
