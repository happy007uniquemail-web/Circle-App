import { UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import PostComposer from '../components/PostComposer';
import Avatar from '../components/Avatar';
import FollowButton from '../components/FollowButton';
import StoryBar from '../components/Stories';
import { currentUserProfile, isFollowing, selectFollowingFeed, useAppState } from '../lib/store';

/** Suggested accounts — mitigates the "empty feed for new users" risk (PRD §11). */
function SuggestedFollows({ exclude }: { exclude: string }) {
  const state = useAppState();
  const suggestions = state.profiles
    .filter((p) => p.username && p.id !== exclude && !p.isSuspended && !isFollowing(state, exclude, p.id))
    .slice(0, 5);

  return (
    <div className="card p-5">
      <h2 className="font-semibold">Your feed is just getting started</h2>
      <p className="mt-1 text-sm text-slate-600">Follow a few people and their newest posts show up here.</p>
      <ul className="mt-4 space-y-3">
        {suggestions.map((p) => (
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

/** `/home` — reverse-chronological Following feed, 20 per page (FEED-1). */
export default function Home() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const feed = useInfiniteFeed((cursor) => (me ? selectFollowingFeed(state, me.id, cursor) : { items: [], nextCursor: null }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Home</h1>
        <span className="text-xs font-medium text-slate-400">Following · newest first</span>
      </div>
      <StoryBar />
      <PostComposer />
      <InfiniteFeed
        items={feed.items}
        hasMore={feed.hasMore}
        onLoadMore={feed.loadMore}
        empty={me ? <SuggestedFollows exclude={me.id} /> : null}
      />
    </div>
  );
}
