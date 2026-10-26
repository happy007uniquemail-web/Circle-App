import { useState, type FormEvent } from 'react';
import { Heart, MessageCircle, Repeat2, Send, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Profile, Story } from '../types';
import { LIMITS } from '../types';
import { timeAgo } from '../lib/format';
import {
  STORY_EMOJIS,
  currentUserProfile,
  hasRepostedStory,
  hasStoryReaction,
  storyCommentsFor,
  storyReactionCounts,
  useActions,
  useAppState,
} from '../lib/store';
import Avatar from './Avatar';
import Modal from './Modal';
import { toast } from './Toast';

/* ------------------------------------------------------------- action bar */

const HEART = '❤️';

/**
 * F-STO2: interaction strip inside the story viewer — quick emoji reactions
 * (heart included), reply-into-DM, comments, and repost-to-my-story.
 * Hidden entirely for the story's own author (they see engagement, not actions).
 */
export function StoryActionBar({
  story,
  author,
  isMine,
  onCloseViewer,
  onCommentsChange,
}: {
  story: Story;
  author: Profile;
  isMine: boolean;
  onCloseViewer: () => void;
  /** Freezes the viewer's auto-advance while the comments modal is open. */
  onCommentsChange?: (open: boolean) => void;
}) {
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const me = currentUserProfile(state);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!me || isMine) return null;
  const meId = me.id;

  const counts = storyReactionCounts(state, story.id);
  const comments = storyCommentsFor(state, story.id);
  const heartCount = counts[HEART] ?? 0;
  const hearted = hasStoryReaction(state, meId, story.id, HEART);
  const reposted = hasRepostedStory(state, meId, story.id);
  const totalReactions = Object.values(counts).reduce<number>((a, b) => a + (b ?? 0), 0);

  async function react(emoji: string) {
    const r = await actions.toggleStoryReaction(story.id, emoji);
    if (!r.ok) toast(r.error ?? 'Could not react.', 'error');
  }

  async function replyInDm() {
    setBusy(true);
    const r = await actions.startConversation(story.userId);
    setBusy(false);
    if (!r.ok || !r.conversationId) return toast(r.error ?? 'Could not open the chat.', 'error');
    onCloseViewer();
    navigate(`/messages/${r.conversationId}?story=${story.id}`);
  }

  async function repost() {
    if (reposted) return toast('You already reposted this story — check your ring.', 'info');
    setBusy(true);
    const r = await actions.repostStory(story.id);
    setBusy(false);
    if (r.ok) toast('Reposted to your story — lives for 24h ⏳', 'success');
    else toast(r.error ?? 'Could not repost.', 'error');
  }

  function openComments() {
    // Force the viewer's auto-advance to pause while the panel is up.
    setCommentsOpen(true);
    onCommentsChange?.(true);
  }

  return (
    <div className="mt-3">
      {/* quick reactions strip */}
      <div className="flex items-center justify-center gap-0.5 rounded-2xl bg-black/40 px-1.5 py-1 backdrop-blur" aria-label="React to story">
        {STORY_EMOJIS.map((e) => {
          const mine = hasStoryReaction(state, meId, story.id, e);
          return (
            <button
              key={e}
              onClick={() => void react(e)}
              aria-pressed={mine}
              aria-label={mine ? `Remove ${e} reaction` : `React with ${e}`}
              className={`flex min-h-9 min-w-9 items-baseline justify-center gap-0.5 rounded-full px-1.5 py-1 text-xl transition ${mine ? 'scale-110 bg-white/25' : 'opacity-85 hover:scale-105 hover:opacity-100'}`}
            >
              <span aria-hidden>{e}</span>
              <span className="text-[10px] leading-none text-white/80">{counts[e] ? counts[e] : ''}</span>
            </button>
          );
        })}
        <span className="ml-1 pr-1 text-[10px] text-white/50">{totalReactions}</span>
      </div>

      {/* primary actions */}
      <div className="mt-2 flex items-center justify-center gap-2">
        <button
          onClick={() => void react(HEART)}
          aria-pressed={hearted}
          aria-label={hearted ? `Unlike story (${heartCount})` : `Like story (${heartCount})`}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold shadow transition ${hearted ? 'bg-rose-500 text-white' : 'bg-white/90 text-rose-600 hover:bg-white'}`}
        >
          <Heart size={16} fill={hearted ? 'currentColor' : 'none'} /> {heartCount}
        </button>
        <button
          onClick={() => void replyInDm()}
          disabled={busy}
          className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/90 px-3.5 text-sm font-semibold text-[#0F1B2D] shadow transition hover:bg-white"
        >
          <MessageCircle size={16} /> Reply
        </button>
        <button
          onClick={openComments}
          aria-label={`Comment on story (${comments.length})`}
          className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/90 px-3.5 text-sm font-semibold text-[#0F1B2D] shadow transition hover:bg-white"
        >
          💬 {comments.length}
        </button>
        <button
          onClick={() => void repost()}
          aria-pressed={reposted}
          aria-label={reposted ? 'Reposted to your story' : 'Repost to your story'}
          className={`flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold shadow transition ${reposted ? 'bg-[#5FBB70] text-white' : 'bg-white/90 text-[#0F1B2D] hover:bg-white'}`}
        >
          <Repeat2 size={16} /> {reposted ? 'Reposted' : 'Repost'}
        </button>
      </div>

      {commentsOpen && (
        <StoryCommentsModal
          story={story}
          author={author}
          me={me}
          onClose={() => {
            setCommentsOpen(false);
            onCommentsChange?.(false);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------- comments panel */

/** F-STO2: comment thread for one story (list + composer, delete rules per DB). */
function StoryCommentsModal({
  story,
  author,
  me,
  onClose,
}: {
  story: Story;
  author: Profile;
  me: Profile;
  onClose: () => void;
}) {
  const state = useAppState();
  const actions = useActions();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const comments = storyCommentsFor(state, story.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await actions.addStoryComment(story.id, body);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not comment.', 'error');
    setBody('');
  }

  return (
    <Modal onClose={onClose} label={`Comments on ${author.displayName}'s story`} className="max-w-sm">
      <div className="flex max-h-[70vh] flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 pb-3 pt-4">
          <h2 className="text-lg font-bold">Story comments</h2>
          <span className="truncate text-xs text-slate-400">on {author.displayName}'s story</span>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {comments.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No comments yet — be the first.</p>
          )}
          {comments.map((c) => {
            const commentee = state.profiles.find((p) => p.id === c.authorId);
            if (!commentee) return null;
            const canDelete = c.authorId === me.id || author.id === me.id || me.role === 'admin';
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar src={commentee.avatarUrl} name={commentee.displayName} size={28} />
                <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
                    <b className="text-[13px]">{commentee.displayName}</b>
                    <span className="text-slate-400">· {timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-800">{c.body}</p>
                </div>
                {canDelete && (
                  <button
                    onClick={async () => {
                      const r = await actions.deleteStoryComment(c.id);
                      if (!r.ok) toast(r.error ?? 'Could not delete comment.', 'error');
                    }}
                    aria-label="Delete comment"
                    className="tap44 h-fit rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-100 px-4 py-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, LIMITS.commentMax))}
            placeholder={`Reply to ${author.displayName.split(' ')[0]}'s story…`}
            rows={1}
            aria-label={`Comment text, ${LIMITS.commentMax - body.length} characters remaining`}
            className="input max-h-28 min-h-[44px] flex-1 resize-none py-2.5"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="btn-primary aspect-square !rounded-full px-3.5"
            aria-label="Post comment"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </Modal>
  );
}
