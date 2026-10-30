import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { ApiError } from "./links";

const MAX_TOKEN_LINKS = 100_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createQuotaToken(linkCount: number, createdBy: string) {
  if (!Number.isSafeInteger(linkCount) || linkCount < 1 || linkCount > MAX_TOKEN_LINKS) {
    throw new ApiError(400, `Token link count must be between 1 and ${MAX_TOKEN_LINKS}.`);
  }

  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO QuotaTokens (id, token_hash, token_hint, token_value, link_count, created_by) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = randomBytes(6).toString("base64url");
    try {
      insert.run(randomUUID(), hashToken(token), token.slice(0, 4), token, linkCount, createdBy);
      return { token, linkCount };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("UNIQUE constraint failed: QuotaTokens.token_hash")) {
        throw error;
      }
    }
  }
  throw new ApiError(500, "Unable to generate a unique quota token. Please try again.");
}

export function listQuotaTokens() {
  return getDb()
    .prepare(
      `SELECT QuotaTokens.id, QuotaTokens.token_hint, QuotaTokens.token_value, QuotaTokens.link_count, QuotaTokens.used_at,
              Users.email AS used_by_email, QuotaTokens.created_at
       FROM QuotaTokens
       LEFT JOIN Users ON Users.id = QuotaTokens.used_by
       ORDER BY QuotaTokens.created_at DESC
       LIMIT 100`,
    )
    .all() as {
    id: string;
    token_hint: string;
    token_value: string | null;
    link_count: number;
    used_at: string | null;
    used_by_email: string | null;
    created_at: string;
  }[];
}

export function redeemQuotaToken(tokenInput: string, userId: string): { addedLinks: number; linkBonus: number } {
  const token = tokenInput.trim();
  if (!token || token.length > 100) {
    throw new ApiError(400, "Enter a valid quota token.");
  }

  const db = getDb();
  const redeem = db.transaction(() => {
    const row = db
      .prepare("SELECT id, link_count FROM QuotaTokens WHERE token_hash = ? AND used_at IS NULL")
      .get(hashToken(token)) as { id: string; link_count: number } | undefined;
    if (!row) {
      throw new ApiError(400, "This token is invalid or has already been used.");
    }

    const usedAt = new Date().toISOString();
    const claimed = db
      .prepare("UPDATE QuotaTokens SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL")
      .run(userId, usedAt, row.id);
    if (claimed.changes !== 1) {
      throw new ApiError(400, "This token is invalid or has already been used.");
    }

    const updatedUser = db
      .prepare("UPDATE Users SET link_bonus = link_bonus + ? WHERE id = ?")
      .run(row.link_count, userId);
    if (updatedUser.changes !== 1) {
      throw new ApiError(404, "Account not found.");
    }
    const user = db.prepare("SELECT link_bonus FROM Users WHERE id = ?").get(userId) as { link_bonus: number };
    return { addedLinks: row.link_count, linkBonus: user.link_bonus };
  });

  return redeem();
}
