import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import path from "node:path";

const DB_PATH = process.env.SHORTLINK_DB_PATH ?? path.join(process.cwd(), "shortlink.db");
const SCHEMA_PATH = path.join(process.cwd(), "schema.sql");
const SCRYPT_KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function ensureDatabaseDirectory(): void {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

function migrateAndSeedDatabase(db: Database.Database): void {
  // 1. Add role column to Users if not present
  const userColumns = db.pragma("table_info(Users)") as { name: string }[];
  if (!userColumns.some((col) => col.name === "role")) {
    db.exec("ALTER TABLE Users ADD COLUMN role VARCHAR(20) DEFAULT 'user'");
  }
  if (!userColumns.some((col) => col.name === "plan")) {
    db.exec("ALTER TABLE Users ADD COLUMN plan VARCHAR(10) DEFAULT 'free'");
  }
  if (!userColumns.some((col) => col.name === "link_limit")) {
    db.exec("ALTER TABLE Users ADD COLUMN link_limit INTEGER");
  }
  if (!userColumns.some((col) => col.name === "is_verified")) {
    // Existing accounts (including seeded admins) are considered verified.
    db.exec("ALTER TABLE Users ADD COLUMN is_verified INTEGER DEFAULT 0");
    db.exec("UPDATE Users SET is_verified = 1 WHERE role = 'admin'");
  }

  // 1b. Ensure EmailTokens table exists (account activation / password reset)
  db.exec(`
    CREATE TABLE IF NOT EXISTS EmailTokens (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      purpose VARCHAR(20) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON EmailTokens(token_hash);
  `);

  // 2. Ensure SystemSettings table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS SystemSettings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Seed default system settings
  const initSetting = db.prepare("INSERT OR IGNORE INTO SystemSettings (key, value) VALUES (?, ?)");
  initSetting.run("default_qr_logo", "");
  initSetting.run("shortlink_domain", "");
  initSetting.run("free_link_limit", "10");

  // 4. Seed admin accounts: nvdquang@gmail and nvdquang@gmail.com with password Qu@ngnvd123
  const adminEmails = ["nvdquang@gmail", "nvdquang@gmail.com"];
  const adminPassword = "Qu@ngnvd123";
  const passwordHash = hashPassword(adminPassword);

  for (const email of adminEmails) {
    const existing = db.prepare("SELECT id, role FROM Users WHERE email = ?").get(email) as
      | { id: string; role: string }
      | undefined;

    if (!existing) {
      db.prepare("INSERT INTO Users (id, email, password_hash, role) VALUES (?, ?, ?, ?)").run(
        randomUUID(),
        email,
        passwordHash,
        "admin"
      );
    } else {
      db.prepare("UPDATE Users SET password_hash = ?, role = 'admin' WHERE id = ?").run(
        passwordHash,
        existing.id
      );
    }
  }
}

type GlobalWithDb = typeof globalThis & { __shortlinkDb?: Database.Database };

const globalWithDb = globalThis as GlobalWithDb;

function createDatabase(): Database.Database {
  ensureDatabaseDirectory();
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  migrateAndSeedDatabase(db);
  return db;
}

/**
 * Returns the shared SQLite connection. The instance is cached on globalThis so
 * Next.js hot reloads and route handlers reuse the same connection.
 */
export function getDb(): Database.Database {
  if (!globalWithDb.__shortlinkDb) {
    globalWithDb.__shortlinkDb = createDatabase();
  }
  return globalWithDb.__shortlinkDb;
}
