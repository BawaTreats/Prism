import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config";
import { incrBy, setExpiry, getExpiry } from "../redis";

/**
 * Creates a rate limiting preHandler middleware backed by Redis / in-memory store.
 * Uses a fixed/sliding token window per IP address.
 *
 * Response headers:
 *   X-RateLimit-Limit     – maximum requests allowed in the window
 *   X-RateLimit-Remaining – requests left in the current window
 *   X-RateLimit-Reset     – Unix epoch (seconds) when the window resets
 *   Retry-After           – seconds until reset (only on 429)
 */
export function createRateLimiter(options?: {
  limit?: number;
  windowSec?: number;
  name?: string;
}) {
  const limit = options?.limit ?? config.rateLimit.defaultLimit;
  const windowSec = options?.windowSec ?? config.rateLimit.windowSec;
  const name = options?.name ?? "api";

  return async function rateLimitMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const ip = request.ip || request.socket.remoteAddress || "127.0.0.1";
    const key = `ratelimit:${name}:${ip}`;

    try {
      const current = await incrBy(key, 1);
      if (current === 1) {
        // Set expiry on the first request in this window
        await setExpiry(key, windowSec);
      }

      // Compute the wall-clock reset time from the live TTL so that the
      // header reflects the actual remaining window, not the full duration.
      let ttl = windowSec;
      try {
        const remaining = await getExpiry(key);
        if (remaining > 0) ttl = remaining;
      } catch {
        // Fall back to the full window if getExpiry is unavailable
      }
      const resetAt = Math.floor(Date.now() / 1000) + ttl;

      reply.header("X-RateLimit-Limit", limit);
      reply.header("X-RateLimit-Remaining", Math.max(0, limit - current));
      reply.header("X-RateLimit-Reset", resetAt);

      if (current > limit) {
        reply.header("Retry-After", ttl);
        return reply.status(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: `Rate limit of ${limit} requests per ${windowSec}s exceeded for this IP. Please try again later.`,
        });
      }
    } catch (err) {
      // Non-fatal: allow request through if the rate limiter errors
      request.log.warn({ error: String(err) }, "Rate limiter error, allowing request");
    }
  };
}

/** Default limiter for general API routes (higher limit). */
export const defaultRateLimiter = createRateLimiter({
  limit: config.rateLimit.defaultLimit,
  windowSec: config.rateLimit.windowSec,
  name: "default",
});

/**
 * Replay limiter for expensive replay/trace endpoints (lower limit).
 * Applied only to POST /api/replay and GET /api/replay/:jobId.
 */
export const replayRateLimiter = createRateLimiter({
  limit: config.rateLimit.replayLimit,
  windowSec: config.rateLimit.windowSec,
  name: "replay",
});
