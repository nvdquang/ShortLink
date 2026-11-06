import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { NextResponse } from "next/server";
import { asString, readJsonBody } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 4000;
const MAX_RESPONSE_HEADER_SIZE = 64 * 1024;
const MAX_REDIRECTS = 4;
const MAX_URL_LENGTH = 2048;
const DNS_FAILURE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ENODATA", "ESERVFAIL"]);
const CONNECTION_FAILURE_CODES = new Set([
  ...DNS_FAILURE_CODES,
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EHOSTDOWN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function isExpectedConnectionFailure(error: unknown): boolean {
  if (error instanceof Error && error.name === "TimeoutError") return true;
  const code = getErrorCode(error);
  return code !== null && CONNECTION_FAILURE_CODES.has(code);
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a! >= 224
    );
  }

  if (family === 6) {
    const firstSegment = Number.parseInt(address.split(":")[0] || "0", 16);
    const normalized = address.toLowerCase();
    return (
      firstSegment >= 0x2000 &&
      firstSegment <= 0x3fff &&
      !normalized.startsWith("2001:db8:") &&
      !normalized.startsWith("2002:")
    );
  }

  return false;
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress | null> {
  const host = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  if (family === 4 || family === 6) {
    return isPublicAddress(host) ? { address: host, family: family === 4 ? 4 : 6 } : null;
  }

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    const publicAddress = addresses.find(({ address }) => isPublicAddress(address));
    if (!publicAddress) return null;
    return {
      address: publicAddress.address,
      family: isIP(publicAddress.address) === 6 ? 6 : 4,
    };
  } catch (error) {
    const errorCode = getErrorCode(error);
    if (errorCode && DNS_FAILURE_CODES.has(errorCode)) return null;
    throw error;
  }
}

function requestHeaders(url: URL): RequestOptions {
  return {
    protocol: url.protocol,
    hostname: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : undefined,
    method: "HEAD",
    path: `${url.pathname}${url.search}`,
    maxHeaderSize: MAX_RESPONSE_HEADER_SIZE,
    headers: {
      Host: url.host,
      "User-Agent": "ShortLink-URL-Validator/1.0",
      "Range": "bytes=0-0",
    },
    timeout: REQUEST_TIMEOUT_MS,
  };
}

function requestStatus(
  url: URL,
  method: "HEAD" | "GET",
  address: ResolvedAddress,
): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = {
      ...requestHeaders(url),
      method,
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all) {
          callback(null, [{ address: address.address, family: address.family }]);
          return;
        }
        callback(null, address.address, address.family);
      },
    };
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(options, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location ?? null;
      response.destroy();
      resolve({ status, location });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const error = new Error("Target request timed out.");
      error.name = "TimeoutError";
      request.destroy(error);
    });
    request.on("error", reject);
    request.end();
  });
}

async function isReachableHttpUrl(value: string): Promise<boolean> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(value);
  } catch (error) {
    if (isExpectedConnectionFailure(error)) return false;
    throw error;
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (
      (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") ||
      !currentUrl.hostname ||
      currentUrl.username ||
      currentUrl.password
    ) {
      return false;
    }

    const port = currentUrl.port ? Number(currentUrl.port) : currentUrl.protocol === "https:" ? 443 : 80;
    if ((currentUrl.protocol === "http:" && port !== 80) || (currentUrl.protocol === "https:" && port !== 443)) {
      return false;
    }

    const address = await resolvePublicAddress(currentUrl.hostname);
    if (!address) return false;

    let response: { status: number; location: string | null };
    try {
      response = await requestStatus(currentUrl, "HEAD", address);
      if (response.status === 405 || response.status === 501) {
        response = await requestStatus(currentUrl, "GET", address);
      }
    } catch {
      return false;
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || redirectCount === MAX_REDIRECTS) return false;
      try {
        currentUrl = new URL(response.location, currentUrl);
      } catch {
        return false;
      }
      continue;
    }

    return response.status >= 200 && response.status < 400;
  }

  return false;
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const value = asString(body.url)?.trim();
  if (!value || value.length > MAX_URL_LENGTH) {
    return NextResponse.json({ error: "A URL of up to 2048 characters is required." }, { status: 400 });
  }

  const normalizedUrl = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return NextResponse.json({ valid: await isReachableHttpUrl(normalizedUrl) }, {
    headers: { "Cache-Control": "no-store" },
  });
}
