import { NextResponse } from "next/server";
import { consumeEmailToken, activateUser } from "@/lib/auth";
import { asString, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/auth/verify?token=... -> activate the account and confirm in HTML.
export async function GET(request: Request) {
  try {
    const token = asString(new URL(request.url).searchParams.get("token"));
    const { userId } = consumeEmailToken(token ?? "", "activate");
    activateUser(userId);
    return NextResponse.json({ ok: true, message: "Account activated successfully. You can now sign in." });
  } catch (error) {
    return errorResponse(error);
  }
}
