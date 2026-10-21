import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { LinkRecord } from "./links";

export type AnalyticsRecord = {
  id: string;
  link_id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  referer: string | null;
  clicked_at: string;
};

export type ClickContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  referer?: string | null;
};

export type DeviceType = "Mobile" | "Desktop" | "Tablet" | "Unknown";

export function detectDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return "Unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua))) return "Tablet";
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(ua)) return "Mobile";
  if (/windows|macintosh|linux|x11|cros/.test(ua)) return "Desktop";
  return "Unknown";
}

export function recordClick(link: LinkRecord, context: ClickContext = {}): AnalyticsRecord {
  const db = getDb();
  const id = randomUUID();
  const deviceType = detectDeviceType(context.userAgent);
  db.prepare(
    "INSERT INTO Analytics (id, link_id, ip_address, user_agent, device_type, referer) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, link.id, context.ipAddress ?? null, context.userAgent ?? null, deviceType, context.referer ?? null);
  db.prepare("UPDATE Links SET click_count = click_count + 1 WHERE id = ?").run(link.id);
  return db.prepare("SELECT * FROM Analytics WHERE id = ?").get(id) as AnalyticsRecord;
}

export type AnalyticsSummary = {
  totalClicks: number;
  uniqueVisitors: number;
  firstClickAt: string | null;
  lastClickAt: string | null;
  byDevice: { deviceType: string; clicks: number }[];
  byDay: { day: string; clicks: number }[];
  byReferer: { referer: string; clicks: number }[];
};

/** Aggregates the Analytics table for a single link. */
export function getAnalyticsSummary(linkId: string): AnalyticsSummary {
  const db = getDb();
  const totals = db
    .prepare(
      "SELECT COUNT(*) AS totalClicks, COUNT(DISTINCT ip_address) AS uniqueVisitors, MIN(clicked_at) AS firstClickAt, MAX(clicked_at) AS lastClickAt FROM Analytics WHERE link_id = ?",
    )
    .get(linkId) as { totalClicks: number; uniqueVisitors: number; firstClickAt: string | null; lastClickAt: string | null };

  const byDevice = db
    .prepare("SELECT COALESCE(device_type, 'Unknown') AS deviceType, COUNT(*) AS clicks FROM Analytics WHERE link_id = ? GROUP BY deviceType ORDER BY clicks DESC")
    .all(linkId) as { deviceType: string; clicks: number }[];

  const byDay = db
    .prepare("SELECT substr(clicked_at, 1, 10) AS day, COUNT(*) AS clicks FROM Analytics WHERE link_id = ? GROUP BY day ORDER BY day ASC")
    .all(linkId) as { day: string; clicks: number }[];

  const byReferer = db
    .prepare("SELECT COALESCE(referer, 'Direct') AS referer, COUNT(*) AS clicks FROM Analytics WHERE link_id = ? GROUP BY referer ORDER BY clicks DESC LIMIT 10")
    .all(linkId) as { referer: string; clicks: number }[];

  return { ...totals, byDevice, byDay, byReferer };
}

export type AnalyticsResponse = {
  link: LinkRecord;
  summary: AnalyticsSummary;
  recentClicks: AnalyticsRecord[];
};

export function getAnalyticsForCode(link: LinkRecord, recentLimit = 20): AnalyticsResponse {
  const db = getDb();
  const safeLimit = Math.min(Math.max(recentLimit, 1), 100);
  const recentClicks = db
    .prepare("SELECT * FROM Analytics WHERE link_id = ? ORDER BY clicked_at DESC LIMIT ?")
    .all(link.id, safeLimit) as AnalyticsRecord[];
  return { link, summary: getAnalyticsSummary(link.id), recentClicks };
}
