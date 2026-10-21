import { NextResponse } from "next/server";
import { registerUser, createEmailToken } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/mailer";
import { asString, errorResponse, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const email = asString(body.email);
    const password = asString(body.password);
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    const { user } = registerUser(email, password);
    // Send the activation link to the registration email.
    const token = createEmailToken(user.id, "activate");
    await sendVerificationEmail(user.email, token);
    // No session cookie yet: the account must be activated via email first.
    return NextResponse.json(
      {
        user,
        message: "Account created. We sent an activation link to your email — please verify to sign in.",
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
