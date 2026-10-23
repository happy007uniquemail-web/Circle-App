/**
 * Shared image pipeline (TRD Workstream D).
 *
 * One implementation for every image entry point (post/comment photos,
 * avatar, story, DM): MIME sniffing by magic bytes (IMG-02), canvas
 * re-encode which strips EXIF/GPS (IMG-04), long-edge resize + WebP with
 * JPEG fallback at ~0.8 quality (IMG-03), and a hard post-compress size
 * cap that steps quality down before giving up (IMG-05).
 */
import { LIMITS } from '../config/limits';

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export interface CompressedImage {
  dataUrl: string;
  beforeBytes: number;
  afterBytes: number;
  mime: string;
}

/** `450 KB` / `2.3 MB` — used for the before/after size display (IMG-06). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Identify by file signature, not the (spoofable) `type` field — IMG-02. */
export async function sniffImageMime(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
    if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
      && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return 'image/png';
    if (head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46
      && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
    return null;
  } catch {
    return null;
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('read failed'));
    fr.readAsDataURL(blob);
  });
}

/**
 * Read a file as a data URL without re-encoding — the pass-through path when
 * the user turns compression off in `ImageUploader` (size cap still applies).
 */
export function readAsDataUrl(file: Blob): Promise<string> {
  return toDataUrl(file);
}

/**
 * Compress one image for storage. Throws an error with a user-readable
 * message when the file is too big, not a real image, or cannot be brought
 * under the post-compress cap.
 */
export async function compressImage(
  file: File,
  opts: { maxEdge?: number; maxBytes?: number } = {},
): Promise<CompressedImage> {
  const maxEdge = opts.maxEdge ?? LIMITS.imageMaxEdgePx;
  const maxBytes = opts.maxBytes ?? LIMITS.imageMaxBytes;

  if (file.size > maxBytes) {
    throw new Error(`Images must be ${formatBytes(maxBytes)} or smaller.`);
  }
  const sniffed = await sniffImageMime(file);
  if (!sniffed || !ACCEPTED_MIME.includes(sniffed)) {
    throw new Error('Only JPEG, PNG, or WebP images are allowed.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image.');
    ctx.drawImage(bitmap, 0, 0, w, h);
    // Canvas re-encode drops EXIF (incl. GPS) — IMG-04.

    // WebP first; when the browser cannot encode WebP it hands back PNG, in
    // which case fall back to JPEG (IMG-03).
    let quality: number = LIMITS.imageQuality;
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
    if (!blob) throw new Error('Could not process that image.');

    // Hard cap after compression (IMG-05): step the quality down, give up
    // with a clear message rather than uploading an oversized object.
    while (blob.size > LIMITS.imageMaxPostCompressBytes && quality > 0.35) {
      quality = Math.max(0.3, quality - 0.2);
      const smaller = await toBlob(canvas, blob.type || 'image/jpeg', quality);
      if (smaller && smaller.size < blob.size) blob = smaller;
    }
    if (blob.size > (opts.maxEdge === LIMITS.avatarMaxEdgePx
      ? LIMITS.avatarMaxPostCompressBytes
      : LIMITS.imageMaxPostCompressBytes)) {
      throw new Error('That image stays over the size limit even after compression — try a different photo.');
    }

    return {
      dataUrl: await toDataUrl(blob),
      beforeBytes: file.size,
      afterBytes: blob.size,
      mime: blob.type || 'image/jpeg',
    };
  } finally {
    bitmap.close();
  }
}
