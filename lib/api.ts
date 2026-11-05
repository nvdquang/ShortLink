export type LinkRecord = {
  id: string;
  original_url: string;
  short_code: string;
  custom_alias: string | null;
  title: string | null;
  qr_image_url: string | null;
  qr_config: string | null;
  click_count: number;
  expires_at: string | null;
  expired_url: string | null;
  is_active: number;
  user_id: string | null;
  created_at: string;
};

export type AnalyticsSummary = {
  totalClicks: number;
  uniqueVisitors: number;
  firstClickAt: string | null;
  lastClickAt: string | null;
  byDevice: { deviceType: string; clicks: number }[];
  byDay: { day: string; clicks: number }[];
  byReferer: { referer: string; clicks: number }[];
};

export type AnalyticsResponse = {
  link: LinkRecord;
  summary: AnalyticsSummary;
  recentClicks: {
    id: string;
    device_type: string | null;
    referer: string | null;
    ip_address: string | null;
    clicked_at: string;
  }[];
};

export type SystemSettings = {
  defaultQrLogo: string;
  shortlinkDomain: string;
  expiredRedirectUrl: string;
  freeLinkLimit: number;
  activationEmailFrom: string;
  requireEmailActivation: boolean;
  systemMode: "free" | "plan";
};

/** Builds the public short URL from a code, with optional custom domain setting. */
export function shortUrlFor(code: string, customDomainSetting?: string): string {
  const trimmed = customDomainSetting?.trim();
  if (trimmed) {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const isLocal = /localhost|127\.0\.0\.1/i.test(trimmed);
    const protocol = hasProtocol ? "" : (isLocal ? "http://" : "https://");
    const cleanDomain = trimmed.replace(/\/+$/, "");
    return `${protocol}${cleanDomain}/${code}`;
  }
  const origin = typeof window === "undefined" ? "http://127.0.0.1:3333" : window.location.origin;
  return `${origin.replace(/\/+$/, "")}/${code}`;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed, please try again.");
  }
  return payload as T;
}

export type CreateLinkPayload = {
  originalUrl: string;
  customAlias?: string | null;
  title?: string | null;
  expiresAt?: string | null;
  expiredUrl?: string | null;
  qrConfig?: unknown;
};

export type LinkUsage = {
  count: number;
  limit: number | null;
  canCreate: boolean;
};

export type QuotaTokenRecord = {
  id: string;
  token_hint: string;
  token_value: string | null;
  link_count: number;
  used_at: string | null;
  used_by_email: string | null;
  created_at: string;
};

export function createShortLink(payload: CreateLinkPayload) {
  return request<{ link: LinkRecord; shortUrl: string }>("/api/links", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchLinks(limit = 20) {
  return request<{ links: LinkRecord[]; usage: LinkUsage }>(`/api/links?limit=${limit}`);
}

export function fetchAnalytics(code: string, limit = 20) {
  return request<AnalyticsResponse>(`/api/links/${encodeURIComponent(code)}/analytics?limit=${limit}`);
}

export type AuthUser = { id: string; email: string; role: string; plan?: string; linkLimit?: number | null; plusExpiresAt?: string | null; created_at: string };

export function fetchCurrentUser() {
  return request<{ user: AuthUser | null }>("/api/auth/me");
}

export function signIn(email: string, password: string) {
  return request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signUp(email: string, password: string) {
  return request<{ user: AuthUser; requiresEmailActivation: boolean; message: string }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signOut() {
  return request<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function requestPasswordReset(email: string) {
  return request<{ ok: true; message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function fetchSystemSettings() {
  return request<{ settings: SystemSettings }>("/api/admin/settings");
}

export function updateSystemSettingsApi(settings: Partial<SystemSettings>) {
  return request<{ settings: SystemSettings }>("/api/admin/settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export type AdminUser = {
  id: string;
  email: string;
  role: string;
  plan: string;
  linkLimit: number | null;
  linkCount: number;
  plusUpgradedAt: string | null;
  plusExpiresAt: string | null;
  created_at: string;
};

export function fetchAdminUsers() {
  return request<{ users: AdminUser[] }>("/api/admin/users");
}

export function updateAdminUser(payload: { userId: string; plan?: "free" | "plus"; linkLimit?: number | null }) {
  return request<{ user: AdminUser }>("/api/admin/users", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function updateShortLink(code: string, payload: {
  originalUrl: string;
  expiresAt: string | null;
  expiredUrl: string | null;
  isActive: boolean;
  qrConfig: unknown;
}) {
  return request<{ link: LinkRecord }>(`/api/links/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminQuotaTokens() {
  return request<{ tokens: QuotaTokenRecord[] }>("/api/admin/quota-tokens");
}

export function createAdminQuotaToken(linkCount: number) {
  return request<{ token: string; linkCount: number }>("/api/admin/quota-tokens", {
    method: "POST",
    body: JSON.stringify({ linkCount }),
  });
}

export function redeemQuotaToken(token: string) {
  return request<{ addedLinks: number; linkBonus: number }>("/api/quota-tokens/redeem", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
