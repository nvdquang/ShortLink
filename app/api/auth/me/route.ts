import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return NextResponse.json({ user: getUserForSession(getSessionToken(request)) });
}
