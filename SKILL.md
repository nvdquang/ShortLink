---
name: shortlink-application
description: Rebuild, maintain, or extend the ShortLink URL-shortening and QR-code application. Use when working on this app or recreating it in another repository.
---

# ShortLink application skill

Use this guide when rebuilding or maintaining ShortLink with Claude Code, another coding agent, or an IDE assistant. It captures the application's current behavior and constraints; it is not a substitute for inspecting the target repository. Treat the checked-out source and tests as authoritative if they differ from this document.

## How to apply this skill

1. Inspect the repository, its package scripts, existing implementation, database, and tests before changing anything. Do not assume the target repository has the same file layout or framework.
2. If recreating the app from scratch, implement the essential link creation and redirect flow first, then authentication, account plans, analytics, administration, and email workflows.
3. If modifying an existing app, trace each behavior across UI, API, persistence, and tests. Preserve behavior not explicitly requested.
4. Make small, typed, complete changes. Reuse existing patterns, validate input, and report errors instead of hiding them.
5. Run the narrowest relevant tests, followed by the available build or type check when the change warrants it. Never claim a command passed unless it was run.
6. Never inspect, copy, print, or commit secrets or local user data. In particular, keep `.env*`, SQLite database files and sidecars, build output, and generated files out of source changes.

## Product overview

ShortLink is a responsive web app for creating short URLs, generating QR codes, managing links, and viewing click analytics. The current implementation is a Next.js App Router application with TypeScript, React, SQLite (`better-sqlite3`), and a small Python SQLite utility.

The app's current UI has a light, LHU-inspired visual theme: Roboto-first sans-serif fonts, dark blue (`#284f9e` family) and gold (`#efbb35`) accents, a fixed desktop sidebar, workspace top bar, and responsive content. The base font size is 16px (12pt); headings, controls, labels, and helper text use their own sizes for hierarchy. Keep UI accessible, responsive, keyboard-operable, and consistent with the existing design.

### Main user journeys

- A guest can create public links and QR codes. Registered users can manage their own links.
- A user can sign up, activate an account by email when activation is enabled, sign in/out, request a password reset, and reset a password.
- Users can redeem a one-time quota token to add link capacity.
- Link Analytics presents a list with sequence number, short link, target URL, clicks, and active/deactive status. Editing a link exposes its target and QR configuration.
- Administrators have separate **System Settings** and **User Management** areas. User Management includes user plans/limits and one-time quota tokens.
- System Settings cover expired-link fallback URL, sender address and email activation, free link limit, short-link domain, and default QR logo.
- QR codes can be previewed, customized, copied/shared where supported, and downloaded.

## Behavioral requirements

### Short links and redirects

- Short codes are case-sensitive URL path segments. Resolve the code from the request pathname only; never require a particular host name. A custom domain can change without breaking lookups.
- The redirect endpoint must return a `307` to the complete stored `original_url`, preserving query strings. Do not construct the destination from the short-link host or append only a path/query suffix.
- Record a click for a valid redirect, including available timestamp, device/user-agent, referer, and client IP metadata. Only trust forwarded-IP headers when the app is behind a trusted proxy.
- An inactive or unknown short link must not redirect to an unintended URL.
- On expiry, use this precedence: link-specific `expired_url`; otherwise the administrator-configured expired redirect fallback; otherwise the application home page. Validate configured/destination URLs as HTTP or HTTPS.
- Keep absolute redirect `Location` headers intact behind reverse proxies. On IIS/ARR, **Reverse rewrite host in response headers** can mutate external redirect URLs; document and verify proxy configuration rather than masking it in application code.
- Use a cryptographically secure random short-code generator and enforce uniqueness in the database. Validate aliases and handle collisions explicitly.

### Plans, ownership, and quotas

- Links created by an authenticated user belong to that user; guest-created links have no user owner and remain public.
- A user may list, update, delete, or inspect analytics only for links they own. Enforce ownership in server-side queries, not just in the UI.
- Current behavior: Free accounts have a configurable link count limit (default 10) plus redeemed bonus links, and a maximum five-day link lifetime. Plus accounts and administrators have no such creation limit and may use custom aliases. Plus is granted by an administrator for one year and falls back to Free after expiration.
- Quota tokens grant the configured number of additional links to the first user who redeems them. Redemption is one-time and must be atomic. Token generation uses cryptographic randomness; redemption compares a hash. The current admin listing also retains the full token value to allow copying it later, so restrict this listing to administrators and never expose token values in public endpoints or logs.

### Authentication and email

- Normalize email addresses and validate input. Current password length is 10–128 characters.
- Hash passwords with a suitable password hashing algorithm (the current app uses Node.js `scrypt`). Store session tokens as hashes; issue an `HttpOnly`, `SameSite=Lax` cookie with a finite lifetime and `Secure` in production.
- Verify authentication and authorization on every protected API request. Do not rely on client-side role checks.
- Email verification is required by default. An administrator may disable it; in that mode registration activates the account and signs the user in without sending an activation email.
- Support verification and password-reset links with expiring, single-use tokens stored as hashes. Do not reveal whether an email address exists in public recovery flows.
- Mail settings should come from administrator configuration with environment-variable fallback where appropriate. Never place SMTP credentials in source or logs.

### Administration and data safety

- Admin-only endpoints must derive the role from the authenticated server-side session.
- Admin functions include users/plans/link limits, quota-token creation and listing, and system settings. Validate all settings and persist updates transactionally where several values change together.
- Never perform destructive changes to users, links, tokens, or databases unless specifically requested and confirmed. Explain expected cascade effects first.
- Keep schema changes backward-compatible with a migration for existing SQLite databases. Preserve foreign keys and indexes.

## Current data model

The SQLite schema currently defines:

- `Users`: credentials, role, plan, custom link limit, bonus quota, verification state, and Plus timestamps.
- `Links`: original URL, short code/custom alias, title, QR configuration, click count, expiry and expired URL, active state, optional owner, creation time.
- `Analytics`: link reference, IP, user agent, device type, referrer, click time.
- `AuthSessions`: user reference, hashed session token, expiry.
- `EmailTokens`: user reference, hashed single-use activation/reset token, purpose, expiry, usage time.
- `SystemSettings`: key/value settings.
- `QuotaTokens`: hashed token, short hint, optional copyable value, link count, redeemer, creator, and usage timestamps.

Foreign-key deletion behavior matters: owned links and related records may be cascaded when a user is deleted; a token's `used_by` becomes null when its redeemer is deleted. Inspect actual schema and migrations before relying on these effects.

## Repository map (current project)

Use this as orientation, not as a required layout for a fresh implementation:

- `app/page.tsx`: primary single-page workspace, link creation, analytics and administration UI.
- `app/globals.css`: responsive styles, colors, typography, and layout.
- `app/[code]/route.ts`: host-independent short-code lookup, click recording, and HTTP redirect.
- `app/api/links/`: link creation, listing, editing, deletion, and per-link analytics endpoints.
- `app/api/auth/`: registration, login, logout, session lookup, email verification, and password recovery.
- `app/api/admin/`: admin settings, users, and quota-token endpoints.
- `app/api/quota-tokens/redeem/`: authenticated quota redemption.
- `lib/links.ts`: URL normalization, short-code generation, link ownership, plan and expiry rules.
- `lib/auth.ts`: password hashing, sessions, user lookup, and email tokens.
- `lib/analytics.ts`, `lib/quota-tokens.ts`, `lib/settings.ts`, `lib/mailer.ts`, `lib/db.ts`, `lib/http.ts`: corresponding shared server logic.
- `schema.sql`: SQLite schema.
- `test_api.mjs`, `test_auth.mjs`: API and auth integration tests.
- `database.py`, `test_database.py`: Python SQLite helper and tests.
- `README.md`: setup, API, and IIS reverse-proxy notes.
- `web.config`: IIS rewrite/proxy example. Do not hard-code its production domain in app logic.

## API surface (current app)

Inspect route handlers for exact response formats and status codes. The main endpoints include:

- `POST /api/links`, `GET /api/links`, `GET/PATCH/DELETE /api/links/:code`, `GET /api/links/:code/analytics`
- `GET /:code` for public redirect and click recording
- `POST /api/auth/register`, `/login`, `/logout`, `/forgot-password`, `/reset-password`
- `GET /api/auth/me`, `/api/auth/verify`
- `GET/PATCH /api/admin/settings`, admin user and quota-token routes
- `POST /api/quota-tokens/redeem`

Use JSON request validation, parameterized SQL, explicit status codes, and consistent API error handling. Do not leak stack traces, password hashes, session tokens, or private user data.

## Local development and verification

Current project prerequisites are Node.js 20+ and npm. Python utility/tests require Python 3.10+.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3333`. Production commands are `npm run build` and `npm start`. The default web database is `shortlink.db`; `SHORTLINK_DB_PATH` can select another path. Treat a real database as user data: use an isolated test database for integration tests.

Available checks:

```bash
npm run test:api
npm run test:auth
python3 -m unittest -v
```

Use only tests relevant to the change, and confirm any test server uses an isolated database. Do not run destructive tests against a production or user database. If the test scripts require a running app or environment variables, inspect their setup and document the exact prerequisites rather than assuming.

## Definition of done

- The requested behavior works end-to-end across UI, API, and persistence.
- Ownership, plan limits, expiry rules, and administrator authorization are enforced server-side.
- Redirects preserve the exact stored HTTP(S) destination and query string across local and proxy deployments.
- Input validation, errors, responsive behavior, and relevant empty/loading/success states are addressed.
- Schema changes migrate existing databases safely.
- Targeted tests pass; run a build/type check when available and relevant.
- Documentation is updated for user-visible configuration or deployment changes.
- The final response summarizes files/behavior changed and reports checks accurately.
