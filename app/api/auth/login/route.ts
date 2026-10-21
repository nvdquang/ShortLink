import { NextResponse } from "next/server";
import { loginUser, setSessionCookie } from "@/lib/auth";
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
    const session = loginUser(email, password);
    const response = NextResponse.json({ user: session.user });
    response.headers.append("Set-Cookie", setSessionCookie(session.token));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
