import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { ApiError } from "./links";

const SESSION_COOKIE = "shortlink_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const SCRYPT_KEY_LENGTH = 64;

export type UserRecord = {
  id: string;
  email: string;
  role: string;
  plan: string;
  linkLimit: number | null;
  is_verified: number;
  created_at: string;
};

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(user: { id: string; email: string; role?: string | null; plan?: string | null; link_limit?: number | null; is_verified?: number | null; created_at: string }): UserRecord {
  return {
    id: user.id,
    email: user.email,
    role: user.role ?? "user",
    is_verified: Boolean(user.is_verified ?? 1),
    plan: user.plan ?? "free",
    linkLimit: user.link_limit ?? null,
    created_at: user.created_at,
  };
}

function issueSession(userId: string): { token: string; user: UserRecord } {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const user = db.prepare("SELECT id, email, role, plan, link_limit, is_verified, created_at FROM Users WHERE id = ?").get(userId) as (UserRecord & { role: string }) | undefined;
  if (!user) throw new ApiError(401, "Account no longer exists.");
  db.prepare("INSERT INTO AuthSessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").run(
    randomUUID(), userId, tokenHash, expiresAt,
  );
  return { token, user: publicUser(user) };
}

export function registerUser(emailInput: string, password: string): { token: string; user: UserRecord } {
  const email = emailInput.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    throw new ApiError(400, "Please enter a valid email address.");
  }
  if (password.length < 10 || password.length > 128) {
    throw new ApiError(400, "Password must be between 10 and 128 characters.");
  }
  const db = getDb();
  const existing = db.prepare("SELECT 1 FROM Users WHERE email = ?").get(email);
  if (existing) throw new ApiError(409, "This email is already registered.");
  const id = randomUUID();
  db.prepare("INSERT INTO Users (id, email, password_hash, role) VALUES (?, ?, ?, 'user')").run(id, email, hashPassword(password));
  return issueSession(id);
}

export function loginUser(emailInput: string, password: string): { token: string; user: UserRecord } {
  const email = emailInput.trim().toLowerCase();
  const user = getDb().prepare("SELECT id, email, password_hash, role, plan, link_limit, is_verified, created_at FROM Users WHERE email = ?").get(email) as
    (UserRecord & { password_hash: string; role: string }) | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new ApiError(401, "Incorrect email or password.");
  }
  if (!user.is_verified) {
    throw new ApiError(403, "Account is not activated. Please check your email for the activation link.");
  }
  return issueSession(user.id);
}

export function getUserForSession(token: string | null | undefined): UserRecord | null {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const user = getDb().prepare(
    "SELECT Users.id, Users.email, Users.role, Users.plan, Users.link_limit, Users.is_verified, Users.created_at FROM AuthSessions INNER JOIN Users ON Users.id = AuthSessions.user_id WHERE AuthSessions.token_hash = ? AND AuthSessions.expires_at > ?",
  ).get(tokenHash, new Date().toISOString()) as UserRecord & { link_limit?: number | null } | undefined;
  return user ? publicUser(user) : null;
}

export function revokeSession(token: string | null | undefined): void {
  if (!token) return;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  getDb().prepare("DELETE FROM AuthSessions WHERE token_hash = ?").run(tokenHash);
}

export function getSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      try { return decodeURIComponent(value.join("=")); } catch { return null; }
    }
  }
  return null;
}

export function setSessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/* ---------------- Account activation & password reset (email tokens) ---------------- */

export type EmailTokenPurpose = "activate" | "reset";

const TOKEN_TTL: Record<EmailTokenPurpose, number> = {
  activate: 24 * 60 * 60 * 1000, // 24 hours
  reset: 60 * 60 * 1000, // 1 hour
};

export function createEmailToken(userId: string, purpose: EmailTokenPurpose): string {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL[purpose]).toISOString();
  // Invalidate previous unused tokens of the same purpose for this user.
  db.prepare("DELETE FROM EmailTokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL").run(userId, purpose);
  db.prepare(
    "INSERT INTO EmailTokens (id, user_id, token_hash, purpose, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), userId, tokenHash, purpose, expiresAt);
  return token;
}

export type EmailTokenResult = { userId: string; purpose: EmailTokenPurpose };

export function consumeEmailToken(token: string, purpose: EmailTokenPurpose): EmailTokenResult {
  if (!token) throw new ApiError(400, "Missing token.");
  const db = getDb();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = db
    .prepare("SELECT id, user_id, purpose, expires_at, used_at FROM EmailTokens WHERE token_hash = ?")
    .get(tokenHash) as { id: string; user_id: string; purpose: EmailTokenPurpose; expires_at: string; used_at: number | null } | undefined;
  if (!row || row.purpose !== purpose) {
    throw new ApiError(400, "This link is invalid.");
  }
  if (row.used_at) {
    throw new ApiError(400, "This link has already been used.");
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw new ApiError(400, "This link has expired. Please request a new one.");
  }
  const user = db.prepare("SELECT id, is_verified FROM Users WHERE id = ?").get(row.user_id) as { id: string; is_verified: number } | undefined;
  if (!user) throw new ApiError(400, "This link is invalid.");
  db.prepare("UPDATE EmailTokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
  return { userId: row.user_id, purpose };
}

export function activateUser(userId: string): void {
  getDb().prepare("UPDATE Users SET is_verified = 1 WHERE id = ?").run(userId);
}

export function getUserByEmail(emailInput: string): UserRecord | null {
  const email = emailInput.trim().toLowerCase();
  const user = getDb().prepare("SELECT id, email, role, plan, link_limit, is_verified, created_at FROM Users WHERE email = ?").get(email) as
    | (UserRecord & { link_limit?: number | null })
    | undefined;
  return user ? publicUser(user) : null;
}

export function resetPassword(userId: string, newPassword: string): void {
  if (newPassword.length < 10 || newPassword.length > 128) {
    throw new ApiError(400, "Password must be between 10 and 128 characters.");
  }
  // Revoke all existing sessions after a password reset.
  const db = getDb();
  db.prepare("UPDATE Users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), userId);
  db.prepare("DELETE FROM AuthSessions WHERE user_id = ?").run(userId);
}
