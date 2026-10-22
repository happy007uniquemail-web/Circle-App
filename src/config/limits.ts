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
