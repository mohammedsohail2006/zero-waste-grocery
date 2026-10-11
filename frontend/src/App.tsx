import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bell, Boxes,
  Check, ChevronDown, CircleHelp, Clock3, Download, Edit2,
  Leaf, LayoutDashboard, Menu, Package, Plus, Search, Send,
  Settings as SettingsIcon, Sparkles, Trash2, TrendingUp, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getHealth, postCopilotQuestion } from "./lib/api";

type Route = "overview" | "inventory" | "expiry" | "forecasts" | "assistant" | "reports" | "settings";
type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  price: number;
  expiry: string;
  unit: string;
  history: number[];
};
type Preferences = { storeName: string; lowStockThreshold: number; expiryWindow: number; emailAlerts: boolean };
type ChatMessage = { role: "user" | "assistant"; text: string; mode?: "demo" | "live" };

const routes: { id: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "expiry", label: "Expiry & waste", icon: Clock3 },
  { id: "forecasts", label: "Demand forecasts", icon: TrendingUp },
  { id: "assistant", label: "AI assistant", icon: Sparkles },
  { id: "reports", label: "Reports & analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];
const categories = ["Produce", "Dairy", "Bakery", "Pantry", "Beverages"];
const storageKey = "freshwise.inventory.v1";
const settingsKey = "freshwise.settings.v1";
const reviewedKey = "freshwise.reviewed-expiry.v1";
const palette = ["#28684d", "#8fb786", "#c5d69e", "#df9b63", "#718a78"];

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

const starterProducts: Product[] = [
  { id: "p-101", name: "Whole milk · 1L", sku: "DAI-001", category: "Dairy", stock: 20, price: 68, expiry: dateOffset(1), unit: "cartons", history: [18, 21, 17, 22, 19, 24, 20] },
  { id: "p-102", name: "Strawberries · 250g", sku: "PRO-014", category: "Produce", stock: 14, price: 95, expiry: dateOffset(2), unit: "punnet", history: [12, 16, 15, 19, 18, 21, 17] },
  { id: "p-103", name: "Greek yogurt · 500g", sku: "DAI-008", category: "Dairy", stock: 32, price: 115, expiry: dateOffset(3), unit: "tubs", history: [15, 17, 16, 20, 19, 22, 18] },
  { id: "p-104", name: "Sourdough loaf", sku: "BAK-003", category: "Bakery", stock: 9, price: 85, expiry: dateOffset(1), unit: "loaves", history: [9, 10, 12, 11, 13, 14, 12] },
  { id: "p-105", name: "Baby spinach · 150g", sku: "PRO-022", category: "Produce", stock: 26, price: 55, expiry: dateOffset(5), unit: "bags", history: [19, 18, 21, 20, 22, 24, 23] },
  { id: "p-106", name: "Free-range eggs · 6 pack", sku: "DAI-011", category: "Dairy", stock: 48, price: 72, expiry: dateOffset(12), unit: "packs", history: [22, 25, 24, 27, 26, 28, 25] },
  { id: "p-107", name: "Rolled oats · 1kg", sku: "PAN-005", category: "Pantry", stock: 35, price: 140, expiry: dateOffset(120), unit: "bags", history: [8, 9, 10, 8, 11, 10, 9] },
  { id: "p-108", name: "Cold brew coffee · 330ml", sku: "BEV-009", category: "Beverages", stock: 18, price: 125, expiry: dateOffset(24), unit: "bottles", history: [11, 12, 14, 12, 15, 16, 13] },
];
const defaultPreferences: Preferences = { storeName: "Freshwise Market", lowStockThreshold: 10, expiryWindow: 7, emailAlerts: true };
const routeFromPath = (path: string): Route => routes.find((route) => route.id === path.replace(/^\/+|\/+$/g, ""))?.id ?? "overview";

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function daysUntil(value: string) {
  return Math.ceil((new Date(`${value}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(location.pathname));
  const [products, setProducts] = useState<Product[]>(() => readJson(storageKey, starterProducts));
  const [preferences, setPreferences] = useState<Preferences>(() => readJson(settingsKey, defaultPreferences));
  const [reviewed, setReviewed] = useState<string[]>(() => readJson(reviewedKey, []));
  const [apiStatus, setApiStatus] = useState("Checking API");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    getHealth().then(() => setApiStatus("API connected")).catch(() => setApiStatus("API unavailable"));
  }, []);
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(products)), [products]);
  useEffect(() => localStorage.setItem(settingsKey, JSON.stringify(preferences)), [preferences]);
  useEffect(() => localStorage.setItem(reviewedKey, JSON.stringify(reviewed)), [reviewed]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const navigate = (next: Route) => {
    history.pushState({}, "", next === "overview" ? "/" : `/${next}`);
    setRoute(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const expiring = useMemo(() => products.filter((product) => daysUntil(product.expiry) <= preferences.expiryWindow), [products, preferences.expiryWindow]);
  const metrics = useMemo(() => ({
    value: products.reduce((sum, product) => sum + product.stock * product.price, 0),
    atRisk: expiring.reduce((sum, product) => sum + product.stock * product.price, 0),
    recovery: Math.round(expiring.reduce((sum, product) => sum + product.stock * product.price * 0.3, 0)),
  }), [products, expiring]);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate("overview"); }}>
          <span className="brand-mark"><Leaf size={21} /></span>
          <span><strong>freshwise</strong><small>LESS WASTE, MORE GROWTH</small></span>
        </a>
        <div className="store-switch"><span className="store-avatar">F</span><span><small>YOUR STORE</small><strong>{preferences.storeName}</strong></span><ChevronDown size={15} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {routes.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${route === id ? "nav-current" : ""}`} aria-current={route === id ? "page" : undefined} onClick={() => navigate(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {id === "expiry" && expiring.length > 0 && <span className="nav-count">{expiring.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection"><span className={`connection-dot ${apiStatus === "API connected" ? "connected" : ""}`} /><span><strong>{apiStatus}</strong><small>{apiStatus === "API connected" ? "Copilot service reachable" : "Local demo remains available"}</small></span></div>
          <div className="profile-chip"><span className="profile-avatar">JM</span><span><strong>Jordan Miller</strong><small>Store manager</small></span><button aria-label="Open settings" onClick={() => navigate("settings")}><SettingsIcon size={16} /></button></div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Toggle navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{routes.find((item) => item.id === route)?.label}</strong></div>
          <div className="topbar-actions"><span className="data-badge"><span />LOCAL DEMO · SAVED ON THIS DEVICE</span><button className="icon-button" aria-label="View expiry alerts" onClick={() => navigate("expiry")}><Bell size={18} />{expiring.length > 0 && <i />}</button><span className="top-avatar">JM</span></div>
        </header>
        <div className="page-container">
          {route === "overview" && <Overview products={products} expiring={expiring} metrics={metrics} preferences={preferences} navigate={navigate} />}
          {route === "inventory" && <Inventory products={products} setProducts={setProducts} preferences={preferences} toast={setToast} />}
          {route === "expiry" && <Expiry products={products} expiring={expiring} reviewed={reviewed} setReviewed={setReviewed} toast={setToast} />}
          {route === "forecasts" && <Forecasts products={products} />}
          {route === "assistant" && <Assistant products={products} />}
          {route === "reports" && <Reports products={products} />}
          {route === "settings" && <Settings preferences={preferences} setPreferences={setPreferences} toast={setToast} />}
          <footer className="app-footer"><span>Freshwise <span className="footer-dot">·</span> Zero-waste grocery management</span><span>Local demo workspace · changes stay in this browser</span></footer>
        </div>
      </main>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  );
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-title-row"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function MetricCard({ label, value, note, icon: Icon, tone = "" }: { label: string; value: string; note: string; icon: typeof Package; tone?: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>;
}

function Overview({ products, expiring, metrics, preferences, navigate }: { products: Product[]; expiring: Product[]; metrics: { value: number; atRisk: number; recovery: number }; preferences: Preferences; navigate: (route: Route) => void }) {
  const categoryData = categories.map((category) => ({ name: category, value: products.filter((product) => product.category === category).reduce((sum, product) => sum + product.stock * product.price, 0) })).filter((item) => item.value > 0);
  const riskData = ["Expired", "1–2 days", "3–7 days", "8+ days"].map((label, index) => ({
    name: label,
    count: products.filter((product) => {
      const days = daysUntil(product.expiry);
      return index === 0 ? days < 0 : index === 1 ? days >= 0 && days <= 2 : index === 2 ? days > 2 && days <= 7 : days > 7;
    }).length,
  }));
  return <>
    <PageTitle eyebrow="YOUR STORE AT A GLANCE" title={`Good morning, Jordan`} description={`${preferences.storeName} · Live operational data is not connected. This is your saved local demo workspace.`} action={<button className="button-primary" onClick={() => navigate("inventory")}><Plus size={17} />Add product</button>} />
    <div className="notice notice-info"><div className="notice-symbol"><CircleHelp size={17} /></div><div><strong>You're exploring with local demo data</strong><p>Products and settings are saved in this browser only. Connect an authorized inventory backend to see store data.</p></div><button className="text-button" onClick={() => navigate("settings")}>Workspace settings <ArrowRight size={14} /></button></div>
    <div className="metric-grid">
      <MetricCard label="Products in catalog" value={String(products.length)} note="Local demo catalog" icon={Boxes} />
      <MetricCard label="Inventory value" value={money(metrics.value)} note="On-hand stock × listed price" icon={Package} tone="tone-lime" />
      <MetricCard label="Expiring this week" value={String(expiring.length)} note={`Within ${preferences.expiryWindow} days · demo records`} icon={Clock3} tone="tone-amber" />
      <MetricCard label="Waste avoided" value="Not tracked" note="No waste-event data connected" icon={Leaf} tone="tone-sage" />
      <MetricCard label="Potential recovery" value={money(metrics.recovery)} note="Illustrative 30% markdown estimate" icon={TrendingUp} tone="tone-lime" />
    </div>
    {expiring.length > 0 && <div className="notice notice-warning"><div className="notice-symbol"><AlertTriangle size={17} /></div><div><strong>{expiring.length} demo product{expiring.length === 1 ? "" : "s"} within the expiry window</strong><p>Review these local records and consider markdown or stock rotation. Suggestions are not executed automatically.</p></div><button className="text-button" onClick={() => navigate("expiry")}>Review expiry <ArrowRight size={14} /></button></div>}
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-head"><div><h2>Inventory value by category</h2><p>Calculated from local demo stock and listed prices</p></div><button className="subtle-button" onClick={() => navigate("reports")}>Details <ArrowRight size={14} /></button></div>
        {categoryData.length ? <div className="chart-wrap donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={59} outerRadius={88} paddingAngle={4} stroke="none">{categoryData.map((entry, index) => <Cell key={entry.name} fill={palette[index % palette.length]} />)}</Pie><Tooltip formatter={(value) => money(Number(value))} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{money(metrics.value)}</strong><span>stock value</span></div></div> : <EmptyState title="No products yet" text="Add inventory to see category distribution." />}
        <div className="chart-legend">{categoryData.map((item, index) => <span key={item.name}><i style={{ background: palette[index % palette.length] }} />{item.name}</span>)}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><h2>Expiry watch</h2><p>Local demo products grouped by days to expiry</p></div><button className="subtle-button" onClick={() => navigate("expiry")}>View list <ArrowRight size={14} /></button></div>
        <div className="chart-wrap bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={riskData} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0ea" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#858e85", fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#858e85", fontSize: 11 }} /><Tooltip /><Bar dataKey="count" name="Products" fill="#4d8764" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
        <div className="chart-caption"><span><i className="legend-dot" />Products by expiry window</span><span className="caption-label">Local demo records</span></div>
      </section>
    </div>
    <section className="panel table-panel"><div className="panel-head"><div><h2>Needs attention</h2><p>Products sorted by earliest expiry in your local demo inventory</p></div><button className="subtle-button" onClick={() => navigate("inventory")}>Open inventory <ArrowRight size={14} /></button></div>
      {expiring.length ? <div className="attention-list">{expiring.slice(0, 4).map((product) => <div className="attention-row" key={product.id}><span className="product-avatar">{product.category === "Dairy" ? "D" : product.category === "Bakery" ? "B" : "P"}</span><span className="attention-name"><strong>{product.name}</strong><small>{product.category} · {product.stock} {product.unit}</small></span><span className="expiry-date">{daysUntil(product.expiry) < 0 ? "Expired" : daysUntil(product.expiry) === 0 ? "Expires today" : `${daysUntil(product.expiry)} days left`}</span><button className="row-action" onClick={() => navigate("expiry")} aria-label={`Review ${product.name}`}><ArrowRight size={16} /></button></div>)}</div> : <EmptyState title="Nothing expiring soon" text="Products within your configured expiry window will appear here." />}</section>
  </>;
}

function Inventory({ products, setProducts, preferences, toast }: { products: Product[]; setProducts: (products: Product[]) => void; preferences: Preferences; toast: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const filtered = useMemo(() => products.filter((product) => (category === "All categories" || product.category === category) && `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "expiry" ? a.expiry.localeCompare(b.expiry) : sort === "stock" ? a.stock - b.stock : a.name.localeCompare(b.name)), [products, category, search, sort]);
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const openForm = (product?: Product) => { setEditing(product ?? null); setFormOpen(true); };
  const saveProduct = (product: Product) => {
    const duplicate = products.some((item) => item.sku.toLowerCase() === product.sku.toLowerCase() && item.id !== product.id);
    if (duplicate) { toast("That SKU is already in the demo catalog."); return; }
    setProducts(editing ? products.map((item) => item.id === product.id ? product : item) : [product, ...products]);
    setFormOpen(false);
    toast(editing ? "Product updated in this browser." : "Product added to this browser.");
  };
  const deleteProduct = (product: Product) => {
    if (!window.confirm(`Delete ${product.name} from this browser's demo catalog?`)) return;
    setProducts(products.filter((item) => item.id !== product.id));
    toast("Product removed from the local demo catalog.");
  };
  return <>
    <PageTitle eyebrow="STOCK & PRODUCT CATALOG" title="Inventory" description="Manage your local demo product list, review stock levels, and keep expiry dates visible." action={<button className="button-primary" onClick={() => openForm()}><Plus size={17} />Add product</button>} />
    <div className="notice notice-info compact-notice"><div className="notice-symbol"><CircleHelp size={16} /></div><div><strong>Local demo inventory</strong><p>Changes are stored in this browser, not in Supabase or a production stock system.</p></div></div>
    <section className="panel inventory-panel"><div className="inventory-toolbar"><label className="search-field"><Search size={16} /><input aria-label="Search products" placeholder="Search products or SKU" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <label className="select-field"><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="select-field"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="expiry">Expiry date</option><option value="stock">Stock (low first)</option></select></label>
    </div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Unit price</th><th>Expiry date</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {visible.map((product) => {
          const days = daysUntil(product.expiry);
          return <tr key={product.id}><td><div className="product-cell"><span className="product-avatar">{product.category[0]}</span><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.category}</td><td><strong>{product.stock}</strong> <span className="muted">{product.unit}</span></td><td>{money(product.price)}</td><td>{new Date(`${product.expiry}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td><td><div className="status-list">{(days < 0 ? ["Expired"] : days <= preferences.expiryWindow ? ["Expiring soon"] : []).concat(product.stock <= preferences.lowStockThreshold ? ["Low stock"] : []).map((status) => <span key={status} className={`status-pill ${status === "Low stock" ? "status-low" : "status-risk"}`}><i />{status}</span>)}{days >= 0 && days > preferences.expiryWindow && product.stock > preferences.lowStockThreshold && <span className="status-pill status-good"><i />Healthy</span>}</div></td><td><div className="table-actions"><button aria-label={`Edit ${product.name}`} onClick={() => openForm(product)}><Edit2 size={15} /></button><button aria-label={`Delete ${product.name}`} onClick={() => deleteProduct(product)}><Trash2 size={15} /></button></div></td></tr>;
        })}
      </tbody></table></div>
      {!filtered.length && <EmptyState title="No matching products" text="Try changing your search or category filter." />}
      <div className="table-pagination"><span>{filtered.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} of ${filtered.length} products` : "0 products"}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button></div></div>
    </section>
    {formOpen && <ProductDialog product={editing} onClose={() => setFormOpen(false)} onSave={saveProduct} />}
  </>;
}

function ProductDialog({ product, onClose, onSave }: { product: Product | null; onClose: () => void; onSave: (product: Product) => void }) {
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState(product?.category ?? categories[0]);
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [expiry, setExpiry] = useState(product?.expiry ?? dateOffset(7));
  const [unit, setUnit] = useState(product?.unit ?? "units");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !sku.trim() || !unit.trim()) { setError("Product name, SKU, and unit are required."); return; }
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0 || !Number.isFinite(Number(price)) || Number(price) < 0) { setError("Stock must be a non-negative whole number and price cannot be negative."); return; }
    if (!expiry) { setError("Choose an expiry date."); return; }
    onSave({ id: product?.id ?? `p-${crypto.randomUUID()}`, name: name.trim(), sku: sku.trim(), category, stock: Number(stock), price: Number(price), expiry, unit: unit.trim(), history: product?.history ?? [] });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"><div className="dialog-heading"><div><span className="eyebrow">{product ? "EDIT CATALOG ENTRY" : "NEW CATALOG ENTRY"}</span><h2 id="product-dialog-title">{product ? "Edit product" : "Add a product"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
    <form onSubmit={submit}><div className="form-grid"><label className="form-field form-wide">Product name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label className="form-field">SKU<input value={sku} onChange={(event) => setSku(event.target.value)} /></label><label className="form-field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-field">Stock<input type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></label><label className="form-field">Unit<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label><label className="form-field">Unit price (₹)<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="form-field">Expiry date<input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></label></div>
      {error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button-primary">{product ? "Save changes" : "Add product"}</button></div></form>
  </section></div>;
}

function Expiry({ products, expiring, reviewed, setReviewed, toast }: { products: Product[]; expiring: Product[]; reviewed: string[]; setReviewed: (ids: string[]) => void; toast: (message: string) => void }) {
  const sorted = [...expiring].sort((a, b) => a.expiry.localeCompare(b.expiry));
  const recommendations = (product: Product) => {
    const days = daysUntil(product.expiry);
    if (days < 0) return { action: "Remove from sale; assess safe disposal", rationale: `This product expired ${Math.abs(days)} day${days === -1 ? "" : "s"} ago. Do not sell or donate it for consumption; follow your store's approved food-safety and disposal procedures.` };
    if (days <= 1) return { action: "Markdown or bundle", rationale: `${product.stock} ${product.unit} remain and expiry is ${days === 0 ? "today" : "tomorrow"}. A short markdown may help recover value; confirm food safety and store policy first.` };
    if (days <= 3) return { action: "Rotate stock first", rationale: `Expiry is in ${days} days. Move this batch to the most visible position and check daily sell-through before considering a markdown.` };
    return { action: "Monitor & rotate", rationale: `Expiry is in ${days} days. Use first-expiring-first-out rotation and compare with verified sales before changing price.` };
  };
  return <>
    <PageTitle eyebrow="FRESHNESS & PREVENTION" title="Expiry & waste" description="Spot short-dated products and review explainable actions. No markdown, donation, or disposal is executed here." />
    <div className="notice notice-warning"><div className="notice-symbol"><AlertTriangle size={17} /></div><div><strong>Expiry suggestions are operational prompts, not food-safety determinations</strong><p>Check local safety rules and product condition. Expired or unsafe food must never be donated for consumption.</p></div></div>
    <div className="expiry-summary"><div className="expiry-stat"><span className="stat-icon amber-bg"><Clock3 size={18} /></span><span><small>Within 7 days</small><strong>{expiring.length} products</strong></span></div><div className="expiry-stat"><span className="stat-icon red-bg"><AlertTriangle size={18} /></span><span><small>Expired</small><strong>{products.filter((product) => daysUntil(product.expiry) < 0).length} products</strong></span></div><div className="expiry-stat"><span className="stat-icon green-bg"><Check size={18} /></span><span><small>Reviewed</small><strong>{reviewed.filter((id) => expiring.some((item) => item.id === id)).length} of {expiring.length}</strong></span></div></div>
    <section className="panel"><div className="panel-head"><div><h2>Short-dated inventory</h2><p>Prioritized by nearest expiry · local demo records</p></div><span className="data-chip">DEMO DATA</span></div>
    {sorted.length ? <div className="expiry-list">{sorted.map((product) => { const days = daysUntil(product.expiry); const suggestion = recommendations(product); const isReviewed = reviewed.includes(product.id); return <article className={`expiry-card ${isReviewed ? "expiry-reviewed" : ""}`} key={product.id}><div className="expiry-card-main"><span className={`expiry-indicator ${days <= 2 ? "indicator-red" : "indicator-amber"}`}><Clock3 size={17} /></span><div className="expiry-info"><div className="expiry-title"><h3>{product.name}</h3><span className={`status-pill ${days <= 2 ? "status-risk" : "status-low"}`}><i />{days < 0 ? "Expired" : days === 0 ? "Expires today" : days === 1 ? "1 day left" : `${days} days left`}</span></div><p>{product.category} · {product.stock} {product.unit} · {money(product.price)} per unit</p><div className="recommendation-copy"><strong>Suggested next step: {suggestion.action}</strong><span>{suggestion.rationale}</span></div></div><button className={`button-secondary review-button ${isReviewed ? "review-done" : ""}`} onClick={() => { setReviewed(isReviewed ? reviewed.filter((id) => id !== product.id) : [...reviewed, product.id]); toast(isReviewed ? "Review reopened." : "Marked as reviewed. No stock action was taken."); }}>{isReviewed ? <><Check size={15} />Reviewed</> : "Mark reviewed"}</button></div></article>; })}</div> : <EmptyState title="No products in the expiry window" text="Your local demo inventory has no short-dated products right now." />}</section>
    <section className="panel safety-panel"><div className="panel-head"><div><h2>Waste tracking data</h2><p>Waste-event records are not connected to this demo workspace.</p></div></div><EmptyState title="No waste events to report" text="This app does not infer waste or waste avoided from expiry risk. Connect verified waste records to enable trend reporting." /></section>
  </>;
}

function Forecasts({ products }: { products: Product[] }) {
  const [selected, setSelected] = useState(products[0]?.id ?? "");
  const product = products.find((item) => item.id === selected);
  const observations = product?.history.slice(-7) ?? [];
  const forecast = observations.length ? observations.reduce((sum, value) => sum + value, 0) / observations.length : null;
  const data = forecast === null ? [] : [...observations.map((actual, index) => ({ period: `D${index - observations.length + 1}`, actual, forecast: null as number | null })), { period: "Next", actual: null as number | null, forecast: Number(forecast.toFixed(1)) }];
  return <>
    <PageTitle eyebrow="PLANNING BASELINE" title="Demand forecasts" description="Explore a transparent moving-average baseline. This demo forecast is not a trained model or a real store prediction." />
    <div className="notice notice-info"><div className="notice-symbol"><Activity size={17} /></div><div><strong>Method: 7-observation moving average</strong><p>The forecast is the arithmetic mean of the selected product's seven local demo observations. No seasonality, promotions, holidays, or live sales are included.</p></div></div>
    <section className="panel forecast-panel"><div className="forecast-controls"><label className="select-field"><span>Product</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><span className="data-chip">ILLUSTRATIVE BASELINE</span></div>
      {product ? forecast !== null ? <><div className="forecast-kpis"><div><small>Next period baseline</small><strong>{forecast.toFixed(1)} <span>units</span></strong></div><div><small>Method</small><strong>7-day moving average</strong></div><div><small>Observations</small><strong>{observations.length} demo values</strong></div></div><div className="forecast-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 18, right: 14, left: -16, bottom: 0 }}><defs><linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#84a77d" stopOpacity={0.3} /><stop offset="100%" stopColor="#84a77d" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0ea" /><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#858e85", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#858e85", fontSize: 11 }} /><Tooltip /><Area dataKey="actual" name="Demo observed demand" type="monotone" stroke="#28684d" strokeWidth={2.5} fill="url(#forecastFill)" connectNulls={false} /><Area dataKey="forecast" name="Moving-average baseline" type="monotone" stroke="#d79554" strokeWidth={2} strokeDasharray="5 5" fill="none" dot={{ r: 4 }} /></AreaChart></ResponsiveContainer></div><div className="assumption-box"><strong>Underlying demo observations (units)</strong><div className="observation-pills">{observations.map((value, index) => <span key={`${value}-${index}`}>D{index + 1}: {value}</span>)}</div></div></> : <EmptyState title="No demand observations" text="This product has no sales history. The forecast is unavailable until verified or explicitly supplied observations exist." /> : <EmptyState title="No products to forecast" text="Add a product to view the illustrative moving-average calculation." />}
    </section>
  </>;
}

function Assistant({ products }: { products: Product[] }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", mode: "demo", text: "Hi Jordan. I can help brainstorm general waste-reduction practices in demo mode. I don't have access to trusted live inventory or sales data, so I won't make store-specific claims." }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || loading) return;
    setMessages((current) => [...current, { role: "user", text: prompt }]);
    setQuestion("");
    setError("");
    setLoading(true);
    try {
      const response = await postCopilotQuestion(prompt);
      setMessages((current) => [...current, { role: "assistant", mode: "live", text: response.answer }]);
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "The assistant service is unavailable.";
      setError(`${reason} No live answer was generated.`);
      setMessages((current) => [...current, { role: "assistant", mode: "demo", text: "Demo mode (not AI-generated): For short-dated stock, verify batch dates and product condition, rotate earliest-expiring items forward, then compare with recent verified sales before considering a manager-approved markdown. I could not answer from your store's live data." }]);
    } finally {
      setLoading(false);
    }
  };
  return <>
    <PageTitle eyebrow="OPERATIONS COPILOT" title="AI assistant" description="Ask about inventory or waste prevention. Live answers require the backend's trusted-data integration." />
    <div className="assistant-layout"><section className="panel chat-panel"><div className="chat-head"><span className="assistant-avatar"><Sparkles size={18} /></span><div><strong>Freshwise assistant</strong><small><i className="online-dot" />{loading ? "Thinking…" : "Demo mode · live data not connected"}</small></div><span className="data-chip">NO LIVE INVENTORY CONTEXT</span></div>
      <div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div className={`chat-message ${message.role === "user" ? "message-user" : ""}`} key={`${index}-${message.text.slice(0, 12)}`}>{message.role === "assistant" && <span className="message-avatar"><Sparkles size={14} /></span>}<div><span className="message-mode">{message.role === "user" ? "YOU" : message.mode === "live" ? "LIVE BACKEND RESPONSE" : "DEMO GUIDANCE · NOT AI-GENERATED"}</span><p>{message.text}</p></div></div>)}{loading && <div className="loading-line"><span />Contacting copilot API…</div>}</div>
      {error && <div className="assistant-error" role="alert"><AlertTriangle size={15} />{error}</div>}
      <form className="chat-form" onSubmit={ask}><label className="sr-only" htmlFor="assistant-question">Ask a question</label><input id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about stock rotation or waste prevention…" maxLength={1000} /><button className="button-primary" aria-label="Send question" disabled={!question.trim() || loading}><Send size={16} /></button></form><p className="chat-disclaimer">Do not submit personal, customer, or confidential information. Demo guidance is general and must be reviewed by a manager.</p>
    </section><aside className="panel assistant-side"><span className="eyebrow">AVAILABLE CONTEXT</span><h2>What the assistant can see</h2><div className="context-status"><span className="context-off"><X size={14} /></span><span><strong>Live stock records</strong><small>Not connected to the copilot backend</small></span></div><div className="context-status"><span className="context-off"><X size={14} /></span><span><strong>Verified sales history</strong><small>Not connected to the copilot backend</small></span></div><div className="context-status"><span className="context-demo"><Check size={14} /></span><span><strong>Local demo catalog</strong><small>{products.length} browser-only product examples</small></span></div><div className="notice notice-info assistant-note"><div className="notice-symbol"><CircleHelp size={16} /></div><div><strong>Why is it in demo mode?</strong><p>The current API requires server-side trusted inventory context, which has not been implemented. Client-supplied stock facts are intentionally not sent.</p></div></div></aside></div>
  </>;
}

function Reports({ products }: { products: Product[] }) {
  const [category, setCategory] = useState("All categories");
  const reportProducts = products.filter((product) => category === "All categories" || product.category === category);
  const reportValue = reportProducts.reduce((sum, product) => sum + product.stock * product.price, 0);
  const reportAtRisk = reportProducts.filter((product) => daysUntil(product.expiry) <= 7).reduce((sum, product) => sum + product.stock * product.price, 0);
  const reportRecovery = Math.round(reportProducts.filter((product) => daysUntil(product.expiry) <= 7).reduce((sum, product) => sum + product.stock * product.price * 0.3, 0));
  const exportCsv = () => {
    const rows = [["Product", "SKU", "Category", "Stock", "Unit", "Unit price INR", "Expiry date", "Inventory value INR"], ...reportProducts.map((item) => [item.name, item.sku, item.category, String(item.stock), item.unit, String(item.price), item.expiry, String(item.stock * item.price)])];
    const csv = rows.map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "freshwise-local-demo-inventory.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const categoryData = categories.map((item) => ({ name: item, value: reportProducts.filter((product) => product.category === item).reduce((sum, product) => sum + product.stock * product.price, 0) })).filter((item) => item.value);
  return <>
    <PageTitle eyebrow="PERFORMANCE & IMPACT" title="Reports & analytics" description="Inventory valuation is calculated from this browser's demo records. Waste and sales events are not connected." action={<button className="button-secondary" onClick={exportCsv}><Download size={16} />Export inventory CSV</button>} />
    <section className="report-filters panel"><label className="select-field"><span>Category filter</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><span className="data-chip">EVENT DATE FILTER UNAVAILABLE · NO VERIFIED EVENTS</span></section>
    <div className="metric-grid report-metrics"><MetricCard label="Current inventory value" value={money(reportValue)} note="Local demo records · selected categories" icon={Package} /><MetricCard label="Short-dated value" value={money(reportAtRisk)} note="Value of products within 7 days" icon={Clock3} tone="tone-amber" /><MetricCard label="Potential recovery" value={money(reportRecovery)} note="Illustrative 30% markdown estimate" icon={TrendingUp} tone="tone-lime" /><MetricCard label="Waste recorded" value="Not available" note="No verified waste-event feed" icon={Leaf} tone="tone-sage" /></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Inventory value by category</h2><p>Current catalog snapshot · filtered categories</p></div></div><div className="report-bars">{categoryData.map((item) => <div className="report-bar-row" key={item.name}><span>{item.name}</span><div><i style={{ width: `${Math.max(3, (item.value / Math.max(reportValue, 1)) * 100)}%` }} /></div><strong>{money(item.value)}</strong></div>)}{!categoryData.length && <EmptyState title="No products in this category" text="Choose another category to see inventory valuation." />}</div></section><section className="panel"><div className="panel-head"><div><h2>Waste reduction & savings</h2><p>No verified event history is available</p></div></div><div className="unavailable-chart"><Leaf size={24} /><strong>Waiting for waste records</strong><span>Waste trends, avoided waste, and realized savings need verified stock movement and waste-event data. We do not estimate these as actual impact.</span></div></section></div>
    <section className="panel"><div className="panel-head"><div><h2>Product performance</h2><p>Current demo inventory valuation · not sales performance</p></div><button className="subtle-button" onClick={exportCsv}><Download size={14} />Download CSV</button></div><div className="table-scroll"><table><thead><tr><th>Product</th><th>Category</th><th>Stock</th><th>Unit price</th><th>Inventory value</th></tr></thead><tbody>{[...reportProducts].sort((a, b) => b.stock * b.price - a.stock * a.price).map((product) => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.category}</td><td>{product.stock} {product.unit}</td><td>{money(product.price)}</td><td><strong>{money(product.stock * product.price)}</strong></td></tr>)}</tbody></table>{!reportProducts.length && <EmptyState title="No products in this category" text="Choose another category to see product valuations." />}</div></section>
  </>;
}

function Settings({ preferences, setPreferences, toast }: { preferences: Preferences; setPreferences: (preferences: Preferences) => void; toast: (message: string) => void }) {
  const [draft, setDraft] = useState(preferences);
  useEffect(() => setDraft(preferences), [preferences]);
  const save = (event: FormEvent) => { event.preventDefault(); setPreferences(draft); toast("Preferences saved in this browser."); };
  return <>
    <PageTitle eyebrow="WORKSPACE CONFIGURATION" title="Settings" description="Configure the local demo store and alert thresholds. These preferences are saved in this browser." />
    <div className="settings-grid"><form className="panel settings-panel" onSubmit={save}><div className="panel-head"><div><h2>Store preferences</h2><p>Demo workspace identity and inventory alert thresholds</p></div></div><div className="settings-fields"><label className="form-field">Store name<input value={draft.storeName} maxLength={80} onChange={(event) => setDraft({ ...draft, storeName: event.target.value })} /></label><label className="form-field">Low-stock alert threshold<input type="number" min="0" max="100000" step="1" value={draft.lowStockThreshold} onChange={(event) => setDraft({ ...draft, lowStockThreshold: Number(event.target.value) })} /><small>Flag products at or below this number of units.</small></label><label className="form-field">Expiry alert window<input type="number" min="1" max="365" step="1" value={draft.expiryWindow} onChange={(event) => setDraft({ ...draft, expiryWindow: Number(event.target.value) })} /><small>Show products expiring within this many days.</small></label><label className="toggle-setting"><span><strong>Email notifications</strong><small>Preference only. No notification provider is configured.</small></span><input type="checkbox" checked={draft.emailAlerts} onChange={(event) => setDraft({ ...draft, emailAlerts: event.target.checked })} /></label></div><div className="settings-actions"><button className="button-primary" disabled={!draft.storeName.trim() || draft.expiryWindow < 1 || draft.lowStockThreshold < 0}>Save preferences</button></div></form>
    <aside className="settings-aside"><section className="panel settings-panel"><span className="eyebrow">DATA & CONNECTIONS</span><h2>Workspace status</h2><div className="connection-detail"><span>Inventory database</span><strong className="state-demo">Local browser storage</strong></div><div className="connection-detail"><span>Copilot API</span><strong>Configured separately</strong></div><div className="connection-detail"><span>Notifications</span><strong>Not configured</strong></div><div className="notice notice-warning settings-warning"><div className="notice-symbol"><AlertTriangle size={16} /></div><div><strong>Not production persistence</strong><p>Demo data is stored in this browser's local storage. It is not shared or backed up to your store database.</p></div></div></section><section className="panel settings-panel"><span className="eyebrow">ABOUT FRESHWISE</span><h2>Transparent by design</h2><p className="settings-copy">Forecasts are labeled baselines. Savings are clearly identified estimates. We never report simulated values as live store performance.</p></section></aside></div>
  </>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span><Package size={19} /></span><strong>{title}</strong><p>{text}</p></div>;
}
