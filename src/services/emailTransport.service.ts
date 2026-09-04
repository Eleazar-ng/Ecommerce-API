import CircuitBreaker from 'opossum';
import { resend } from '../config/resend.js';
import { env } from '../config/env.js';
import { withRetry } from '../utils/retry.js';

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

// The raw send operation, wrapped in retry with exponential backoff — handles TRANSIENT
// failures (a network blip, a momentary 5xx from Resend, a rate limit that clears on its
// own). This is the function the circuit breaker below actually calls.
async function sendViaResendWithRetry(params: SendEmailParams): Promise<void> {
  await withRetry(
    async () => {
      const result = await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (result.error) {
        // Resend's SDK returns errors in the response body rather than always throwing —
        // normalize that into a real thrown Error so both withRetry's catch logic and
        // opossum's failure tracking see it correctly as a failure.
        throw new Error(`Resend API error: ${result.error.message}`);
      }
    },
    { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 8000 }
  );
}

// The circuit breaker's job is DIFFERENT from retry's: retry answers "this one call might
// succeed if I try again in a moment"; the breaker answers "Resend has been failing
// consistently for a while — stop hammering it with retries (which cost time and won't
// succeed anyway) and fail FAST until there's a real sign of recovery." Without this, a
// sustained Resend outage would mean every single email attempt still pays the full
// retry-with-backoff cost before eventually failing, for as long as the outage lasts.
const breaker = new CircuitBreaker(sendViaResendWithRetry, {
  timeout: 15_000, // an attempt (including its own internal retries) taking longer than this counts as a failure
  errorThresholdPercentage: 50, // open the circuit once >=50% of recent calls have failed
  resetTimeout: 30_000, // after opening, wait this long before letting a single "trial" call through (half-open)
  rollingCountTimeout: 60_000, // the rolling window over which the failure percentage is calculated
  rollingCountBuckets: 10,
});

breaker.on('open', () => {
  console.error(
    '[email] Circuit breaker OPEN — Resend appears to be failing consistently. Pausing send attempts.'
  );
});
breaker.on('halfOpen', () => {
  console.warn('[email] Circuit breaker HALF-OPEN — testing whether Resend has recovered.');
});
breaker.on('close', () => {
  console.log('[email] Circuit breaker CLOSED — Resend is healthy again.');
});

// Public entry point for the rest of the email layer. This CAN still throw — after retries
// are exhausted, or immediately if the circuit is currently open. Callers (email.service.ts)
// decide what "this email totally failed" should mean for them — in this codebase, that
// means: log it and move on, since email delivery should never block or fail a core
// business operation like signup.
export async function sendEmailResilient(params: SendEmailParams): Promise<void> {
  await breaker.fire(params);
}