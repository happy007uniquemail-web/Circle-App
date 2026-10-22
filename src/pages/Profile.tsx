import { useState } from 'react';
import { Ban, Bell, BellOff, CalendarDays, Check, Flag, Lock, MessageCircle, Settings, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import ReportModal from '../components/ReportModal';
import { confirmAction } from '../components/ConfirmDialog';
import { ProfileSkeleton } from '../components/Skeleton';
import { toast } from '../components/Toast';
import {
  canViewPostsOf,
  currentUserProfile,
  dmAllows,
  followerCount,
  followingCount,
  isFollowing,
  mutedIdsFor,
  pendingRequest,
  profileByUsername,
  selectAuthorFeed,
  useActions,
  useAppState,
  useDataReady,
  visiblePosts,
} from '../lib/store';

type Tab = 'posts' | 'followers' | 'following';
const PAGE = 10;

/** `/u/:username` — public profile: posts, counts, follow, lists (PROF-3/4, FOL-3). */
export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const me = currentUserProfile(state);
  const profile = username ? profileByUsername(state, username) : null;
  const [tab, setTab] = useState<Tab>('posts');
  const [limit, setLimit] = useState(PAGE);
  const [reporting, setReporting] = useState(false);

  const feed = useInfiniteFeed((cursor) =>
    profile && me ? selectAuthorFeed(state, me.id, profile.id, cursor) : { items: [], nextCursor: null },
  );
  const ready = useDataReady();

  if (!ready && !profile) return <ProfileSkeleton />;

  if (!profile || !profile.username) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold">Profile not found</h1>
        <p className="mt-1 text-sm text-slate-600">No user matches “{username}”.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => void actions.refresh()} className="btn-ghost">Retry</button>
          <Link to="/explore" className="btn-primary inline-flex">Explore people</Link>
        </div>
      </div>
    );
  }

  const isMe = me?.id === profile.id;
  const following = me ? isFollowing(state, me.id, profile.id) : false;
  const requested = me && !isMe ? pendingRequest(state, me.id, profile.id) !== null : false;
  // PRV-02: non-followers of followers-only/private accounts see a lock notice.
  const canSeePosts = me ? canViewPostsOf(state, me.id, profile.id) : false;
  const isMuted = me ? mutedIdsFor(state, me.id).has(profile.id) : false;
  const canMessageMe = me ? dmAllows(state, me.id, profile.id) : false;
  // PRV-04: follow lists / join date honour the owner's toggles (owner + admin always see their own).
  const showLists = isMe || me?.role === 'admin' || profile.showFollowLists !== false;
  const showJoin = isMe || me?.role === 'admin' || profile.showJoinDate !== false;
  const myPosts = visiblePosts(state, me?.id ?? null).filter((p) => p.authorId === profile.id);

  // PRV-03: pending requests to me, shown on my own profile for approval.
  const requestRows = isMe
    ? state.follows.filter((f) => f.followingId === profile.id && f.status === 'pending')
    : [];
  const requestProfiles = requestRows
    .map((f) => state.profiles.find((p) => p.id === f.followerId))
    .filter((p): p is NonNullable<typeof p> => !!p && !!p.username);

  const followerRows = state.follows.filter((f) => f.followingId === profile.id && f.status !== 'pending');
  const followingRows = state.follows.filter((f) => f.followerId === profile.id && f.status !== 'pending');
  const listRows = tab === 'followers' ? followerRows : followingRows;
  const listProfiles = listRows
    .map((f) => state.profiles.find((p) => p.id === (tab === 'followers' ? f.followerId : f.followingId)))
    .filter((p): p is NonNullable<typeof p> => !!p && !!p.username);

  async function blockUser() {
    const ok = await confirmAction({
      title: `Block @${profile!.username}?`,
      message: 'They won’t see your content and you won’t see theirs. You can undo this in Settings.',
      confirmLabel: 'Block',
    });
    if (!ok) return;
    const r = await actions.blockUser(profile!.id);
    if (r.ok) toast(`Blocked @${profile!.username}. Manage blocks in Settings.`, 'success');
    else toast(r.error ?? 'Could not block user.', 'error');
  }

  async function messageUser() {
    const r = await actions.startConversation(profile!.id);
    if (!r.ok || !r.conversationId) return toast(r.error ?? 'Could not start a conversation.', 'error');
    navigate(`/messages/${r.conversationId}`);
  }

  // PRV-08: mute hides their content from my feeds without blocking.
  async function toggleMute() {
    const r = isMuted ? await actions.unmuteUser(profile!.id) : await actions.muteUser(profile!.id);
    if (!r.ok) return toast(r.error ?? 'Could not update mute.', 'error');
    toast(isMuted ? `Unmuted @${profile!.username}.` : `Muted @${profile!.username}. Their posts are hidden from your feeds.`, 'success');
  }

  // PRV-03: approve/decline follow requests (own profile).
  async function decideRequest(followerId: string, accept: boolean) {
    const r = accept ? await actions.approveFollow(followerId) : await actions.declineFollow(followerId);
    if (!r.ok) return toast(r.error ?? 'Could not update request.', 'error');
    toast(accept ? 'Follow request approved.' : 'Follow request declined.', 'success');
  }

  return (
    <div className="space-y-4">
      <header className="card p-5">
        <div className="flex items-start gap-4">
          <Avatar src={profile.avatarUrl} name={profile.displayName} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{profile.displayName}</h1>
              {profile.role === 'admin' && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">admin</span>
              )}
              {profile.isSuspended && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">suspended</span>
              )}
            </div>
            <p className="text-sm text-slate-500">@{profile.username}</p>
            {profile.bio && <p className="mt-2 text-[15px] leading-relaxed">{profile.bio}</p>}
            {showJoin && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <CalendarDays size={13} /> Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {isMe ? (
              <Link to="/settings" className="btn-ghost border border-white/15 bg-white/[0.05]">
                <Settings size={15} /> Edit profile
              </Link>
            ) : (
              me && (
                <>
                  {canMessageMe && (
                    <button onClick={messageUser} className="btn-ghost border border-white/15 bg-white/[0.05]">
                      <MessageCircle size={15} /> Message
                    </button>
                  )}
                  <FollowButton userId={profile.id} />
                </>
              )
            )}
            {me && !isMe && (
              <div className="flex justify-center gap-1">
                <button onClick={() => setReporting(true)} aria-label="Report this user" className="tap44 rounded-full p-2 text-slate-400 hover:bg-white/[0.06]">
                  <Flag size={15} />
                </button>
                <button onClick={() => void toggleMute()} aria-label={isMuted ? 'Unmute this user' : 'Mute this user'} className="tap44 rounded-full p-2 text-slate-400 hover:bg-white/[0.06]">
                  {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
                </button>
                <button onClick={blockUser} aria-label="Block this user" className="tap44 rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                  <Ban size={15} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-5 border-t border-slate-100 pt-3 text-sm">
          <Stat label="Posts" value={myPosts.length} active={tab === 'posts'} onClick={() => { setTab('posts'); setLimit(PAGE); }} />
          <Stat label="Followers" value={followerCount(state, profile.id)} active={tab === 'followers'} onClick={() => { setTab('followers'); setLimit(PAGE); }} />
          <Stat label="Following" value={followingCount(state, profile.id)} active={tab === 'following'} onClick={() => { setTab('following'); setLimit(PAGE); }} />
        </div>
        {me && following && !isMe && <p className="mt-2 text-xs text-slate-400">You follow @{profile.username}</p>}
        {me && requested && !isMe && (
          <p className="mt-2 text-xs text-slate-400">Request sent — @{profile.username} hasn’t approved it yet.</p>
        )}
      </header>

      {/* PRV-03: my pending follow requests, with approve/decline. */}
      {isMe && requestProfiles.length > 0 && (
        <section aria-label="Follow requests" className="card p-5">
          <h2 className="font-semibold">Follow requests</h2>
          <p className="mt-1 text-sm text-slate-500">People asking to follow you. Approving lets them see your posts.</p>
          <ul className="mt-3 space-y-2">
            {requestProfiles.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <Link to={`/u/${p.username}`}>
                  <Avatar src={p.avatarUrl} name={p.displayName} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${p.username}`} className="block truncate text-sm font-semibold hover:underline">{p.displayName}</Link>
                  <p className="truncate text-xs text-slate-500">@{p.username}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => void decideRequest(p.id, true)}
                    aria-label={`Approve follow request from @${p.username}`}
                    className="tap44 rounded-full bg-brand-600 p-2 text-white hover:bg-brand-700"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    onClick={() => void decideRequest(p.id, false)}
                    aria-label={`Decline follow request from @${p.username}`}
                    className="tap44 rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                  >
                    <X size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'posts' ? (
        canSeePosts ? (
          <InfiniteFeed items={feed.items} hasMore={feed.hasMore} onLoadMore={feed.loadMore}
            empty={<p className="card p-6 text-center text-sm text-slate-500">
              {isMe ? 'You haven’t posted yet — share your first post from Home.' : `@${profile.username} hasn’t posted anything visible yet.`}
            </p>} />
        ) : (
          /* PRV-02: non-followers of a restricted account get a lock notice. */
          <div className="card p-8 text-center">
            <Lock size={22} className="mx-auto text-slate-400" aria-hidden />
            <h2 className="mt-2 font-semibold">
              {profile.visibility === 'private' ? 'This account is private' : 'Posts are for followers only'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Follow @{profile.username} {profile.visibility === 'private' ? 'and wait for approval' : ''} to see their posts.
            </p>
            <div className="mt-4 flex justify-center">
              <FollowButton userId={profile.id} />
            </div>
          </div>
        )
      ) : (
        <section aria-label={`${tab} list`}>
          {!showLists ? (
            /* PRV-04: owner hid their follow lists — counts stay, contents don't. */
            <p className="card p-6 text-center text-sm text-slate-500">
              @{profile.username} keeps their {tab === 'followers' ? 'follower' : 'following'} list private.
            </p>
          ) : listProfiles.length === 0 ? (
            <p className="card p-6 text-center text-sm text-slate-500">
              {tab === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          ) : (
            <ul className="space-y-3">
              {listProfiles.slice(0, limit).map((p) => (
                <li key={p.id} className="card flex items-center gap-3 p-4">
                  <Link to={`/u/${p.username}`}>
                    <Avatar src={p.avatarUrl} name={p.displayName} size={40} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/u/${p.username}`} className="block truncate text-sm font-semibold hover:underline">{p.displayName}</Link>
                    <p className="truncate text-xs text-slate-500">@{p.username}</p>
                  </div>
                  {me && p.id !== me.id && <FollowButton userId={p.id} />}
                </li>
              ))}
            </ul>
          )}
          {showLists && listProfiles.length > limit && (
            <button onClick={() => setLimit((l) => l + PAGE)} className="btn-ghost mx-auto mt-3 flex">
              Show more ({listProfiles.length - limit} remaining)
            </button>
          )}
        </section>
      )}

      {reporting && (
        <ReportModal target="user" targetId={profile.id} label={`@${profile.username}`} onClose={() => setReporting(false)} />
      )}
    </div>
  );
}

function Stat({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-2 py-1 -mx-2 transition hover:bg-white/[0.06] ${active ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
      <b>{value}</b> <span className="font-normal">{label}</span>
    </button>
  );
}
