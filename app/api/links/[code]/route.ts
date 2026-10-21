import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { ApiError, deleteLink, getLinkByCode, updateLink } from "@/lib/links";
import { asBoolean, asString, errorResponse, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

async function resolveCode(context: RouteContext): Promise<string> {
  const { code } = await context.params;
  if (!code) throw new ApiError(400, "Missing link code.");
  return decodeURIComponent(code);
}

// GET /api/links/:code -> link details.
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = getUserForSession(getSessionToken(request));
    const link = getLinkByCode(await resolveCode(context), user?.id ?? null);
    if (!link) throw new ApiError(404, "Link not found.");
    return NextResponse.json({ link: { ...link, click_count: Number(link.click_count), is_active: Boolean(link.is_active) } });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/links/:code -> update title, expiry, active state or QR config.
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = getUserForSession(getSessionToken(request));
    const body = await readJsonBody(request);
    const link = updateLink(await resolveCode(context), {
      title: asString(body.title),
      expiresAt: asString(body.expiresAt),
      isActive: asBoolean(body.isActive),
      qrConfig: body.qrConfig,
    }, user?.id ?? null, user?.role ?? null, user?.plan ?? null);
    return NextResponse.json({ link });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/links/:code -> remove the link and its analytics (cascade).
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = getUserForSession(getSessionToken(request));
    deleteLink(await resolveCode(context), user?.id ?? null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
