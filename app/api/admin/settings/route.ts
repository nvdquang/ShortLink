import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { getSystemSettings, updateSystemSettings } from "@/lib/settings";
import { errorResponse, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = getSystemSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = getUserForSession(getSessionToken(request));
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Only administrators can configure system settings." }, { status: 403 });
    }

    const body = await readJsonBody(request);
    let expiredRedirectUrl: string | undefined;
    if (body.expiredRedirectUrl !== undefined) {
      if (typeof body.expiredRedirectUrl !== "string") {
        return NextResponse.json({ error: "Expired link redirect URL must be a string." }, { status: 400 });
      }
      const value = body.expiredRedirectUrl.trim();
      if (value) {
        try {
          const parsedUrl = new URL(value);
          if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new Error("Unsupported URL protocol.");
          }
          expiredRedirectUrl = parsedUrl.toString();
        } catch {
          return NextResponse.json({ error: "Expired link redirect URL must be a valid HTTP or HTTPS URL." }, { status: 400 });
        }
      } else {
        expiredRedirectUrl = "";
      }
    }
    const updated = updateSystemSettings({
      defaultQrLogo: typeof body.defaultQrLogo === "string" ? body.defaultQrLogo : undefined,
      shortlinkDomain: typeof body.shortlinkDomain === "string" ? body.shortlinkDomain : undefined,
      expiredRedirectUrl,
      freeLinkLimit: body.freeLinkLimit !== undefined ? Number(body.freeLinkLimit) : undefined,
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
