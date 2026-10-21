import { getDb } from "./db";

export type SystemSettings = {
  defaultQrLogo: string;
  shortlinkDomain: string;
  freeLinkLimit: number;
};

export const DEFAULT_SETTINGS: SystemSettings = {
  defaultQrLogo: "",
  shortlinkDomain: "",
  freeLinkLimit: 10,
};

export function getSystemSettings(): SystemSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM SystemSettings").all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    defaultQrLogo: map.default_qr_logo ?? DEFAULT_SETTINGS.defaultQrLogo,
    shortlinkDomain: map.shortlink_domain ?? DEFAULT_SETTINGS.shortlinkDomain,
    freeLinkLimit: Number(map.free_link_limit) > 0 ? Number(map.free_link_limit) : DEFAULT_SETTINGS.freeLinkLimit,
  };
}

export function updateSystemSettings(updates: {
  defaultQrLogo?: string | null;
  shortlinkDomain?: string | null;
  freeLinkLimit?: number | string | null;
}): SystemSettings {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO SystemSettings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);

  const run = db.transaction(() => {
    if (updates.defaultQrLogo !== undefined) {
      upsert.run("default_qr_logo", updates.defaultQrLogo ? updates.defaultQrLogo.trim() : "");
    }
    if (updates.shortlinkDomain !== undefined) {
      let domain = updates.shortlinkDomain ? updates.shortlinkDomain.trim() : "";
      domain = domain.replace(/\/+$/, "");
      upsert.run("shortlink_domain", domain);
    }
    if (updates.freeLinkLimit !== undefined) {
      const parsed = Number(updates.freeLinkLimit);
      const limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_SETTINGS.freeLinkLimit;
      upsert.run("free_link_limit", String(limit));
    }
  });
  run();

  return getSystemSettings();
}

/**
 * Builds the full short link URL from code and optional custom domain.
 * If domain is not specified, falls back to fallbackOrigin or localhost:3000.
 */
export function formatShortUrl(code: string, domainSetting?: string, fallbackOrigin?: string): string {
  const trimmed = domainSetting?.trim();
  if (trimmed) {
    const hasProtocol = /^https?:\/\//i.test(trimmed);
    const isLocal = /localhost|127\.0\.0\.1/i.test(trimmed);
    const protocol = hasProtocol ? "" : (isLocal ? "http://" : "https://");
    const cleanDomain = trimmed.replace(/\/+$/, "");
    return `${protocol}${cleanDomain}/${code}`;
  }
  const origin = fallbackOrigin || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return `${origin.replace(/\/+$/, "")}/${code}`;
}
