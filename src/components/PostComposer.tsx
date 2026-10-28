import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Film, ImagePlus, Loader2, Send, X } from 'lucide-react';
import { LIMITS } from '../types';
import { extractHashtags } from '../lib/format';
import { putVideo, validateVideo } from '../lib/media';
import { compressImage, formatBytes, readAsDataUrl, sniffImageMime } from '../lib/compress';
import { currentUserProfile, useActions, useAppState } from '../lib/store';
import Avatar from './Avatar';
import { toast } from './Toast';

interface VideoDraft {
  ref: string;
  name: string;
  seconds: number;
}

/**
 * Home composer (POST-1/2, F-VID, F-HAS, MOD-4) — compact variant:
 *
 * Collapsed the form is just avatar · one-line input · [🖼][🎬][counter][Post]
 * (~100px tall). Photo-upload controls live behind the 🖼 icon (progressive
 * disclosure) and previews only appear once something is attached, so the
 * composer never pushes the feed down. All functionality is preserved:
 * 1–500 chars, up to 4 JPEG/PNG/WebP photos ≤10 MB with a compression
 * toggle, one ≤60 s video (photos XOR video), live hashtag preview.
 */
export default function PostComposer() {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [video, setVideo] = useState<VideoDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [compress, setCompress] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!me) return null;

  const remaining = LIMITS.postMax - body.length;
  const capBytes = compress ? LIMITS.imageMaxBytes : LIMITS.imageMaxPostCompressBytes;
  const tags = extractHashtags(body);
  const showPanel = panelOpen || images.length > 0;

  // Auto-grow: starts as one line (~44px tap target), expands to ~4 lines max.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [body]);

  async function attachPhotos(files: FileList | null) {
    if (!files?.length) return;
    setNotice(null);
    const room = LIMITS.imagesPerPost - images.length;
    if (room <= 0) {
      setNotice(`Up to ${LIMITS.imagesPerPost} photos per post.`);
      return;
    }
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setNotice(`Up to ${LIMITS.imagesPerPost} photos per post — first ${room} added.`);
    const picked: string[] = [];
    try {
      for (const file of list) {
        if (file.size > capBytes) {
          setNotice(
            `${file.name} is ${formatBytes(file.size)} — over the ${formatBytes(capBytes)} limit` +
              (compress ? '. Pick a smaller photo.' : ' without compression.'),
          );
          continue;
        }
        setBusy(true);
        try {
          if (compress) {
            const out = await compressImage(file, { maxCompressedBytes: LIMITS.imageMaxPostCompressBytes });
            picked.push(out.dataUrl);
          } else {
            // Compression off: verify real JPEG/PNG/WebP (IMG-02) and pass through.
            const sniffed = await sniffImageMime(file);
            if (!sniffed || !['image/jpeg', 'image/png', 'image/webp'].includes(sniffed)) {
              setNotice(`${file.name}: only JPEG, PNG, or WebP images are allowed.`);
              continue;
            }
            picked.push(await readAsDataUrl(file));
          }
        } catch (e) {
          setNotice(e instanceof Error ? e.message : 'Could not read that image.');
        }
      }
      if (picked.length) setImages((prev) => [...prev, ...picked]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function attachVideo(file: File | undefined) {
    if (!file) return;
    const check = await validateVideo(file);
    if (!check.ok) return toast(check.error, 'error');
    const ref = await putVideo(file);
    setImages([]); // video XOR photos
    setPanelOpen(false);
    setVideo({ ref, name: file.name, seconds: Math.round(check.duration) });
    toast(`Video attached (${check.duration.toFixed(1)}s).`, 'success');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (me?.isSuspended) return toast('Your account is suspended — posting is disabled.', 'error');
    setBusy(true);
    const result = await actions.createPost(body, video ? [] : images, video?.ref ?? null);
    setBusy(false);
    if (!result.ok) return toast(result.error ?? 'Could not create post.', 'error');
    setBody('');
    setImages([]);
    setVideo(null);
    setPanelOpen(false);
    setNotice(null);
    toast('Posted!', 'success');
  }

  function openPhotos() {
    setPanelOpen(true); // previews + add-tile + compression toggle visible
    fileRef.current?.click(); // and straight to the picker in one tap
  }

  return (
    <form onSubmit={submit} className="card p-2.5">
      {/* Row 1 — avatar + one-line input (auto-grows as you type) */}
      <div className="flex items-start gap-2">
        <Avatar src={me.avatarUrl} name={me.displayName} size={32} className="mt-0.5" />
        <textarea
          id="post-composer"
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, LIMITS.postMax))}
          placeholder="What's happening? #hashtags welcome"
          rows={1}
          aria-label={`Post text, ${remaining} characters remaining`}
          className="max-h-33 min-h-[44px] min-w-0 flex-1 resize-none rounded-xl bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-txt-subtle"
        />
      </div>

      {/* Attached video chip (only when present) */}
      {video && (
        <div className="mx-1 mt-1.5 flex items-center gap-2 rounded-xl border border-border-subtle bg-glass-strong px-2.5 py-1.5 text-sm">
          <Film size={15} className="text-brand-600" />
          <span className="min-w-0 flex-1 truncate">{video.name}</span>
          <span className="text-xs text-txt-subtle">{video.seconds}s</span>
          <button type="button" aria-label="Remove video" onClick={() => setVideo(null)} className="tap44 rounded-full p-1 text-txt-subtle hover:bg-hover-wash">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Progressive disclosure: photo panel only after 🖼 or with previews */}
      {showPanel && !video && (
        <div className="mx-1 mt-1.5 rounded-xl border border-border-subtle bg-glass-strong p-2">
          <div className="flex items-center gap-1.5">
            {images.map((url, i) => (
              <span key={i} className="relative">
                <img src={url} alt={`Preview ${i + 1}`} width={48} height={48} className="h-12 w-12 rounded-lg object-cover ring-1 ring-border-subtle" />
                <button
                  type="button"
                  aria-label={`Remove image ${i + 1}`}
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="tap44 absolute -right-1.5 -top-1.5 rounded-full bg-black/50 p-0.5 text-white shadow backdrop-blur hover:bg-black/70"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            {images.length < LIMITS.imagesPerPost && (
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                aria-label={`Add photos — ${images.length}/${LIMITS.imagesPerPost} selected`}
                className="grid h-12 w-12 place-items-center rounded-lg border border-dashed border-border-subtle text-txt-subtle hover:border-brand-500 hover:text-brand-600 disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              </button>
            )}
            <div className="ml-auto flex flex-col items-end gap-0.5 text-[10px] leading-tight text-txt-subtle">
              <label className="flex cursor-pointer items-center gap-1 font-medium text-txt-muted">
                <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} className="h-3 w-3 accent-brand-600" />
                Compress
              </label>
              <span>JPG/PNG/WebP · ≤{formatBytes(LIMITS.imageMaxBytes)}</span>
            </div>
            {images.length === 0 && (
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="Hide photo panel" className="tap44 rounded-full p-1 text-txt-subtle hover:bg-hover-wash">
                <X size={12} />
              </button>
            )}
          </div>
          {notice && (
            <p role="alert" className="mt-1 text-[11px] text-red-600">
              {notice}
            </p>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <p className="mt-1 truncate px-1 text-xs text-brand-600">
          {tags.map((t) => `#${t}`).join(' ')}
        </p>
      )}

      {/* Row 2 — one compact toolbar: media buttons · counter · Post */}
      <div className="mt-0.5 flex items-center gap-0.5 px-0.5">
        <button
          type="button"
          onClick={openPhotos}
          disabled={!!video}
          title={video ? 'Remove the video to add photos' : 'Add photos'}
          aria-label={video ? 'Remove the video to add photos' : 'Add photos'}
          className={`tap44 rounded-full p-2 transition ${video ? 'text-txt-subtle opacity-40' : 'text-brand-600 hover:bg-hover-wash'}`}
        >
          <ImagePlus size={17} />
        </button>
        <label
          className={`tap44 cursor-pointer rounded-full p-2 transition ${video ? 'text-brand-600 hover:bg-hover-wash' : 'text-txt-muted hover:bg-hover-wash hover:text-txt-main'}`}
          title={video ? `Video attached — ${video.seconds}s` : `Attach a video (≤${LIMITS.videoMaxSeconds}s, ≤${Math.round(LIMITS.videoMaxBytes / 1048576)} MB)`}
        >
          <span className="sr-only">
            {video ? 'Video attached' : `Attach a video (≤${LIMITS.videoMaxSeconds}s, ≤${Math.round(LIMITS.videoMaxBytes / 1048576)} MB)`}
          </span>
          <Film size={17} />
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            hidden
            onChange={(e) => {
              void attachVideo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <span
          className={`ml-auto pr-1.5 text-[11px] tabular-nums transition ${remaining < LIMITS.postMax ? '' : 'opacity-0'}`}
          aria-hidden={remaining === LIMITS.postMax}
        >
          {remaining} left
        </span>
        <button type="submit" disabled={busy || (!body.trim() && images.length === 0 && !video)} className="btn-primary px-3.5 py-1.5 text-xs">
          <Send size={14} /> Post
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        aria-hidden
        onChange={(e) => void attachPhotos(e.target.files)}
      />
    </form>
  );
}
