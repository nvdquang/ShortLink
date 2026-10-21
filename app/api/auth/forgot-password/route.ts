import { NextResponse } from "next/server";
import { getUserByEmail, createEmailToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { asString, errorResponse, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

// POST /api/auth/forgot-password { email } -> send a password reset link.
// Always returns ok to avoid leaking which emails are registered.
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const email = asString(body.email);
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    const user = getUserByEmail(email);
    if (user) {
      const token = createEmailToken(user.id, "reset");
      await sendPasswordResetEmail(user.email, token);
    }
    return NextResponse.json({
      ok: true,
      message: "If that email is registered, a password reset link has been sent.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
