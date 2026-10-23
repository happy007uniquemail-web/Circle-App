import { useEffect, useRef } from 'react';
import { UserPlus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import PostComposer from '../components/PostComposer';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import { FeedSkeleton } from '../components/Skeleton';
import StoryBar from '../components/Stories';
import {
  FEED_MODES,
  feedFilterCount,
  filterFeedItems,
  normalizeFeedMode,
  readFeedFilters,
  selectHomeFeed,
} from '../lib/feedModes';
import { currentUserProfile, followerCount, interestsOf, isFollowing, sharedInterestCount, useAppState, useDataReady } from '../lib/store';
import { LIMITS } from '../types';

/** Suggested accounts — mitigates the "empty feed for new users" risk (PRD §11). */
function SuggestedFollows({ exclude }: { exclude: string }) {
  const state = useAppState();
  const suggestions = state.profiles
    .filter((p) => p.username && p.id !== exclude && !p.isSuspended && !isFollowing(state, exclude, p.id))
    // INT-07: people you share interests with surface first.
    .map((p) => ({ p, overlap: sharedInterestCount(state, exclude, p.id) }))
    .sort((a, b) => b.overlap - a.overlap || followerCount(state, b.p.id) - followerCount(state, a.p.id))
    .slice(0, 5);

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Your feed is just getting started</h2>
      <p className="mt-1 text-sm text-slate-600">Follow a few people and their newest posts show up here.</p>
      <ul className="mt-4 space-y-3">
        {suggestions.map(({ p }) => (
          <li key={p.id} className="flex items-center gap-3">
            <Link to={`/u/${p.username}`}>
              <Avatar src={p.avatarUrl} name={p.displayName} size={40} />
            </Link>
            <div className="min-w-0 flex-1">
              <Link to={`/u/${p.username}`} className="block truncate text-sm font-semibold hover:underline">{p.displayName}</Link>
              <p className="truncate text-xs text-slate-500">{p.bio || `@${p.username}`}</p>
            </div>
            <FollowButton userId={p.id} />
          </li>
        ))}
      </ul>
      <Link to="/explore" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
        <UserPlus size={15} /> Find more people
      </Link>
    </div>
  );
}

/** `/home` — TOP-01 feed modes (For you/Popular/Latest/Trending) and TOP-03
 *  filters over the Following feed, 20 per page (FEED-1). Mode + filters are
 *  URL state, so every view is shareable and survives a reload. */
export default function Home() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const ready = useDataReady();
  const [params, setParams] = useSearchParams();

  const mode = normalizeFeedMode(params.get('feed'));
  const filters = readFeedFilters(params);
  const modeKey = `${mode}|${filters.type}|${filters.time}|${filters.interests.join(',')}`;
  const modeLabel = FEED_MODES.find((m) => m.id === mode)?.label ?? 'For you';
  const filterCount = feedFilterCount(filters);

  const feed = useInfiniteFeed((cursor) => {
    if (!me) return { items: [], nextCursor: null };
    const page = selectHomeFeed(state, me.id, mode, cursor);
    return { ...page, items: filterFeedItems(state, page.items, filters) };
  });

  // A mode/filter change swaps the page's cursor shape (offset vs ts~key) and
  // must start over; also jump the scroll region back to the top of the list.
  const prevKey = useRef(modeKey);
  useEffect(() => {
    if (prevKey.current === modeKey) return;
    prevKey.current = modeKey;
    feed.reset();
    document.getElementById('main-scroll')?.scrollTo(0, 0);
  }, [modeKey]);

  // Mobile tab bar "Create" (§5.2) lands here: focus the composer, then
  // consume the param so the URL stays shareable.
  const compose = params.get('compose');
  useEffect(() => {
    if (compose !== '1') return;
    const next = new URLSearchParams(params);
    next.delete('compose');
    setParams(next, { replace: true });
    requestAnimationFrame(() => {
      const el = document.getElementById('post-composer');
      if (!(el instanceof HTMLElement)) return;
      el.scrollIntoView({ block: 'center' });
      el.focus({ preventScroll: true });
    });
  }, [compose]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Home</h1>
        <span className="text-xs font-medium text-txt-subtle">
          {modeLabel}
          {filterCount > 0 && ` · ${filterCount} filter${filterCount === 1 ? '' : 's'}`}
        </span>
      </div>
      <StoryBar />
      {/* INT-03: the gentle reminder promised by onboarding's Skip button. */}
      {me && interestsOf(state, me.id).length < LIMITS.interestsMin && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-100 bg-brand-50/40 p-4">
          <p className="text-sm text-slate-600">
            Pick at least {LIMITS.interestsMin} interests to get better people (and cabin) suggestions.
          </p>
          <Link to="/settings" className="btn-primary shrink-0">Add interests</Link>
        </div>
      )}
      <PostComposer />
      {ready ? (
        <InfiniteFeed
          items={feed.items}
          hasMore={feed.hasMore}
          onLoadMore={feed.loadMore}
          empty={me ? <SuggestedFollows exclude={me.id} /> : null}
        />
      ) : (
        <FeedSkeleton n={3} />
      )}
    </div>
  );
}
