import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { getSystemSettings } from "./settings";

const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DEFAULT_CODE_LENGTH = 7;
const MAX_ALIAS_LENGTH = 50;
const MAX_TITLE_LENGTH = 255;
const ALIAS_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,49}$/;

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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export class ExpiredLinkError extends ApiError {
  expiredUrl: string | null;

  constructor(expiredUrl: string | null) {
    super(410, "Link has expired.");
    this.expiredUrl = expiredUrl;
    this.name = "ExpiredLinkError";
  }
}

export function extractShortCode(input: string): string {
  let pathname: string;
  try {
    pathname = new URL(input).pathname;
  } catch {
    pathname = input;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) {
    throw new ApiError(404, "Short link not found.");
  }

  try {
    return decodeURIComponent(segments[0]);
  } catch {
    throw new ApiError(404, "Short link not found.");
  }
}

/** Encodes a random 64-bit value into Base62 (e.g. "aB3x9Qr"). */
export function generateShortCode(length = DEFAULT_CODE_LENGTH): string {
  const bytes = randomBytes(8);
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  let code = "";
  while (value > 0n) {
    code = BASE62_ALPHABET[Number(value % 62n)] + code;
    value /= 62n;
  }
  return code.padStart(length, "0").slice(-length);
}

export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new ApiError(400, "Destination URL is required.");
  }
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ApiError(400, "Invalid URL format.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError(400, "Only http and https protocols are supported.");
  }
  return parsed.toString();
}

function normalizeExpiry(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "Invalid expiration date.");
  }
  return date.toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

function generateUniqueCode(): string {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM Links WHERE short_code = ? OR custom_alias = ?");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateShortCode();
    if (!exists.get(code, code)) return code;
  }
  throw new ApiError(500, "Unable to generate short code, please try again.");
}

export type CreateLinkInput = {
  originalUrl: string;
  customAlias?: string | null;
  title?: string | null;
  qrConfig?: unknown;
  expiresAt?: string | null;
  expiredUrl?: string | null;
  userId?: string | null;
  userRole?: string | null;
  userPlan?: string | null;
};

/** Free accounts are capped at 5 days from link creation; Plus and admins are unlimited. */
function getMaxExpiryDays(plan: string | null | undefined, role: string | null | undefined): number | null {
  const settings = getSystemSettings();
  if (settings.systemMode === "free" || role === "admin" || plan === "plus") return null;
  return 5;
}

export function createLink(input: CreateLinkInput): LinkRecord {
  const db = getDb();
  const originalUrl = normalizeUrl(input.originalUrl);
  const alias = input.customAlias?.trim() || null;
  // Custom alias is a Plus/admin feature; Free accounts cannot set it.
  if (alias && getMaxExpiryDays(input.userPlan ?? null, input.userRole ?? null) !== null) {
    throw new ApiError(403, "Custom alias is available to Plus and administrator accounts only.");
  }
  if (alias && (alias.length > MAX_ALIAS_LENGTH || !ALIAS_PATTERN.test(alias))) {
    throw new ApiError(400, "Custom alias can only contain letters, numbers, and hyphens.");
  }
  if (alias && getDb().prepare("SELECT 1 FROM Links WHERE short_code = ? OR custom_alias = ?").get(alias, alias)) {
    throw new ApiError(409, "Custom alias is already in use.");
  }
  const title = input.title?.trim().slice(0, MAX_TITLE_LENGTH) || null;
  const normalizedExpiry = normalizeExpiry(input.expiresAt);
  let expiresAt = normalizedExpiry;
  const expiredUrl = input.expiredUrl ? normalizeUrl(input.expiredUrl) : null;
  const qrConfig = input.qrConfig == null ? null : JSON.stringify(input.qrConfig);
  const userId = input.userId ?? null;
  const userRole = input.userRole ?? null;
  const userPlan = input.userPlan ?? null;
  const maxExpiryDays = getMaxExpiryDays(userPlan, userRole);

  if (maxExpiryDays !== null) {
    const maxExpiry = new Date();
    maxExpiry.setDate(maxExpiry.getDate() + maxExpiryDays);
    maxExpiry.setHours(23, 59, 59, 999);
    const maxExpiryTimestamp = maxExpiry.getTime();

    if (!expiresAt) {
      const defaultExp = new Date();
      defaultExp.setDate(defaultExp.getDate() + maxExpiryDays);
      expiresAt = defaultExp.toISOString();
    } else if (new Date(expiresAt).getTime() > maxExpiryTimestamp) {
      throw new ApiError(400, "Free accounts cannot set an expiration date beyond 5 days from link creation. Upgrade to Plus for unlimited expiry.");
    }
  }

  if (userId && maxExpiryDays !== null) {
    const { freeLinkLimit, systemMode } = getSystemSettings();
    if (systemMode !== "free") {
      const owner = db.prepare("SELECT link_limit, link_bonus FROM Users WHERE id = ?").get(userId) as
        | { link_limit: number | null; link_bonus: number }
        | undefined;
      const effectiveLimit = (owner?.link_limit ?? freeLinkLimit) + (owner?.link_bonus ?? 0);
      const countRow = db.prepare("SELECT COUNT(*) as count FROM Links WHERE user_id = ?").get(userId) as { count: number };
      if (countRow.count >= effectiveLimit) {
        throw new ApiError(
          403,
          `Free plan limit of ${effectiveLimit} links reached. Please contact an administrator to upgrade.`
        );
      }
    }
  }

  const insert = db.prepare(
    "INSERT INTO Links (id, original_url, short_code, custom_alias, title, qr_config, expires_at, expired_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = alias ?? generateUniqueCode();
    try {
      const id = randomUUID();
      insert.run(id, originalUrl, code, alias, title, qrConfig, expiresAt, expiredUrl, userId);
      return db.prepare("SELECT * FROM Links WHERE id = ?").get(id) as LinkRecord;
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (alias) throw new ApiError(409, "Custom alias is already in use.");
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(500, "Unable to create link, please try again.");
}

export function getLinkByCode(code: string, userId?: string | null): LinkRecord | undefined {
  if (userId) {
    return getDb()
      .prepare("SELECT * FROM Links WHERE (short_code = ? OR custom_alias = ?) AND user_id = ?")
      .get(code, code, userId) as LinkRecord | undefined;
  }
  return getDb()
    .prepare("SELECT * FROM Links WHERE (short_code = ? OR custom_alias = ?) AND user_id IS NULL")
    .get(code, code) as LinkRecord | undefined;
}

export function listLinks(limit = 20, userId?: string | null): LinkRecord[] {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  if (userId) {
    return getDb()
      .prepare("SELECT * FROM Links WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(userId, safeLimit) as LinkRecord[];
  }
  return getDb()
    .prepare("SELECT * FROM Links WHERE user_id IS NULL ORDER BY created_at DESC LIMIT ?")
    .all(safeLimit) as LinkRecord[];
}

export type UpdateLinkInput = {
  originalUrl?: string;
  title?: string | null;
  expiresAt?: string | null;
  expiredUrl?: string | null;
  isActive?: boolean;
  qrConfig?: unknown;
};

export function updateLink(code: string, input: UpdateLinkInput, userId?: string | null, userRole?: string | null, userPlan?: string | null): LinkRecord {
  const db = getDb();
  const existing = getLinkByCode(code, userId);
  if (!existing) throw new ApiError(404, "Link not found.");
  const maxExpiryDays = getMaxExpiryDays(userPlan ?? null, userRole ?? null);

  let expiresAt: string | null = existing.expires_at;
  if (input.expiresAt !== undefined) {
    if (maxExpiryDays !== null) {
      if (input.expiresAt === null) {
        throw new ApiError(400, "Free accounts cannot remove the link expiration date.");
      }
      const newExpiry = normalizeExpiry(input.expiresAt);
      if (!newExpiry) {
        throw new ApiError(400, "Free accounts cannot remove the link expiration date.");
      }
      const maxExpiry = new Date(existing.created_at);
      maxExpiry.setDate(maxExpiry.getDate() + maxExpiryDays);
      maxExpiry.setHours(23, 59, 59, 999);
      if (new Date(newExpiry).getTime() > maxExpiry.getTime()) {
        throw new ApiError(400, "Free accounts cannot extend expiration date beyond 5 days from link creation. Upgrade to Plus for unlimited expiry.");
      }
      expiresAt = newExpiry;
    } else {
      expiresAt = normalizeExpiry(input.expiresAt);
    }
  }

  const title = input.title === undefined ? existing.title : input.title?.trim().slice(0, MAX_TITLE_LENGTH) || null;
  const originalUrl = input.originalUrl === undefined ? existing.original_url : normalizeUrl(input.originalUrl);
  const expiredUrl = input.expiredUrl === undefined
    ? existing.expired_url
    : input.expiredUrl === null || input.expiredUrl.trim() === ""
      ? null
      : normalizeUrl(input.expiredUrl);
  const isActive = input.isActive === undefined ? existing.is_active : input.isActive ? 1 : 0;
  const qrConfig = input.qrConfig === undefined ? existing.qr_config : input.qrConfig == null ? null : JSON.stringify(input.qrConfig);

  db.prepare("UPDATE Links SET original_url = ?, title = ?, expires_at = ?, expired_url = ?, is_active = ?, qr_config = ? WHERE id = ?").run(
    originalUrl,
    title,
    expiresAt,
    expiredUrl,
    isActive,
    qrConfig,
    existing.id,
  );
  return getLinkByCode(code, userId)!;
}

export function deleteLink(code: string, userId?: string | null): void {
  const result = userId
    ? getDb().prepare("DELETE FROM Links WHERE (short_code = ? OR custom_alias = ?) AND user_id = ?").run(code, code, userId)
    : getDb().prepare("DELETE FROM Links WHERE (short_code = ? OR custom_alias = ?) AND user_id IS NULL").run(code, code);
  if (result.changes === 0) throw new ApiError(404, "Link not found.");
}

/** Returns the redirect target or throws when the link cannot be used. */
export function resolveLink(code: string): LinkRecord {
  const link = getDb()
    .prepare("SELECT * FROM Links WHERE short_code = ? OR custom_alias = ?")
    .get(code, code) as LinkRecord | undefined;
  if (!link) throw new ApiError(404, "Link not found.");
  if (!link.is_active) throw new ApiError(410, "Link has been deactivated.");
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    let expiredUrl = link.expired_url;
    if (!expiredUrl) {
      expiredUrl = getSystemSettings().expiredRedirectUrl || null;
      if (expiredUrl) {
        getDb().prepare("UPDATE Links SET expired_url = ? WHERE id = ? AND expired_url IS NULL").run(expiredUrl, link.id);
        const persistedUrl = getDb().prepare("SELECT expired_url FROM Links WHERE id = ?").get(link.id) as
          | { expired_url: string | null }
          | undefined;
        expiredUrl = persistedUrl?.expired_url ?? expiredUrl;
      }
    }
    throw new ExpiredLinkError(expiredUrl);
  }
  return link;
}
