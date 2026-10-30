import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { errorResponse, readJsonBody } from "@/lib/http";
import { redeemQuotaToken } from "@/lib/quota-tokens";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = getUserForSession(getSessionToken(request));
    if (!user) {
      return NextResponse.json({ error: "Sign in to redeem a quota token." }, { status: 401 });
    }
    const body = await readJsonBody(request);
    if (typeof body.token !== "string") {
      return NextResponse.json({ error: "Enter a valid quota token." }, { status: 400 });
    }
    const result = redeemQuotaToken(body.token, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
