import { useState, type FormEvent } from 'react';
import { Flag, MessageCircle, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Post } from '../types';
import { LIMITS } from '../types';
import { timeAgo } from '../lib/format';
import { currentUserProfile, useActions, useAppState } from '../lib/store';
import Avatar from './Avatar';
import ImageUploader from './ImageUploader';
import ReportModal from './ReportModal';
import RichText from './RichText';
import { toast } from './Toast';

/** Comment thread under a post (ENG-2, ENG-3 + F-CMI photos in comments). */
export default function CommentList({ post }: { post: Post }) {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [reporting, setReporting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const comments = state.comments
    .filter((c) => c.postId === post.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await actions.addComment(post.id, body, images);
    setBusy(false);
    if (!result.ok) return toast(result.error ?? 'Could not add comment.', 'error');
    setBody('');
    setImages([]);
    toast('Comment added.', 'success');
  }

  if (!me) return null;

  return (
    <section aria-label="Comments">
      <form onSubmit={submit} className="card mb-4 p-4">
        <div className="flex gap-3">
          <Avatar src={me.avatarUrl} name={me.displayName} size={32} />
          <div className="min-w-0 flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, LIMITS.commentMax))}
              placeholder="Write a comment… (text or photo)"
              rows={2}
              aria-label={`Comment text, ${LIMITS.commentMax - body.length} characters remaining`}
              className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-slate-400">{LIMITS.commentMax - body.length}</span>
              <button type="submit" disabled={busy || (body.trim().length < 1 && images.length === 0)} className="btn-primary px-4 py-1.5">
                <MessageCircle size={14} /> Comment
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2 border-t border-slate-100 pt-2">
          <ImageUploader value={images} onChange={setImages} max={LIMITS.imagesPerComment} label="Add photo to comment" />
        </div>
      </form>

      <ul className="space-y-3">
        {comments.map((c) => {
          const author = state.profiles.find((p) => p.id === c.authorId);
          if (!author) return null;
          const canDelete = c.authorId === me.id || post.authorId === me.id || me.role === 'admin';
          return (
            <li key={c.id} className="card p-4">
              <div className="flex gap-3">
                <Link to={`/u/${author.username}`} aria-label={`${author.displayName}'s profile`}>
                  <Avatar src={author.avatarUrl} name={author.displayName} size={32} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
                    <Link to={`/u/${author.username}`} className="font-semibold hover:underline">{author.displayName}</Link>
                    <span className="text-slate-500">@{author.username}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{timeAgo(c.createdAt)}</span>
                  </div>
                  {c.body && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[15px]">
                      <RichText text={c.body} />
                    </p>
                  )}
                  {c.imageUrls.length > 0 && (
                    <div className={`mt-2 grid gap-1 ${c.imageUrls.length === 1 ? 'max-w-sm' : 'grid-cols-2'}`}>
                      {c.imageUrls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Photo ${i + 1} in comment by ${author.displayName}`}
                          loading="lazy"
                          decoding="async"
                          width={1600}
                          height={1200}
                          className="aspect-[4/3] w-full rounded-lg border border-white/10 object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {canDelete && (
                    <button
                      aria-label="Delete comment"
                      onClick={async () => {
                        const r = await actions.deleteComment(c.id);
                        if (!r.ok) toast(r.error ?? 'Could not delete comment.', 'error');
                        else toast('Comment deleted.', 'success');
                      }}
                      className="tap44 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  {c.authorId !== me.id && (
                    <button aria-label="Report comment" onClick={() => setReporting(c.id)} className="tap44 rounded-full p-1.5 text-slate-400 hover:bg-white/[0.06]">
                      <Flag size={15} />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {comments.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">No comments yet — start the conversation.</p>
      )}

      {reporting && (
        <ReportModal target="comment" targetId={reporting} label="this comment" onClose={() => setReporting(null)} />
      )}
    </section>
  );
}
