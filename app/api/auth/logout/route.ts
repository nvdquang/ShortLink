import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionToken, revokeSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  revokeSession(getSessionToken(request));
  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", clearSessionCookie());
  return response;
}
