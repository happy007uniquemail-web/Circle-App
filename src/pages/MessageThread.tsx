import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ImagePlus, Send, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LIMITS } from '../types';
import { timeAgo } from '../lib/format';
import { putVideo, validateVideo } from '../lib/media';
import { compressImage, formatBytes } from '../lib/compress';
import { profileById, threadMessages, useActions, useAppState, useDataReady } from '../lib/store';
import Avatar from '../components/Avatar';
import { ChatSkeleton } from '../components/Skeleton';
import RichText from '../components/RichText';
import { toast } from '../components/Toast';
import VideoPlayer from '../components/VideoPlayer';

/** `/messages/:id` — DM thread (F-DM): text, photo/video, shared posts, read receipts. */
export default function MessageThread() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = state.session?.id;

  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversation = state.conversations.find((c) => c.id === id);
  const isMember = !!conversation && !!me && conversation.memberIds.includes(me);
  const other = conversation && me ? profileById(state, conversation.memberIds.find((m) => m !== me)!) : null;
  const messages = useMemo(() => (id ? threadMessages(state, id) : []), [state, id]);
  const ready = useDataReady(); // UI-04: skeleton until hydration lands

  // Shared post attach via ShareMenu (`?share=post:<id>`)
  const shareParam = params.get('share');
  const sharedPostId = shareParam?.startsWith('post:') ? shareParam.slice(5) : null;
  const sharedPost = sharedPostId ? state.posts.find((p) => p.id === sharedPostId && !p.deletedAt) : null;

  // Opening the thread marks incoming messages read (NOT-2 equivalent for DMs).
  useEffect(() => {
    if (isMember && id) void actions.markConversationRead(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isMember]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (!me) return null;
  if (!isMember || !other) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold">Conversation unavailable</h1>
        <p className="mt-1 text-sm text-slate-600">You don’t have access to this thread.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => void actions.refresh()} className="btn-ghost">Retry</button>
          <Link to="/messages" className="btn-primary inline-flex">Back to messages</Link>
        </div>
      </div>
    );
  }

  async function attachPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const out = await compressImage(file, { maxEdge: LIMITS.dmImageMaxEdgePx });
      setVideo(null);
      setPhoto(out.dataUrl);
      toast(`Photo ${formatBytes(out.beforeBytes)} → ${formatBytes(out.afterBytes)}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that photo.', 'error');
    }
  }

  async function attachVideo(file: File | undefined) {
    if (!file) return;
    const check = await validateVideo(file);
    if (!check.ok) return toast(check.error, 'error');
    setPhoto(null);
    setVideo(await putVideo(file));
    toast(`Video attached (${Math.round(check.duration)}s).`, 'success');
  }

  function clearShare() {
    const next = new URLSearchParams(params);
    next.delete('share');
    setParams(next, { replace: true });
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const media = photo ? { kind: 'image' as const, ref: photo } : video ? { kind: 'video' as const, ref: video } : null;
    const r = await actions.sendMessage(id!, body, media, sharedPostId);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not send.', 'error');
    setBody('');
    setPhoto(null);
    setVideo(null);
    if (sharedPostId) clearShare();
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate('/messages')} aria-label="Back to messages" className="tap44 rounded-full p-2 text-slate-500 hover:bg-white/[0.06]">
          <ArrowLeft size={18} />
        </button>
        <Link to={`/u/${other.username}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar src={other.avatarUrl} name={other.displayName} size={38} />
          <span className="min-w-0">
            <b className="block truncate text-sm">{other.displayName}</b>
            <span className="text-xs text-slate-500">
              @{other.username}
              <span className="ml-1.5 inline-flex items-center gap-1 text-sky-400">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" aria-hidden />
                Active now
              </span>
            </span>
          </span>
        </Link>
        {other.isSuspended && <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">suspended</span>}
      </header>

      <ul className="min-h-[45vh] space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md" aria-label="Message thread">
        {!ready ? (
          <ChatSkeleton />
        ) : messages.map((m) => {
          const mine = m.senderId === me;
          const sender = profileById(state, m.senderId);
          const shared = m.postId ? state.posts.find((p) => p.id === m.postId && !p.deletedAt) : null;
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'}`}>
                {!mine && sender && (
                  <span className="mb-0.5 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                    <Avatar src={sender.avatarUrl} name={sender.displayName} size={16} /> {sender.displayName}
                  </span>
                )}
                <div className={`rounded-2xl px-3.5 py-2.5 text-[15px] shadow-sm ${mine ? 'rounded-br-none bg-gradient-to-r from-brand-500 to-purple-500 text-white' : 'rounded-bl-none border border-white/10 bg-white/[0.07] text-slate-800 backdrop-blur-md'}`}>
                  {m.mediaKind === 'image' && m.mediaRef && (
                    <img src={m.mediaRef} alt="Shared photo" loading="lazy" decoding="async" width={1600} height={1200} className="mb-1.5 aspect-[4/3] max-h-64 w-full rounded-xl object-cover" />
                  )}
                  {m.mediaKind === 'video' && m.mediaRef && (
                    <div className="mb-1.5 w-64 max-w-full">
                      <VideoPlayer refKey={m.mediaRef} downloadable label="Shared video" />
                    </div>
                  )}
                  {shared && (
                    <Link
                      to={`/p/${shared.id}`}
                      className={`mb-1.5 block rounded-xl border p-2.5 text-sm transition hover:shadow ${mine ? 'border-white/15 bg-white/[0.12] text-white' : 'border-white/10 bg-white/[0.05]'}`}
                    >
                      <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">📎 Post</span>
                      <span className="line-clamp-3">{shared.body || 'Photo post'}</span>
                    </Link>
                  )}
                  {m.body && <RichText text={m.body} className={mine ? 'text-white' : ''} />}
                </div>
                <span className={`mt-0.5 block px-1 text-[10px] text-slate-400 ${mine ? 'text-right' : ''}`}>
                  {timeAgo(m.createdAt)}
                  {mine && (m.readAt ? ' · seen' : '')}
                </span>
              </div>
            </li>
          );
        })}
        {ready && messages.length === 0 && (
          <li className="py-8 text-center text-sm text-slate-400">
            This thread is quiet — say hi to {other.displayName.split(' ')[0]} 👋
          </li>
        )}
        <div ref={bottomRef} />
      </ul>

      {(photo || video || sharedPost) && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm backdrop-blur-md">
          <span className="min-w-0 flex-1">
            {sharedPost ? (
              <>
                <b className="text-xs uppercase tracking-wide text-brand-600">Sharing post</b>
                <p className="line-clamp-2 text-slate-600">{sharedPost.body || 'Photo post'}</p>
              </>
            ) : photo ? (
              <img src={photo} alt="Attachment preview" className="h-16 rounded-lg object-cover" />
            ) : (
              <span className="flex items-center gap-1.5 text-slate-600">🎬 Video attachment</span>
            )}
          </span>
          <button
            onClick={() => { setPhoto(null); setVideo(null); if (sharedPostId) clearShare(); }}
            aria-label="Remove attachment"
            className="tap44 rounded-full p-1.5 text-slate-400 hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <form onSubmit={send} className="flex items-end gap-2 rounded-2xl border border-white/10 bg-surface-deep p-3">
        <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
          <label className="tap44 cursor-pointer rounded-full p-2 text-brand-600 hover:bg-brand-50" title="Attach photo">
            <span className="sr-only">Attach photo</span>
            <ImagePlus size={18} aria-hidden />
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <label className="tap44 cursor-pointer rounded-full p-2 text-brand-600 hover:bg-brand-50" title="Attach video (≤60s)">
            <span className="sr-only">Attach video (up to 60 seconds)</span>
            <span className="text-sm" aria-hidden>🎬</span>
            <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { void attachVideo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, LIMITS.dmMax))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (body.trim() || photo || video || sharedPostId) void send();
            }
          }}
          placeholder={`Message ${other.displayName.split(' ')[0]}…`}
          rows={1}
          aria-label="Message text"
          className="input max-h-32 min-h-[44px] flex-1 resize-none py-2.5"
        />
        <button
          type="submit"
          disabled={busy || (!body.trim() && !photo && !video && !sharedPostId)}
          className="btn-primary aspect-square !rounded-full px-3.5"
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </form>
      <p className="text-center text-[11px] text-slate-400">
        Enter to send · Shift+Enter for a new line · rate-limited &amp; block-aware
      </p>
    </div>
  );
}
