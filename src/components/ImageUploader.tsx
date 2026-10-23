import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { LIMITS } from '../types';
import { compressImage, formatBytes, readAsDataUrl, sniffImageMime } from '../lib/compress';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
  /** Long-edge resize target — avatars pass `LIMITS.avatarMaxEdgePx` (IMG-03). */
  maxEdge?: number;
  /** Post-compress/upload cap for this bucket (avatars: 1 MB, posts: 2 MB). */
  compressedMaxBytes?: number;
}

/**
 * File pick → shared compression pipeline (TRD D: ≤4/2 images, JPEG/PNG/WebP
 * by magic bytes, 10 MB before / 2 MB after compression) with a visible
 * progress indicator and per-file before→after sizes (IMG-06).
 *
 * Product additions: the size limit is shown up front, files over the limit
 * produce an explicit warning naming the file and the cap, and the user can
 * turn compression off (originals must then already fit the upload cap).
 */
export default function ImageUploader({
  value,
  onChange,
  max = LIMITS.imagesPerPost,
  label = 'Add photos',
  maxEdge,
  compressedMaxBytes = LIMITS.imageMaxPostCompressBytes,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [compress, setCompress] = useState(true);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  /** Cap applied to the picked file: pre-compress limit, or the hard upload
   *  cap when the user opted out of compression. */
  const capBytes = compress ? LIMITS.imageMaxBytes : compressedMaxBytes;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setWarnings([]);
    setNotes([]);
    const room = max - value.length;
    if (room <= 0) {
      setError(`Up to ${max} images per post.`);
      return;
    }
    const list = Array.from(files).slice(0, room);
    if (Array.from(files).length > room) {
      setError(`Only the first ${room} photo${room === 1 ? '' : 's'} were added (limit ${max}).`);
    }
    const picked: string[] = [];
    const skipped: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        // Size-limit warning (product request): name the file and the cap.
        if (file.size > capBytes) {
          skipped.push(
            `${file.name} is ${formatBytes(file.size)} — over the ${formatBytes(capBytes)} limit` +
              (compress ? '. Pick a smaller photo.' : ' without compression. Enable compression or pick a smaller photo.'),
          );
          continue;
        }
        setBusy({ done: i, total: list.length, name: file.name });
        try {
          if (compress) {
            const out = await compressImage(file, {
              ...(maxEdge ? { maxEdge } : {}),
              maxCompressedBytes: compressedMaxBytes,
            });
            picked.push(out.dataUrl);
            setNotes((n) => [...n, `${file.name}: ${formatBytes(out.beforeBytes)} → ${formatBytes(out.afterBytes)}`]);
          } else {
            // Compression off: pass the original through, still verified as a
            // real JPEG/PNG/WebP (IMG-02) and capped at the upload limit.
            const sniffed = await sniffImageMime(file);
            if (!sniffed || !['image/jpeg', 'image/png', 'image/webp'].includes(sniffed)) {
              skipped.push(`${file.name}: only JPEG, PNG, or WebP images are allowed.`);
              continue;
            }
            picked.push(await readAsDataUrl(file));
            setNotes((n) => [...n, `${file.name}: kept original (${formatBytes(file.size)})`]);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not read that image.');
        }
      }
      if (skipped.length) setWarnings(skipped);
      if (picked.length) onChange([...value, ...picked]);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={i} className="relative">
            <img
              src={url}
              alt={`Upload preview ${i + 1}`}
              width={80}
              height={80}
              className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200"
            />
            <button
              type="button"
              aria-label={`Remove image ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="tap44 absolute -right-2 -top-2 rounded-full bg-black/50 p-1 text-white shadow backdrop-blur hover:bg-black/70"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => inputRef.current?.click()}
            aria-label={
              busy
                ? `Compressing photo ${busy.done + 1}/${busy.total}`
                : `Add photos — ${value.length}/${max} selected`
            }
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 text-slate-500 hover:border-brand-500 hover:text-brand-600 disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <span className="text-[10px] font-medium">
              {busy ? `${busy.done + 1}/${busy.total}` : `${value.length}/${max}`}
            </span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        aria-hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {/* Size limit shown up front + compression option (product request) */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] text-slate-500">
          JPG, PNG or WebP · max {formatBytes(LIMITS.imageMaxBytes)} per image
          {!compress && ` · capped at ${formatBytes(compressedMaxBytes)} uncompressed`}
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-600">
          <input
            type="checkbox"
            checked={compress}
            onChange={(e) => setCompress(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-600"
          />
          Compress images{compress ? ' (on)' : ' (off)'}
        </label>
      </div>

      {/* Compression progress + before/after sizes (IMG-06) */}
      <div role="status" aria-live="polite" className="min-h-0">
        {busy && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 size={12} className="animate-spin" />
            {compress ? 'Compressing' : 'Reading'} {busy.name} ({busy.done + 1}/{busy.total})…
          </p>
        )}
        {!busy && notes.length > 0 && (
          <p className="mt-1.5 text-xs text-slate-500">{notes.join(' · ')}</p>
        )}
      </div>

      {/* Oversize / invalid-file warnings — name the file and the limit */}
      {warnings.length > 0 && (
        <div role="alert" className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {label !== 'none' && value.length === 0 && !busy && (
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
          {label}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
