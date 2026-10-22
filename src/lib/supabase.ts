/**
 * Live Supabase backend (production mode).
 *
 * When VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are configured, `store.ts`
 * boots `SupabaseProvider` against this module; otherwise the offline
 * DemoProvider keeps the app fully functional without a server.
 *
 * The client is a module singleton so auth state (persisted session,
 * auto-refresh, `detectSessionInUrl` for the OAuth/email-confirm return trip)
 * lives exactly one place.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getVideoUrl } from './media';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Real credentials present (template placeholders like `<project-ref>` do not count). */
export const realBackend: boolean = Boolean(
  url && anon && url.startsWith('https://') && !url.includes('<'),
);

export const supabase: SupabaseClient | null = realBackend
  ? createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

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
  const ext = EXT[blob.type] ?? 'bin';
  const path = `${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(friendlyError(error));
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Upload several image references in parallel → public URLs (order preserved). */
export function uploadImages(refs: string[], bucket: MediaBucket, uid: string): Promise<string[]> {
  return Promise.all(refs.map((r) => uploadRef(r, bucket, uid)));
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
  if (/row-level security/i.test(raw)) return 'You do not have permission to do that.';
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'Network error — check your connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}
