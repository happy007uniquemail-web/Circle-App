/**
 * Rate limit constants — shared between client and server.
 * Server-side triggers (supabase/migrations) enforce these limits
 * authoritatively; these constants are kept in sync for reference.
 */

// QTA-01/02: per-user storage quota + upload rate
// QTA-06: upload rate enforcement in storage bucket policies
// CHT-11: cabin message rate limit
// POST-4: posts per 10 minutes

export const LIMITS = {
  // Storage
  USER_STORAGE_QUOTA_MB: 500,
  UPLOADS_PER_HOUR: 20,
  // Cabin messages
  CABIN_RATE_PER_MIN: 20,
  // Posts
  POSTS_PER_10_MIN: 5,
  // Hashtags per post
  HASHTAGS_PER_POST: 5,
  // Images per post
  IMAGES_PER_POST: 4,
  // Videos per post
  VIDEOS_PER_POST: 1,
  // Cabins per user
  CABINS_CREATE_MAX: 5,
  CABINS_JOIN_MAX: 50,
  // Cabin member limit
  CABIN_MEMBERS_MAX: 5000,
  // Interest tags
  INTERESTS_MAX: 10,
  // Display
  DISPLAY_NAME_MAX: 50,
  BIO_MAX: 160,
  POST_BODY_MAX: 500,
  COMMENT_BODY_MAX: 300,
  CABIN_NAME_MIN: 3,
  CABIN_NAME_MAX: 40,
  CABIN_DESC_MAX: 300,
  DM_BODY_MAX: 1000,
} as const;

export type Limitskey = keyof typeof LIMITS;

/**
 * Human-readable limit name for error messages.
 */
export function limitName(key: Limitskey): string {
  return key.replace(/[A-Z]/g, ' $&').replace(/^./, s => s.toUpperCase());
}