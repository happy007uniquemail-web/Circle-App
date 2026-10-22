import { Link } from 'react-router-dom';
import { Hash, TrendingUp, Users } from 'lucide-react';
import Avatar from './Avatar';
import FollowButton from './FollowButton';
import { currentUserProfile, followerCount, trendingHashtags, useAppState } from '../lib/store';

/**
 * Desktop right rail (BLK-05): secondary content that would otherwise be
 * empty margin on wide screens — suggested people + trending hashtags +
 * legal links (also serves as the page footer's link home).
 */
export default function SidePanel() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const tags = trendingHashtags(state, me?.id ?? null, 5);
  const following = new Set(state.follows.filter((f) => f.followerId === me?.id).map((f) => f.followingId));
  const blocked = new Set(state.blocks.filter((b) => b.blockerId === me?.id).map((b) => b.blockedId));
  const suggested = state.profiles
    .filter((p) => p.id !== me?.id && !following.has(p.id) && !blocked.has(p.id) && !p.isSuspended)
    .sort((a, b) => followerCount(state, b.id) - followerCount(state, a.id))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {suggested.length > 0 && (
        <section className="card p-4" aria-label="People to follow">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Users size={15} className="text-brand-600" aria-hidden /> To follow
          </h2>
          <ul className="mt-3 space-y-3">
            {suggested.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5">
                <Link to={`/u/${p.username}`} className="shrink-0" aria-label={`${p.displayName}'s profile`}>
                  <Avatar src={p.avatarUrl} name={p.displayName} size={36} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${p.username}`} className="block truncate text-sm font-semibold hover:underline">
                    {p.displayName}
                  </Link>
                  <p className="truncate text-xs text-slate-500">@{p.username}</p>
                </div>
                <FollowButton userId={p.id} compactLabel />
              </li>
            ))}
          </ul>
        </section>
      )}

      {tags.length > 0 && (
        <section className="card p-4" aria-label="Trending hashtags">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <TrendingUp size={15} className="text-emerald-600" aria-hidden /> Trending
          </h2>
          <ul className="mt-2.5 space-y-1">
            {tags.map((t) => (
              <li key={t.tag}>
                <Link
                  to={`/hashtag/${encodeURIComponent(t.tag)}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 transition hover:bg-white/[0.05] hover:text-brand-600"
                >
                  <Hash size={14} aria-hidden />#{t.tag}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        <Link to="/terms" className="hover:underline">Terms</Link>
        {' · '}
        <Link to="/privacy" className="hover:underline">Privacy</Link>
        <br />
        <span aria-hidden>© 2026 Circle</span>
      </p>
    </div>
  );
}
