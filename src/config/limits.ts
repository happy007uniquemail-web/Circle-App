/**
 * Single source of truth for app limits (TRD §6.6 / UI-01 / SEC-05 support).
 *
 * The media numbers here MUST match the server-side enforcement in
 * `supabase/migrations/0004_media_safety.sql` (bucket `file_size_limit`,
 * `circle_can_upload`) — the server is authoritative; these are the
 * client-side UX checks layered on top.
 */
export const LIMITS = {
  /* ── text ─────────────────────────────────────────────────────────── */
  postMax: 500,
  commentMax: 300,
  bioMax: 160,
  displayNameMax: 50,
  usernamePattern: /^[a-zA-Z0-9_]{3,20}$/,
  imagesPerPost: 4, // enforced server-side too (0001: cardinality <= 4)
  imagesPerComment: 2, // enforced server-side too (0002: cardinality <= 2)
  dmMax: 1000,
  storyCaptionMax: 200,
  hashtagsPerPost: 10,
  hashtagMaxLen: 30,
  linksPerPost: 3,
  feedPageSize: 20,
  storyTtlMs: 24 * 60 * 60 * 1000,

  /* ··· interests (TRD §8 / INT-03) ············································ */
  /** Minimum picks to finish onboarding's interest step (skippable). */
  interestsMin: 3, // INTERESTS_MIN
  /** Hard maximum; enforced server-side by user_interests_limit (0007). */
  interestsMax: 10, // INTERESTS_MAX

  /* --- cabins (TRD section 9 / CAB-01, CAB-05, CHT-04, CHT-11) --- */
  /** Owned-cabin cap (CAB-05); server: enforce_cabin_create_limit (0008). */
  cabinCreateMax: 5,
  /** Joined-cabin cap incl. owned (CAB-05); server: enforce_cabin_member_limits. */
  cabinJoinMax: 50,
  /** Default member cap per cabin (CAB-05, column default 500). */
  cabinMembersMax: 500,
  cabinNameMin: 3,
  cabinNameMax: 40, // CAB-01
  cabinDescMax: 300, // CAB-01
  cabinTagsMin: 1,
  cabinTagsMax: 10, // CAB-01 raised 3→10 by product request (0009); server: enforce_cabin_interest_count
  cabinRequestMsgMax: 200, // CAB-11 (server: enforce_join_request_insert)
  cabinMessageMax: 2000, // CHT-04 (server: check constraint)
  /** CHT-11 rate limit; server: enforce_cabin_message_rate (20/min). */
  cabinRatePerMin: 20,

  /* ── images (TRD §6.6) ──────────────────────────────────────────────── */
  /** Largest selectable file before compression (IMG-01). */
  imageMaxBytes: 10 * 1024 * 1024, // IMAGE_MAX_PRE_COMPRESS_MB = 10
  /** Hard cap after compression (IMG-05); matches post-images bucket limit. */
  imageMaxPostCompressBytes: 2 * 1024 * 1024, // IMAGE_MAX_POST_COMPRESS_MB = 2
  /** Avatar bucket cap (0004: 1 MB) — avatars target ≤ 100 KB in practice. */
  avatarMaxPostCompressBytes: 1024 * 1024,
  /** Long-edge resize target for post/comment images (IMG-03). */
  imageMaxEdgePx: 1600, // IMAGE_MAX_EDGE_PX
  /** Avatar long-edge target (IMG-03). */
  avatarMaxEdgePx: 512, // AVATAR_MAX_EDGE_PX
  /** Story / DM previews keep their historical, lighter targets. */
  storyImageMaxEdgePx: 1080,
  dmImageMaxEdgePx: 1000,
  /** Encode quality (WebP, JPEG fallback) — IMG-03. */
  imageQuality: 0.8,

  /* ── video (TRD §6.4) ──────────────────────────────────────────────── */
  videoMaxBytes: 50 * 1024 * 1024, // VIDEO_MAX_MB = 50 (VID-02)
  videoMaxSeconds: 60, // VIDEO_MAX_SECONDS (VID-01)
  videoMaxShortSidePx: 1080, // VIDEO_MAX_SHORT_SIDE_PX (VID-03)
  videoMaxBitrateMbps: 8, // VIDEO_MAX_BITRATE_MBPS (VID-04)

  /* ── storage quotas (TRD §6.5 — mirror of 0004 SQL constants) ───────── */
  userStorageQuotaBytes: 500 * 1024 * 1024, // USER_STORAGE_QUOTA_MB = 500
  uploadsPerHour: 20, // UPLOADS_PER_HOUR
} as const;
