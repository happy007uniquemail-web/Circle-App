import { Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import InfiniteFeed, { useInfiniteFeed } from '../components/InfiniteFeed';
import { currentUserProfile, selectSavedFeed, useAppState } from '../lib/store';

/** `/saved` — the user's private bookmark collection (F-SAV). */
export default function Saved() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const feed = useInfiniteFeed((cursor) => (me ? selectSavedFeed(state, me.id, cursor) : { items: [], nextCursor: null }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Bookmark size={18} className="text-amber-500" /> Saved
        </h1>
        <span className="text-xs font-medium text-slate-400">private · only you can see this</span>
      </div>

      <InfiniteFeed
        items={feed.items}
        hasMore={feed.hasMore}
        onLoadMore={feed.loadMore}
        empty={
          <div className="card p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-500">
              <Bookmark size={22} />
            </div>
            <h2 className="mt-3 font-semibold">Nothing saved yet</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tap the bookmark on any post to keep it here — photos and videos included.
            </p>
            <Link to="/explore" className="btn-primary mt-4 inline-flex">Browse posts</Link>
          </div>
        }
      />
    </div>
  );
}
