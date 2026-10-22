/**
 * Video blob store (F-VID, F-OPT).
 * Videos live in IndexedDB — only a `vid:<id>` key goes into the app state, so
 * localStorage stays small and the quota-safe persistence path is untouched.
 */

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

/**
 * Client-side video validation (F-SAF): container type, size, and duration
 * probed from metadata before anything is accepted.
 */
export async function validateVideo(file: File): Promise<{ ok: true; duration: number } | { ok: false; error: string }> {
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (!allowed.includes(file.type)) return { ok: false, error: 'Videos must be MP4, WebM, or MOV.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: 'Videos must be 10 MB or smaller.' };
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(v.duration);
      v.onerror = () => reject(new Error('unreadable'));
      v.src = url;
      setTimeout(() => reject(new Error('timeout')), 8000);
    });
    if (!isFinite(duration) || duration < 0.5) return { ok: false, error: 'Video is empty or unreadable.' };
    if (duration > 60) return { ok: false, error: 'Videos must be 60 seconds or shorter.' };
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
