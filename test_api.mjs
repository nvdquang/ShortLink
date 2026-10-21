import assert from "node:assert/strict";

const baseUrl = process.env.SHORTLINK_TEST_URL ?? "http://localhost:3001";
const alias = `e2e-${Date.now().toString(36)}`;

const createResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    originalUrl: "https://example.org/shortlink-e2e",
    customAlias: alias,
    title: "ShortLink API E2E",
  }),
});
assert.equal(createResponse.status, 201, "creating a short link should return 201");
const created = await createResponse.json();
assert.equal(created.link.custom_alias, alias);
assert.equal(created.link.click_count, 0);

const duplicateResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ originalUrl: "https://example.org/other", customAlias: alias }),
});
assert.equal(duplicateResponse.status, 409, "duplicate aliases should be rejected");

const invalidResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ originalUrl: "javascript:alert(1)" }),
});
assert.equal(invalidResponse.status, 400, "non-http protocols should be rejected");

const redirectResponse = await fetch(`${baseUrl}/${alias}`, {
  method: "GET",
  redirect: "manual",
  headers: {
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile",
    referer: "https://social.example/campaign",
    "x-forwarded-for": "203.0.113.9",
  },
});
assert.equal(redirectResponse.status, 307, "valid short codes should return 307");
assert.equal(redirectResponse.headers.get("location"), "https://example.org/shortlink-e2e");

const analyticsResponse = await fetch(`${baseUrl}/api/links/${alias}/analytics`);
assert.equal(analyticsResponse.status, 200);
const analytics = await analyticsResponse.json();
assert.equal(analytics.summary.totalClicks, 1);
assert.equal(analytics.summary.uniqueVisitors, 1);
assert.equal(analytics.summary.byDevice[0].deviceType, "Mobile");
assert.equal(analytics.summary.byReferer[0].referer, "https://social.example/campaign");
assert.equal(analytics.recentClicks[0].ip_address, "203.0.113.9");

const deactivateResponse = await fetch(`${baseUrl}/api/links/${alias}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ isActive: false }),
});
assert.equal(deactivateResponse.status, 200);
const inactiveRedirect = await fetch(`${baseUrl}/${alias}`, { redirect: "manual" });
assert.equal(inactiveRedirect.status, 404, "inactive links should not redirect");

const deleteResponse = await fetch(`${baseUrl}/api/links/${alias}`, { method: "DELETE" });
assert.equal(deleteResponse.status, 200);
const deletedAnalyticsResponse = await fetch(`${baseUrl}/api/links/${alias}/analytics`);
assert.equal(deletedAnalyticsResponse.status, 404, "deleted links should no longer have analytics");

const authEmail = `auth-${Date.now()}@example.test`;
const authPassword = "shortlink-pass-2026";
const registration = await fetch(`${baseUrl}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: authEmail, password: authPassword }),
});
assert.equal(registration.status, 201, "valid registration should return 201");
const sessionCookie = registration.headers.get("set-cookie");
assert.ok(sessionCookie?.includes("HttpOnly"), "session cookie must be HttpOnly");
assert.ok(sessionCookie?.includes("SameSite=Lax"), "session cookie must use SameSite=Lax");
const cookiePair = sessionCookie.split(";")[0];
const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: cookiePair } });
const meBody = await meResponse.json();
assert.equal(meBody.user.email, authEmail);
const ownedLinkResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookiePair },
  body: JSON.stringify({ originalUrl: "https://example.org/account-owned" }),
});
assert.equal(ownedLinkResponse.status, 201);
const ownedLink = await ownedLinkResponse.json();
assert.equal(ownedLink.link.user_id, meBody.user.id);
const publicLinksResponse = await fetch(`${baseUrl}/api/links`);
assert.ok(!(await publicLinksResponse.json()).links.some((link) => link.id === ownedLink.link.id));
const duplicateRegistration = await fetch(`${baseUrl}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: authEmail, password: authPassword }),
});
assert.equal(duplicateRegistration.status, 409);
const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: authEmail, password: "incorrect-password" }),
});
assert.equal(badLogin.status, 401);
const goodLogin = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: authEmail, password: authPassword }),
});
assert.equal(goodLogin.status, 200);
const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie: cookiePair } });
assert.equal(logout.status, 200);
const loggedOut = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: cookiePair } });
assert.equal((await loggedOut.json()).user, null);
const cleanup = await fetch(`${baseUrl}/api/links/${ownedLink.link.short_code}`, { method: "DELETE", headers: { cookie: cookiePair } });
assert.equal(cleanup.status, 404, "revoked sessions cannot delete owned links");
const newSessionCookie = goodLogin.headers.get("set-cookie").split(";")[0];
await fetch(`${baseUrl}/api/links/${ownedLink.link.short_code}`, { method: "DELETE", headers: { cookie: newSessionCookie } });

console.log("API and auth end-to-end tests passed:", { alias, clicks: analytics.summary.totalClicks, authEmail });
