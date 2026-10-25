/**
 * Type declarations for Next.js environment variables.
 * Extends the global "process.env" type with project-specific vars.
 */

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Canonical site URL (exposed to client) */
      NEXT_PUBLIC_SITE_URL?: string;

      /** Email sending API key (not exposed to client) */
      RESEND_API_KEY?: string;

      /** Destination for contact emails (not exposed to client) */
      CONTACT_TO_EMAIL?: string;

      /** Verified sender address (not exposed to client) */
      CONTACT_FROM_EMAIL?: string;

      /** PostgreSQL connection string (not exposed to client) */
      DATABASE_URL?: string;

      /** Rate limiter (not exposed to client) */
      UPSTASH_REDIS_REST_URL?: string;

      /** Rate limiter token (not exposed to client) */
      UPSTASH_REDIS_REST_TOKEN?: string;

      /** Captcha widget site key (exposed to client) */
      NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;

      /** Captcha secret key (not exposed to client) */
      TURNSTILE_SECRET_KEY?: string;
    }
  }
}