import { useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import { currentUserProfile, isFollowing, useActions, useAppState } from '../lib/store';
import { toast } from './Toast';

/** Follow / unfollow with immediate UI feedback (FOL-1, FOL-2). */
export default function FollowButton({ userId, compactLabel = false }: { userId: string; compactLabel?: boolean }) {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const [pending, setPending] = useState(false);
  if (!me || me.id === userId) return null;

  const following = isFollowing(state, me.id, userId);

  async function click() {
    setPending(true);
    const result = await actions.toggleFollow(userId); // self-follow & duplicates rejected server-side
    if (!result.ok) toast(result.error ?? 'Could not update follow.', 'error');
    setPending(false);
  }

  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        await click();
      }}
      disabled={pending}
      aria-pressed={following}
      className={following ? 'btn-ghost border border-white/15 bg-white/[0.05]' : 'btn-primary'}
    >
      {following ? (
        <>
          <UserCheck size={15} /> {!compactLabel && 'Following'}
        </>
      ) : (
        <>
          <UserPlus size={15} /> {compactLabel ? 'Follow' : 'Follow'}
        </>
      )}
    </button>
  );
}
