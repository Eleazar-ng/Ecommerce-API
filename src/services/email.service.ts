import { env } from '../config/env.js';
import { sendEmailResilient } from './emailTransport.service.js';

// Public API deliberately UNCHANGED from the original console.log stub — same three
// function names, same signatures, same call sites in auth.service.ts/admin.service.ts.
// Only the internals changed: real delivery via Resend, wrapped in retry + circuit breaker
// (see emailTransport.service.ts), fired without blocking the caller.

function baseTemplate(heading: string, bodyHtml: string): string {
  // Deliberately minimal inline HTML — no external template engine/MJML. Proportionate for
  // this project's scope; revisit only if visual design of these emails becomes a real
  // requirement.
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #111;">${heading}</h2>
      ${bodyHtml}
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">${label}</a>`;
}

// Fire-and-forget: kicks off the resilient send but does NOT await the network call here —
// a slow or down email provider must never block or fail the caller's actual business
// operation (signup, password reset request, admin invite). Retry/circuit-breaker handling
// already happened inside sendEmailResilient; anything that still fails after that is
// logged here with context (which email, which recipient) and deliberately swallowed —
// there is no further escalation path for a fire-and-forget email in this project.
function fireAndForget(label: string, to: string, subject: string, html: string): void {
  void sendEmailResilient({ to, subject, html }).catch((err) => {
    console.error(`[email] Failed to send ${label} to ${to} after retries/circuit-breaker:`, err);
  });
}

export async function sendVerificationEmail(email: string, rawToken: string): Promise<void> {
  const url = `${env.CLIENT_URL}/verify-email/${rawToken}`;
  const html = baseTemplate(
    'Verify your email',
    `<p>Thanks for signing up. Click below to verify your email address:</p>
     <p>${button(url, 'Verify Email')}</p>
     <p>This link expires in 24 hours.</p>`
  );
  fireAndForget('verification email', email, 'Verify your email', html);
}

export async function sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  const url = `${env.CLIENT_URL}/reset-password/${rawToken}`;
  const html = baseTemplate(
    'Reset your password',
    `<p>We received a request to reset your password. Click below to choose a new one:</p>
     <p>${button(url, 'Reset Password')}</p>
     <p>This link expires in 30 minutes.</p>`
  );
  fireAndForget('password reset email', email, 'Reset your password', html);
}

export async function sendAdminInviteEmail(email: string, rawToken: string): Promise<void> {
  const url = `${env.CLIENT_URL}/complete-admin-setup/${rawToken}`;
  const html = baseTemplate(
    "You've been invited as an admin",
    `<p>An administrator has invited you to join as an admin. Click below to set your password and activate your account:</p>
     <p>${button(url, 'Complete Setup')}</p>
     <p>This link expires in 7 days.</p>`
  );
  fireAndForget('admin invite email', email, "You've been invited as an admin", html);
}