import { notFound, redirect } from "next/navigation";
import { ApiError, resolveLink } from "@/lib/links";
import { clientIp } from "@/lib/http";
import { recordClick } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ code: string }> };

/**
 * Handles real short-link redirects: /:code
 * Records a click in Analytics, then sends the visitor to the original URL.
 */
export default async function ShortCodePage({ params }: PageProps) {
  const { code } = await params;
  try {
    const link = resolveLink(decodeURIComponent(code));
    const headers = await import("next/headers").then((mod) => mod.headers());
    recordClick(link, {
      ipAddress: clientIp(new Request("http://localhost", { headers })),
      userAgent: headers.get("user-agent"),
      referer: headers.get("referer"),
    });
    redirect(link.original_url);
  } catch (error) {
    if (error instanceof ApiError) {
      notFound();
    }
    throw error;
  }
}
