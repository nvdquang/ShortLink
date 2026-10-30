import assert from "node:assert/strict";
import Database from "better-sqlite3";
import path from "node:path";

const baseUrl = process.env.SHORTLINK_TEST_URL ?? "http://localhost:3001";
const dbPath = process.env.SHORTLINK_TEST_DB_PATH ?? process.env.SHORTLINK_DB_PATH ?? path.join(process.cwd(), "shortlink.db");
const alias = `e2e-${Date.now().toString(36)}`;

function withTestDb(callback) {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  try {
    return callback(db);
  } finally {
    db.close();
  }
}

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

const youtubeTarget = "https://www.youtube.com/watch?v=sKuT1s1rsb8&list=PLlN3ncUdIbjAHVubHU8aflnABC-HSydr5";
const youtubeLinkResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ originalUrl: youtubeTarget }),
});
assert.equal(youtubeLinkResponse.status, 201);
const youtubeLink = await youtubeLinkResponse.json();
const youtubeRedirect = await fetch(`${baseUrl}/${youtubeLink.link.short_code}`, { redirect: "manual" });
assert.equal(youtubeRedirect.status, 307);
assert.equal(youtubeRedirect.headers.get("location"), youtubeTarget, "redirects should preserve the full target URL and query");

const expiredDefaultResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    originalUrl: "https://example.org/expired-default",
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  }),
});
assert.equal(expiredDefaultResponse.status, 201);
const expiredDefaultLink = await expiredDefaultResponse.json();
assert.equal(expiredDefaultLink.link.expired_url, null);
const expiredDefaultRedirect = await fetch(`${baseUrl}/${expiredDefaultLink.link.short_code}`, { redirect: "manual" });
assert.equal(expiredDefaultRedirect.status, 307, "expired links without a fallback should redirect home");
assert.equal(expiredDefaultRedirect.headers.get("location"), "/");

const expiredFallbackResponse = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    originalUrl: "https://example.org/expired-fallback",
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    expiredUrl: "https://example.org/link-expired",
  }),
});
assert.equal(expiredFallbackResponse.status, 201);
const expiredFallbackLink = await expiredFallbackResponse.json();
assert.equal(expiredFallbackLink.link.expired_url, "https://example.org/link-expired");
const expiredFallbackRedirect = await fetch(`${baseUrl}/${expiredFallbackLink.link.short_code}`, { redirect: "manual" });
assert.equal(expiredFallbackRedirect.status, 307);
assert.equal(expiredFallbackRedirect.headers.get("location"), "https://example.org/link-expired");
const updateExpiredUrl = await fetch(`${baseUrl}/api/links/${expiredFallbackLink.link.short_code}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ expiredUrl: "https://example.org/updated-link-expired" }),
});
assert.equal(updateExpiredUrl.status, 200, "expired_url should be updatable");
assert.equal((await updateExpiredUrl.json()).link.expired_url, "https://example.org/updated-link-expired");
const updatedExpiredRedirect = await fetch(`${baseUrl}/${expiredFallbackLink.link.short_code}`, { redirect: "manual" });
assert.equal(updatedExpiredRedirect.status, 307);
assert.equal(updatedExpiredRedirect.headers.get("location"), "https://example.org/updated-link-expired");

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
await fetch(`${baseUrl}/api/links/${youtubeLink.link.short_code}`, { method: "DELETE" });
await fetch(`${baseUrl}/api/links/${expiredDefaultLink.link.short_code}`, { method: "DELETE" });
await fetch(`${baseUrl}/api/links/${expiredFallbackLink.link.short_code}`, { method: "DELETE" });
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
assert.equal(registration.headers.get("set-cookie"), null, "unverified registrations must not receive a session cookie");
const authUserId = withTestDb((db) => {
  const user = db.prepare("SELECT id FROM Users WHERE email = ?").get(authEmail);
  assert.ok(user, "registration should create the test account");
  db.prepare("UPDATE Users SET is_verified = 1 WHERE id = ?").run(user.id);
  return user.id;
});
const firstLogin = await fetch(`${baseUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: authEmail, password: authPassword }),
});
assert.equal(firstLogin.status, 200, "verified accounts should be able to sign in");
const firstSessionCookie = firstLogin.headers.get("set-cookie");
assert.ok(firstSessionCookie?.includes("HttpOnly"), "session cookie must be HttpOnly");
assert.ok(firstSessionCookie?.includes("SameSite=Lax"), "session cookie must use SameSite=Lax");
const cookiePair = firstSessionCookie.split(";")[0];
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
const editedTarget = "https://www.youtube.com/watch?v=updated&list=updated-playlist";
const editLinkResponse = await fetch(`${baseUrl}/api/links/${ownedLink.link.short_code}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: cookiePair },
  body: JSON.stringify({ originalUrl: editedTarget, qrConfig: { color: "#123456", background: "#ffffff" } }),
});
assert.equal(editLinkResponse.status, 200, "link owners should be able to edit target URL and QR settings");
const editedLink = await editLinkResponse.json();
assert.equal(editedLink.link.original_url, editedTarget);
assert.deepEqual(JSON.parse(editedLink.link.qr_config), { color: "#123456", background: "#ffffff" });
const editedLinkRedirect = await fetch(`${baseUrl}/${ownedLink.link.short_code}`, { redirect: "manual" });
assert.equal(editedLinkRedirect.status, 307);
assert.equal(editedLinkRedirect.headers.get("location"), editedTarget);
const usageResponse = await fetch(`${baseUrl}/api/links?limit=1`, { headers: { cookie: cookiePair } });
assert.equal(usageResponse.status, 200);
const usageBody = await usageResponse.json();
assert.equal(usageBody.usage.count, 1);
const systemSettingsResponse = await fetch(`${baseUrl}/api/admin/settings`);
assert.equal(systemSettingsResponse.status, 200);
const systemSettings = await systemSettingsResponse.json();
assert.equal(usageBody.usage.limit, systemSettings.settings.freeLinkLimit);
assert.equal(usageBody.usage.canCreate, usageBody.usage.count < usageBody.usage.limit);
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
const newSessionCookie = goodLogin.headers.get("set-cookie").split(";")[0];
const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie: cookiePair } });
assert.equal(logout.status, 200);
const loggedOut = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: cookiePair } });
assert.equal((await loggedOut.json()).user, null);
const cleanup = await fetch(`${baseUrl}/api/links/${ownedLink.link.short_code}`, { method: "DELETE", headers: { cookie: cookiePair } });
assert.equal(cleanup.status, 404, "revoked sessions cannot delete owned links");
const quotaLinkCodes = [];
for (let index = usageBody.usage.count; index < usageBody.usage.limit; index += 1) {
  const response = await fetch(`${baseUrl}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: newSessionCookie },
    body: JSON.stringify({ originalUrl: `https://example.org/free-quota-${index}` }),
  });
  assert.equal(response.status, 201);
  quotaLinkCodes.push((await response.json()).link.short_code);
}
const reachedQuota = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({ originalUrl: "https://example.org/free-quota-over-limit" }),
});
assert.equal(reachedQuota.status, 403, "Free accounts should not create links after reaching their quota");

const nonAdminTokenList = await fetch(`${baseUrl}/api/admin/quota-tokens`, { headers: { cookie: newSessionCookie } });
assert.equal(nonAdminTokenList.status, 403, "regular users must not manage quota tokens");
withTestDb((db) => db.prepare("UPDATE Users SET role = 'admin' WHERE id = ?").run(authUserId));
const tokenResponse = await fetch(`${baseUrl}/api/admin/quota-tokens`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({ linkCount: 2 }),
});
assert.equal(tokenResponse.status, 201, "admins should be able to create quota tokens");
const issuedToken = await tokenResponse.json();
assert.equal(issuedToken.linkCount, 2);
assert.match(issuedToken.token, /^[A-Za-z0-9_-]{8}$/, "quota tokens should be eight URL-safe characters");
const adminTokenList = await fetch(`${baseUrl}/api/admin/quota-tokens`, { headers: { cookie: newSessionCookie } });
assert.equal(adminTokenList.status, 200);
assert.ok((await adminTokenList.json()).tokens.some((token) => token.token_value === issuedToken.token), "admins should be able to retrieve tokens from the list for copying");
const activationSettingsResponse = await fetch(`${baseUrl}/api/admin/settings`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({ activationEmailFrom: "activation-test@example.test", requireEmailActivation: false }),
});
assert.equal(activationSettingsResponse.status, 200, "admins should be able to configure registration activation");
const activationSettings = await activationSettingsResponse.json();
assert.equal(activationSettings.settings.activationEmailFrom, "activation-test@example.test");
assert.equal(activationSettings.settings.requireEmailActivation, false);
const noActivationEmail = `no-activation-${Date.now()}@example.test`;
const noActivationRegistration = await fetch(`${baseUrl}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: noActivationEmail, password: authPassword }),
});
assert.equal(noActivationRegistration.status, 201);
const noActivationBody = await noActivationRegistration.json();
assert.equal(noActivationBody.requiresEmailActivation, false);
assert.match(noActivationBody.message, /without email activation/i);
const noActivationCookie = noActivationRegistration.headers.get("set-cookie");
assert.ok(noActivationCookie?.includes("HttpOnly"), "accounts registered without activation should receive an authenticated session");
const noActivationMe = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: noActivationCookie.split(";")[0] } });
assert.equal((await noActivationMe.json()).user.email, noActivationEmail);
const resetActivationSettings = await fetch(`${baseUrl}/api/admin/settings`, {
  method: "PATCH",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({
    activationEmailFrom: systemSettings.settings.activationEmailFrom,
    requireEmailActivation: systemSettings.settings.requireEmailActivation,
  }),
});
assert.equal(resetActivationSettings.status, 200, "test should restore registration settings");
withTestDb((db) => {
  const tokenRow = db.prepare("SELECT token_hash, token_hint, token_value FROM QuotaTokens WHERE created_by = ? ORDER BY created_at DESC LIMIT 1").get(authUserId);
  assert.ok(tokenRow);
  assert.notEqual(tokenRow.token_hash, issuedToken.token, "database should store only the token hash");
  assert.equal(tokenRow.token_value, issuedToken.token, "admin token list should have the full token available for copying");
  db.prepare("DELETE FROM Users WHERE email = ?").run(noActivationEmail);
  db.prepare("UPDATE Users SET role = 'user' WHERE id = ?").run(authUserId);
});

const redemption = await fetch(`${baseUrl}/api/quota-tokens/redeem`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({ token: issuedToken.token }),
});
assert.equal(redemption.status, 200, "users should be able to redeem a valid quota token");
assert.deepEqual(await redemption.json(), { addedLinks: 2, linkBonus: 2 });
const duplicateRedemption = await fetch(`${baseUrl}/api/quota-tokens/redeem`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({ token: issuedToken.token }),
});
assert.equal(duplicateRedemption.status, 400, "quota tokens should only be redeemable once");
const updatedUsageResponse = await fetch(`${baseUrl}/api/links?limit=1`, { headers: { cookie: newSessionCookie } });
assert.equal(updatedUsageResponse.status, 200);
const updatedUsage = await updatedUsageResponse.json();
assert.equal(updatedUsage.usage.limit, usageBody.usage.limit + 2);
assert.equal(updatedUsage.usage.canCreate, true);

const bonusLinkCodes = [];
for (let index = 0; index < 2; index += 1) {
  const response = await fetch(`${baseUrl}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: newSessionCookie },
    body: JSON.stringify({ originalUrl: `https://example.org/token-quota-${index}` }),
  });
  assert.equal(response.status, 201, "redeemed quota should allow additional links");
  bonusLinkCodes.push((await response.json()).link.short_code);
}
const reachedBonusQuota = await fetch(`${baseUrl}/api/links`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: newSessionCookie },
  body: JSON.stringify({ originalUrl: "https://example.org/token-quota-over-limit" }),
});
assert.equal(reachedBonusQuota.status, 403, "users should not exceed the base quota plus token bonus");

for (const code of quotaLinkCodes) {
  await fetch(`${baseUrl}/api/links/${code}`, { method: "DELETE", headers: { cookie: newSessionCookie } });
}
for (const code of bonusLinkCodes) {
  await fetch(`${baseUrl}/api/links/${code}`, { method: "DELETE", headers: { cookie: newSessionCookie } });
}
await fetch(`${baseUrl}/api/links/${ownedLink.link.short_code}`, { method: "DELETE", headers: { cookie: newSessionCookie } });
withTestDb((db) => db.prepare("DELETE FROM Users WHERE id = ?").run(authUserId));

console.log("API, auth, and quota-token end-to-end tests passed:", { alias, clicks: analytics.summary.totalClicks, authEmail });
