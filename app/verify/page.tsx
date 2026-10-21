"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function VerifyInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Missing activation token.");
      return;
    }
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (res.ok) {
          setStatus("ok");
          setMessage(data?.message ?? "Account activated.");
        } else {
          setStatus("error");
          setMessage(data?.error ?? "Activation failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Activation failed, please try again.");
      });
  }, [params]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 440, padding: 32, border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center", background: "#fff" }}>
        <h1 style={{ color: status === "ok" ? "#16a34a" : status === "error" ? "#dc2626" : "#0284c7" }}>
          {status === "pending" ? "Activating..." : status === "ok" ? "✓ Account Activated" : "✕ Activation Failed"}
        </h1>
        <p style={{ color: "#475569" }}>{status === "pending" ? "Please wait a moment..." : message}</p>
        {status !== "pending" && (
          <a href="/" style={{ display: "inline-block", marginTop: 12, background: "#0284c7", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontWeight: 700 }}>
            Go to Sign In
          </a>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading...</div>}>
      <VerifyInner />
    </Suspense>
  );
}
