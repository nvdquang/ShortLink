import { NextResponse } from "next/server";
import { consumeEmailToken, resetPassword } from "@/lib/auth";
import { asString, errorResponse, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/auth/reset-password { token, password } -> set a new password.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const token = asString(body.token);
    const password = asString(body.password);
    if (!token) {
      return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: "New password is required." }, { status: 400 });
    }
    const { userId } = consumeEmailToken(token, "reset");
    resetPassword(userId, password);
    return NextResponse.json({ ok: true, message: "Password updated successfully. You can now sign in with the new password." });
  } catch (error) {
    return errorResponse(error);
  }
}
