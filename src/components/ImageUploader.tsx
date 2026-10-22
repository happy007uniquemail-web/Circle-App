import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { LIMITS } from '../types';
import { compressImage, formatBytes } from '../lib/compress';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
  /** Long-edge resize target — avatars pass `LIMITS.avatarMaxEdgePx` (IMG-03). */
  maxEdge?: number;
}

/**
 * File pick → shared compression pipeline (TRD D: ≤4/2 images, JPEG/PNG/WebP
 * by magic bytes, 10 MB before / 2 MB after compression) with a visible
 * progress indicator and per-file before→after sizes (IMG-06).
 */
export default function ImageUploader({
  value,
  onChange,
  max = LIMITS.imagesPerPost,
  label = 'Add photos',
  maxEdge,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; name: string } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
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
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setBusy({ done: i, total: list.length, name: file.name });
        try {
          const out = await compressImage(file, maxEdge ? { maxEdge } : {});
          picked.push(out.dataUrl);
          setNotes((n) => [...n, `${file.name}: ${formatBytes(out.beforeBytes)} → ${formatBytes(out.afterBytes)}`]);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not read that image.');
        }
      }
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
              className="absolute -right-2 -top-2 rounded-full bg-black/50 p-1 text-white shadow backdrop-blur hover:bg-black/70"
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
            aria-label={busy ? 'Compressing photo' : 'Add photos'}
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
      {/* Compression progress + before/after sizes (IMG-06) */}
      <div role="status" aria-live="polite" className="min-h-0">
        {busy && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 size={12} className="animate-spin" />
            Compressing {busy.name} ({busy.done + 1}/{busy.total})…
          </p>
        )}
        {!busy && notes.length > 0 && (
          <p className="mt-1.5 text-xs text-slate-500">{notes.join(' · ')}</p>
        )}
      </div>
      {label !== 'none' && value.length === 0 && !busy && (
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
          {label}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
