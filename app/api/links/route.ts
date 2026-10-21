import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { createLink, listLinks } from "@/lib/links";
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
    return NextResponse.json({ links });
  } catch (error) {
    return errorResponse(error);
  }
}
