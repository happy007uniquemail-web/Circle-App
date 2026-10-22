import { useState } from 'react';
import { Download, Flag, ImageOff, MessageCircle, MoreHorizontal, Pencil, Repeat2, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { FeedItem, Post } from '../types';
import { LIMITS } from '../types';
import { compact, timeAgo } from '../lib/format';
import { downloadMedia } from '../lib/media';
import { currentUserProfile, profileById, useActions, useAppState, useHasReposted, useHasSaved } from '../lib/store';
import Avatar from './Avatar';
import LikeButton from './LikeButton';
import ReportModal from './ReportModal';
import RichText from './RichText';
import ShareMenu from './ShareMenu';
import { toast } from './Toast';
import VideoPlayer from './VideoPlayer';

async function downloadPostMedia(post: Post) {
  if (post.videoUrl) {
    const ok = await downloadMedia(post.videoUrl, `circle-${post.id}.mp4`);
    if (!ok) toast('Could not download that video.', 'error');
    return;
  }
  post.imageUrls.forEach((url, i) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `circle-${post.id}-${i + 1}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}

/**
 * Timeline post (F-REP repost header, F-VID video, F-SAV bookmark/download,
 * F-SHR share, F-HAS linked hashtags). `memo`'d — parents re-render on every
 * store tick, so identity of `item` is the render gate (F-OPT).
 */
const PostCard = ({ item, onChange }: { item: FeedItem; onChange?: () => void }) => {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const navigate = useNavigate();
  const reposted = useHasReposted(item.post.id);
  const saved = useHasSaved(item.post.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.post.body);
  const [reporting, setReporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const post = item.post;
  const author = profileById(state, post.authorId);
  const reposter = item.reposterId ? profileById(state, item.reposterId) : null;
  if (!author) return null;

  const isMine = me?.id === post.authorId;
  const isAdmin = me?.role === 'admin';
  const toPost = () => navigate(`/p/${post.id}`);

  async function saveEdit() {
    const result = await actions.editPost(post.id, draft);
    if (!result.ok) return toast(result.error ?? 'Could not edit post.', 'error');
    setEditing(false);
    toast('Post updated.', 'success');
  }

  async function remove() {
    if (!window.confirm('Delete this post? It is soft-deleted and purged after 30 days.')) return;
    const result = await actions.deletePost(post.id);
    if (!result.ok) return toast(result.error ?? 'Could not delete post.', 'error');
    onChange?.();
    toast('Post deleted.', 'success');
  }

  function copyLink() {
    const url = `${window.location.origin}/p/${post.id}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => toast('Link copied to clipboard.', 'success'))
      .catch(() => toast(`Copy this link: ${url}`, 'info'));
  }

  return (
    <article className="card p-4 transition hover:border-slate-300 hover:shadow" aria-label={`Post by ${author.displayName}`}>
      {reposter && (
        <div className="mb-2 flex items-center gap-2 pl-1 text-xs font-medium text-slate-500">
          <Repeat2 size={14} className="text-emerald-600" />
          <Link to={`/u/${reposter.username}`} className="hover:underline">{reposter.displayName}</Link>
          <span>reposted</span>
          <span className="text-slate-400">· {timeAgo(item.repostedAt!)}</span>
        </div>
      )}

      <header className="flex items-start gap-3">
        <Link to={`/u/${author.username}`} aria-label={`${author.displayName}'s profile`}>
          <Avatar src={author.avatarUrl} name={author.displayName} size={40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5">
            <Link to={`/u/${author.username}`} className="truncate font-semibold hover:underline">
              {author.displayName}
            </Link>
            <span className="truncate text-sm text-slate-500">@{author.username}</span>
            <span className="text-slate-400">·</span>
            <Link to={`/p/${post.id}`} className="text-sm text-slate-500 hover:underline">
              {timeAgo(post.createdAt)}
            </Link>
            {post.editedAt && <span className="text-xs text-slate-400">(edited)</span>}
          </div>
          {author.isSuspended && <span className="text-xs font-medium text-red-600">suspended account</span>}

          {editing ? (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, LIMITS.postMax))}
                maxLength={LIMITS.postMax}
                rows={3}
                className="input resize-none"
                aria-label="Edit post"
                autoFocus
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-slate-400">{draft.length}/{LIMITS.postMax}</span>
                <div className="flex gap-2">
                  <button className="btn-ghost py-1.5" onClick={() => { setEditing(false); setDraft(post.body); }}>Cancel</button>
                  <button className="btn-primary py-1.5" disabled={draft.trim().length < 1 && !post.imageUrls.length && !post.videoUrl} onClick={saveEdit}>Save</button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
              <RichText text={post.body} />
            </p>
          )}
        </div>

        <details className="relative">
          <summary aria-label="Post menu" className="cursor-pointer list-none rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
            <MoreHorizontal size={18} />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl glass py-1">
            <button onClick={copyLink} className="flex w-full items-center gap-2 px-3.5 py-2 text-sm hover:bg-white/[0.06]">
              <Download size={14} /> Copy link
            </button>
            {(post.imageUrls.length > 0 || post.videoUrl) && (
              <button onClick={() => void downloadPostMedia(post)} className="flex w-full items-center gap-2 px-3.5 py-2 text-sm hover:bg-white/[0.06]">
                <Download size={14} /> Save media to device
              </button>
            )}
            {isMine && (
              <button onClick={() => setEditing(true)} className="flex w-full items-center gap-2 px-3.5 py-2 text-sm hover:bg-white/[0.06]">
                <Pencil size={14} /> Edit post
              </button>
            )}
            {(isMine || isAdmin) && (
              <button onClick={remove} className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50">
                <Trash2 size={14} /> Delete post
              </button>
            )}
            {!isMine && (
              <button onClick={() => setReporting(true)} className="flex w-full items-center gap-2 px-3.5 py-2 text-sm hover:bg-white/[0.06]">
                <Flag size={14} /> Report post
              </button>
            )}
          </div>
        </details>
      </header>

      {!editing && post.videoUrl && (
        <div className="mt-3">
          <VideoPlayer refKey={post.videoUrl} downloadable label={`Video in post by ${author.displayName}`} className="max-h-[480px]" />
        </div>
      )}

      {!editing && !post.videoUrl && post.imageUrls.length > 0 && (
        <div
          onClick={toPost}
          className={`mt-3 grid cursor-pointer gap-1 ${post.imageUrls.length === 1 ? '' : 'grid-cols-2'}`}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && toPost()}
          aria-label="Open post"
        >
          {post.imageUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`Image ${i + 1} of post by ${author.displayName}`}
              loading="lazy"
              decoding="async"
              className={`w-full rounded-xl border border-white/10 object-cover ${post.imageUrls.length === 1 ? 'max-h-96' : 'aspect-[4/3]'} ${
                post.imageUrls.length === 3 && i === 0 ? 'col-span-2' : ''
              }`}
            />
          ))}
        </div>
      )}

      {!editing && (
        <footer className="mt-3 flex items-center gap-0.5 border-t border-slate-200 pt-2 text-slate-500 sm:gap-1">
          <LikeButton postId={post.id} count={post.likeCount} />

          {me && !isMine && (
            <button
              onClick={async (e) => {
                e.stopPropagation();
                const r = await actions.toggleRepost(post.id);
                if (!r.ok) toast(r.error ?? 'Could not repost.', 'error');
                else toast(reposted ? 'Repost removed.' : 'Reposted to your feed.', 'success');
              }}
              aria-pressed={reposted}
              aria-label={reposted ? 'Undo repost' : 'Repost this post'}
              className={`group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition hover:text-brand-500 ${reposted ? 'text-emerald-600' : 'text-slate-500'}`}
            >
              <Repeat2 size={17} className={reposted ? '' : 'group-hover:text-brand-500'} />
              <span className="tabular-nums">{compact(post.repostCount)}</span>
            </button>
          )}

          <button
            onClick={toPost}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition hover:text-sky-400"
            aria-label={`View ${post.commentCount} comments`}
          >
            <MessageCircle size={17} />
            <span className="tabular-nums">{compact(post.commentCount)}</span>
          </button>

          <span className="flex-1" />

          <button
            onClick={async (e) => {
              e.stopPropagation();
              const r = await actions.toggleSave(post.id);
              if (!r.ok) toast(r.error ?? 'Could not save.', 'error');
              else toast(saved ? 'Removed from saved.' : 'Saved — find it in Saved posts.', 'success');
            }}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from saved' : 'Save post'}
            title={saved ? 'Saved' : 'Save'}
            className={`rounded-full p-2 transition ${saved ? 'text-amber-500' : 'text-slate-400 hover:text-slate-900'}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); setSharing(true); }}
            aria-label="Share this post"
            title="Share"
            className="rounded-full p-2 text-slate-400 transition hover:text-slate-900"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
            </svg>
          </button>

          {post.imageUrls.length === 0 && !post.videoUrl && (
            <span className="ml-1 hidden items-center gap-1 text-xs text-slate-300 sm:flex" aria-hidden>
              <ImageOff size={12} /> text only
            </span>
          )}
        </footer>
      )}

      {reporting && <ReportModal target="post" targetId={post.id} label="this post" onClose={() => setReporting(false)} />}
      {sharing && <ShareMenu post={post} onClose={() => setSharing(false)} />}
    </article>
  );
};

export default PostCard;
