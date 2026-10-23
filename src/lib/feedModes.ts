/**
 * Feed modes + feed filters — UI Design TRD §6.2 TOP-01/TOP-03.
 *
 * Pure UI-layer selectors composed from the existing store selectors; the
 * store itself is untouched (TRD §0: keep data logic working). Mode and
 * filters live in the URL (?feed=, ?type=, ?time=, ?ints=), so a switch is a
 * shareable, reload-safe SPA navigation with no full-page reload.
 */
import { exploreScore, interestsOf, selectExploreFeed, selectFollowingFeed, sharedInterestCount } from './store';
import type { AppState, FeedItem, FeedPage, Post } from '../types';

/* ── TOP-01: For you / Popular / Latest / Trending ─────────────────────── */

export type FeedMode = 'for-you' | 'popular' | 'latest' | 'trending';

export const FEED_MODES: ReadonlyArray<{ id: FeedMode; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'popular', label: 'Popular' },
  { id: 'latest', label: 'Latest' },
  { id: 'trending', label: 'Trending' },
];

export function normalizeFeedMode(raw: string | null | undefined): FeedMode {
  return FEED_MODES.some((m) => m.id === raw) ? (raw as FeedMode) : 'for-you';
}

/** URL keys owned by the top bar (carried when cross-linking into /home). */
export const FEED_FILTER_KEYS = ['type', 'time', 'ints'] as const;

/** Offset page size for the ranked modes (matches LIMITS.feedPageSize). */
const PAGE = 20;

function offsetPage(items: FeedItem[], cursor: string | null, limit: number): FeedPage {
  const start = cursor ? parseInt(cursor, 10) || 0 : 0;
  const page = items.slice(start, start + limit);
  return { items: page, nextCursor: start + limit < items.length ? String(start + limit) : null };
}

/** Engagement (FEED-2) + shared-interest signal (INT-07) for "For you". */
function forYouScore(state: AppState, viewerId: string, item: FeedItem): number {
  return exploreScore(item.post) + sharedInterestCount(state, viewerId, item.post.authorId) * 3;
}

/** The whole Following set (paged at the store's default size, so the
 *  literal-typed limit parameter never gets overloaded). */
function allFollowing(state: AppState, viewerId: string): FeedItem[] {
  const items: FeedItem[] = [];
  let cursor: string | null = null;
  do {
    const page: FeedPage = selectFollowingFeed(state, viewerId, cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return items;
}

/**
 * The home feed in one TOP-01 mode. Latest/trending delegate straight to the
 * shipped selectors (their cursor shapes stay theirs); for-you/popular
 * re-rank the full Following set and page by offset.
 */
export function selectHomeFeed(
  state: AppState,
  viewerId: string,
  mode: FeedMode,
  cursor: string | null,
): FeedPage {
  if (mode === 'latest') return selectFollowingFeed(state, viewerId, cursor);
  if (mode === 'trending') return selectExploreFeed(state, viewerId, cursor);

  const all = allFollowing(state, viewerId);
  const ranked =
    mode === 'popular'
      ? [...all].sort(
          (a, b) => b.post.likeCount - a.post.likeCount || b.post.createdAt.localeCompare(a.post.createdAt),
        )
      : [...all].sort(
          (a, b) =>
            forYouScore(state, viewerId, b) - forYouScore(state, viewerId, a) ||
            b.post.createdAt.localeCompare(a.post.createdAt),
        );
  return offsetPage(ranked, cursor, PAGE);
}

/* ── TOP-03: filter by interests, content type, and time ───────────────── */

export type PostTypeFilter = 'all' | 'photos' | 'video' | 'text';
export type TimeFilter = 'any' | 'day' | 'week';

export const TYPE_FILTERS: ReadonlyArray<{ id: PostTypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'video', label: 'Video' },
  { id: 'text', label: 'Text' },
];

export const TIME_FILTERS: ReadonlyArray<{ id: TimeFilter; label: string }> = [
  { id: 'any', label: 'Any time' },
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'This week' },
];

export interface FeedFilters {
  type: PostTypeFilter;
  time: TimeFilter;
  /** Selected interest ids (INT-02) — posts by people carrying any of them. */
  interests: string[];
}

export const DEFAULT_FILTERS: FeedFilters = { type: 'all', time: 'any', interests: [] };

/** Validate URL params into filters (unknown values fall back to defaults). */
export function readFeedFilters(params: URLSearchParams): FeedFilters {
  const type = params.get('type');
  const time = params.get('time');
  return {
    type: TYPE_FILTERS.some((t) => t.id === type) ? (type as PostTypeFilter) : 'all',
    time: TIME_FILTERS.some((t) => t.id === time) ? (time as TimeFilter) : 'any',
    interests: (params.get('ints') ?? '').split(',').filter(Boolean),
  };
}

/** Serialise mode + filters into a URL search string (feed-param only). */
export function writeFeedParams(feed: FeedMode, f: FeedFilters): string {
  const p = new URLSearchParams();
  if (feed !== 'for-you') p.set('feed', feed);
  if (f.type !== 'all') p.set('type', f.type);
  if (f.time !== 'any') p.set('time', f.time);
  if (f.interests.length) p.set('ints', f.interests.join(','));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** How many TOP-03 constraints are on (badge on the filter button). */
export function feedFilterCount(f: FeedFilters): number {
  return (f.type !== 'all' ? 1 : 0) + (f.time !== 'any' ? 1 : 0) + f.interests.length;
}

function matchesType(post: Post, t: PostTypeFilter): boolean {
  if (t === 'photos') return post.imageUrls.length > 0;
  if (t === 'video') return post.videoUrl !== null;
  if (t === 'text') return post.imageUrls.length === 0 && post.videoUrl === null;
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filter a page's items; the page cursor is kept (hasMore stays truthful —
 *  a page may simply render fewer rows when filters are on). */
export function filterFeedItems(state: AppState, items: FeedItem[], f: FeedFilters): FeedItem[] {
  if (f.type === 'all' && f.time === 'any' && f.interests.length === 0) return items;
  const wanted = new Set(f.interests);
  const cutoff =
    f.time === 'day' ? Date.now() - DAY_MS : f.time === 'week' ? Date.now() - 7 * DAY_MS : 0;
  return items.filter(({ post }) => {
    if (!matchesType(post, f.type)) return false;
    if (cutoff && new Date(post.createdAt).getTime() < cutoff) return false;
    if (wanted.size) {
      const theirs = new Set(interestsOf(state, post.authorId));
      let hit = false;
      for (const id of wanted) {
        if (theirs.has(id)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    return true;
  });
}
