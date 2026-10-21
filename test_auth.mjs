import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.SHORTLINK_TEST_URL ?? "http://localhost:3000";
const email = `shortlink-${randomUUID()}@example.test`;
const password = "secure-shortlink-password";
const request = async (route, init = {}) => fetch(`${baseUrl}${route}`, init);
const postJson = (body) => ({ headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let sessionCookie = "";
let ownedShortCode = "";
try {
  const registration = await request("/api/auth/register", { method: "POST", ...postJson({ email, password }) });
  assert.equal(registration.status, 201, await registration.clone().text());
  assert.match(registration.headers.get("set-cookie") ?? "", /HttpOnly/);
  assert.match(registration.headers.get("set-cookie") ?? "", /SameSite=Lax/);
  sessionCookie = registration.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(sessionCookie);

  const me = await request("/api/auth/me", { headers: { cookie: sessionCookie } });
  const meBody = await me.json();
  assert.equal(meBody.user.email, email);

  const duplicate = await request("/api/auth/register", { method: "POST", ...postJson({ email: email.toUpperCase(), password }) });
  assert.equal(duplicate.status, 409);
  const badLogin = await request("/api/auth/login", { method: "POST", ...postJson({ email, password: "not-the-password" }) });
  assert.equal(badLogin.status, 401);

  const created = await request("/api/links", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ originalUrl: "https://example.org/auth-owned-link" }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  ownedShortCode = createdBody.link.short_code;
  assert.equal(createdBody.link.user_id, meBody.user.id);

  const anonymousLinks = await request("/api/links");
  assert.ok(!(await anonymousLinks.json()).links.some((link) => link.short_code === ownedShortCode));
  const anonymousDetails = await request(`/api/links/${ownedShortCode}`);
  assert.equal(anonymousDetails.status, 404);

  const logout = await request("/api/auth/logout", { method: "POST", headers: { cookie: sessionCookie } });
  assert.equal(logout.status, 200);
  const revokedMe = await request("/api/auth/me", { headers: { cookie: sessionCookie } });
  assert.equal((await revokedMe.json()).user, null);

  const login = await request("/api/auth/login", { method: "POST", ...postJson({ email, password }) });
  assert.equal(login.status, 200);
  const loggedInCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert.ok(loggedInCookie);
  const ownedDetails = await request(`/api/links/${ownedShortCode}`, { headers: { cookie: loggedInCookie } });
  assert.equal(ownedDetails.status, 200);
  assert.equal((await ownedDetails.json()).link.short_code, ownedShortCode);

  console.log("Authentication tests passed:", { email, userId: meBody.user.id, ownedShortCode });
} finally {
  if (sessionCookie && ownedShortCode) {
    const newLogin = await request("/api/auth/login", { method: "POST", ...postJson({ email, password }) });
    const cleanupCookie = newLogin.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (cleanupCookie) await request(`/api/links/${ownedShortCode}`, { method: "DELETE", headers: { cookie: cleanupCookie } });
    await request("/api/auth/logout", { method: "POST", headers: { cookie: cleanupCookie } });
  }
}
