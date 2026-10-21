import nodemailer from "nodemailer";

/**
 * Sends transactional emails via SMTP.
 *
 * Configure with environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_URL
 *
 * When SMTP is not configured, emails are logged to the server console
 * (dev mode) instead of failing, so registration still works.
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function isConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

export function buildVerifyUrl(token: string): string {
  return `${APP_URL}/verify?token=${encodeURIComponent(token)}`;
}

export function buildResetUrl(token: string): string {
  return `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer:dev] SMTP not configured. Would send to ${to}:\nSubject: ${subject}\n${html}\n`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const url = buildVerifyUrl(token);
  await sendWithLog(
    to,
    "Activate your ShortLink account",
    `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
      <h2 style="color:#0f172a;margin-top:0">Activate your account</h2>
      <p>Welcome to <b>ShortLink Studio</b>! Please confirm your email address to activate your account.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${url}" style="background:#0284c7;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Activate Account</a>
      </p>
      <p style="font-size:12px;color:#64748b">Or copy this link into your browser:<br><a href="${url}">${url}</a></p>
      <p style="font-size:12px;color:#64748b">This link expires in 24 hours.</p>
    </div>`,
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const url = buildResetUrl(token);
  await sendWithLog(
    to,
    "Reset your ShortLink password",
    `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
      <h2 style="color:#0f172a;margin-top:0">Reset your password</h2>
      <p>We received a request to reset the password for your ShortLink account.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${url}" style="background:#0284c7;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700">Choose New Password</a>
      </p>
      <p style="font-size:12px;color:#64748b">Or copy this link into your browser:<br><a href="${url}">${url}</a></p>
      <p style="font-size:12px;color:#64748b">This link expires in 1 hour. If you didn't request it, you can safely ignore this email.</p>
    </div>`,
  );
}

/**
 * Wraps send() so an SMTP failure (bad credentials, network...) is logged with
 * a clear message instead of bubbling up as an opaque 500 to the user.
 */
async function sendWithLog(to: string, subject: string, html: string): Promise<void> {
  try {
    await send(to, subject, html);
    console.log(`[mailer] Email sent to ${to}: "${subject}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("535") || message.includes("EAUTH")) {
      console.error(
        `[mailer] Gmail rejected the login (535 Bad Credentials).\n` +
          `  → You must use a Google App Password, not the account password.\n` +
          `  → Create one at https://myaccount.google.com/apppasswords and put it in SMTP_PASS, then restart the server.`
      );
    } else {
      console.error(`[mailer] Failed to send email to ${to}: ${message}`);
    }
  }
}
