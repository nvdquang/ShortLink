import { NextResponse } from "next/server";
import { getSessionToken, getUserForSession } from "@/lib/auth";
import { errorResponse, readJsonBody } from "@/lib/http";
import { createQuotaToken, listQuotaTokens } from "@/lib/quota-tokens";

export const dynamic = "force-dynamic";

function isAdmin(request: Request) {
  return getUserForSession(getSessionToken(request))?.role === "admin";
}

export async function GET(request: Request) {
  try {
    if (!isAdmin(request)) {
      return NextResponse.json({ error: "Only administrators can manage quota tokens." }, { status: 403 });
    }
    return NextResponse.json({ tokens: listQuotaTokens() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = getUserForSession(getSessionToken(request));
    if (!admin || admin.role !== "admin") {
      return NextResponse.json({ error: "Only administrators can manage quota tokens." }, { status: 403 });
    }
    const body = await readJsonBody(request);
    const linkCount = typeof body.linkCount === "number" ? body.linkCount : Number(body.linkCount);
    const created = createQuotaToken(linkCount, admin.id);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
