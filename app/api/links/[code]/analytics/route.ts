import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { ApiError, getLinkByCode } from "@/lib/links";
import { getAnalyticsForCode } from "@/lib/analytics";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ code: string }> };

// GET /api/links/:code/analytics -> click stats for one link.
export async function GET(request: Request, context: RouteContext) {
  try {
    const { code } = await context.params;
    const user = getUserForSession(getSessionToken(request));
    const link = getLinkByCode(decodeURIComponent(code), user?.id ?? null);
    if (!link) throw new ApiError(404, "Link not found.");
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 20);
    return NextResponse.json(getAnalyticsForCode(link, Number.isFinite(limit) ? limit : 20));
  } catch (error) {
    return errorResponse(error);
  }
}
