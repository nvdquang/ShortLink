import { NextResponse } from "next/server";
import { ApiError } from "./links";

/** Reads and parses a JSON body, rejecting malformed payloads with a 400. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text.trim()) {
      throw new ApiError(400, "Request body cannot be empty.");
    }
    const body = JSON.parse(text);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiError(400, "Request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof ApiError ||
      (error instanceof Error && (error.name === "ApiError" || typeof (error as { status?: unknown }).status === "number"))
    ) {
      throw error;
    }
    throw new ApiError(400, "Unable to parse JSON in request.");
  }
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 45);
  return request.headers.get("x-real-ip")?.slice(0, 45) ?? null;
}

export function errorResponse(error: unknown): NextResponse {
  if (
    error instanceof ApiError ||
    (error instanceof Error && error.name === "ApiError") ||
    (typeof error === "object" && error !== null && "status" in error && typeof (error as { status: unknown }).status === "number")
  ) {
    const apiErr = error as { status: number; message: string };
    return NextResponse.json({ error: apiErr.message }, { status: apiErr.status });
  }
  console.error("Unexpected API error:", error);
  return NextResponse.json({ error: "Internal server error, please try again." }, { status: 500 });
}
