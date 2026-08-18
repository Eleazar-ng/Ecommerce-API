export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

// Retries a failing async operation with exponential backoff. Handles TRANSIENT failures —
// a momentary network blip, a 5xx that clears on its own, a rate limit that resets shortly.
// This is deliberately generic (not email-specific) — any "call an unreliable external
// service" operation in this codebase can reuse it.
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 8000 } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;

      const exponentialDelay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      // "Full jitter" (AWS's recommended approach, not just adding random noise to a fixed
      // delay): pick a random value between 0 and the computed exponential delay, rather
      // than always waiting the full computed amount. Without this, many concurrent callers
      // that all failed at the same moment would all retry at the same moments too —
      // a "thundering herd" that can itself overwhelm a service that's just starting to
      // recover.
      const jitteredDelay = Math.random() * exponentialDelay;

      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }

  throw lastError;
}