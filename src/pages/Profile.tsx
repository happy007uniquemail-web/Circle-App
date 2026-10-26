import { useState } from 'react';
import { Ban, Bell, BellOff, CalendarDays, Check, Flag, Lock, MessageCircle, Settings, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import HobbiesSection from '../components/HobbiesSection';
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
  interestTagsOf,
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
  // INT-06: interest tags honour PRV-04's show_interests toggle (owner/admin always see their own).
  const showTags = isMe || me?.role === 'admin' || profile.showInterest !== false;
  const tags = showTags ? interestTagsOf(state, profile.id) : [];
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

  // Brand palette (mirrors the logo): navy #0F1B2D · coral #EF6B5A ·
  // green #5FBB70 · cream #F8F1E1. Decorative shapes only — no artwork.
  const hobbies = showTags ? tags.map((t) => ({ id: t.id, name: t.name })) : [];

  return (
    <div className="space-y-4">
      <section aria-label="Profile" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {/* Identity banner — deep navy with the brand's 4-colour accents */}
        <div className="relative bg-[#0F1B2D] px-5 pb-14 pt-6 text-[#F8F1E1]">
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full border-4 border-[#EF6B5A]/70" />
          <span aria-hidden className="pointer-events-none absolute -left-6 top-3 h-2.5 w-2.5 rounded-full bg-[#5FBB70]" />
          <span aria-hidden className="pointer-events-none absolute left-16 top-9 h-1.5 w-1.5 rounded-full bg-[#F8F1E1]/70" />
          <span aria-hidden className="pointer-events-none absolute right-24 top-6 h-2 w-2 rounded-full bg-[#F8F1E1]/50" />
          <span aria-hidden className="pointer-events-none absolute bottom-3 left-10 select-none text-lg font-black text-[#EF6B5A]/80">✦</span>
          <div className="relative flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[#EF6B5A] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">Circle</span>
            <span className="rounded-full bg-[#5FBB70] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0F1B2D]">member</span>
            {profile.role === 'admin' && (
              <span className="rounded-full bg-[#F8F1E1] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#0F1B2D]">admin</span>
            )}
            {profile.isSuspended && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700">suspended</span>
            )}
          </div>
        </div>

        {/* Avatar straddles banner and body */}
        <div className="relative px-5">
          <div className="-mt-9 flex w-fit rounded-full bg-white p-1 shadow-md ring-2 ring-[#EF6B5A]/40">
            <span className="rounded-full ring-2 ring-[#5FBB70]/60">
              <Avatar src={profile.avatarUrl} name={profile.displayName} size={84} />
            </span>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-[#0F1B2D]">{profile.displayName}</h1>
            <span className="rounded-full bg-[#E7EDF6] px-2.5 py-0.5 text-xs font-semibold text-[#2A3F5C]">
              @{profile.username}
            </span>
          </div>
          {profile.bio && (
            <p className="mt-2 border-l-[3px] border-[#EF6B5A] pl-3 text-[15px] leading-relaxed text-slate-700">{profile.bio}</p>
          )}
          {showJoin && (
            <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#F8F1E1] px-2.5 py-1 text-xs font-medium text-[#7A5B24]">
              <CalendarDays size={13} /> Joined{' '}
              {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}

          {/* Stats — one chip per brand colour, tappable */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat colour="coral" label="Posts" value={myPosts.length} active={tab === 'posts'} onClick={() => { setTab('posts'); setLimit(PAGE); }} />
            <Stat colour="green" label="Followers" value={followerCount(state, profile.id)} active={tab === 'followers'} onClick={() => { setTab('followers'); setLimit(PAGE); }} />
            <Stat colour="cream" label="Following" value={followingCount(state, profile.id)} active={tab === 'following'} onClick={() => { setTab('following'); setLimit(PAGE); }} />
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isMe ? (
              <Link
                to="/settings"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0F1B2D] px-4 text-sm font-semibold text-[#F8F1E1] shadow-sm transition hover:opacity-90"
              >
                <Settings size={15} /> Edit profile
              </Link>
            ) : (
              me && (
                <>
                  {canMessageMe && (
                    <button
                      onClick={messageUser}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#EF6B5A] px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                    >
                      <MessageCircle size={15} /> Message
                    </button>
                  )}
                  <FollowButton userId={profile.id} />
                </>
              )
            )}
            {me && !isMe && (
              <div className="flex gap-1">
                <button onClick={() => setReporting(true)} aria-label="Report this user" className="tap44 rounded-full p-2 text-slate-400 hover:bg-slate-50">
                  <Flag size={15} />
                </button>
                <button onClick={() => void toggleMute()} aria-label={isMuted ? 'Unmute this user' : 'Mute this user'} className="tap44 rounded-full p-2 text-slate-400 hover:bg-slate-50">
                  {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
                </button>
                <button onClick={blockUser} aria-label="Block this user" className="tap44 rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-[#B23A2B]">
                  <Ban size={15} />
                </button>
              </div>
            )}
          </div>
          {me && following && !isMe && <p className="mt-2 text-xs text-slate-400">You follow @{profile.username}</p>}
          {me && requested && !isMe && (
            <p className="mt-2 text-xs text-slate-400">Request sent — @{profile.username} hasn’t approved it yet.</p>
          )}
        </div>
      </section>

      {/* Interests live under a collapsible, adaptive Hobbies card */}
      <HobbiesSection hobbies={hobbies} />

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

type StatColour = 'coral' | 'green' | 'cream';

const STAT_STYLES: Record<StatColour, { base: string; active: string }> = {
  coral: { base: 'bg-[#FCE9E4] text-[#B23A2B]', active: 'bg-[#EF6B5A] text-white shadow-md' },
  green: { base: 'bg-[#E4F5E9] text-[#1E7A3C]', active: 'bg-[#5FBB70] text-[#0F1B2D] shadow-md' },
  cream: { base: 'bg-[#F8F1E1] text-[#7A5B24]', active: 'bg-[#F8F1E1] text-[#0F1B2D] shadow-md ring-1 ring-[#E3D2A6]' },
};

function Stat({ colour, label, value, active, onClick }: { colour: StatColour; label: string; value: number; active: boolean; onClick: () => void }) {
  const s = STAT_STYLES[colour];
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 flex-col items-center justify-center rounded-2xl px-2 py-1.5 text-center transition hover:opacity-90 ${active ? s.active : s.base}`}
    >
      <b className="text-base leading-none">{value}</b>
      <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</span>
    </button>
  );
}
