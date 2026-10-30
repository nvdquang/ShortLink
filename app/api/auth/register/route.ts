import { NextResponse } from "next/server";
import { registerUser, createEmailToken, setSessionCookie } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/mailer";
import { asString, errorResponse, readJsonBody } from "@/lib/http";
import { getSystemSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const email = asString(body.email);
    const password = asString(body.password);
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }
    const settings = getSystemSettings();
    const { token, user } = registerUser(email, password, !settings.requireEmailActivation);
    if (settings.requireEmailActivation) {
      const token = createEmailToken(user.id, "activate");
      await sendVerificationEmail(user.email, token);
    }
    const response = NextResponse.json(
      {
        user,
        requiresEmailActivation: settings.requireEmailActivation,
        message: settings.requireEmailActivation
          ? "Account created. We sent an activation link to your email — please verify to sign in."
          : "Account created successfully. You can now sign in without email activation.",
      },
      { status: 201 },
    );
    if (!settings.requireEmailActivation) {
      response.headers.set("set-cookie", setSessionCookie(token));
    }
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
