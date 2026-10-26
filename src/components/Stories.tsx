import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Timer, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import type { Story } from '../types';
import { LIMITS } from '../types';
import { timeAgo } from '../lib/format';
import { putVideo, validateVideo } from '../lib/media';
import { compressImage, formatBytes } from '../lib/compress';
import { activeStories, currentUserProfile, useActions, useAppState } from '../lib/store';
import Avatar from './Avatar';
import Modal, { useDialogA11y } from './Modal';
import { StoryActionBar } from './StoryInteractions';
import { toast } from './Toast';
import VideoPlayer from './VideoPlayer';

/* -------------------------------------------------------------- viewer */

/** Full-screen tap-through story viewer with progress bars + autoplay (F-STO). */
export function StoryViewer({
  startIndex,
  segmentIndex = 0,
  onClose,
}: {
  startIndex: number;
  segmentIndex?: number;
  onClose: () => void;
}) {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const [groupIdx, setGroupIdx] = useState(startIndex);
  const [segIdx, setSegIdx] = useState(segmentIndex);
  const [paused, setPaused] = useState(false);
  // F-STO2: the comments modal freezes self-advance while it's open.
  const [commentsOpen, setCommentsOpen] = useState(false);
  const frozen = paused || commentsOpen;
  // UI-08: trap Tab inside the viewer and restore focus on close.
  const viewerRef = useRef<HTMLDivElement>(null);
  useDialogA11y(viewerRef, onClose);

  const groups = useMemo(() => activeStories(state, state.session?.id ?? null), [state]);
  const group = groups[groupIdx];
  const story: Story | undefined = group?.stories[segIdx];

  // Images/text auto-advance every 5 s; videos advance when playback ends.
  useEffect(() => {
    if (!story || frozen || story.kind === 'video') return;
    const t = window.setTimeout(() => advance(1), 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, story?.kind, frozen]);

  function advance(dir: 1 | -1) {
    if (!group) return onClose();
    const nextSeg = segIdx + dir;
    if (nextSeg >= 0 && nextSeg < group.stories.length) return setSegIdx(nextSeg);
    const nextGroup = groupIdx + dir;
    if (nextGroup >= 0 && nextGroup < groups.length) {
      setGroupIdx(nextGroup);
      setSegIdx(dir === 1 ? 0 : groups[nextGroup]!.stories.length - 1);
      return;
    }
    onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') advance(1);
      if (e.key === 'ArrowLeft') advance(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIdx, segIdx, groups.length]);

  if (!group || !story) return null;
  const isMine = story.userId === me?.id;

  // Chevron pair re-used by each media frame — anchored INSIDE the frame so
  // they straddle the actual media edges (the frame hugs the media format).
  const chevrons = (
    <>
      <button className="tap44 absolute -left-3.5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white ring-1 ring-white/20 backdrop-blur hover:bg-black/70" aria-label="Previous" onClick={() => advance(-1)}><ChevronLeft size={20} /></button>
      <button className="tap44 absolute -right-3.5 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-1 text-white ring-1 ring-white/20 backdrop-blur hover:bg-black/70" aria-label="Next" onClick={() => advance(1)}><ChevronRight size={20} /></button>
    </>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={`${group.profile.displayName}'s story`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={viewerRef} tabIndex={-1} className="relative w-full max-w-md focus:outline-none">
        {/* progress bars — one per segment of this author */}
        <div className="absolute -top-3 left-0 right-0 flex gap-1 px-1">
          {group.stories.map((s, i) => (
            <span key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
              <span
                className={`block h-full rounded-full bg-white ${i === segIdx && !frozen ? 'story-progress' : ''}`}
                style={{ width: i < segIdx ? '100%' : i === segIdx ? (frozen ? '40%' : undefined) : '0%' }}
              />
            </span>
          ))}
        </div>

        <header className="mb-3 flex items-center gap-2 pt-3 text-white">
          <Avatar src={group.profile.avatarUrl} name={group.profile.displayName} size={34} />
          <Link to={`/u/${group.profile.username}`} onClick={onClose} className="text-sm font-semibold hover:underline">
            {group.profile.displayName}
          </Link>
          <span className="text-xs text-white/60">{timeAgo(story.createdAt)} ago</span>
          {isMine && (
            <button
              onClick={async () => {
                const r = await actions.deleteStory(story.id);
                if (r.ok) {
                  toast('Story deleted.', 'success');
                  onClose();
                } else toast(r.error ?? 'Could not delete story.', 'error');
              }}
              className="tap44 ml-auto rounded-full p-1.5 text-white/70 hover:bg-white/10"
              aria-label="Delete my story"
            >
              <X size={17} />
            </button>
          )}
          {!isMine && <button onClick={onClose} className="tap44 ml-auto rounded-full p-1.5 text-white/70 hover:bg-white/10" aria-label="Close stories"><X size={18} /></button>}
        </header>

        <div className="relative" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {story.kind === 'text' && (
            <div className="relative grid aspect-[9/14] max-h-[calc(100dvh-11rem)] place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-600 p-8 text-center">
              <p className="whitespace-pre-wrap text-2xl font-bold text-white">{story.caption}</p>
              {chevrons}
            </div>
          )}
          {story.kind === 'image' && story.media && (
            /* Frame hugs the photo's own aspect ratio — shown exactly as chosen, uncropped */
            <div className="relative mx-auto w-fit max-w-full">
              <img src={story.media} alt={`Story by ${group.profile.displayName}`} className="block max-h-[calc(100dvh-11rem)] max-w-full rounded-2xl bg-black" />
              {story.caption && (
                <p className="absolute inset-x-4 bottom-4 rounded-xl bg-black/50 px-3 py-2 text-center text-sm text-white">{story.caption}</p>
              )}
              {chevrons}
            </div>
          )}
          {story.kind === 'video' && story.media && (
            /* Same contract for video: the frame matches the video's intrinsic format */
            <div className="relative mx-auto w-fit max-w-full">
              <VideoPlayer refKey={story.media} poster={false} onEnded={() => advance(1)} label={`Video story by ${group.profile.displayName}`} className="max-h-[calc(100dvh-11rem)] w-auto object-contain" />
              {chevrons}
            </div>
          )}

          {/* Tap zones span the stage (not the frame) so portrait media still has wide
              tap areas; for video they stop above the native control bar so the
              play/scrub controls remain clickable. */}
          <button className={`absolute left-0 w-1/3 cursor-w-resize ${story.kind === 'video' ? 'top-0 bottom-12' : 'inset-y-0'}`} aria-label="Previous story" onClick={() => advance(-1)} />
          <button className={`absolute right-0 w-1/3 cursor-e-resize ${story.kind === 'video' ? 'top-0 bottom-12' : 'inset-y-0'}`} aria-label="Next story" onClick={() => advance(1)} />
        </div>

        {/* F-STO2: reactions / reply / comments / repost strip (others only) */}
        <StoryActionBar
          story={story}
          author={group.profile}
          isMine={isMine}
          onCloseViewer={onClose}
          onCommentsChange={setCommentsOpen}
        />

        <div className="mt-3 flex justify-between text-xs text-white/60">
          <span>{group.stories.length} segment{group.stories.length > 1 ? 's' : ''} · expires in {hoursLeft(story.expiresAt)}h</span>
          <button onClick={() => setGroupIdx((i) => (i + 1) % groups.length)} className="hover:text-white">
            Next author →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function hoursLeft(expiresAt: string): number {
  return Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 3600_000));
}

/* ------------------------------------------------------------- composer */

/** Create an ephemeral story: photo, ≤60 s video, or text (F-STO). */
export function StoryComposer({ onClose }: { onClose: () => void }) {
  const actions = useActions();
  const [kind, setKind] = useState<'image' | 'video' | 'text'>('text');
  const [media, setMedia] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined, want: 'image' | 'video') {
    if (!file) return;
    setBusy(true);
    try {
      if (want === 'image') {
        try {
          const out = await compressImage(file, { maxEdge: LIMITS.storyImageMaxEdgePx });
          setMedia(out.dataUrl);
          setKind('image');
          toast(`Photo ${formatBytes(out.beforeBytes)} → ${formatBytes(out.afterBytes)}`, 'success');
        } catch (e) {
          return toast(e instanceof Error ? e.message : 'Could not read that photo.', 'error');
        }
      } else {
        const check = await validateVideo(file);
        if (!check.ok) return toast(check.error, 'error');
        setMedia(await putVideo(file));
        setKind('video');
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function publish() {
    setBusy(true);
    const r = await actions.createStory({ kind, media, caption });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not add story.', 'error');
    toast('Story live for 24 hours ⏳', 'success');
    onClose();
  }

  return (
    <Modal onClose={onClose} label="Add story" className="max-w-sm" showClose={false}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between pr-8">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Timer size={17} className="text-brand-600" /> Add story</h2>
          <button onClick={onClose} aria-label="Close" className="tap44 absolute right-2 top-2 rounded-full p-1.5 text-slate-500 hover:bg-white/[0.06]"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400">Disappears for everyone after 24 hours.</p>

        <div className="mt-4 flex gap-2">
          {(['text', 'image', 'video'] as const).map((k) => (
            <button
              key={k}
              onClick={() => { setKind(k); if (k === 'text') setMedia(null); else setMedia(null); }}
              className={`flex-1 rounded-xl border px-2 py-2 text-xs font-semibold capitalize transition ${kind === k ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-border-subtle text-txt-subtle hover:border-brand-400'}`}
            >
              {k === 'text' ? 'Aa Text' : k === 'image' ? '📷 Photo' : '🎬 Video'}
            </button>
          ))}
        </div>

        {kind === 'text' ? (
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, LIMITS.storyCaptionMax))}
            placeholder="Say something…"
            rows={4}
            autoFocus
            className="input mt-3 resize-none"
            aria-label="Story text"
          />
        ) : (
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept={kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm,video/quicktime'}
              hidden
              onChange={(e) => void pick(e.target.files?.[0], kind === 'image' ? 'image' : 'video')}
            />
            {media ? (
              /* Preview matches the chosen media's format — no cropping */
              <div className="relative mx-auto w-fit max-w-full rounded-xl">
                {kind === 'image' ? (
                  <img src={media} alt="Story preview" className="block max-h-64 max-w-full rounded-xl" />
                ) : (
                  <VideoPlayer refKey={media} label="Story video preview" className="max-h-64 w-auto object-contain" />
                )}
                <button onClick={() => setMedia(null)} aria-label="Remove media" className="tap44 absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><X size={14} /></button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="grid h-40 w-full place-items-center rounded-xl border border-dashed border-white/20 text-sm text-slate-500 hover:border-brand-500 hover:text-brand-600"
              >
                <Plus size={22} />
                {kind === 'image' ? 'Pick a photo' : `Pick a video (≤${LIMITS.videoMaxSeconds}s, ≤${Math.round(LIMITS.videoMaxBytes / 1048576)} MB)`}
              </button>
            )}
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, LIMITS.storyCaptionMax))}
              placeholder="Add a caption (optional)"
              className="input mt-2"
              aria-label="Story caption"
            />
          </div>
        )}

        <button
          onClick={publish}
          disabled={busy || (kind === 'text' ? !caption.trim() : !media)}
          className="btn-primary mt-4 w-full"
        >
          {busy ? 'Working…' : 'Share to story'}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ bar */

/** Story ring strip above the home feed (F-STO). */
export default function StoryBar() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const [viewing, setViewing] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const groups = activeStories(state, state.session?.id ?? null);

  if (!me || groups.length === 0) {
    return (
      <>
        <div className="card flex items-center justify-between p-3">
          <p className="text-sm text-slate-500">Share what’s happening — your story disappears after 24 hours.</p>
          <button onClick={() => setComposing(true)} className="btn-primary px-3 py-1.5 text-xs">+ Add story</button>
        </div>
        {composing && <StoryComposer onClose={() => setComposing(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="card no-scrollbar flex gap-4 overflow-x-auto p-3" aria-label="Stories">
        {groups.map((g, i) => {
          const mine = g.profile.id === me.id;
          return (
            <button
              key={g.profile.id}
              onClick={() => setViewing(i)}
              className="flex w-16 shrink-0 flex-col items-center gap-1"
              aria-label={mine ? 'View your story' : `View ${g.profile.displayName}'s story`}
            >
              <span className={`rounded-full p-0.5 ${mine ? 'bg-slate-200' : 'bg-gradient-to-tr from-brand-500 via-purple-500 to-pink-500'}`}>
                <span className="block rounded-full bg-scrim p-0.5">
                  <Avatar src={g.profile.avatarUrl} name={mine ? 'You' : g.profile.displayName} size={46} />
                </span>
              </span>
              <span className="w-full truncate text-center text-[10px] font-medium text-slate-900">{mine ? 'Your story' : g.profile.username}</span>
            </button>
          );
        })}
        <button
          onClick={() => setComposing(true)}
          className="flex w-16 shrink-0 flex-col items-center gap-1"
          aria-label="Add to your story"
        >
          <span className="grid h-[54px] w-[54px] place-items-center rounded-full border-2 border-dashed border-border-subtle text-txt-subtle hover:border-brand-400 hover:text-txt-main hover:bg-hover-wash">
            <Plus size={20} />
          </span>
          <span className="text-[10px] text-slate-500">Add</span>
        </button>
      </div>

      {viewing !== null && <StoryViewer startIndex={viewing} onClose={() => setViewing(null)} />}
      {composing && <StoryComposer onClose={() => setComposing(false)} />}
    </>
  );
}
