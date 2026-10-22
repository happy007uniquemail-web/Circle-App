import { useEffect, useState } from 'react';
import { Hash, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import { compact } from '../lib/format';
import { followerCount, followingCount, selectExploreFeed, selectSearchUsers, trendingHashtags, useAppState } from '../lib/store';

/** Trending hashtags over the last 7 days (F-HAS). */
function TrendingHashtags() {
  const state = useAppState();
  const tags = trendingHashtags(state, state.session?.id ?? null, 8);
  if (tags.length === 0) return null;
  return (
    <section className="card p-4" aria-label="Trending hashtags">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">
        <Hash size={14} /> Trending tags
      </h2>
      <ul className="flex flex-wrap gap-2">
        {tags.map(({ tag, count }) => (
          <li key={tag}>
            <Link
              to={`/hashtag/${encodeURIComponent(tag)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:border-brand-300 hover:bg-brand-100"
            >
              #{tag}
              <span className="text-xs text-brand-500">{compact(count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** `/explore` — trending posts (7-day engagement) + user search (FEED-2, FEED-3). */
export default function Explore() {
  const state = useAppState();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const feed = useInfiniteFeed((cursor) => selectExploreFeed(state, state.session?.id ?? null, cursor));

  useEffect(() => setDraft(q), [q]);

  function update(value: string) {
    setDraft(value);
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  }

  const results = q ? selectSearchUsers(state, state.session?.id ?? null, q) : [];

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={draft}
          onChange={(e) => update(e.target.value)}
          placeholder="Search people by username or name…"
          aria-label="Search users"
          className="input input-icon py-3"
          autoFocus
        />
      </div>

      {q && (
        <section aria-label="People results">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">People</h2>
          {results.length === 0 ? (
            <p className="card p-6 text-center text-sm text-slate-500">No people match “{q}”.</p>
          ) : (
            <ul className="space-y-3">
              {results.map((p) => (
                <li key={p.id} className="card flex items-center gap-3 p-4">
                  <Link to={`/u/${p.username}`}>
                    <Avatar src={p.avatarUrl} name={p.displayName} size={44} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to={`/u/${p.username}`} className="block truncate font-semibold hover:underline">{p.displayName}</Link>
                    <p className="truncate text-sm text-slate-500">@{p.username}</p>
                    <p className="mt-0.5 flex gap-3 text-xs text-slate-400">
                      <span><b className="text-slate-600">{compact(followerCount(state, p.id))}</b> followers</span>
                      <span><b className="text-slate-600">{compact(followingCount(state, p.id))}</b> following</span>
                    </p>
                  </div>
                  <FollowButton userId={p.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!q && <TrendingHashtags />}

      <section aria-label="Trending posts">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {q ? 'Trending' : 'Trending this week'}
          </h2>
          <span className="text-xs text-slate-400">engagement score · last 7 days</span>
        </div>
        <InfiniteFeed items={feed.items} hasMore={feed.hasMore} onLoadMore={feed.loadMore}
          empty={<p className="card p-6 text-center text-sm text-slate-500">Nothing trending yet.</p>} />
      </section>
    </div>
  );
}
