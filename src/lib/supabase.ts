/**
 * Supabase backend client.
 *
 * The app runs in official mode only: VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are required, and `store.ts` boots
 * `SupabaseProvider` against this module. Missing credentials render a setup
 * screen at the entry point instead of starting the app.
 *
 * The client is a module singleton so auth state (persisted session,
 * auto-refresh, `detectSessionInUrl` for the OAuth/email-confirm return trip)
 * lives exactly one place.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LIMITS } from '../config/limits';
import { formatBytes } from './compress';
import { getVideoUrl } from './media';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Real credentials present (template placeholders like `<project-ref>` do not count). */
function createSupabaseClient(): SupabaseClient | null {
  if (!url || !anon || !/^https:\/\/[^\s<]+$/i.test(url) || anon.includes('<')) return null;
  try {
    return createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (e) {
    console.error('[circle] Supabase client init failed:', e);
    return null;
  }
}

/** `null` when the deployment is missing credentials — the entry point shows setup instructions. */
export const supabase: SupabaseClient | null = createSupabaseClient();

/* ------------------------------------------------------------------ storage */

export type MediaBucket = 'post-images' | 'avatars' | 'media';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

/** `data:` URL or `vid:` IndexedDB reference → Blob (http(s) refs pass through elsewhere). */
async function refToBlob(ref: string): Promise<Blob> {
  if (ref.startsWith('data:') || ref.startsWith('blob:')) return (await fetch(ref)).blob();
  const objectUrl = await getVideoUrl(ref); // `vid:` key → object URL
  if (!objectUrl) throw new Error('That video could not be read.');
  return (await fetch(objectUrl)).blob();
}

/** Upload one image/video reference to its bucket; returns the public URL. */
export async function uploadRef(ref: string, bucket: MediaBucket, uid: string): Promise<string> {
  if (!supabase) throw new Error('Backend not configured.');
  if (/^https?:\/\//.test(ref)) return ref; // already uploaded
  const blob = await refToBlob(ref);
  // Client-layer size cap mirroring the bucket limits (IMG-05/VID-02); the
  // Storage API rejects over-limit files authoritatively regardless.
  if (bucket !== 'media') {
    const cap = bucket === 'avatars' ? LIMITS.avatarMaxPostCompressBytes : LIMITS.imageMaxPostCompressBytes;
    if (blob.size > cap) {
      throw new Error(`That image is ${formatBytes(blob.size)} — over the ${formatBytes(cap)} limit after compression. Pick a different photo.`);
    }
  } else if (blob.size > LIMITS.videoMaxBytes) {
    throw new Error(`That video is ${formatBytes(blob.size)} — over the ${Math.round(LIMITS.videoMaxBytes / 1048576)} MB limit.`);
  }
  const ext = EXT[blob.type] ?? 'bin';
  const path = `${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
  });
  if (error) {
    const msg = friendlyError(error);
    // RLS denial on storage = quota/rate gate (circle_can_upload) or policy —
    // give the user the actionable version.
    if (/permission/i.test(msg)) {
      throw new Error(
        `Upload blocked — you may be at your storage quota or hourly upload limit. Try again later or remove old media.`,
      );
    }
    throw new Error(msg);
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Upload several image references in parallel → public URLs (order preserved). */
export function uploadImages(refs: string[], bucket: MediaBucket, uid: string): Promise<string[]> {
  return Promise.all(refs.map((r) => uploadRef(r, bucket, uid)));
}

/** Best-effort removal of storage objects from their public URLs (QTA-04). */
export async function deleteMediaUrls(urls: Array<string | null | undefined>): Promise<void> {
  if (!supabase) return;
  const byBucket = new Map<MediaBucket, string[]>();
  for (const url of urls) {
    if (!url) continue;
    const m = /\/storage\/v1\/object\/public\/(avatars|post-images|media)\/(.+)$/.exec(url);
    if (!m) continue; // not a storage URL (OAuth avatar, data:, vid:)
    const bucket = m[1] as MediaBucket;
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), decodeURIComponent(m[2])]);
  }
  if (!byBucket.size) return;
  await Promise.allSettled(
    [...byBucket].map(([bucket, paths]) => supabase!.storage.from(bucket).remove(paths)),
  );
}

/* -------------------------------------------------------------------- errors */

/** Map PostgREST / Auth / storage errors to copy a user can act on. */
export function friendlyError(e: unknown): string {
  const err = e as
    | { message?: string; error_description?: string; error?: string; msg?: string; code?: string }
    | null
    | undefined;
  const raw = err?.message ?? err?.error_description ?? err?.msg ?? err?.error ?? '';
  if (err?.code === '23505' || /duplicate key|unique constraint/i.test(raw)) return 'That value is already taken.';
  if (/email not confirmed/i.test(raw)) return 'Confirm your email first — check your inbox.';
  if (/invalid login credentials/i.test(raw)) return 'Wrong email or password.';
  if (/user already registered|already been registered/i.test(raw)) return 'An account with that email already exists.';
  // Storage bucket limits (TRD D) — IMG-07 / VID-07 surface as these.
  if (/file size|exceeds.*limit|too large|payload/i.test(raw)) {
    return 'That file is larger than this project’s upload limit — try a smaller file.';
  }
  if (/mime|content.?type/i.test(raw)) return 'That file type isn’t allowed here.';
  if (/row-level security/i.test(raw)) return `Permission denied by the database — ${raw}`;
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Network error — check your connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}
