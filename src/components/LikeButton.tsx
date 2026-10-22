import { Heart } from 'lucide-react';
import { compact } from '../lib/format';
import { useActions, useAppState, useHasLiked } from '../lib/store';
import { toast } from './Toast';

/** Like / unlike with instant feedback — one like per user per post (ENG-1). */
export default function LikeButton({ postId, count, size = 17 }: { postId: string; count: number; size?: number }) {
  const liked = useHasLiked(postId);
  const state = useAppState();
  const actions = useActions();
  const signedIn = !!state.session;

  async function toggle() {
    const result = await actions.toggleLike(postId);
    if (!result.ok) toast(result.error ?? 'Could not update like.', 'error');
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!signedIn) return;
        void toggle();
      }}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike this post' : 'Like this post'}
      className={`tap44 group flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition hover:text-pink-500 ${
        liked ? 'text-pink-500' : 'text-slate-500'
      }`}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} className={liked ? '' : 'group-hover:text-pink-500'} />
      <span className="tabular-nums">{compact(count)}</span>
    </button>
  );
}
