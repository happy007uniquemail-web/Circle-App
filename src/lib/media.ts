/**
 * Video blob store (F-VID, F-OPT).
 * Videos live in IndexedDB — only a `vid:<id>` key goes into the app state, so
 * localStorage stays small and the quota-safe persistence path is untouched.
 */
import { LIMITS } from '../config/limits';
import { formatBytes } from './compress';

const DB_NAME = 'circle-media';
const STORE = 'blobs';
const PREFIX = 'vid:';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const urlCache = new Map<string, string>();

function keyOf(key: string): string {
  return key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key;
}

/** Persist a video blob; returns the `vid:` reference stored in post/story/message rows. */
export async function putVideo(file: File): Promise<string> {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return PREFIX + id;
}

/** Resolve a `vid:` reference to a cached object URL (null when missing). */
export async function getVideoUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith(PREFIX)) return ref; // data: URLs pass through
  const cached = urlCache.get(ref);
  if (cached) return cached;
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(keyOf(ref));
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(ref, url);
    return url;
  } catch {
    return null;
  }
}

/** Remove a stored video (account deletion / post purge). */
export async function deleteVideo(ref: string): Promise<void> {
  if (!ref.startsWith(PREFIX)) return;
  const cached = urlCache.get(ref);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(ref);
  }
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(keyOf(ref));
  } catch {
    /* best effort */
  }
}

/** True when the reference points at a blob-backed video. */
export function isVideoRef(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith(PREFIX);
}

/** VID-05: container signature check — `....ftyp` (MP4/MOV) or EBML (WebM). */
async function sniffVideoKind(file: File): Promise<'iso' | 'webm' | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head.length >= 12 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) return 'iso';
    if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
    return null;
  } catch {
    return null;
  }
}

/**
 * Client-side video validation (TRD D): container type + magic bytes (VID-05),
 * byte size (VID-02), duration (VID-01), resolution (VID-03) and derived
 * bitrate (VID-04) — probed before anything is accepted. The `media` bucket's
 * `file_size_limit` (50 MB) re-checks server-side (VID-07).
 */
export async function validateVideo(file: File): Promise<{ ok: true; duration: number } | { ok: false; error: string }> {
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type)) return { ok: false, error: 'Videos must be MP4, WebM, or MOV.' };

  const kind = await sniffVideoKind(file);
  if (!kind) return { ok: false, error: 'That file does not look like a real video — re-export it as MP4.' };
  if ((kind === 'webm') !== (file.type === 'video/webm')) {
    return { ok: false, error: `Contents do not match the file type — re-export it as ${kind === 'webm' ? 'WebM' : 'MP4'}.` };
  }

  if (file.size > LIMITS.videoMaxBytes) {
    return {
      ok: false,
      error: `Videos must be ${Math.round(LIMITS.videoMaxBytes / 1048576)} MB or smaller (this one is ${formatBytes(file.size)}).`,
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const { duration, width, height } = await new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
      const v = document.createElement('video');
      const timer = window.setTimeout(() => reject(new Error('timeout')), 8000);
      const finish = (fn: () => void) => {
        window.clearTimeout(timer);
        fn();
      };
      v.preload = 'metadata';
      v.onloadedmetadata = () => finish(() => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }));
      v.onerror = () => finish(() => reject(new Error('unreadable')));
      v.src = url;
    });
    if (!isFinite(duration) || duration < 0.5) return { ok: false, error: 'Video is empty or unreadable.' };
    if (duration > LIMITS.videoMaxSeconds) {
      return { ok: false, error: `Videos must be ${LIMITS.videoMaxSeconds} seconds or shorter.` };
    }
    if (Math.min(width, height) > LIMITS.videoMaxShortSidePx) {
      return {
        ok: false,
        error: `Video is ${width}×${height} — max is ${LIMITS.videoMaxShortSidePx}p. Export at 1080p or lower.`,
      };
    }
    const mbps = (file.size * 8) / (duration * 1_000_000);
    if (mbps > LIMITS.videoMaxBitrateMbps) {
      return {
        ok: false,
        error: `Bitrate ${mbps.toFixed(1)} Mbps exceeds the ${LIMITS.videoMaxBitrateMbps} Mbps limit — shorten or re-export the clip.`,
      };
    }
    return { ok: true, duration };
  } catch {
    return { ok: false, error: 'Could not read that video — try re-exporting as MP4.' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Trigger a browser download for a media reference (F-SAV). */
export async function downloadMedia(ref: string, filename: string): Promise<boolean> {
  const href = await getVideoUrl(ref);
  if (!href) return false;
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
