import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { createLink, listLinks } from "@/lib/links";
import { getDb } from "@/lib/db";
import { getSystemSettings, formatShortUrl } from "@/lib/settings";
import { asString, errorResponse, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/links -> create a short link and return its short URL.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const originalUrl = asString(body.originalUrl) ?? asString(body.url);
    if (!originalUrl) {
      return NextResponse.json({ error: "Destination URL is required." }, { status: 400 });
    }
    const user = getUserForSession(getSessionToken(request));
    const link = createLink({
      originalUrl,
      customAlias: asString(body.customAlias) ?? asString(body.alias) ?? null,
      title: asString(body.title) ?? null,
      qrConfig: body.qrConfig,
      expiresAt: asString(body.expiresAt) ?? null,
      expiredUrl: body.expiredUrl === null ? null : asString(body.expiredUrl) ?? null,
      userId: user?.id ?? null,
      userRole: user?.role ?? null,
      userPlan: user?.plan ?? null,
    });
    const settings = getSystemSettings();
    const origin = new URL(request.url).origin;
    const shortUrl = formatShortUrl(link.short_code, settings.shortlinkDomain, origin);
    return NextResponse.json({
      link: { ...link, click_count: Number(link.click_count), is_active: Boolean(link.is_active) },
      shortUrl,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

// GET /api/links -> list the most recent links.
export async function GET(request: Request) {
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
    const user = getUserForSession(getSessionToken(request));
    const links = listLinks(Number.isFinite(limit) ? limit : 20, user?.id ?? null).map((link) => ({ ...link, click_count: Number(link.click_count), is_active: Boolean(link.is_active) }));
    const count = user
      ? Number((getDb().prepare("SELECT COUNT(*) AS count FROM Links WHERE user_id = ?").get(user.id) as { count: number }).count)
      : 0;
    const settings = getSystemSettings();
    const userBonus = user
      ? Number((getDb().prepare("SELECT link_bonus FROM Users WHERE id = ?").get(user.id) as { link_bonus: number }).link_bonus)
      : 0;
    const isFreeSystemMode = settings.systemMode === "free";
    const linkLimit = !user || user.role === "admin" || user.plan === "plus" || isFreeSystemMode
      ? null
      : (user.linkLimit ?? settings.freeLinkLimit) + userBonus;
    const usage = {
      count,
      limit: linkLimit,
      canCreate: linkLimit === null || count < linkLimit,
    };
    return NextResponse.json({ links, usage });
  } catch (error) {
    return errorResponse(error);
  }
}
