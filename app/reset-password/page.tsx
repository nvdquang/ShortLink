"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setDone(true);
      } else {
        setError(data?.error ?? "Reset failed.");
      }
    } catch {
      setError("Reset failed, please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 440, width: "100%", padding: 32, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }}>
        {done ? (
          <>
            <h1 style={{ color: "#16a34a", textAlign: "center" }}>✓ Password Updated</h1>
            <p style={{ color: "#475569", textAlign: "center" }}>Your password has been changed. You can now sign in.</p>
            <a href="/" style={{ display: "block", marginTop: 12, background: "#0284c7", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontWeight: 700, textAlign: "center" }}>
              Go to Sign In
            </a>
          </>
        ) : (
          <>
            <h1 style={{ color: "#0f172a", marginTop: 0 }}>Choose a New Password</h1>
            <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
              <label htmlFor="rp-pass" style={{ fontWeight: 600, fontSize: 13 }}>New password</label>
              <input id="rp-pass" type="password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6 }} />
              <label htmlFor="rp-confirm" style={{ fontWeight: 600, fontSize: 13 }}>Confirm new password</label>
              <input id="rp-confirm" type="password" required minLength={10} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6 }} />
              {error && <p style={{ color: "#dc2626", fontSize: 13 }} role="alert">{error}</p>}
              <button type="submit" disabled={busy || !token} style={{ background: "#0284c7", color: "#fff", border: "none", padding: "11px 16px", borderRadius: 6, fontWeight: 700, cursor: "pointer" }}>
                {busy ? "Updating..." : "Update Password"}
              </button>
              {!token && <p style={{ color: "#dc2626", fontSize: 13 }}>Missing reset token. Please use the link from your email.</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading...</div>}>
      <ResetInner />
    </Suspense>
  );
}
