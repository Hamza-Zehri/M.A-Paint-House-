import { lazy, Suspense, useState, useEffect } from "react";
import { AppProvider, useApp } from "./store/AppContext";
import { Icon } from "./components/Icon";
import { login } from "./lib/auth";
import { onIdle } from "./lib/asyncUtils";
import { prefetchPdf } from "./lib/pdfLazy";
import { mark } from "./lib/perf";
import type { Invoice } from "./lib/types";
import Dashboard from "./pages/Dashboard";

// The dashboard is the first page after login, so it stays in the entry chunk.
// Everything else is loaded on demand and warmed on hover / idle.
const Customers = lazy(() => import("./pages/Customers"));
const ProductFamilies = lazy(() => import("./pages/ProductFamilies"));
const AllProducts = lazy(() => import("./pages/AllProducts"));
const PriceManagement = lazy(() => import("./pages/PriceManagement"));
const ImportProducts = lazy(() => import("./pages/ImportProducts"));
const InvoiceBuilder = lazy(() => import("./pages/Invoice"));
const InvoiceHistory = lazy(() => import("./pages/InvoiceHistory"));
const Payments = lazy(() => import("./pages/Payments"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));

const pageLoaders: Partial<Record<Page, () => Promise<unknown>>> = {
  customers: () => import("./pages/Customers"),
  families: () => import("./pages/ProductFamilies"),
  allproducts: () => import("./pages/AllProducts"),
  pricing: () => import("./pages/PriceManagement"),
  import: () => import("./pages/ImportProducts"),
  invoice: () => import("./pages/Invoice"),
  history: () => import("./pages/InvoiceHistory"),
  payments: () => import("./pages/Payments"),
  ledger: () => import("./pages/Ledger"),
  reports: () => import("./pages/Reports"),
  settings: () => import("./pages/Settings"),
};
const prefetchPage = (next: Page) => { void pageLoaders[next]?.(); };

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
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 180);
    return () => clearTimeout(t);
  }, []);

  // Warm the most likely next screens when the browser is idle — never on the
  // critical auth/initial-data path.
  useEffect(() => {
    if (!ready || !user) return;
    onIdle(() => {
      (["invoice", "history", "payments", "reports"] as Page[]).forEach(prefetchPage);
      prefetchPdf();
    });
  }, [ready, user]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
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
    const started = mark(`nav.${next}`, "navigation");
    setPage(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => requestAnimationFrame(() => mark(`nav.${next}`, "navigation", started)));
  };

  const content = () => {
    switch (page) {
      case "dashboard": return <Dashboard go={(next) => { if (next === "invoice") setEditingInvoice(null); go(next); }} />;
      case "customers": return <Customers />;
      case "families": return <ProductFamilies />;
      case "allproducts": return <AllProducts />;
      case "pricing": return <PriceManagement />;
      case "import": return <ImportProducts onNavigate={(next) => go(next as Page)} />;
      case "invoice": return <InvoiceBuilder key={editingInvoice?.id || "new"} initial={editingInvoice} onDone={() => { setEditingInvoice(null); go("history"); }} />;
      case "history": return <InvoiceHistory onEdit={(inv) => { setEditingInvoice(inv); go("invoice"); }} />;
      case "payments": return <Payments />;
      case "ledger": return <Ledger />;
      case "reports": return <Reports />;
      case "settings": return <Settings />;
    }
  };

  return (
    <div className={`app-shell ${mobileMenuOpen ? "drawer-open" : ""} ${page === "invoice" ? "invoice-active" : ""}`}>
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
              onMouseEnter={() => prefetchPage(item.id)}
              onFocus={() => prefetchPage(item.id)}
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
              onClick={() => { setEditingInvoice(null); go("invoice"); }}
              onMouseEnter={() => prefetchPage("invoice")}
              onFocus={() => prefetchPage("invoice")}
              title="Create a new invoice"
            >
              <Icon name="plus" size={17} />
              <span>New Invoice</span>
            </button>
            <div className="date-pill">
              <Icon name="calendar" size={16} />
              <span>{new Date().toLocaleDateString("en-PK", { weekday: "long", day: "numeric", month: "long" })}</span>
            </div>
            <div className="connection-pill" style={{ background: online ? "rgba(31,191,156,0.18)" : "rgba(232,93,74,0.22)", color: online ? "#1fbf9c" : "#e85d4a" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
              <span>{online ? "Online" : "Offline"}</span>
            </div>
          </div>
        </header>

        <div className="main-content-area">
          <Suspense fallback={(
            <div className="flex min-h-[360px] flex-col gap-3 p-6" aria-label="Loading page">
              <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-200/80" />
              <div className="h-4 w-80 animate-pulse rounded-lg bg-slate-200/60" />
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
                <div className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
                <div className="h-28 animate-pulse rounded-2xl bg-slate-200/60" />
              </div>
            </div>
          )}>
            {content()}
          </Suspense>
        </div>

        <footer className="app-footer">
          <span>© {new Date().getFullYear()} M.A Paint House · Khuzdar</span>
          <span className="app-footer-sep">·</span>
          <span className="app-footer-credit">Designed &amp; Developed by <b>Engr. Hamza Asad</b></span>
        </footer>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={`mobile-nav-item ${page === "dashboard" ? "active" : ""}`}
          onClick={() => go("dashboard")}
          aria-label="Dashboard"
        >
          <Icon name="grid" size={19} />
          <span>Home</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item mobile-nav-invoice ${page === "invoice" ? "active" : ""}`}
          onClick={() => { setEditingInvoice(null); go("invoice"); }}
          onFocus={() => prefetchPage("invoice")}
          aria-label="New invoice"
        >
          <span className="mobile-invoice-icon-wrap"><Icon name="plus" size={22} /></span>
          <span>Invoice</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${page === "history" ? "active" : ""}`}
          onClick={() => go("history")}
          onFocus={() => prefetchPage("history")}
          aria-label="Invoice history"
        >
          <Icon name="file" size={19} />
          <span>History</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-item ${page === "payments" ? "active" : ""}`}
          onClick={() => go("payments")}
          onFocus={() => prefetchPage("payments")}
          aria-label="Payments"
        >
          <Icon name="wallet" size={19} />
          <span>Payments</span>
        </button>
        <button
          type="button"
          className="mobile-nav-item"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="More navigation options"
        >
          <Icon name="menu" size={19} />
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
