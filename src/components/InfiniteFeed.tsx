import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FeedItem, FeedPage } from '../types';
import { useAppState } from '../lib/store';
import PostCard from './PostCard';

/**
 * Cursor-based infinite scroll helper: keeps the cursor of every loaded page,
 * re-derives all pages from the latest snapshot on each change (fresh counts),
 * and merges them into one list (FEED-1, 20 items per page).
 */
export function useInfiniteFeed(makePage: (cursor: string | null) => FeedPage) {
  const state = useAppState();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);

  const chunks: FeedItem[][] = [];
  let nextCursor: string | null = null;
  for (const cursor of cursors) {
    const page = makePage(cursor);
    chunks.push(page.items);
    nextCursor = page.nextCursor;
  }

  return {
    items: chunks.flat(),
    hasMore: nextCursor !== null,
    loadMore: () => {
      if (nextCursor !== null) {
        const cursor = nextCursor;
        setCursors((prev) => [...prev, cursor]);
      }
    },
    reset: () => setCursors([null]),
    /** Re-derive from scratch when the underlying dataset changes shape. */
    state,
  };
}

/** Memoized card — identity of `item` is the render gate (F-OPT). */
const MemoPostCard = memo(PostCard);

interface Props {
  items: FeedItem[];
  hasMore: boolean;
  onLoadMore: () => void;
  empty?: ReactNode;
  loadingLabel?: string;
}

/** Renders posts + a sentinel that auto-loads the next page. */
export default function InfiniteFeed({ items, hasMore, onLoadMore, empty, loadingLabel = 'Loading more…' }: Props) {
  const sentinel = useRef<HTMLDivElement>(null);
  const callback = useRef(onLoadMore);
  callback.current = onLoadMore;

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { rootMargin: '400px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length === 0, hasMore]);

  if (items.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MemoPostCard key={item.post.id} item={item} />
      ))}
      {hasMore && (
        <div ref={sentinel} className="py-6 text-center text-sm text-slate-400" aria-live="polite">
          {loadingLabel}
        </div>
      )}
      {!hasMore && items.length > 0 && <p className="py-6 text-center text-xs text-slate-400">You’re all caught up.</p>}
    </div>
  );
}
