"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  Copy,
  Globe2,
  Link2,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MousePointer2,
  Pencil,
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
  fetchAdminQuotaTokens,
  createAdminQuotaToken,
  redeemQuotaToken,
  updateAdminUser,
  updateShortLink,
  type AdminUser,
  type AnalyticsSummary,
  type AuthUser,
  type LinkRecord,
  type LinkUsage,
  type QuotaTokenRecord,
  type SystemSettings,
} from "@/lib/api";

function getFormattedDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function vietQrField(id: string, value: string): string {
  const length = new TextEncoder().encode(value).length;
  return `${id}${String(length).padStart(2, "0")}${value}`;
}

function calculateCrc16(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function createUpgradeVietQr(memo: string): string | null {
  const accountInfo = vietQrField("00", "970423") + vietQrField("01", "0918884034");
  const merchantAccountInfo =
    vietQrField("00", "A000000727") +
    vietQrField("01", accountInfo) +
    vietQrField("02", "QRIBFTTA");
  if (new TextEncoder().encode(memo).length > 95) return null;
  const additionalData = vietQrField("08", memo);

  const payload =
    vietQrField("00", "01") +
    vietQrField("01", "12") +
    vietQrField("38", merchantAccountInfo) +
    vietQrField("52", "0000") +
    vietQrField("53", "704") +
    vietQrField("54", "60000") +
    vietQrField("58", "VN") +
    vietQrField("59", "NGUYEN VU DUY QUANG") +
    vietQrField("62", additionalData) +
    "6304";
  return `${payload}${calculateCrc16(payload)}`;
}

export default function Home() {
  const [view, setView] = useState<"create" | "analytics" | "admin" | "user-management">("create");
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
  const [expiredUrl, setExpiredUrl] = useState("");
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [linkUsage, setLinkUsage] = useState<LinkUsage | null>(null);
  const [currentLink, setCurrentLink] = useState<LinkRecord | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
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
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // System settings for admin
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [adminDefaultLogo, setAdminDefaultLogo] = useState("");
  const [adminDomain, setAdminDomain] = useState("");
  const [adminExpiredRedirectUrl, setAdminExpiredRedirectUrl] = useState("");
  const [adminSystemMode, setAdminSystemMode] = useState<"free" | "plan">("plan");
  const [adminFreeLimit, setAdminFreeLimit] = useState(10);
  const [adminActivationEmailFrom, setAdminActivationEmailFrom] = useState("");
  const [adminRequireEmailActivation, setAdminRequireEmailActivation] = useState(true);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUserEmailFilter, setAdminUserEmailFilter] = useState("");
  const [adminAlert, setAdminAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [adminTokens, setAdminTokens] = useState<QuotaTokenRecord[]>([]);
  const [adminTokensLoading, setAdminTokensLoading] = useState(false);
  const [adminTokenCreating, setAdminTokenCreating] = useState(false);
  const [adminTokenCount, setAdminTokenCount] = useState(10);
  const [revealedToken, setRevealedToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [tokenRedeeming, setTokenRedeeming] = useState(false);
  const [tokenNotice, setTokenNotice] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<LinkRecord | null>(null);
  const [editOriginalUrl, setEditOriginalUrl] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editExpiredUrl, setEditExpiredUrl] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editQrColor, setEditQrColor] = useState("#0284c7");
  const [editQrBackground, setEditQrBackground] = useState("#ffffff");
  const [editQrLogo, setEditQrLogo] = useState("");
  const [editQrExtras, setEditQrExtras] = useState<Record<string, unknown>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const effectiveLogo = logo || systemSettings?.defaultQrLogo || null;
  const configuredDomain = systemSettings?.shortlinkDomain?.trim() || "";
  const systemMode = systemSettings?.systemMode ?? "plan";
  const hasAdvancedAccess = systemMode === "free" || user?.role === "admin" || user?.plan === "plus";
  const displayDomain = configuredDomain
    ? configuredDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
    : (typeof window !== "undefined" ? window.location.host : "127.0.0.1:3333");

  const safeUrl = useMemo(() => {
    if (!url.trim()) return "https://example.com/product/summer-collection";
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }, [url]);

  const shortUrl = currentLink
    ? shortUrlFor(currentLink.short_code, configuredDomain)
    : `${displayDomain}/${alias.trim() || "summer26"}`;

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
        setAdminExpiredRedirectUrl(settings.expiredRedirectUrl || "");
        setAdminSystemMode(settings.systemMode === "free" ? "free" : "plan");
        setAdminFreeLimit(settings.freeLinkLimit || 10);
        setAdminActivationEmailFrom(settings.activationEmailFrom || "");
        setAdminRequireEmailActivation(settings.requireEmailActivation);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchLinks(100)
      .then(({ links: rows, usage }) => {
        if (!active) return;
        setLinks(rows);
        setLinkUsage(usage);
        setCurrentLink((current) => current ?? rows[0] ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (user?.role !== "admin") {
      setAdminTokens([]);
      return;
    }
    let active = true;
    setAdminTokensLoading(true);
    fetchAdminQuotaTokens()
      .then(({ tokens }) => {
        if (active) setAdminTokens(tokens);
      })
      .catch((cause) => {
        if (active) setAdminAlert({ type: "error", message: cause instanceof Error ? cause.message : "Unable to load quota tokens." });
      })
      .finally(() => {
        if (active) setAdminTokensLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.role]);

  useEffect(() => {
    if (view !== "user-management" || user?.role !== "admin") return;
    let active = true;
    setAdminUsersLoading(true);
    fetchAdminUsers()
      .then(({ users }) => {
        if (active) setAdminUsers(users);
      })
      .catch((cause) => {
        if (active) {
          setAdminAlert({ type: "error", message: cause instanceof Error ? cause.message : "Unable to load users." });
        }
      })
      .finally(() => {
        if (active) setAdminUsersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, user?.role]);

  // Set default expiry (today + 5 days) only on the client, after mount,
  // so server-rendered HTML and client HTML always match (avoids hydration mismatch).
  useEffect(() => {
    setExpiry((curr) => {
      const canLimit = systemMode !== "free" && user?.role !== "admin" && user?.plan !== "plus";
      if (canLimit) {
        const maxVal = getFormattedDate(5);
        if (!curr || curr > maxVal) return maxVal;
        return curr;
      }
      return curr || getFormattedDate(5);
    });
  }, [user?.role, user?.plan, systemMode]);

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
    if (linkLimitReached) {
      setError(`You have reached your Free plan limit of ${linkUsage?.limit} links.`);
      return;
    }
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
      if (systemMode !== "free" && !isAdmin && user?.plan !== "plus") {
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
        expiredUrl: expiredUrl.trim() || null,
        qrConfig: { color: qrColor, background: bgColor, resolution, logo: effectiveLogo },
      });
      setCurrentLink(link);
      setLinks((rows) => [link, ...rows.filter((row) => row.id !== link.id)]);
      setLinkUsage((usage) => usage
        ? {
            ...usage,
            count: usage.count + 1,
            canCreate: usage.limit === null || usage.count + 1 < usage.limit,
          }
        : usage);
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
      if (authMode === "register") {
        const result = await signUp(authEmail, authPassword);
        if (result.requiresEmailActivation) {
          setAuthNotice(result.message);
          setAuthMode("login");
          setAuthPassword("");
          return;
        }
        setUser(result.user);
        setAuthOpen(false);
        setAuthPassword("");
        const { links: ownedLinks, usage } = await fetchLinks(100);
        setLinks(ownedLinks);
        setLinkUsage(usage);
        setCurrentLink(ownedLinks[0] ?? null);
        return;
      }
      const result = await signIn(authEmail, authPassword);
      setUser(result.user);
      setAuthOpen(false);
      setAuthPassword("");
      const { links: ownedLinks, usage } = await fetchLinks(100);
      setLinks(ownedLinks);
      setLinkUsage(usage);
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
    const { links: publicLinks, usage } = await fetchLinks(100).catch(() => ({
      links: [],
      usage: { count: 0, limit: null, canCreate: true },
    }));
    setLinks(publicLinks);
    setLinkUsage(usage);
  }

  function copyTextFallback(value: string): boolean {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.top = "0";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      return document.execCommand("copy");
    } finally {
      input.remove();
    }
  }

  async function copyToClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        if (copyTextFallback(value)) return;
        throw new Error("Clipboard copy is unavailable.");
      }
    }
    if (!copyTextFallback(value)) throw new Error("Clipboard copy is unavailable.");
  }

  async function copyLink() {
    setCopied(false);
    setCopyError(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shortUrl);
      } else if (!copyTextFallback(shortUrl)) {
        throw new Error("Clipboard copy is unavailable.");
      }
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      try {
        if (!copyTextFallback(shortUrl)) throw new Error("Clipboard copy is unavailable.");
        setCopied(true);
        setCopyError(null);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setCopied(false);
        setCopyError("Unable to copy the short link. Please check your browser clipboard permissions.");
      }
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
        expiredRedirectUrl: adminExpiredRedirectUrl,
        freeLinkLimit: adminFreeLimit,
        activationEmailFrom: adminActivationEmailFrom,
        requireEmailActivation: adminRequireEmailActivation,
        systemMode: adminSystemMode,
      });
      setSystemSettings(settings);
      setAdminExpiredRedirectUrl(settings.expiredRedirectUrl);
      setAdminActivationEmailFrom(settings.activationEmailFrom);
      setAdminRequireEmailActivation(settings.requireEmailActivation);
      setAdminAlert({ type: "success", message: "All system settings saved successfully!" });
    } catch (err) {
      setAdminAlert({ type: "error", message: err instanceof Error ? err.message : "Failed to save settings." });
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleCreateQuotaToken() {
    if (adminTokenCreating) return;
    setAdminTokenCreating(true);
    setAdminAlert(null);
    setRevealedToken("");
    try {
      const created = await createAdminQuotaToken(adminTokenCount);
      setRevealedToken(created.token);
      const { tokens } = await fetchAdminQuotaTokens();
      setAdminTokens(tokens);
      setAdminAlert({ type: "success", message: `Created a one-time token for ${created.linkCount} additional links.` });
    } catch (cause) {
      setAdminAlert({ type: "error", message: cause instanceof Error ? cause.message : "Unable to create quota token." });
    } finally {
      setAdminTokenCreating(false);
    }
  }

  async function handleCopyQuotaToken(token: string) {
    try {
      await copyToClipboard(token);
      setAdminAlert({ type: "success", message: "Quota token copied to clipboard." });
    } catch {
      setAdminAlert({ type: "error", message: "Unable to copy the quota token. Please select and copy it manually." });
    }
  }

  async function handleRedeemQuotaToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tokenRedeeming) return;
    setTokenRedeeming(true);
    setTokenError(null);
    setTokenNotice(null);
    try {
      const result = await redeemQuotaToken(tokenInput);
      const { links: refreshedLinks, usage } = await fetchLinks(100);
      setLinks(refreshedLinks);
      setLinkUsage(usage);
      setTokenInput("");
      setTokenNotice(`Token accepted. ${result.addedLinks} links have been added to your quota.`);
    } catch (cause) {
      setTokenError(cause instanceof Error ? cause.message : "Unable to redeem quota token.");
    } finally {
      setTokenRedeeming(false);
    }
  }

  function openLinkEditor(link: LinkRecord) {
    setEditingLink(link);
    setCurrentLink(link);
    setEditOriginalUrl(link.original_url);
    setEditExpiresAt(link.expires_at ? new Date(link.expires_at).toISOString().slice(0, 10) : "");
    setEditExpiredUrl(link.expired_url ?? "");
    setEditIsActive(Boolean(link.is_active));
    setEditError(null);
    try {
      const parsed: unknown = link.qr_config ? JSON.parse(link.qr_config) : {};
      const config = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
      setEditQrExtras(config);
      setEditQrColor(typeof config.color === "string" ? config.color : "#0284c7");
      setEditQrBackground(typeof config.background === "string" ? config.background : "#ffffff");
      setEditQrLogo(typeof config.logo === "string" ? config.logo : "");
    } catch {
      setEditQrExtras({});
      setEditQrColor("#0284c7");
      setEditQrBackground("#ffffff");
      setEditQrLogo("");
      setEditError("Saved QR settings could not be read; default QR settings are shown.");
    }
  }

  async function handleSaveLinkEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLink || editSaving) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const expiresAt = editExpiresAt
        ? new Date(`${editExpiresAt}T23:59:59`).toISOString()
        : user?.role === "admin" || user?.plan === "plus"
          ? null
          : editingLink.expires_at;
      const { link } = await updateShortLink(editingLink.short_code, {
        originalUrl: editOriginalUrl,
        expiresAt,
        expiredUrl: editExpiredUrl.trim() || null,
        isActive: editIsActive,
        qrConfig: {
          ...editQrExtras,
          color: editQrColor,
          background: editQrBackground,
          logo: editQrLogo,
        },
      });
      setLinks((current) => current.map((item) => item.id === link.id ? link : item));
      setCurrentLink(link);
      setEditingLink(null);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Unable to update this short link.");
    } finally {
      setEditSaving(false);
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

  const isFreeSystemMode = systemMode === "free";
  const freeLimit = isFreeSystemMode ? null : (linkUsage?.limit ?? systemSettings?.freeLinkLimit ?? 10);
  const linkCount = linkUsage?.count ?? links.length;
  const linkLimitReached = Boolean(user && linkUsage && linkUsage.limit !== null && !linkUsage.canCreate);
  const usedPercent = freeLimit ? Math.min(100, Math.round((linkCount / freeLimit) * 100)) : 100;
  const upgradeMemo = user ? `Upgrade ${user.email}` : "";
  const upgradeQrPayload = useMemo(() => upgradeMemo ? createUpgradeVietQr(upgradeMemo) : null, [upgradeMemo]);
  const filteredAdminUsers = adminUsers.filter((adminUser) =>
    adminUser.email.toLowerCase().includes(adminUserEmailFilter.trim().toLowerCase()),
  );

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
            <button
              className={`nav-item ${view === "user-management" ? "active" : ""}`}
              style={
                view === "user-management"
                  ? { background: "var(--gold-pale)", color: "var(--gold-dark)", fontWeight: 700 }
                  : { color: "var(--gold-dark)" }
              }
              onClick={() => {
                setView("user-management");
                setMobileNav(false);
              }}
            >
              <Users size={17} /> User Management
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
        {user && links.slice(0, 3).map((row) => (
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
        {(!user || links.length === 0) && (
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
              <p>{linkCount} links created (No limit)</p>
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
              <p>{`${linkCount} links created — unlimited links & expiry`}</p>
              <button onClick={() => setAdvanced(true)}>Plus: no expiry limit <ArrowUpRight size={14} /></button>
            </div>
          ) : (
            <div className="plan-box">
              <div className="plan-top">
                <span>{user ? "Free plan" : "Guest"}</span>
                <span>{user ? (isFreeSystemMode ? "Unlimited" : `${usedPercent}%`) : "—"}</span>
              </div>
              <div className="plan-track">
                <i style={{ width: `${user ? (isFreeSystemMode ? 100 : usedPercent) : 0}%` }} />
              </div>
              <p>{user ? (isFreeSystemMode ? `${linkCount} links created — unlimited` : `${linkCount} / ${freeLimit} links used`) : "Sign in to save links"}</p>
              <button
                onClick={() => (user ? setUpgradeOpen(true) : (setAuthMode("register"), setAuthOpen(true)))}
              >
                {user ? (isFreeSystemMode ? "Free mode: unlimited links" : `Free limit: ${freeLimit} links`) : "Create account"} <ArrowUpRight size={14} />
              </button>
              {user && user.plan !== "plus" && (
                <form className="quota-redeem-form" onSubmit={handleRedeemQuotaToken}>
                  <label htmlFor="quota-token-input">Have a quota token?</label>
                  <input
                    id="quota-token-input"
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                    placeholder="Enter token"
                    autoComplete="off"
                    required
                  />
                  <button type="submit" disabled={tokenRedeeming || !tokenInput.trim()}>
                    {tokenRedeeming ? "Redeeming..." : "Redeem Token"}
                  </button>
                  {tokenError && <span className="quota-token-error" role="alert">{tokenError}</span>}
                  {tokenNotice && <span className="quota-token-notice" role="status">{tokenNotice}</span>}
                </form>
              )}
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
              {view === "create"
                ? "Create Link"
                : view === "analytics"
                  ? "Analytics"
                  : view === "user-management"
                    ? "User Management (Admin)"
                    : "System Settings (Admin)"}
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
              className={`top-avatar${user ? "" : " register-avatar"}`}
              style={user?.role === "admin" ? { background: "var(--gold-pale)", color: "var(--gold-dark)" } : {}}
              onClick={() => (user ? undefined : (setAuthMode("register"), setAuthOpen(true)))}
            >
              {user ? user.email.slice(0, 2).toUpperCase() : "Register"}
            </button>
          </div>
        </header>

        {copyError && <p className="copy-error" role="alert">{copyError}</p>}

        {view === "create" && (
          <div className="content create-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-line" /> LINK MANAGEMENT
                </div>
                <h1>Create New Link</h1>
                <p>Shorten URLs and generate customized QR codes in seconds.</p>
                <p>
                  ShortLink giúp bạn rút gọn link, tạo mã QR tùy chỉnh và theo dõi lượt nhấp nhanh chóng,
                  thuận tiện trên cùng một nền tảng.
                </p>
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
                    if (user && !hasAdvancedAccess) {
                      setError("Advanced Options are available to Plus, administrator accounts, and the current system mode.");
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
                    <small style={{ color: "var(--gold-dark)", fontWeight: 700 }}>
                      {systemMode === "free" ? "(System is in Free mode)" : "(Plus accounts)"}
                    </small>
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
                          max={mounted && systemMode !== "free" && user?.role !== "admin" && user?.plan !== "plus" ? getFormattedDate(5) : undefined}
                          onChange={(e) => setExpiry(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="input-label" htmlFor="expired-url">
                          Redirect URL After Expiration
                        </label>
                        <input
                          id="expired-url"
                          type="url"
                          placeholder="https://example.com/link-expired"
                          value={expiredUrl}
                          onChange={(e) => setExpiredUrl(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="qr-settings">
                      <div className="settings-title">
                        <QrCode size={16} />
                        <b>QR Code Studio</b>
                        {effectiveLogo && (
                          <span style={{ fontSize: 10, color: "var(--sky)", marginLeft: 6, fontWeight: 700 }}>
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
                                  fontSize: 10,
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
                  <button className="primary-button" onClick={createLink} disabled={loading || linkLimitReached}>
                    <Sparkles size={16} /> {loading ? "Generating..." : linkLimitReached ? "Link Limit Reached" : "Shorten & Generate QR"}{" "}
                    <span className="button-arrow">↗</span>
                  </button>
                </div>

                {linkLimitReached && (
                  <p className="result-error" role="status">
                    You have reached your Free plan limit of {linkUsage?.limit} links. Upgrade your plan to create more links.
                  </p>
                )}

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
                    <button title="Copy short link" onClick={copyLink} disabled={!generated && !currentLink}>
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

            <section className="chart-card analytics-links-card">
              <div className="chart-heading">
                <div>
                  <h2>Short Links</h2>
                  <p>Manage destination URLs, status, click counts, and QR settings.</p>
                </div>
              </div>
              <div className="analytics-links-scroll">
                <table className="analytics-links-table">
                  <thead>
                    <tr>
                      <th>Num</th>
                      <th>Short Link</th>
                      <th>Target URL</th>
                      <th>Total Clicks</th>
                      <th>Link Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((link, index) => {
                      const isActive = Boolean(link.is_active) &&
                        (!link.expires_at || new Date(link.expires_at).getTime() > Date.now());
                      const shortLink = shortUrlFor(link.short_code, configuredDomain);
                      return (
                        <tr key={link.id}>
                          <td>{index + 1}</td>
                          <td>
                            <a href={shortLink} target="_blank" rel="noreferrer" className="analytics-short-link">
                              {shortLink}
                            </a>
                          </td>
                          <td className="analytics-target-url">
                            <a href={link.original_url} target="_blank" rel="noreferrer">
                              {link.original_url}
                            </a>
                          </td>
                          <td>{Number(link.click_count).toLocaleString()}</td>
                          <td>
                            <span className={`link-status-badge ${isActive ? "active" : "inactive"}`}>
                              {isActive ? "Active" : "Deactive"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="link-edit-button"
                              type="button"
                              title={`Edit ${shortLink} and QR settings`}
                              aria-label={`Edit ${shortLink} and QR settings`}
                              onClick={() => openLinkEditor(link)}
                            >
                              <Pencil size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {links.length === 0 && (
                      <tr>
                        <td colSpan={6} className="analytics-links-empty">No short links created yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

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

            <footer className="dashboard-foot">
              <span>
                <span className="status-dot" /> Data updated just now
              </span>
              <span>Timestamps displayed in local timezone</span>
            </footer>
          </div>
        )}

        {(view === "admin" || view === "user-management") && (
          <div className="content admin-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow" style={{ color: "var(--gold-dark)" }}>
                  <ShieldCheck size={14} /> SYSTEM ADMINISTRATION
                </div>
                <h1>{view === "admin" ? "System Configuration" : "User Management"}</h1>
                <p>
                  {view === "admin"
                    ? "Manage QR codes, shortlink domains, expired-link redirects, and account creation limits."
                    : "Manage account plans and link limits, and issue one-time quota tokens."}
                </p>
              </div>
              <span className="admin-badge" style={{ fontSize: 12, padding: "6px 12px" }}>
                Account: {user?.email}
              </span>
            </div>

            {adminAlert && (
              <div className={adminAlert.type === "success" ? "admin-alert-success" : "admin-alert-error"}>
                {adminAlert.type === "success" ? <Check size={16} /> : <X size={16} />}
                <span>{adminAlert.message}</span>
              </div>
            )}

            {view === "admin" && (
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
                        <span style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", padding: 4 }}>No logo</span>
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
                    <span style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
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
                      placeholder="127.0.0.1:3333 or slink.vn or https://s.company.com"
                      value={adminDomain}
                      onChange={(e) => setAdminDomain(e.target.value)}
                    />
                    <span className="admin-field-hint">
                      Leave blank to default to browser host (e.g. <code>127.0.0.1:3333</code>).
                    </span>
                  </div>

                  <div style={{ marginTop: 14, padding: 12, background: "var(--sky-subtle)", border: "1px solid #bae6fd", borderRadius: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--sky-dark)", fontWeight: 600, display: "block", marginBottom: 3 }}>
                      Display URL format:
                    </span>
                    <code style={{ fontSize: 13, color: "var(--sky)", fontWeight: 700 }}>
                      {adminDomain.trim()
                        ? `${adminDomain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}/aB3x9Qr`
                        : `${typeof window !== "undefined" ? window.location.host : "127.0.0.1:3333"}/aB3x9Qr`}
                    </code>
                  </div>
                </div>

                {/* Setting 3: System Usage Mode */}
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon amber">
                      <Sparkles size={19} />
                    </div>
                    <div>
                      <h2>3. System Usage Mode</h2>
                      <p>Choose whether the platform operates in Free mode or in plan-based mode.</p>
                    </div>
                  </div>

                  <div className="admin-field">
                    <label htmlFor="admin-system-mode">Platform mode</label>
                    <select
                      id="admin-system-mode"
                      value={adminSystemMode}
                      onChange={(e) => setAdminSystemMode(e.target.value === "free" ? "free" : "plan")}
                    >
                      <option value="plan">Plan</option>
                      <option value="free">Free</option>
                    </select>
                    <span className="admin-field-hint">
                      {adminSystemMode === "free"
                        ? "All users can create unlimited links and have access to Advanced Options."
                        : "Plan-based rules apply: advanced options and limits follow role and package permissions."}
                    </span>
                  </div>
                </div>

                {/* Setting 4: Free Link Limit */}
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon amber">
                      <Sparkles size={19} />
                    </div>
                    <div>
                      <h2>4. Link Creation Limit (Free Accounts)</h2>
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
                    <span style={{ fontSize: 11, color: "var(--gold-dark)", lineHeight: 1.4, display: "block" }}>
                      When a standard account reaches this limit ({adminFreeLimit} links), further creations will be blocked with a prompt to contact an administrator.
                    </span>
                  </div>
                </div>

                {/* Setting 5: Expired Link Redirect */}
                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon blue">
                      <ArrowUpRight size={19} />
                    </div>
                    <div>
                      <h2>5. Expired Link Redirect URL</h2>
                      <p>Fallback destination for expired links that do not have their own redirect URL.</p>
                    </div>
                  </div>
                  <div className="admin-field">
                    <label htmlFor="admin-expired-redirect-url">System Expired URL</label>
                    <input
                      id="admin-expired-redirect-url"
                      type="url"
                      placeholder="https://example.com/link-expired"
                      value={adminExpiredRedirectUrl}
                      onChange={(e) => setAdminExpiredRedirectUrl(e.target.value)}
                    />
                    <span className="admin-field-hint">
                      When an expired link is opened, this URL is saved to its <code>expired_url</code> field and used as the redirect destination. Leave blank to redirect to the homepage.
                    </span>
                  </div>
                </div>

                <div className="admin-card">
                  <div className="admin-card-head">
                    <div className="admin-card-icon blue">
                      <Mail size={19} />
                    </div>
                    <div>
                      <h2>6. Registration Email</h2>
                      <p>Choose the sender address and whether new accounts must activate through email.</p>
                    </div>
                  </div>
                  <div className="admin-field">
                    <label htmlFor="admin-activation-email-from">Activation email sender</label>
                    <input
                      id="admin-activation-email-from"
                      type="email"
                      placeholder="no-reply@example.com"
                      value={adminActivationEmailFrom}
                      onChange={(event) => setAdminActivationEmailFrom(event.target.value)}
                    />
                    <span className="admin-field-hint">
                      Leave blank to use SMTP_FROM (or SMTP_USER) from the server environment.
                    </span>
                  </div>
                  <label className="admin-email-activation-toggle">
                    <input
                      type="checkbox"
                      checked={adminRequireEmailActivation}
                      onChange={(event) => setAdminRequireEmailActivation(event.target.checked)}
                    />
                    <span>
                      <strong>Require email activation for new accounts</strong>
                      <small>
                        {adminRequireEmailActivation
                          ? "New users must open the activation link before signing in."
                          : "New users are activated immediately and can sign in without receiving email."}
                      </small>
                    </span>
                  </label>
                </div>
              </div>
              <div className="admin-actions-bar">
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4, color: "var(--gold)" }} />
                  Settings are saved directly to SQLite and take effect immediately across the entire platform.
                </div>
                <button type="submit" className="primary-button" disabled={adminSaving} style={{ padding: "0 20px" }}>
                  <Save size={16} /> {adminSaving ? "Saving..." : "Save All Settings"}
                </button>
              </div>
            </form>
            )}

            {view === "user-management" && (
            <div className="admin-user-management">
              <section className="admin-card quota-admin-card">
                <div className="admin-card-head">
                  <div className="admin-card-icon blue">
                    <Sparkles size={19} />
                  </div>
                  <div>
                    <h2>One-Time Link Quota Tokens</h2>
                    <p>Create a token that gives the first user to redeem it extra short-link capacity.</p>
                  </div>
                </div>
                <div className="quota-token-create-row">
                  <label htmlFor="admin-token-link-count">Additional links</label>
                  <input
                    id="admin-token-link-count"
                    type="number"
                    min={1}
                    max={100000}
                    value={adminTokenCount}
                    onChange={(event) => setAdminTokenCount(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                  />
                  <button type="button" className="upload-button" disabled={adminTokenCreating} onClick={handleCreateQuotaToken}>
                    {adminTokenCreating ? "Creating..." : "Generate Token"}
                  </button>
                </div>
                {revealedToken && (
                  <div className="revealed-token" role="status">
                    <code>{revealedToken}</code>
                    <button
                      type="button"
                      className="upload-button"
                      onClick={() => handleCopyQuotaToken(revealedToken)}
                    >
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                )}
                <div className="quota-token-table-wrap">
                  <table className="quota-token-table">
                    <thead>
                      <tr>
                        <th>Token</th>
                        <th>Links</th>
                        <th>Status</th>
                        <th>Redeemed by</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminTokens.map((token) => (
                        <tr key={token.id}>
                          <td>
                            <span className="quota-token-cell">
                              <code>{token.token_value ?? `${token.token_hint}…`}</code>
                              <button
                                type="button"
                                className="quota-token-copy-button"
                                title={token.token_value ? "Copy token" : "This legacy token cannot be copied because its full value was not stored"}
                                aria-label={`Copy token ${token.token_value ?? token.token_hint}`}
                                disabled={!token.token_value}
                                onClick={() => token.token_value && handleCopyQuotaToken(token.token_value)}
                              >
                                <Copy size={14} />
                              </button>
                            </span>
                          </td>
                          <td>{token.link_count}</td>
                          <td>
                            <span className={`link-status-badge ${token.used_at ? "inactive" : "active"}`}>
                              {token.used_at ? "Used" : "Unused"}
                            </span>
                          </td>
                          <td>{token.used_by_email ?? "—"}</td>
                          <td>{new Date(token.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {!adminTokensLoading && adminTokens.length === 0 && (
                        <tr><td colSpan={5} className="analytics-links-empty">No quota tokens created yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {adminTokensLoading && <p className="admin-field-hint">Loading tokens…</p>}
                </div>
              </section>

              <div className="admin-card" style={{ marginTop: 16 }}>
                <div className="admin-card-head">
                  <div className="admin-card-icon">
                    <Users size={19} />
                  </div>
                  <div>
                    <h2>Users, Plans & Link Limits</h2>
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
                  <>
                    <div className="admin-field" style={{ maxWidth: 360, marginBottom: 10 }}>
                      <label htmlFor="admin-user-email-filter">Lọc danh sách theo email</label>
                      <input
                        id="admin-user-email-filter"
                        type="search"
                        placeholder="Nhập email cần tìm"
                        value={adminUserEmailFilter}
                        onChange={(event) => setAdminUserEmailFilter(event.target.value)}
                      />
                    </div>
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid var(--line)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>
                          <th style={{ padding: "6px 8px" }}>Email</th>
                          <th style={{ padding: "6px 8px" }}>Role</th>
                          <th style={{ padding: "6px 8px" }}>Plan</th>
                          <th style={{ padding: "6px 8px" }}>Links</th>
                          <th style={{ padding: "6px 8px" }}>Limit</th>
                          <th style={{ padding: "6px 8px" }}>Plus upgraded at</th>
                          <th style={{ padding: "6px 8px" }}>Hạn nâng cấp</th>
                          <th style={{ padding: "6px 8px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAdminUsers.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ padding: "12px 8px", color: "#64748b", textAlign: "center" }}>
                              Không tìm thấy tài khoản phù hợp.
                            </td>
                          </tr>
                        ) : filteredAdminUsers.map((u) => (
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
                                  fontSize: 11,
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
                                  style={{ width: 64, padding: "3px 6px", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12 }}
                                  onBlur={(e) => {
                                    const value = Math.max(1, parseInt(e.target.value, 10) || 1);
                                    if (value !== (u.linkLimit ?? systemSettings?.freeLinkLimit ?? 10)) {
                                      handleAdminUserUpdate(u.id, { linkLimit: value });
                                    }
                                  }}
                                />
                              )}
                            </td>
                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                              {u.plusUpgradedAt ? new Date(u.plusUpgradedAt).toLocaleString("vi-VN") : "—"}
                            </td>
                            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                              {u.plusExpiresAt ? new Date(u.plusExpiresAt).toLocaleDateString("vi-VN") : "—"}
                            </td>
                            <td style={{ padding: "6px 8px" }}>
                              {u.role === "admin" ? (
                                <span style={{ fontSize: 11, color: "#94a3b8" }}>—</span>
                              ) : u.plan === "plus" ? (
                                <button
                                  type="button"
                                  className="upload-button"
                                  style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2", fontSize: 11 }}
                                  onClick={() => handleAdminUserUpdate(u.id, { plan: "free" })}
                                >
                                  Downgrade to Free
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="upload-button"
                                  style={{ color: "var(--gold-dark)", borderColor: "var(--gold-border)", background: "var(--gold-pale)", fontWeight: 700, fontSize: 11 }}
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
                  </>
                )}
              </div>

            </div>
            )}
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
                  fontSize: 13,
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
                    fontSize: 13,
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

      {editingLink && (
        <div
          className="auth-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !editSaving) setEditingLink(null);
          }}
        >
          <section className="auth-dialog link-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="link-editor-title">
            <button className="auth-close icon-button" type="button" aria-label="Close" disabled={editSaving} onClick={() => setEditingLink(null)}>
              <X size={18} />
            </button>
            <div className="auth-mark">
              <Pencil size={18} />
            </div>
            <div className="auth-kicker">LINK SETTINGS</div>
            <h2 id="link-editor-title">Edit Short Link</h2>
            <p className="auth-subtitle">
              {shortUrlFor(editingLink.short_code, configuredDomain)}
            </p>
            <form className="link-editor-form" onSubmit={handleSaveLinkEdit}>
              <label htmlFor="edit-target-url">Target URL</label>
              <input
                id="edit-target-url"
                type="url"
                required
                value={editOriginalUrl}
                onChange={(event) => setEditOriginalUrl(event.target.value)}
              />
              <div className="link-editor-fields">
                <div>
                  <label htmlFor="edit-expiry">Expiration date</label>
                  <input
                    id="edit-expiry"
                    type="date"
                    value={editExpiresAt}
                    onChange={(event) => setEditExpiresAt(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="edit-expired-url">Redirect URL after expiration</label>
                  <input
                    id="edit-expired-url"
                    type="url"
                    placeholder="Optional"
                    value={editExpiredUrl}
                    onChange={(event) => setEditExpiredUrl(event.target.value)}
                  />
                </div>
              </div>
              <label className="link-active-toggle">
                <input type="checkbox" checked={editIsActive} onChange={(event) => setEditIsActive(event.target.checked)} />
                Link active
              </label>
              <div className="link-editor-qr">
                <div>
                  <b>QR code preview</b>
                  <div className="link-editor-qr-preview">
                    <QRCodeSVG
                      value={shortUrlFor(editingLink.short_code, configuredDomain)}
                      size={150}
                      level="H"
                      fgColor={editQrColor}
                      bgColor={editQrBackground}
                      imageSettings={editQrLogo ? { src: editQrLogo, height: 28, width: 28, excavate: true } : undefined}
                    />
                  </div>
                </div>
                <div className="link-editor-colors">
                  <label htmlFor="edit-qr-color">QR color</label>
                  <input id="edit-qr-color" type="color" value={editQrColor} onChange={(event) => setEditQrColor(event.target.value)} />
                  <label htmlFor="edit-qr-background">QR background</label>
                  <input id="edit-qr-background" type="color" value={editQrBackground} onChange={(event) => setEditQrBackground(event.target.value)} />
                </div>
              </div>
              {editError && <p className="auth-error" role="alert">{editError}</p>}
              <div className="link-editor-actions">
                <button type="button" className="upload-button" disabled={editSaving} onClick={() => setEditingLink(null)}>
                  Cancel
                </button>
                <button type="submit" className="auth-submit" disabled={editSaving}>
                  <Save size={15} /> {editSaving ? "Saving..." : "Save Link & QR"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {upgradeOpen && user && (
        <div
          className="auth-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUpgradeOpen(false);
          }}
        >
          <section className="auth-dialog upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
            <button className="auth-close icon-button" aria-label="Close" onClick={() => setUpgradeOpen(false)}>
              <X size={18} />
            </button>
            <div className="auth-mark upgrade-mark">
              <Sparkles size={19} />
            </div>
            <div className="auth-kicker">UPGRADE YOUR PLAN</div>
            <h2 id="upgrade-title">Upgrade to Plus</h2>
            <p className="auth-subtitle">Quét mã VietQR bằng ứng dụng ngân hàng để chuyển khoản nâng cấp.</p>

            <div className="upgrade-price">
              <span className="upgrade-original-price">400.000đ/năm</span>
              <span className="upgrade-discount">Giảm 85%</span>
              <strong>60.000đ/năm</strong>
            </div>

            <div className="upgrade-content-grid">
              <ul className="upgrade-benefits">
                <li>
                  <div><strong>Không giới hạn số link</strong><span>Tạo bao nhiêu short link tùy thích, không lo chạm hạn mức.</span></div>
                  <div><strong>Unlimited short links</strong><span>Create as many short links as you need, without plan limits.</span></div>
                </li>
                <li>
                  <div><strong>Link không hết hạn</strong><span>Các liên kết luôn hoạt động, trừ khi bạn chủ động xóa hoặc chỉnh sửa.</span></div>
                  <div><strong>Links that never expire</strong><span>Your links stay active unless you choose to delete or edit them.</span></div>
                </li>
                <li>
                  <div><strong>Link mang thương hiệu riêng</strong><span>Tùy biến alias, tên miền và QR với logo thương hiệu của bạn.</span></div>
                  <div><strong>Branded short links</strong><span>Customize aliases, domains, and QR codes with your brand logo.</span></div>
                </li>
              </ul>

              <div className="upgrade-payment">
                <div className="upgrade-qr-column">
                  <div className="vietqr-logo" aria-label="VietQR">
                    <svg aria-hidden="true" viewBox="0 0 48 44">
                      <path d="M7 8 20 33c1.5 3 5.5 3.2 7.3.3L42 7" />
                    </svg>
                    <span><b>Viet</b><strong>QR</strong></span>
                  </div>
                  <div className="upgrade-qr" aria-label="VietQR chuyển khoản">
                    {upgradeQrPayload ? (
                      <QRCodeSVG value={upgradeQrPayload} size={208} level="M" />
                    ) : (
                      <p role="alert">Không thể tạo mã QR vì nội dung chuyển khoản quá dài.</p>
                    )}
                  </div>
                </div>
                <div className="upgrade-payment-details">
                  <div><span>Người nhận</span><strong>NGUYEN VU DUY QUANG</strong></div>
                  <div><span>Số tài khoản</span><strong>0918884034</strong></div>
                  <div><span>Ngân hàng</span><strong>TPBank</strong></div>
                  <div><span>Nội dung chuyển khoản</span><strong>{upgradeMemo}</strong></div>
                </div>
              </div>
            </div>
            <p className="upgrade-note">QR đã điền sẵn số tiền 60.000đ. Sau khi chuyển khoản, vui lòng chờ quản trị viên xác nhận nâng cấp tài khoản.</p>
          </section>
        </div>
      )}
      <footer className="author-footer">
        <span>Author: MSc. Nguyen Vu Duy Quang</span>
        <a href="mailto:nvdquang@gmail.com">Email: nvdquang@gmail.com</a>
        <a href="tel:+84918884034">Mobile: (+84) 0918884034</a>
        <span>Faculty of Information Technology - Lac Hong University - Viet Nam</span>
      </footer>
    </main>
  );
}
