import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { LIMITS } from '../types';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  label?: string;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIM = 1000;
const QUALITY = 0.78;

/** Client-side resize before upload (POST-2): ≤4 images, JPEG/PNG/WebP, ≤5 MB. */
async function resize(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

export default function ImageUploader({ value, onChange, max = LIMITS.imagesPerPost, label = 'Add photos' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = max - value.length;
    if (room <= 0) {
      setError(`Up to ${max} images per post.`);
      return;
    }
    try {
      const picked: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        if (!ACCEPTED.includes(file.type)) {
          setError('Only JPEG, PNG, or WebP images are allowed.');
          continue;
        }
        if (file.size > LIMITS.imageMaxBytes) {
          setError('Each image must be under 5 MB.');
          continue;
        }
        picked.push(await resize(file));
      }
      if (picked.length) onChange([...value, ...picked]);
    } catch {
      setError('Could not read that image. Try another file.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={i} className="relative">
            <img src={url} alt={`Upload preview ${i + 1}`} className="h-20 w-20 rounded-xl object-cover ring-1 ring-slate-200" />
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
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/20 text-slate-500 hover:border-brand-500 hover:text-brand-600"
          >
            <ImagePlus size={18} />
            <span className="text-[10px] font-medium">{value.length}/{max}</span>
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
        onChange={(e) => handleFiles(e.target.files)}
      />
      {label !== 'none' && value.length === 0 && (
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 text-xs font-medium text-brand-600 hover:underline">
          {label}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
