import { NextResponse } from "next/server";
import { recordClick } from "@/lib/analytics";
import { clientIp } from "@/lib/http";
import { ApiError, ExpiredLinkError, extractShortCode, resolveLink } from "@/lib/links";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const code = extractShortCode(request.url);
    const link = resolveLink(code);
    recordClick(link, {
      ipAddress: clientIp(request),
      userAgent: request.headers.get("user-agent"),
      referer: request.headers.get("referer"),
    });
    return NextResponse.redirect(link.original_url, 307);
  } catch (error) {
    if (error instanceof ExpiredLinkError) {
      const destination = error.expiredUrl
        ? new URL(error.expiredUrl, request.url)
        : new URL("/", request.url);
      return NextResponse.redirect(destination, 307);
    }
    if (error instanceof ApiError) {
      return new NextResponse(null, { status: 404 });
    }
    throw error;
  }
}