import { useState } from 'react';
import { Hourglass, UserCheck, UserPlus } from 'lucide-react';
import { currentUserProfile, isFollowing, pendingRequest, useActions, useAppState } from '../lib/store';
import { toast } from './Toast';

/**
 * Follow / unfollow with immediate UI feedback (FOL-1, FOL-2).
 * PRV-03: a follow on a private account becomes a request — the button shows
 * "Requested" and clicking again cancels it.
 */
export default function FollowButton({ userId, compactLabel = false }: { userId: string; compactLabel?: boolean }) {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const [pending, setPending] = useState(false);
  if (!me || me.id === userId) return null;

  const following = isFollowing(state, me.id, userId);
  const requested = !following && pendingRequest(state, me.id, userId) !== null;

  async function click() {
    setPending(true);
    // toggleFollow also cancels a pending request (same row, same button).
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
      aria-label={following ? 'Unfollow' : requested ? 'Cancel follow request' : 'Follow'}
      className={following || requested ? 'btn-secondary' : 'btn-primary'}
    >
      {following ? (
        <>
          <UserCheck size={15} /> {!compactLabel && 'Following'}
        </>
      ) : requested ? (
        <>
          <Hourglass size={15} /> {!compactLabel && 'Requested'}
        </>
      ) : (
        <>
          <UserPlus size={15} /> Follow
        </>
      )}
    </button>
  );
}
