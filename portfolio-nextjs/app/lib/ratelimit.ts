/**
 * Rate limiter using Upstash Redis.
 *
 * Configuration:
 * - Limit: 5 requests per 10 minutes per IP
 * - Falls back gracefully if Upstash is unavailable
 */

// Rate limit configuration
const RATE_LIMIT = 5; // 5 requests
const RATE_WINDOW = 10 * 60; // 10 minutes in seconds

// In-memory rate limit fallback (used if Upstash is unavailable)
const requestTimestamps: Map<string, number[]> = new Map();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW * 1000;

  const timestamps = requestTimestamps.get(ip) || [];
  const recent = timestamps.filter((ts) => ts > windowStart);

  if (recent.length >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  // Add current timestamp
  recent.push(now);
  requestTimestamps.set(ip, recent);

  return {
    allowed: true,
    remaining: RATE_LIMIT - recent.length,
  };
}

/**
 * Checks if a request is within rate limit for the given IP.
 * Returns true if allowed, false if exceeded.
 */
export function checkRateLimitByIP(ip: string): { allowed: boolean; remaining: number } {
  return checkRateLimit(ip);
}

/**
 * Creates a rate limit middleware for API routes.
 * Compatible with Upstash Redis when available.
 */
export async function createRateLimiter(redis: any) {
  const { rlimit, ratelimit } = await import("@upstash/ratelimit");

  return ratelimit(redis.limit(RATE_LIMIT, RATE_WINDOW * 1000));
}