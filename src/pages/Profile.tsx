import { useState } from 'react';
import { Ban, CalendarDays, Flag, MessageCircle, Settings } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import ReportModal from '../components/ReportModal';
import { toast } from '../components/Toast';
import {
  currentUserProfile,
  followerCount,
  followingCount,
  isFollowing,
  profileByUsername,
  selectAuthorFeed,
  useActions,
  useAppState,
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

  if (!profile || !profile.username) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold">Profile not found</h1>
        <p className="mt-1 text-sm text-slate-600">No user matches “{username}”.</p>
        <Link to="/explore" className="btn-primary mt-4 inline-flex">Explore people</Link>
      </div>
    );
  }

  const isMe = me?.id === profile.id;
  const following = me ? isFollowing(state, me.id, profile.id) : false;
  const myPosts = visiblePosts(state, me?.id ?? null).filter((p) => p.authorId === profile.id);

  const followerRows = state.follows.filter((f) => f.followingId === profile.id);
  const followingRows = state.follows.filter((f) => f.followerId === profile.id);
  const listRows = tab === 'followers' ? followerRows : followingRows;
  const listProfiles = listRows
    .map((f) => state.profiles.find((p) => p.id === (tab === 'followers' ? f.followerId : f.followingId)))
    .filter((p): p is NonNullable<typeof p> => !!p && !!p.username);

  async function blockUser() {
    if (!window.confirm(`Block @${profile!.username}? They won’t see your content and you won’t see theirs.`)) return;
    const r = await actions.blockUser(profile!.id);
    if (r.ok) toast(`Blocked @${profile!.username}. Manage blocks in Settings.`, 'success');
    else toast(r.error ?? 'Could not block user.', 'error');
  }

  async function messageUser() {
    const r = await actions.startConversation(profile!.id);
    if (!r.ok || !r.conversationId) return toast(r.error ?? 'Could not start a conversation.', 'error');
    navigate(`/messages/${r.conversationId}`);
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
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <CalendarDays size={13} /> Joined {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {isMe ? (
              <Link to="/settings" className="btn-ghost border border-white/15 bg-white/[0.05]">
                <Settings size={15} /> Edit profile
              </Link>
            ) : (
              me && (
                <>
                  <button onClick={messageUser} className="btn-ghost border border-white/15 bg-white/[0.05]">
                    <MessageCircle size={15} /> Message
                  </button>
                  <FollowButton userId={profile.id} />
                </>
              )
            )}
            {me && !isMe && (
              <div className="flex justify-center gap-1">
                <button onClick={() => setReporting(true)} aria-label="Report this user" className="rounded-full p-2 text-slate-400 hover:bg-white/[0.06]">
                  <Flag size={15} />
                </button>
                <button onClick={blockUser} aria-label="Block this user" className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
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
      </header>

      {tab === 'posts' ? (
        <InfiniteFeed items={feed.items} hasMore={feed.hasMore} onLoadMore={feed.loadMore}
          empty={<p className="card p-6 text-center text-sm text-slate-500">
            {isMe ? 'You haven’t posted yet — share your first post from Home.' : `@${profile.username} hasn’t posted anything visible yet.`}
          </p>} />
      ) : (
        <section aria-label={`${tab} list`}>
          {listProfiles.length === 0 ? (
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
          {listProfiles.length > limit && (
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
