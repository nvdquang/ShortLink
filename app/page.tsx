"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Globe2,
  Link2,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MousePointer2,
  QrCode,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  createShortLink,
  fetchAnalytics,
  fetchCurrentUser,
  fetchLinks,
  fetchSystemSettings,
  signIn,
  signOut,
  signUp,
  requestPasswordReset,
  shortUrlFor,
  updateSystemSettingsApi,
  fetchAdminUsers,
  updateAdminUser,
  type AdminUser,
  type AnalyticsSummary,
  type AuthUser,
  type LinkRecord,
  type SystemSettings,
} from "@/lib/api";

const deviceColors: Record<string, string> = {
  Mobile: "#0284c7",
  Desktop: "#d97706",
  Tablet: "#38bdf8",
  Unknown: "#94a3b8",
};

function getFormattedDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function Home() {
  const [view, setView] = useState<"create" | "analytics" | "admin">("create");
  const [advanced, setAdvanced] = useState(false);
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [qrColor, setQrColor] = useState("#0284c7");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [logo, setLogo] = useState<string | null>(null);
  const [resolution, setResolution] = useState("PNG");
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState<string>("");
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [currentLink, setCurrentLink] = useState<LinkRecord | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const isAdmin = user?.role === "admin";
  const [authOpen, setAuthOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);

  // System settings for admin
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [adminDefaultLogo, setAdminDefaultLogo] = useState("");
  const [adminDomain, setAdminDomain] = useState("");
  const [adminFreeLimit, setAdminFreeLimit] = useState(10);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminAlert, setAdminAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const effectiveLogo = logo || systemSettings?.defaultQrLogo || null;
  const configuredDomain = systemSettings?.shortlinkDomain?.trim() || "";
  const displayDomain = configuredDomain
    ? configuredDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
    : (typeof window !== "undefined" ? window.location.host : "localhost:3000");

  const safeUrl = useMemo(() => {
    if (!url.trim()) return "https://example.com/product/summer-collection";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }, [url]);

  const shortUrl = currentLink
    ? shortUrlFor(currentLink.short_code, configuredDomain)
    : `${displayDomain}/${alias.trim() || "summer26"}`;

  const clicks = analytics?.byDay.map((row) => ({ day: row.day.slice(5), value: row.clicks })) ?? [];
  const devices = analytics?.byDevice.map((row) => ({
    name: row.deviceType,
    value: analytics.totalClicks ? Math.round((row.clicks / analytics.totalClicks) * 100) : 0,
    color: deviceColors[row.deviceType] ?? deviceColors.Unknown,
  })) ?? [];
  const countries = analytics?.byReferer.map((row) => ({
    flag: "🌐",
    name: row.referer,
    value: analytics.totalClicks ? Math.round((row.clicks / analytics.totalClicks) * 100) : 0,
  })) ?? [];

  useEffect(() => {
    setMounted(true);
    let active = true;
    fetchCurrentUser()
      .then(({ user: current }) => {
        if (active) setUser(current);
      })
      .catch(() => undefined);
    fetchSystemSettings()
      .then(({ settings }) => {
        if (!active) return;
        setSystemSettings(settings);
        setAdminDefaultLogo(settings.defaultQrLogo || "");
        setAdminDomain(settings.shortlinkDomain || "");
        setAdminFreeLimit(settings.freeLinkLimit || 10);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchLinks(10)
      .then(({ links: rows }) => {
        if (!active) return;
        setLinks(rows);
        setCurrentLink((current) => current ?? rows[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Set default expiry (today + 5 days) only on the client, after mount,
  // so server-rendered HTML and client HTML always match (avoids hydration mismatch).
  useEffect(() => {
    setExpiry((curr) => {
      const canLimit = user?.role !== "admin" && user?.plan !== "plus";
      if (canLimit) {
        const maxVal = getFormattedDate(5);
        if (!curr || curr > maxVal) return maxVal;
        return curr;
      }
      return curr || getFormattedDate(5);
    });
  }, [user?.role, user?.plan]);

  useEffect(() => {
    if (view !== "analytics" || !currentLink) return;
    let active = true;
    fetchAnalytics(currentLink.short_code)
      .then((data) => {
        if (active) setAnalytics(data.summary);
      })
      .catch(() => {
        if (active) setAnalytics(null);
      });
    return () => {
      active = false;
    };
  }, [view, currentLink]);

  async function createLink() {
    if (loading) return;
    if (!url.trim()) {
      setError("Please enter a destination URL.");
      return;
    }
    if (password.trim()) {
      setError("Password protection is currently not supported by the backend.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let finalExpiry = expiry ? new Date(`${expiry}T23:59:59`).toISOString() : null;
      if (!isAdmin && user?.plan !== "plus") {
        const maxDate = getFormattedDate(5);
        if (!expiry || expiry > maxDate) {
          finalExpiry = new Date(`${maxDate}T23:59:59`).toISOString();
        }
      }
      const { link } = await createShortLink({
        originalUrl: safeUrl,
        customAlias: alias.trim() || null,
        title: null,
        expiresAt: finalExpiry,
        qrConfig: { color: qrColor, background: bgColor, resolution, logo: effectiveLogo },
      });
      setCurrentLink(link);
      setLinks((rows) => [link, ...rows.filter((row) => row.id !== link.id)]);
      setGenerated(true);
    } catch (cause) {
      setGenerated(false);
      setError(cause instanceof Error ? cause.message : "Unable to create link.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    if (forgotMode) {
      try {
        const { message } = await requestPasswordReset(authEmail);
        setAuthNotice(message);
        setForgotMode(false);
      } catch (cause) {
        setAuthError(cause instanceof Error ? cause.message : "Request failed.");
      } finally {
        setAuthBusy(false);
      }
      return;
    }
    try {
      const result = authMode === "login" ? await signIn(authEmail, authPassword) : await signUp(authEmail, authPassword);
      if (authMode === "register") {
        // Account created but not activated: show the check-your-email notice instead of signing in.
        setAuthNotice("Account created. We sent an activation link to your email — please verify to sign in.");
        setAuthMode("login");
        setAuthPassword("");
        return;
      }
      setUser(result.user);
      setAuthOpen(false);
      setAuthPassword("");
      const { links: ownedLinks } = await fetchLinks(10);
      setLinks(ownedLinks);
      setCurrentLink(ownedLinks[0] ?? null);
      if (result.user.role === "admin") {
        setView("admin");
      }
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut().catch(() => undefined);
    setUser(null);
    setCurrentLink(null);
    setAnalytics(null);
    setView("create");
    const { links: publicLinks } = await fetchLinks(10).catch(() => ({ links: [] }));
    setLinks(publicLinks);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function downloadQr() {
    const svg = document.querySelector("#qr-preview svg") as SVGSVGElement | null;
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    if (resolution === "SVG") {
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "shortlink-qr.svg";
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    const image = new Image();
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1200;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = bgColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 50, 50, 1100, 1100);
      canvas.toBlob((png) => {
        if (!png) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = "shortlink-qr.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  }

  async function handleSaveAdminSettings(e: React.FormEvent) {
    e.preventDefault();
    if (adminSaving) return;
    setAdminSaving(true);
    setAdminAlert(null);
    try {
      const { settings } = await updateSystemSettingsApi({
        defaultQrLogo: adminDefaultLogo,
        shortlinkDomain: adminDomain,
        freeLinkLimit: adminFreeLimit,
      });
      setSystemSettings(settings);
      setAdminAlert({ type: "success", message: "All system settings saved successfully!" });
    } catch (err) {
      setAdminAlert({ type: "error", message: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setAdminSaving(false);
    }
  }

  function loadAdminUsers() {
    setAdminUsersLoading(true);
    fetchAdminUsers()
      .then(({ users }) => setAdminUsers(users))
      .catch(() => setAdminUsers([]))
      .finally(() => setAdminUsersLoading(false));
  }

  async function handleAdminUserUpdate(userId: string, payload: { plan?: "free" | "plus"; linkLimit?: number | null }) {
    setAdminUsersLoading(true);
    try {
      const { user } = await updateAdminUser({ userId, ...payload });
      setAdminUsers((curr) => curr.map((u) => (u.id === user.id ? user : u)));
      setAdminAlert({ type: "success", message: `Updated account ${user.email} successfully.` });
    } catch (err) {
      setAdminAlert({ type: "error", message: err instanceof Error ? err.message : "Failed to update user." });
    } finally {
      setAdminUsersLoading(false);
    }
  }

  function handleLogoUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        setAdminDefaultLogo(result);
      }
    };
    reader.readAsDataURL(file);
  }

  const freeLimit = systemSettings?.freeLinkLimit ?? 10;
  const usedPercent = Math.min(100, Math.round((links.length / freeLimit) * 100));

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <a
          href="#home"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setView("create");
            setMobileNav(false);
          }}
        >
          <span className="brand-mark">
            <Link2 size={18} />
          </span>
          <span>
            shortlink<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <button
          className={`nav-item ${view === "create" ? "active" : ""}`}
          onClick={() => {
            setView("create");
            setMobileNav(false);
          }}
        >
          <Link2 size={17} /> Create Link
        </button>
        <button
          className={`nav-item ${view === "analytics" ? "active" : ""}`}
          onClick={() => {
            setView("analytics");
            setMobileNav(false);
          }}
        >
          <BarChart3 size={17} /> Analytics
        </button>

        {user?.role === "admin" && (
          <>
            <div className="sidebar-divider" style={{ margin: "18px 8px 14px" }} />
            <div className="workspace-label" style={{ color: "var(--gold-dark)", display: "flex", alignItems: "center", gap: 5 }}>
              <ShieldCheck size={13} /> ADMINISTRATION
            </div>
            <button
              className={`nav-item ${view === "admin" ? "active" : ""}`}
              style={
                view === "admin"
                  ? { background: "var(--gold-pale)", color: "var(--gold-dark)", fontWeight: 700 }
                  : { color: "var(--gold-dark)" }
              }
              onClick={() => {
                setView("admin");
                setMobileNav(false);
              }}
            >
              <Settings2 size={17} /> System Settings
            </button>
          </>
        )}

        <div className="sidebar-divider" />
        <div className="workspace-label links-label">
          RECENT LINKS{" "}
          <button title="View all" onClick={() => setView("analytics")}>
            <ArrowUpRight size={14} />
          </button>
        </div>
        {links.slice(0, 3).map((row) => (
          <button
            className="recent-link"
            key={row.id}
            onClick={() => {
              setCurrentLink(row);
              setView("analytics");
            }}
          >
            <span className="recent-icon">
              <Sparkles size={15} />
            </span>
            <span className="recent-copy">
              <b>{row.title ?? row.original_url.replace(/^https?:\/\//, "").split("/")[0]}</b>
              <small>/{row.short_code}</small>
            </span>
          </button>
        ))}
        {links.length === 0 && (
          <div className="sidebar-empty">{user ? "Create your first short link" : "Sign in to manage your custom links"}</div>
        )}

        <div className="sidebar-bottom">
          {user?.role === "admin" ? (
            <div className="plan-box" style={{ background: "var(--gold-pale)", borderColor: "var(--gold-border)" }}>
              <div className="plan-top">
                <span style={{ color: "var(--gold-dark)", display: "flex", alignItems: "center", gap: 4 }}>
                  <ShieldCheck size={12} /> Administrator
                </span>
                <span style={{ color: "var(--gold-dark)" }}>Unlimited</span>
              </div>
              <div className="plan-track">
                <i style={{ width: "100%", background: "var(--gold)" }} />
              </div>
              <p>{links.length} links created (No limit)</p>
              <button style={{ color: "var(--gold-dark)" }} onClick={() => setView("admin")}>
                System Settings <ArrowUpRight size={14} />
              </button>
            </div>
          ) : user?.plan === "plus" ? (
            <div className="plan-box" style={{ background: "var(--gold-pale)", borderColor: "var(--gold-border)" }}>
              <div className="plan-top">
                <span>Plus plan</span>
                <span style={{ color: "var(--gold-dark)", fontWeight: 700 }}>★</span>
              </div>
              <p>{`${links.length} links created — unlimited links & expiry`}</p>
              <button onClick={() => setAdvanced(true)}>Plus: no expiry limit <ArrowUpRight size={14} /></button>
            </div>
          ) : (
            <div className="plan-box">
              <div className="plan-top">
                <span>{user ? "Free plan" : "Guest"}</span>
                <span>{user ? `${usedPercent}%` : "—"}</span>
              </div>
              <div className="plan-track">
                <i style={{ width: `${user ? usedPercent : 0}%` }} />
              </div>
              <p>{user ? `${links.length} / ${freeLimit} links used` : "Sign in to save links"}</p>
              <button
                onClick={() => (user ? setAdvanced(true) : (setAuthMode("register"), setAuthOpen(true)))}
                disabled={!!user && user.role !== "admin" && user.plan !== "plus"}
              >
                {user ? `Free limit: ${freeLimit} links` : "Create account"} <ArrowUpRight size={14} />
              </button>
            </div>
          )}

          {user ? (
            <button className="profile profile-action" onClick={handleSignOut}>
              <span className="avatar" style={user.role === "admin" ? { background: "var(--gold-pale)", color: "var(--gold-dark)" } : {}}>
                {user.email.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <b>{user.email}</b>
                <small>{user.role === "admin" ? "Administrator (Sign out)" : "Member (Sign out)"}</small>
              </span>
              <LogOut size={15} />
            </button>
          ) : (
            <button
              className="profile profile-action"
              onClick={() => {
                setAuthMode("login");
                setAuthOpen(true);
              }}
            >
              <span className="avatar">?</span>
              <span>
                <b>Guest</b>
                <small>Sign in / Register</small>
              </span>
              <LogIn size={15} />
            </button>
          )}
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <section className="main-panel">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMobileNav(true)}>
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <b>
              {view === "create" ? "Create Link" : view === "analytics" ? "Analytics" : "System Settings (Admin)"}
            </b>
          </div>
          <div className="top-actions">
            {user?.role === "admin" && (
              <span className="admin-badge">
                <ShieldCheck size={12} /> ADMINISTRATOR
              </span>
            )}
            <span className="status-dot" /> <span className="online-label">All systems operational</span>
            <button
              className="help-button"
              onClick={() => (user ? handleSignOut() : (setAuthMode("login"), setAuthOpen(true)))}
            >
              {user ? "Sign Out" : "Sign In"}
            </button>
            <button
              className="top-avatar"
              style={user?.role === "admin" ? { background: "var(--gold-pale)", color: "var(--gold-dark)" } : {}}
              onClick={() => (user ? undefined : (setAuthMode("register"), setAuthOpen(true)))}
            >
              {user ? user.email.slice(0, 2).toUpperCase() : "AN"}
            </button>
          </div>
        </header>

        {view === "create" && (
          <div className="content create-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" /> LINK MANAGEMENT
                </div>
                <h1>Create New Link</h1>
                <p>Shorten URLs and generate customized QR codes in seconds.</p>
              </div>
              <button className="history-button" onClick={() => setView("analytics")}>
                <Activity size={16} /> Link History
              </button>
            </div>

            <div className="create-grid">
              <div className="creation-column">
                <section className="form-section">
                  <div className="section-heading">
                    <span className="step-number">01</span>
                    <div>
                      <h2>Destination URL</h2>
                      <p>Enter the link you want to share</p>
                    </div>
                    <span className="required-label">REQUIRED</span>
                  </div>
                  <label className="input-label" htmlFor="destination">
                    Target URL
                  </label>
                  <div className="url-input-wrap">
                    <Globe2 size={17} />
                    <input
                      id="destination"
                      type="url"
                      placeholder="https://example.com/your-destination-page"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setGenerated(false);
                      }}
                    />
                    <button
                      aria-label="Paste URL"
                      className="paste-button"
                      onClick={async () => {
                        try {
                          setUrl(await navigator.clipboard.readText());
                        } catch {
                          /* Clipboard permission is optional. */
                        }
                      }}
                    >
                      Paste
                    </button>
                  </div>
                  <div className="preview-strip">
                    <span className="preview-favicon">{url ? "W" : "⌘"}</span>
                    <span className="preview-content">
                      <b>{url ? url.replace(/^https?:\/\//, "").split("/")[0] : "Preview destination page"}</b>
                      <small>
                        {url
                          ? "Meta tags and preview image are not pre-rendered by API"
                          : "Page title, favicon, and preview details will display here"}
                      </small>
                    </span>
                    <span className="scan-status">
                      <span /> {url ? "READY" : "WAITING FOR URL"}
                    </span>
                  </div>
                </section>

                <button
                  className={`advanced-toggle ${advanced ? "expanded" : ""}`}
                  onClick={() => {
                    // Advanced options are admin/Plus only; Free and guest accounts cannot operate this.
                    if (user && user.role !== "admin" && user.plan !== "plus") {
                      setError("Advanced Options are available to Plus and administrator accounts only.");
                      return;
                    }
                    setAdvanced(!advanced);
                  }}
                >
                  <span className="advanced-icon">
                    <Settings2 size={17} />
                  </span>
                  <span className="advanced-copy">
                    <b>Advanced Options</b>
                    <small>Custom alias, domain, QR code styling, and expiration</small>
                    <small style={{ color: "var(--gold-dark)", fontWeight: 700 }}>(Plus accounts)</small>
                  </span>
                  <ChevronDown size={17} className="advanced-chevron" />
                </button>

                {advanced && (
                  <section className="advanced-panel">
                    <div className="advanced-grid">
                      <div>
                        <label className="input-label" htmlFor="alias">
                          Custom Alias
                        </label>
                        <div className="alias-input">
                          <span>{displayDomain}/</span>
                          <input
                            id="alias"
                            placeholder="your-custom-alias"
                            value={alias}
                            onChange={(e) => setAlias(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="input-label" htmlFor="domain">
                          Shortlink Domain
                        </label>
                        <input
                          id="domain"
                          type="text"
                          readOnly
                          value={configuredDomain || "localhost:3000 (Default)"}
                          title={user?.role === "admin" ? "Configured in System Settings" : "System domain set by administrator"}
                          style={{ background: "#f8fafc", cursor: "default" }}
                        />
                      </div>
                      <div>
                        <label className="input-label" htmlFor="password">
                          Access Password
                        </label>
                        <div className="password-wrap">
                          <LockKeyhole size={15} />
                          <input
                            id="password"
                            type="password"
                            placeholder="Optional (coming soon)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="input-label" htmlFor="expiry">
                          Expiration Date
                        </label>
                        <input
                          id="expiry"
                          type="date"
                          value={expiry}
                          max={mounted && user?.role !== "admin" && user?.plan !== "plus" ? getFormattedDate(5) : undefined}
                          onChange={(e) => setExpiry(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="qr-settings">
                      <div className="settings-title">
                        <QrCode size={16} />
                        <b>QR Code Studio</b>
                        {effectiveLogo && (
                          <span style={{ fontSize: 9, color: "var(--sky)", marginLeft: 6, fontWeight: 700 }}>
                            • {logo ? "Custom Logo" : "Default Logo"}
                          </span>
                        )}
                      </div>
                      <div className="qr-controls">
                        <label className="color-control">
                          <span>Code Color</span>
                          <span className="color-picker">
                            <input
                              aria-label="QR Code Color"
                              type="color"
                              value={qrColor}
                              onChange={(e) => setQrColor(e.target.value)}
                            />
                            <code>{qrColor.toUpperCase()}</code>
                          </span>
                        </label>
                        <label className="color-control">
                          <span>Background</span>
                          <span className="color-picker">
                            <input
                              aria-label="QR Background Color"
                              type="color"
                              value={bgColor}
                              onChange={(e) => setBgColor(e.target.value)}
                            />
                            <code>{bgColor.toUpperCase()}</code>
                          </span>
                        </label>
                        <label className="select-control">
                          <span>Format</span>
                          <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                            <option>PNG</option>
                            <option>SVG</option>
                            <option>PDF</option>
                          </select>
                        </label>
                        <label className="select-control">
                          <span>Center Logo</span>
                          <div style={{ display: "flex", gap: 5 }}>
                            <label className="upload-button">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) setLogo(URL.createObjectURL(file));
                                }}
                              />
                              {logo ? <Check size={14} /> : <ArrowDownToLine size={14} />}
                              {logo ? "Selected" : effectiveLogo ? "Change" : "Upload"}
                            </label>
                            {logo && (
                              <button
                                type="button"
                                title="Remove custom logo and revert to system default"
                                onClick={() => setLogo(null)}
                                style={{
                                  border: "1px solid var(--line)",
                                  background: "#fff",
                                  borderRadius: 4,
                                  padding: "0 6px",
                                  fontSize: 9,
                                  color: "#dc2626",
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  </section>
                )}

                <div className="form-footer">
                  <span>
                    <LockKeyhole size={14} /> Your short links are encrypted and secured
                  </span>
                  <button className="primary-button" onClick={createLink} disabled={loading}>
                    <Sparkles size={16} /> {loading ? "Generating..." : "Shorten & Generate QR"}{" "}
                    <span className="button-arrow">↗</span>
                  </button>
                </div>

                {error && (
                  <p
                    className="result-error"
                    role="alert"
                    style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "8px 12px", borderRadius: 6 }}
                  >
                    {error}
                  </p>
                )}

                {generated && (
                  <section className="result-section">
                    <div className="result-head">
                      <div className="result-success">
                        <Check size={16} />
                      </div>
                      <div>
                        <h2>Your Link is Ready</h2>
                        <p>Successfully created and ready to share immediately.</p>
                      </div>
                      <button className="close-result icon-button" title="Close" onClick={() => setGenerated(false)}>
                        <X size={17} />
                      </button>
                    </div>
                    <div className="result-body">
                      <div className="result-link">
                        <small>SHORT LINK</small>
                        <div>
                          <b>{shortUrl}</b>
                          <button className="copy-button" title="Copy short link" onClick={copyLink}>
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                          </button>
                        </div>
                        {copied && <span className="copied-label">Copied to clipboard</span>}
                      </div>
                      <div className="result-qr" id="qr-preview">
                        <QRCodeSVG
                          value={shortUrl}
                          size={132}
                          fgColor={qrColor}
                          bgColor={bgColor}
                          level="H"
                          imageSettings={
                            effectiveLogo ? { src: effectiveLogo, height: 28, width: 28, excavate: true } : undefined
                          }
                        />
                        <button className="download-qr" onClick={downloadQr}>
                          <ArrowDownToLine size={15} /> Download {resolution === "PDF" ? "PNG" : resolution}
                        </button>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              <aside className="preview-column">
                <div className="preview-card">
                  <div className="preview-card-head">
                    <div>
                      <h3>QR Preview</h3>
                      <p>Live preview</p>
                    </div>
                    <span className="live-indicator">
                      <i /> LIVE
                    </span>
                  </div>
                  <div className="qr-stage" style={{ backgroundColor: bgColor }}>
                    <QRCodeSVG
                      value={generated ? shortUrl : safeUrl}
                      size={174}
                      fgColor={qrColor}
                      bgColor={bgColor}
                      level="H"
                      imageSettings={
                        effectiveLogo ? { src: effectiveLogo, height: 36, width: 36, excavate: true } : undefined
                      }
                    />
                  </div>
                  <div className="qr-preview-url">
                    <span>{generated ? shortUrl : url || "Enter a URL to preview QR code"}</span>
                    <button title="Copy link" onClick={copyLink}>
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                  <div className="preview-card-footer">
                    <span>
                      <span className="qr-format-icon">{resolution === "SVG" ? "S" : "P"}</span>
                      {resolution} · High resolution
                    </span>
                    <button onClick={downloadQr}>
                      <ArrowDownToLine size={15} /> Download
                    </button>
                  </div>
                </div>
                <div className="tip-card">
                  <div className="tip-icon">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <b>Pro Tip</b>
                    <p>Adding a centered logo reinforces brand recognition. Select high-contrast colors for effortless scanning.</p>
                  </div>
                </div>
                <div className="security-note">
                  <LockKeyhole size={14} />
                  <span>Secured with modern SSL encryption</span>
                  <span className="security-check">
                    <Check size={12} />
                  </span>
                </div>
              </aside>
            </div>
          </div>
        )}

        {view === "analytics" && (
          <div className="content analytics-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" /> PERFORMANCE OVERVIEW
                </div>
                <h1>Link Analytics</h1>
                <p>Track visitor engagement and performance metrics in real time.</p>
              </div>
              <div className="analytics-actions">
                <select
                  aria-label="Select short link"
                  value={currentLink?.short_code ?? ""}
                  onChange={(event) =>
                    setCurrentLink(links.find((link) => link.short_code === event.target.value) ?? null)
                  }
                >
                  <option value="" disabled>
                    Select a link
                  </option>
                  {links.map((link) => (
                    <option key={link.id} value={link.short_code}>
                      {link.title ?? link.short_code}
                    </option>
                  ))}
                </select>
                <select aria-label="Date range">
                  <option>Last 30 days</option>
                  <option>Last 7 days</option>
                  <option>Last 90 days</option>
                </select>
                <button className="export-button">
                  <ArrowDownToLine size={15} /> Export Report
                </button>
              </div>
            </div>

            <div className="analytics-linkbar">
              <div className="analytics-link-icon">
                <Link2 size={17} />
              </div>
              <div>
                <b>
                  {currentLink?.title ??
                    currentLink?.original_url.replace(/^https?:\/\//, "").split("/")[0] ??
                    "No link selected"}
                </b>
                <span>{currentLink?.original_url ?? "Create a link to view performance analytics."}</span>
              </div>
              <button className="short-chip" onClick={copyLink}>
                {shortUrl} {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              <a href="#analytics" className="open-link" title="Open short link">
                <ExternalLink size={16} />
              </a>
            </div>

            <div className="metric-grid">
              <article className="metric-card">
                <div className="metric-top">
                  <span>Total Clicks</span>
                  <span className="metric-icon green">
                    <MousePointer2 size={16} />
                  </span>
                </div>
                <strong>{(analytics?.totalClicks ?? currentLink?.click_count ?? 0).toLocaleString()}</strong>
                <div className="metric-foot">
                  <span>Real-time tracked</span>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Unique Visitors</span>
                  <span className="metric-icon orange">
                    <Activity size={16} />
                  </span>
                </div>
                <strong>{(analytics?.uniqueVisitors ?? 0).toLocaleString()}</strong>
                <div className="metric-foot">
                  <span>Based on unique IP</span>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Link Status</span>
                  <span className="metric-icon blue">
                    <BarChart3 size={16} />
                  </span>
                </div>
                <strong>{currentLink?.is_active ? "Active" : "—"}</strong>
                <div className="metric-foot">
                  <span>
                    {currentLink?.expires_at
                      ? `Expires ${new Date(currentLink.expires_at).toLocaleDateString()}`
                      : "No expiration set"}
                  </span>
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-top">
                  <span>Referrer Sources</span>
                  <span className="metric-icon plum">
                    <Globe2 size={16} />
                  </span>
                </div>
                <strong>{analytics?.byReferer.length ?? 0}</strong>
                <div className="metric-foot">
                  <span>Recorded from requests</span>
                </div>
              </article>
            </div>

            <section className="chart-card click-chart">
              <div className="chart-heading">
                <div>
                  <h2>Clicks Over Time</h2>
                  <p>
                    {analytics?.firstClickAt
                      ? `From ${new Date(analytics.firstClickAt).toLocaleDateString()} to present`
                      : "No clicks recorded yet"}
                  </p>
                </div>
                <div className="chart-legend">
                  <span />
                  <b>Clicks</b>
                  <select aria-label="Time resolution">
                    <option>Daily</option>
                    <option>Weekly</option>
                  </select>
                </div>
              </div>
              <div className="line-chart">
                {clicks.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={clicks} margin={{ top: 12, right: 4, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="clickFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0284c7" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 4" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} dy={10} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        ticks={[0, 200, 400, 600, 800, 1000]}
                      />
                      <Tooltip contentStyle={{ border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12 }} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Clicks"
                        stroke="#0284c7"
                        strokeWidth={2.5}
                        fill="url(#clickFill)"
                        activeDot={{ r: 5, fill: "#0284c7", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-chart">
                    {currentLink
                      ? "No clicks yet. Open the short link to start collecting statistics."
                      : "Create or select a link to view analytics."}
                  </div>
                )}
              </div>
            </section>

            <div className="insights-grid">
              <section className="chart-card device-card">
                <div className="chart-heading">
                  <div>
                    <h2>Visitor Devices</h2>
                    <p>Distribution by device category</p>
                  </div>
                  <button className="more-button" aria-label="More options">
                    <ChevronDown size={17} />
                  </button>
                </div>
                <div className="device-content">
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={devices}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={86}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {devices.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <strong>{(analytics?.totalClicks ?? 0).toLocaleString()}</strong>
                      <span>TOTAL CLICKS</span>
                    </div>
                  </div>
                  <div className="legend-list">
                    {devices.map((device) => (
                      <div className="legend-row" key={device.name}>
                        <span className="legend-dot" style={{ background: device.color }} />
                        <span>{device.name}</span>
                        <b>{device.value}%</b>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="chart-card country-card">
                <div className="chart-heading">
                  <div>
                    <h2>Traffic Sources</h2>
                    <p>Clicks categorized by referrer</p>
                  </div>
                  <button className="more-button" aria-label="Open referrer stats">
                    <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="country-list">
                  {countries.map((country) => (
                    <div className="country-row" key={country.name}>
                      <span className="country-flag">{country.flag}</span>
                      <span className="country-name">{country.name}</span>
                      <div className="country-track">
                        <i style={{ width: `${country.value * 2.1}%` }} />
                      </div>
                      <b>{country.value}%</b>
                    </div>
                  ))}
                </div>
                <button
                  className="all-countries"
                  onClick={() =>
                    currentLink &&
                    fetchAnalytics(currentLink.short_code, 100)
                      .then((data) => setAnalytics(data.summary))
                      .catch(() => undefined)
                  }
                >
                  Refresh Analytics <ArrowUpRight size={14} />
                </button>
              </section>
            </div>

            <footer className="dashboard-foot">
              <span>
                <span className="status-dot" /> Data updated just now
              </span>
              <span>Timestamps displayed in local timezone</span>
            </footer>
          </div>
        )}

        {view === "admin" && (
          <div className="content admin-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow" style={{ color: "var(--gold-dark)" }}>
                  <ShieldCheck size={14} /> SYSTEM ADMINISTRATION
                </div>
                <h1>System Configuration</h1>
                <p>Manage the default QR code logo, custom shortlink domain, and account creation limits.</p>
              </div>
              <span className="admin-badge" style={{ fontSize: 11, padding: "6px 12px" }}>
                Account: {user?.email}
              </span>
            </div>

            {adminAlert && (
              <div className={adminAlert.type === "success" ? "admin-alert-success" : "admin-alert-error"}>
                {adminAlert.type === "success" ? <Check size={16} /> : <X size={16} />}
                <span>{adminAlert.message}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdminSettings}>
              <div className="admin-grid">
                {/* Setting 1: Default QR Logo */}
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon">
                      <QrCode size={19} />
                    </div>
                    <div>
                      <h2>1. Default QR Code Logo</h2>
                      <p>This logo will automatically appear in the center of all QR codes unless a user provides a custom logo.</p>
                    </div>
                  </div>

                  <div className="admin-logo-preview-box">
                    <div className="admin-logo-thumb">
                      {adminDefaultLogo ? (
                        <img src={adminDefaultLogo} alt="Default QR Logo" />
                      ) : (
                        <span style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", padding: 4 }}>No logo</span>
                      )}
                    </div>
                    <div style={{ flex: 1, display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <label className="upload-button" style={{ cursor: "pointer" }}>
                          <Upload size={14} /> Upload Image
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleLogoUpload(f);
                            }}
                          />
                        </label>
                        {adminDefaultLogo && (
                          <button
                            type="button"
                            className="upload-button"
                            style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}
                            onClick={() => setAdminDefaultLogo("")}
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>
                      <span className="admin-field-hint">Supports PNG, JPG, SVG, or Data URL.</span>
                    </div>
                  </div>

                  <div className="admin-field" style={{ marginTop: 12 }}>
                    <label htmlFor="admin-logo-url">Or enter image URL directly</label>
                    <input
                      id="admin-logo-url"
                      type="text"
                      placeholder="https://example.com/logo.png"
                      value={adminDefaultLogo.startsWith("data:") ? "Base64 Image Data (Uploaded)" : adminDefaultLogo}
                      onChange={(e) => setAdminDefaultLogo(e.target.value)}
                    />
                  </div>

                  <div style={{ marginTop: 14, padding: 12, background: "#f8fafc", border: "1px solid var(--line)", borderRadius: 6, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ background: "#fff", padding: 6, borderRadius: 6, border: "1px solid var(--line)" }}>
                      <QRCodeSVG
                        value="https://shortlink.example/preview"
                        size={64}
                        level="H"
                        fgColor="#0284c7"
                        imageSettings={adminDefaultLogo ? { src: adminDefaultLogo, height: 16, width: 16, excavate: true } : undefined}
                      />
                    </div>
                    <span style={{ fontSize: 10, color: "#64748b", lineHeight: 1.4 }}>
                      Live preview of QR code with selected default logo.
                    </span>
                  </div>
                </div>

                {/* Setting 2: Shortlink Domain */}
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon blue">
                      <Globe2 size={19} />
                    </div>
                    <div>
                      <h2>2. ShortLink Domain</h2>
                      <p>The domain name used to format shortened links and encode into QR codes.</p>
                    </div>
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-domain-input">System Domain</label>
                    <input
                      id="admin-domain-input"
                      type="text"
                      placeholder="localhost:3000 or slink.vn or https://s.company.com"
                      value={adminDomain}
                      onChange={(e) => setAdminDomain(e.target.value)}
                    />
                    <span className="admin-field-hint">
                      Leave blank to default to browser host (e.g. <code>localhost:3000</code>).
                    </span>
                  </div>

                  <div style={{ marginTop: 14, padding: 12, background: "var(--sky-subtle)", border: "1px solid #bae6fd", borderRadius: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--sky-dark)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                      Display URL format:
                    </span>
                    <code style={{ fontSize: 12, color: "var(--sky)", fontWeight: 700 }}>
                      {adminDomain.trim()
                        ? `${adminDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}/aB3x9Qr`
                        : `${typeof window !== "undefined" ? window.location.host : "localhost:3000"}/aB3x9Qr`}
                    </code>
                  </div>
                </div>

                {/* Setting 3: Free Link Limit */}
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon amber">
                      <Sparkles size={19} />
                    </div>
                    <div>
                      <h2>3. Link Creation Limit (Free Accounts)</h2>
                      <p>Maximum number of short links a standard (Free) account can create.</p>
                    </div>
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-limit-input">Maximum Link Count</label>
                    <input
                      id="admin-limit-input"
                      type="number"
                      min={1}
                      max={10000}
                      value={adminFreeLimit}
                      onChange={(e) => setAdminFreeLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                    <span className="admin-field-hint">
                      Default: 10 links. Administrator accounts have no link limit.
                    </span>
                  </div>

                  <div style={{ marginTop: 14, padding: 12, background: "var(--gold-pale)", border: "1px solid var(--gold-border)", borderRadius: 6 }}>
                    <span style={{ fontSize: 10, color: "var(--gold-dark)", lineHeight: 1.4, display: "block" }}>
                      When a standard account reaches this limit ({adminFreeLimit} links), further creations will be blocked with a prompt to contact an administrator.
                    </span>
                  </div>
                </div>
              </div>

              {/* Setting 4: User Management (plan & per-user limits) */}
              <div className="admin-card" style={{ marginTop: 16 }}>
                <div className="admin-card-head">
                  <div className="admin-card-icon">
                    <Users size={19} />
                  </div>
                  <div>
                    <h2>4. User Management — Plans & Link Limits</h2>
                    <p>Upgrade a user from Free to Plus (unlimited links & unlimited expiry) or raise their personal link creation limit.</p>
                  </div>
                </div>

                <button
                  type="button"
                  className="upload-button"
                  style={{ marginBottom: 10 }}
                  onClick={loadAdminUsers}
                  disabled={adminUsersLoading}
                >
                  <Users size={14} /> {adminUsersLoading ? "Loading..." : adminUsers.length ? "Refresh Users" : "Load Users"}
                </button>

                {adminUsers.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid var(--line)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
                          <th style={{ padding: "6px 8px" }}>Email</th>
                          <th style={{ padding: "6px 8px" }}>Role</th>
                          <th style={{ padding: "6px 8px" }}>Plan</th>
                          <th style={{ padding: "6px 8px" }}>Links</th>
                          <th style={{ padding: "6px 8px" }}>Limit</th>
                          <th style={{ padding: "6px 8px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((u) => (
                          <tr key={u.id} style={{ borderBottom: "1px solid var(--line)" }}>
                            <td style={{ padding: "6px 8px", fontWeight: 600 }}>{u.email}</td>
                            <td style={{ padding: "6px 8px" }}>
                              <span style={{ color: u.role === "admin" ? "var(--gold-dark)" : "#64748b", fontWeight: 700 }}>
                                {u.role}
                              </span>
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              <span
                                style={{
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  background: u.plan === "plus" ? "var(--gold-pale)" : "#f1f5f9",
                                  color: u.plan === "plus" ? "var(--gold-dark)" : "#475569",
                                  border: `1px solid ${u.plan === "plus" ? "var(--gold-border)" : "var(--line)"}`,
                                }}
                              >
                                {u.plan === "plus" ? "PLUS" : "FREE"}
                              </span>
                            </td>
                            <td style={{ padding: "6px 8px" }}>{u.linkCount}</td>
                            <td style={{ padding: "6px 8px" }}>
                              {u.plan === "plus" || u.role === "admin" ? (
                                <span style={{ color: "var(--gold-dark)", fontWeight: 700 }}>Unlimited</span>
                              ) : (
                                <input
                                  aria-label={`Link limit for ${u.email}`}
                                  type="number"
                                  min={1}
                                  defaultValue={u.linkLimit ?? systemSettings?.freeLinkLimit ?? 10}
                                  style={{ width: 64, padding: "3px 6px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 11 }}
                                  onBlur={(e) => {
                                    const value = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    if (value !== (u.linkLimit ?? systemSettings?.freeLinkLimit ?? 10)) {
                                      handleAdminUserUpdate(u.id, { linkLimit: value });
                                    }
                                  }}
                                />
                              )}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {u.role === "admin" ? (
                                <span style={{ fontSize: 10, color: "#94a3b8" }}>—</span>
                              ) : u.plan === "plus" ? (
                                <button
                                  type="button"
                                  className="upload-button"
                                  style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2", fontSize: 10 }}
                                  onClick={() => handleAdminUserUpdate(u.id, { plan: "free" })}
                                >
                                  Downgrade to Free
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="upload-button"
                                  style={{ color: "var(--gold-dark)", borderColor: "var(--gold-border)", background: "var(--gold-pale)", fontWeight: 700, fontSize: 10 }}
                                  onClick={() => handleAdminUserUpdate(u.id, { plan: "plus" })}
                                >
                                  Upgrade to Plus
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <span className="admin-field-hint" style={{ display: "block", marginTop: 8 }}>
                      PLUS accounts have unlimited links and can set any expiration date. FREE accounts use the plan limit above (or their personal limit) and a 5-day expiry cap.
                    </span>
                  </div>
                )}
              </div>

              <div className="admin-actions-bar">
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4, color: "var(--gold)" }} />
                  Settings are saved directly to SQLite and take effect immediately across the entire platform.
                </div>
                <button type="submit" className="primary-button" disabled={adminSaving} style={{ padding: "0 20px" }}>
                  <Save size={16} /> {adminSaving ? "Saving..." : "Save All Settings"}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {authOpen && (
        <div
          className="auth-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAuthOpen(false);
          }}
        >
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close icon-button" aria-label="Close" onClick={() => setAuthOpen(false)}>
              <X size={18} />
            </button>
            <div className="auth-mark">
              <Link2 size={19} />
            </div>
            <div className="auth-kicker">SHORTLINK WORKSPACE</div>
            <h2 id="auth-title">{forgotMode ? "Reset Password" : authMode === "login" ? "Welcome Back" : "Create Your Account"}</h2>
            <p className="auth-subtitle">
              {forgotMode
                ? "Enter your account email and we will send you a password reset link."
                : authMode === "login"
                ? "Sign in to manage short links, view analytics, and configure settings."
                : "Save, manage, and brand your own short links."}
            </p>
            {authNotice && (
              <div
                role="status"
                style={{
                  marginBottom: 10,
                  padding: "8px 10px",
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  color: "#15803d",
                  borderRadius: 6,
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                {authNotice}
              </div>
            )}
            <form className="auth-form" onSubmit={submitAuth}>
              <label htmlFor="auth-email">Email / Username</label>
              <input
                id="auth-email"
                type="text"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={255}
                placeholder="you@example.com"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
              />
              {!forgotMode && (
                <>
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={authMode === "register" ? 10 : 1}
                    maxLength={128}
                    placeholder={authMode === "register" ? "At least 10 characters" : "Enter password"}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                  />
                </>
              )}
              {authError && (
                <p className="auth-error" role="alert">
                  {authError}
                </p>
              )}
              <button className="auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? (
                  "Processing..."
                ) : forgotMode ? (
                  <>
                    <Mail size={16} /> Send Reset Link
                  </>
                ) : authMode === "login" ? (
                  <>
                    <LogIn size={16} /> Sign In
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> Create Account
                  </>
                )}
              </button>
            </form>

            {authMode === "login" && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--sky)",
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    setForgotMode((f) => !f);
                    setAuthError(null);
                    setAuthNotice(null);
                  }}
                >
                  {forgotMode ? "Back to Sign In" : "Forgot password?"}
                </button>
              </div>
            )}

            <div className="auth-switch">
              {authMode === "login" ? "Don't have an account?" : "Already have an account?"}
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuthError(null);
                }}
              >
                {authMode === "login" ? "Create Account" : "Sign In"}
              </button>
            </div>
            <div className="auth-security">
              <LockKeyhole size={13} /> Passwords hashed with scrypt; secure sessions stored in HttpOnly cookies.
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
