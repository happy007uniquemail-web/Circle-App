import { Hash } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import { selectHashtagFeed, useAppState } from '../lib/store';

/** `/hashtag/:tag` — every live post carrying this tag, newest first (F-HAS). */
export default function Hashtag() {
  const { tag = '' } = useParams<{ tag: string }>();
  const state = useAppState();
  const feed = useInfiniteFeed((cursor) => selectHashtagFeed(state, state.session?.id ?? null, tag, cursor));

  return (
    <div className="space-y-4">
      <header className="card flex items-center gap-3 p-5">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white">
          <Hash size={22} />
        </span>
        <div>
          <h1 className="text-lg font-bold">#{tag.toLowerCase()}</h1>
          <p className="text-xs text-slate-500">
            {feed.items.length} post{feed.items.length === 1 ? '' : 's'} in your timeline
          </p>
        </div>
        <Link to="/explore" className="btn-ghost ml-auto text-xs">Explore</Link>
      </header>

      <InfiniteFeed
        items={feed.items}
        hasMore={feed.hasMore}
        onLoadMore={feed.loadMore}
        empty={
          <div className="card p-8 text-center text-sm text-slate-500">
            <p>
              No posts with <b className="text-brand-600">#{tag.toLowerCase()}</b> yet — be the first to use it.
            </p>
            <Link to="/home" className="btn-primary mt-3 inline-flex">Create the first post</Link>
          </div>
        }
      />
    </div>
  );
}
