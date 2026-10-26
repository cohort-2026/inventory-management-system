
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../Home.css";

type BackendStatus = "checking" | "online" | "offline";

const features = [
  {
    number: "01",
    icon: "▦",
    title: "Inventory tracking",
    description:
      "Keep product quantities, SKUs and stock locations organised in one central place.",
  },
  {
    number: "02",
    icon: "↗",
    title: "Stock movement",
    description:
      "Record stock adjustments and transfers to maintain a clearer inventory history.",
  },
  {
    number: "03",
    icon: "!",
    title: "Low-stock awareness",
    description:
      "Identify products that need attention before stock shortages disrupt operations.",
  },
  {
    number: "04",
    icon: "⌕",
    title: "Product management",
    description:
      "Find product information quickly and keep important product details accessible.",
  },
  {
    number: "05",
    icon: "▤",
    title: "Sales visibility",
    description:
      "Use stock and sales records to better understand inventory activity.",
  },
  {
    number: "06",
    icon: "✓",
    title: "Controlled access",
    description:
      "Support role-based access so users can work with features appropriate to their role.",
  },
];

export default function Home() {
  const [backendStatus, setBackendStatus] =
    useState<BackendStatus>("checking");
  const [backendMessage, setBackendMessage] = useState("");

   useEffect(() => {
    let active = true;
    let pending: AbortController | null = null;

    const checkBackend = async () => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const apiUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:5000").replace(/\/$/, "");
        const response = await fetch(`${apiUrl}/health`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Health check returned ${response.status}`);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object" || !("status" in data) || data.status !== "ok") {
          throw new Error("Unexpected health response");
        }
        if (!active) return;
        setBackendStatus("online");
        setBackendMessage("The inventory API is responding normally.");
      } catch {
        if (!active) return;
        setBackendStatus("offline");
        setBackendMessage("Cannot reach the inventory API. Check that the backend server is running.");
      } finally {
        clearTimeout(timeout);
      }
    };

    void checkBackend();
    const interval = setInterval(() => void checkBackend(), 15000);
    return () => {
      active = false;
      clearInterval(interval);
      pending?.abort();
    };
  }, []);

  const statusText: Record<BackendStatus, string> = {
    checking: "Checking Backend...",
    online: "Backend Online",
    offline: "Backend Offline",
  };

  return (
    <main className="landing-page">
      {/* Navigation */}
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="Inventory management system home">
          <span className="landing-brand-mark">IMS</span>
          <span>
            Inventory Management System<span className="landing-brand-period">.</span>
          </span>
        </Link>

        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
        </nav>

        <div className="landing-header-actions">
          <Link to="/login" className="landing-sign-in">
            Sign in
          </Link>
          <Link to="/register" className="landing-button landing-button-small">
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div
            className={`landing-status landing-status-${
              backendStatus === "checking" ? "checking" : backendStatus
            }`}
            role="status"
            aria-live="polite"
          >

            <span className="landing-status-dot" aria-hidden="true" />

            {statusText[backendStatus]}

          </div>

          <p className="landing-eyebrow">
            INVENTORY MANAGEMENT, SIMPLIFIED
          </p>

          <h1>
            Know your stock.
            <br />
            <span>Stay in control.</span>
          </h1>

          <p className="landing-intro">
            Manage products, monitor stock levels and track inventory
            movements from one organised workspace. Make everyday stock
            management clearer and more efficient.
          </p>

          <div className="landing-hero-actions">
            <Link to="/register" className="landing-button">
              Start managing stock <span aria-hidden="true">→</span>
            </Link>
            <a href="#features" className="landing-text-link">
              Explore the features ↓
            </a>
          </div>

          <div className="landing-trust-line">
            <span className="landing-trust-check">✓</span>
            <span>One workspace. Better stock visibility.</span>
          </div>
        </div>

        {/* Illustrative dashboard preview */}
        <div
          className="landing-preview"
          aria-label="Illustrative inventory dashboard preview"
        >
          <div className="landing-preview-top">
            <div>
              <p className="landing-preview-label">OVERVIEW</p>
              <h2>Inventory dashboard</h2>
            </div>
            <span className="landing-preview-date">STOCK SUMMARY</span>
          </div>

          <div className="landing-preview-stats">
            <div className="landing-preview-stat landing-preview-stat-highlight">
              <span>Total products</span>
              <strong>248</strong>
              <small>Products recorded</small>
            </div>

            <div className="landing-preview-stat">
              <span>Stock available</span>
              <strong>1,864</strong>
              <small>Units across products</small>
            </div>

            <div className="landing-preview-stat">
              <span>Low-stock items</span>
              <strong>12</strong>
              <small>Review recommended</small>
            </div>

            <div className="landing-preview-stat">
              <span>Out of stock</span>
              <strong>03</strong>
              <small>Require attention</small>
            </div>
          </div>

          <div className="landing-stock-card">
            <div className="landing-stock-heading">
              <strong>Stock watchlist</strong>
              <span className="landing-stock-count">SAMPLE DATA</span>
            </div>

            <div className="landing-stock-row">
              <span className="landing-product-icon landing-product-blue">
                KB
              </span>
              <span className="landing-stock-product">
                <strong>Wireless keyboard</strong>
                <small>SKU: ACC-001</small>
              </span>
              <span className="landing-stock-quantity">
                08 <small>units</small>
              </span>
              <span className="landing-stock-tag">Low stock</span>
            </div>

            <div className="landing-stock-row">
              <span className="landing-product-icon landing-product-gold">
                MS
              </span>
              <span className="landing-stock-product">
                <strong>Wireless mouse</strong>
                <small>SKU: ACC-002</small>
              </span>
              <span className="landing-stock-quantity">
                00 <small>units</small>
              </span>
              <span className="landing-stock-tag landing-stock-tag-warning">
                Out of stock
              </span>
            </div>

            <div className="landing-stock-footer">
              <span className="landing-trust-check">✓</span>
              <span>Example product records for preview purposes</span>
            </div>
          </div>

          <div className="landing-preview-note">
            <span className="landing-note-icon">↗</span>
            <span>
              <strong>Stay informed</strong>
              <small>Keep stock issues visible</small>
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features" id="features">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">BUILT FOR EVERYDAY OPERATIONS</p>
          <h2>Everything you need to manage stock</h2>
          <p>
            Organise inventory tasks with tools designed to make stock
            information easier to maintain and understand.
          </p>
        </div>

        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article className="landing-feature-card" key={feature.number}>
              <span className="landing-feature-number">{feature.number}</span>
              <span className="landing-feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="landing-workflow" id="how-it-works">
        <div>
          <p className="landing-eyebrow">A CLEARER WORKFLOW</p>
          <h2>From product records to informed stock decisions.</h2>
        </div>

        <div className="landing-workflow-steps">
          <div>
            <span>01</span>
            <p>
              <strong>Record your products</strong>
              <small>Add product details, prices, SKUs and stock thresholds.</small>
            </p>
          </div>
          <div>
            <span>02</span>
            <p>
              <strong>Track stock activity</strong>
              <small>Review quantities, adjustments and inventory movements.</small>
            </p>
          </div>
          <div>
            <span>03</span>
            <p>
              <strong>Act on what you see</strong>
              <small>Identify low-stock products and investigate discrepancies.</small>
            </p>
          </div>
        </div>
      </section>

      {/* Backend status and call to action */}
      <section className="landing-cta">
        <div>
          <p className="landing-eyebrow">READY TO GET ORGANISED?</p>
          <h2>Bring your inventory into one place.</h2>
          <p className="landing-cta-description">
            Sign in to continue or create an account to get started.
          </p>
        </div>
        <div className="landing-cta-actions">
          <Link to="/register" className="landing-button landing-button-light">
            Create account →
          </Link>
          <Link to="/login" className="landing-cta-login">
            Already registered? Sign in
          </Link>
        </div>
      </section>

      <section className="landing-backend" aria-live="polite">
        <span

          className={`landing-backend-indicator landing-backend-${backendStatus}`} aria-hidden="true"

        />
        <div>

          <strong>{statusText[backendStatus]}</strong>

          <p>
            {backendMessage ||
              "Waiting for a response from your inventory server."}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <Link to="/" className="landing-brand">
          <span className="landing-brand-mark">IMS</span>
          <span>
            Inventory Management System<span className="landing-brand-period">.</span>
          </span>
        </Link>

        <span>Inventory Management System</span>

        <a href="#top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Back to top ↑
        </a>

        <span className="landing-copyright">
          © {new Date().getFullYear()} Inventory Management System
        </span>
      </footer>
    </main>
  );
}
