/**
 * Data layer (v2).
 *
 * `DataProvider` is the single contract every page talks to. The bundled
 * implementation is `DemoProvider` (localStorage metadata + IndexedDB video
 * blobs, runs fully offline). A `SupabaseProvider` implementing the same
 * contract plugs in via env config — see README.
 *
 * Reads go through reactive selectors over `getSnapshot()` (instant
 * optimistic UI); query methods exist for the remote provider.
 */
import { useSyncExternalStore } from 'react';
import type {
  AppNotification,
  AppState,
  Block,
  Comment,
  Conversation,
  FeedItem,
  FeedPage,
  Follow,
  MediaKind,
  Message,
  Post,
  Profile,
  Report,
  ReportReason,
  ReportTarget,
  Repost,
  Result,
  Save,
  SessionUser,
  Story,
} from '../types';
import { LIMITS } from '../types';
import { avatarFor, countLinks, extractHashtags, svgImage } from './format';
import { deleteVideo } from './media';
import { checkLimit } from './rateLimit';

export type { Result };

export interface OnboardingInput {
  username: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
}

export interface ConversationResult extends Result {
  conversationId?: string;
}

export interface StoryInput {
  kind: MediaKind | 'text';
  media: string | null;
  caption: string;
}

export interface DataProvider {
  subscribe(cb: () => void): () => void;
  getSnapshot(): AppState;
  signInWithGoogle(): Result;
  signInDemoAdmin(): Result;
  signOut(): Result;
  completeOnboarding(input: OnboardingInput): Result;
  updateProfile(input: OnboardingInput): Result;
  deleteAccount(): Result;
  createPost(body: string, imageUrls: string[], videoUrl?: string | null): Result;
  editPost(postId: string, body: string): Result;
  deletePost(postId: string): Result;
  toggleLike(postId: string): Result;
  toggleRepost(postId: string): Result;
  toggleSave(postId: string): Result;
  addComment(postId: string, body: string, imageUrls?: string[]): Result;
  deleteComment(commentId: string): Result;
  toggleFollow(userId: string): Result;
  blockUser(userId: string): Result;
  unblockUser(userId: string): Result;
  submitReport(targetType: ReportTarget, targetId: string, reason: ReportReason, details: string | null): Result;
  resolveReport(reportId: string, status: 'dismissed' | 'actioned'): Result;
  markNotificationsRead(): Result;
  setSuspended(userId: string, suspended: boolean): Result;
  createStory(input: StoryInput): Result;
  deleteStory(storyId: string): Result;
  startConversation(otherId: string): ConversationResult;
  sendMessage(conversationId: string, body: string, media: { kind: MediaKind; ref: string } | null, postId: string | null): Result;
  markConversationRead(conversationId: string): Result;
  getFollowingFeed(cursor: string | null, limit?: number): FeedPage;
  getExploreFeed(cursor: string | null, limit?: number): FeedPage;
  searchUsers(q: string, limit?: number): Profile[];
  /** DEV-only: fabricates an incoming like/comment/follow to exercise realtime UI. */
  simulateIncomingActivity(): string | null;
}

const STORAGE_KEY = 'circle.state.v1';
const HOUR = 3600_000;
const now = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ------------------------------------------------------------------ seed */

const SEED_PEOPLE: Array<Omit<Profile, 'avatarUrl' | 'createdAt'>> = [
  { id: 'p_admin', username: 'admin', displayName: 'Circle Admin', bio: 'Keeping the circle healthy. Report spam and harassment anytime.', role: 'admin', isSuspended: false },
  { id: 'p_maya', username: 'maya', displayName: 'Maya Chen', bio: 'Product designer. I draw interfaces and drink too much coffee ☕', role: 'user', isSuspended: false },
  { id: 'p_omar', username: 'omar', displayName: 'Omar Rivera', bio: 'Frontend engineer, weekend photographer 📷', role: 'user', isSuspended: false },
  { id: 'p_lena', username: 'lena', displayName: 'Lena Park', bio: 'Trail runner | cat person | amateur baker', role: 'user', isSuspended: false },
  { id: 'p_sam', username: 'sam', displayName: 'Sam Okafor', bio: 'Building tiny tools. Opinions are my own.', role: 'user', isSuspended: false },
  { id: 'p_ari', username: 'ari', displayName: 'Ari Costa', bio: 'Musician & sound designer 🎧', role: 'user', isSuspended: false },
  { id: 'p_nina', username: 'nina', displayName: 'Nina Kowalski', bio: 'Data by day, watercolors by night', role: 'user', isSuspended: false },
  { id: 'p_dev', username: 'dev', displayName: 'Dev Patel', bio: 'Reading the internet so you don’t have to.', role: 'user', isSuspended: false },
  { id: 'p_zoe', username: 'zoe', displayName: 'Zoe Adams', bio: 'Urban gardener 🌱 sharing balcony harvests', role: 'user', isSuspended: false },
];

const IMG = (label: string, from: string, to: string) => svgImage(label, from, to);

const SEED_POSTS: Array<{ a: number; body: string; h: number; imgs?: string[] }> = [
  { a: 1, body: 'Spent the morning redesigning an onboarding flow. Friction hides in the tiniest fields — one fewer input can lift completion dramatically. #design #ux', h: 2, imgs: [IMG('Onboarding sketches', '#6366f1', '#ec4899')] },
  { a: 2, body: 'Golden hour ride along the river tonight. No filter needed when the sky does the work for you. #photography', h: 5, imgs: [IMG('Golden hour', '#f59e0b', '#ef4444'), IMG('River trail', '#0ea5e9', '#6366f1')] },
  { a: 3, body: 'Ran my first 21k! Legs are done, brain is wired. Thanks to everyone who cheered me on this week 🏃‍♀️ #running', h: 9 },
  { a: 4, body: 'Shipped a tiny CLI today that renames files by regex. 60 lines. Sometimes the best feature is the one you don’t build. #dev', h: 14 },
  { a: 5, body: 'New track almost done — recorded the whole thing with a $30 mic and a blanket fort. Constraints are good for creativity. #music', h: 20, imgs: [IMG('Blanket fort studio', '#8b5cf6', '#0ea5e9')] },
  { a: 6, body: 'Painted the same bridge four times this month. Each version teaches me something new about light. #art', h: 26, imgs: [IMG('Bridge study #4', '#ec4899', '#f59e0b')] },
  { a: 7, body: 'Thread: 7 links that changed how I think about attention this year. Bookmark this one. #focus', h: 31 },
  { a: 8, body: 'First tomato of the season! Grown on a 4th-floor balcony in a bucket. Gardening is basically engineering with dirt. #gardening', h: 38, imgs: [IMG('First tomato', '#10b981', '#f59e0b')] },
  { a: 2, body: 'Hot take: every app needs a keyboard shortcut for its most common action. Fight me in the replies.', h: 44 },
  { a: 1, body: 'A design system is only as good as its worst component. Auditing ours this week and the buttons are *not* okay. #designsystems', h: 50, imgs: [IMG('Component audit', '#6366f1', '#0ea5e9')] },
  { a: 4, body: 'Reminder: you can delete half your config and nothing breaks. Usually. #dev', h: 58 },
  { a: 3, body: 'Meal-prepped 12 containers for the week. Future me is already grateful.', h: 66 },
  { a: 5, body: 'Played an open mic last night. Nerves were terrible, the set was great. Do the scared thing anyway. #music', h: 74 },
  { a: 6, body: 'Watercolor tip: let the paper do the blending. The more you touch it, the muddier it gets. #art #watercolor', h: 84, imgs: [IMG('Wet-on-wet', '#0ea5e9', '#10b981')] },
  { a: 8, body: 'Composting on a balcony: layer greens and browns, turn it weekly, and nobody believes it’s apartment compost. #gardening', h: 96 },
  { a: 0, body: 'Housekeeping: reports are reviewed within 48 hours. Be specific in the details field — it helps us act faster.', h: 100 },
  { a: 7, body: 'Read three papers on sleep this weekend. Conclusion: consistent wake time beats extra hours in bed. #health', h: 110 },
  { a: 2, body: 'Took my camera to the night market. Long exposures of noodle steam might be my favorite thing now. #photography', h: 130, imgs: [IMG('Night market', '#8b5cf6', '#ec4899'), IMG('Noodle steam', '#f59e0b', '#8b5cf6')] },
  { a: 1, body: 'Unpopular opinion: most “dark patterns” are just lazy copy. Write the honest button label. #design', h: 150 },
  { a: 4, body: 'Debugging tip of the day: explain the bug out loud to an empty chair. The chair is a great reviewer. #dev', h: 170 },
  { a: 3, body: 'Trail race recap: mud, one wrong turn, two high-fives, zero regrets. #running', h: 200 },
  { a: 5, body: 'Mixing drums at 2am is a slippery slope. Sending the final tonight, I promise. #music', h: 240 },
  { a: 6, body: 'Sketchbook tour coming this weekend — 40 pages of city scenes from last month. #art', h: 300 },
  { a: 8, body: 'Balcony harvest haul: 6 tomatoes, a handful of basil, and one extremely smug zucchini. #gardening', h: 400, imgs: [IMG('Harvest haul', '#10b981', '#f59e0b')] },
];

const SEED_COMMENTS: Array<{ p: number; a: number; body: string; h: number }> = [
  { p: 0, a: 4, body: 'One fewer input is basically a feature. Agreed! #design', h: 1 },
  { p: 0, a: 7, body: 'Would love a write-up on how you measured completion lift.', h: 1 },
  { p: 1, a: 6, body: 'That second shot is unreal. What lens? #photography', h: 4 },
  { p: 2, a: 1, body: '21k!! Congratulations 🎉', h: 8 },
  { p: 2, a: 8, body: 'Huge. Recovery week now, please.', h: 8 },
  { p: 3, a: 2, body: '60 lines and zero dependencies — love to see it.', h: 13 },
  { p: 4, a: 5, body: 'Blanket fort acoustics are criminally underrated.', h: 19 },
  { p: 6, a: 3, body: 'Saved. The one on single-tasking hit hard.', h: 30 },
  { p: 7, a: 1, body: 'A bucket tomato!! Congrats 🍅', h: 37 },
  { p: 8, a: 4, body: 'Ctrl+K or riot.', h: 43 },
  { p: 9, a: 3, body: 'The buttons are never okay.', h: 49 },
  { p: 13, a: 6, body: 'Saving this — my blends always go muddy.', h: 83 },
  { p: 17, a: 8, body: 'Night market long exposures = chef’s kiss.', h: 129 },
  { p: 18, a: 7, body: '“Write the honest button label” should be a poster.', h: 149 },
  { p: 21, a: 0, body: 'Reminder: keep DMs out of scope for MVP 😉', h: 239 },
];

/** Small deterministic PRNG so seeds are stable across reloads. */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildSeed(): AppState {
  const rng = makeRng(42);
  const profiles: Profile[] = SEED_PEOPLE.map((p) => ({
    ...p,
    avatarUrl: avatarFor(p.id, p.displayName),
    createdAt: new Date(Date.now() - 400 * 24 * HOUR).toISOString(),
  }));

  const posts: Post[] = SEED_POSTS.map((p, i) => ({
    id: `seed_post_${i}`,
    authorId: profiles[p.a]!.id,
    body: p.body,
    imageUrls: p.imgs ?? [],
    videoUrl: null,
    hashtags: extractHashtags(p.body),
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(Date.now() - p.h * HOUR).toISOString(),
  }));

  const comments: Comment[] = [];
  const likes: Array<{ userId: string; postId: string; createdAt: string }> = [];

  posts.forEach((post, i) => {
    const others = profiles.filter((p) => p.id !== post.authorId && p.role !== 'admin');
    const count = Math.floor(rng() * 6);
    for (let k = 0; k < count && k < others.length; k++) {
      const liker = others[Math.floor(rng() * others.length)]!;
      if (likes.some((l) => l.userId === liker.id && l.postId === post.id)) continue;
      likes.push({ userId: liker.id, postId: post.id, createdAt: post.createdAt });
    }
    post.likeCount = likes.filter((l) => l.postId === post.id).length;
    const seedComments = SEED_COMMENTS.filter((c) => c.p === i);
    seedComments.forEach((c, j) => {
      comments.push({
        id: `seed_c_${i}_${j}`,
        postId: post.id,
        authorId: profiles[c.a]!.id,
        body: c.body,
        imageUrls: [],
        createdAt: new Date(Date.now() - c.h * HOUR).toISOString(),
      });
    });
    post.commentCount = seedComments.length;
  });

  // Reposts (F-REP) — denormalized counts stay in sync.
  const reposts: Repost[] = [
    { userId: 'p_omar', postId: 'seed_post_0', createdAt: new Date(Date.now() - 90 * 60_000).toISOString() },
    { userId: 'p_nina', postId: 'seed_post_2', createdAt: new Date(Date.now() - 5 * HOUR).toISOString() },
  ];
  for (const r of reposts) {
    const p = posts.find((x) => x.id === r.postId);
    if (p) p.repostCount += 1;
  }

  const reports: Report[] = [
    { id: uid(), reporterId: 'p_dev', targetType: 'post', targetId: 'seed_post_10', reason: 'spam', details: 'Repeated promotional replies.', status: 'open', createdAt: new Date(Date.now() - 20 * HOUR).toISOString() },
    { id: uid(), reporterId: 'p_lena', targetType: 'comment', targetId: 'seed_c_8_0', reason: 'harassment', details: 'Rude tone toward the author.', status: 'open', createdAt: new Date(Date.now() - 6 * HOUR).toISOString() },
    { id: uid(), reporterId: 'p_maya', targetType: 'user', targetId: 'p_dev', reason: 'other', details: 'Possible bot account, posting identical links.', status: 'open', createdAt: new Date(Date.now() - 2 * HOUR).toISOString() },
  ];

  // Welcome followers + stories + a demo DM thread for the first-time user (p_you).
  const follows: Follow[] = [
    { followerId: 'p_maya', followingId: 'p_you', createdAt: new Date(Date.now() - 3 * HOUR).toISOString() },
    { followerId: 'p_omar', followingId: 'p_you', createdAt: new Date(Date.now() - 40 * 60_000).toISOString() },
  ];
  const notifications: AppNotification[] = [
    { id: uid(), recipientId: 'p_you', actorId: 'p_omar', type: 'follow', postId: null, readAt: null, createdAt: new Date(Date.now() - 40 * 60_000).toISOString() },
    { id: uid(), recipientId: 'p_you', actorId: 'p_maya', type: 'follow', postId: null, readAt: null, createdAt: new Date(Date.now() - 3 * HOUR).toISOString() },
  ];

  const stories: Story[] = [
    { id: uid(), userId: 'p_maya', kind: 'image', media: IMG('Desk refresh ✨', '#6366f1', '#ec4899'), caption: 'New setup, who dis?', createdAt: new Date(Date.now() - 2 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 22 * HOUR).toISOString() },
    { id: uid(), userId: 'p_lena', kind: 'image', media: IMG('Sunrise miles', '#f59e0b', '#ef4444'), caption: '10k before breakfast 🏃‍♀️', createdAt: new Date(Date.now() - 5 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 19 * HOUR).toISOString() },
    { id: uid(), userId: 'p_sam', kind: 'text', media: null, caption: 'Shipping something small but mighty today 🚢', createdAt: new Date(Date.now() - 7 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 17 * HOUR).toISOString() },
    { id: uid(), userId: 'p_zoe', kind: 'image', media: IMG('Balcony jungle', '#10b981', '#0ea5e9'), caption: 'The basil is taking over', createdAt: new Date(Date.now() - 11 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 13 * HOUR).toISOString() },
  ];

  const conversations: Conversation[] = [
    { id: 'conv_maya_you', memberIds: ['p_you', 'p_maya'], createdAt: new Date(Date.now() - 2 * HOUR).toISOString() },
  ];
  const messages: Message[] = [
    { id: uid(), conversationId: 'conv_maya_you', senderId: 'p_you', body: 'Hey Maya! Loved your onboarding post — one fewer field really does change everything.', mediaKind: null, mediaRef: null, postId: null, createdAt: new Date(Date.now() - 95 * 60_000).toISOString(), readAt: new Date(Date.now() - 90 * 60_000).toISOString() },
    { id: uid(), conversationId: 'conv_maya_you', senderId: 'p_maya', body: 'Right?! Welcome to Circle 🎉 Ask me anything about the design system.', mediaKind: null, mediaRef: null, postId: null, createdAt: new Date(Date.now() - 80 * 60_000).toISOString(), readAt: new Date(Date.now() - 70 * 60_000).toISOString() },
    { id: uid(), conversationId: 'conv_maya_you', senderId: 'p_maya', body: 'Also — this thread is worth a read, saving it here for you 📌', mediaKind: null, mediaRef: null, postId: 'seed_post_18', createdAt: new Date(Date.now() - 12 * 60_000).toISOString(), readAt: null },
  ];

  const saves: Save[] = [
    { userId: 'p_you', postId: 'seed_post_2', createdAt: new Date(Date.now() - 6 * HOUR).toISOString() },
  ];

  return {
    session: null,
    profiles,
    posts,
    comments,
    likes,
    follows,
    reposts,
    saves,
    blocks: [],
    stories,
    notifications,
    reports,
    conversations,
    messages,
    extrasV2: true,
  };
}

/** Patch for states created by v1: fill new tables + seed demo extras once. */
function migrateV2(state: AppState): AppState {
  const next: AppState = {
    ...state,
    reposts: state.reposts ?? [],
    saves: state.saves ?? [],
    stories: state.stories ?? [],
    conversations: state.conversations ?? [],
    messages: state.messages ?? [],
    // v1 rows → v2 shapes (fill fields that didn't exist in v1)
    posts: (state.posts ?? []).map((p) => ({
      ...p,
      videoUrl: p.videoUrl ?? null,
      hashtags: p.hashtags ?? extractHashtags(p.body),
      repostCount: p.repostCount ?? 0,
    })),
    comments: (state.comments ?? []).map((c) => ({ ...c, imageUrls: c.imageUrls ?? [] })),
  };
  if (next.extrasV2) return next;

  const hasYou = next.profiles.some((p) => p.id === 'p_you');
  next.reposts = next.reposts.length ? next.reposts : [
    { userId: 'p_omar', postId: next.posts[0]?.id ?? '', createdAt: new Date(Date.now() - 90 * 60_000).toISOString() },
  ].filter((r) => r.postId);
  next.stories = next.stories.length ? next.stories : [
    { id: uid(), userId: 'p_maya', kind: 'image' as const, media: IMG('Desk refresh ✨', '#6366f1', '#ec4899'), caption: 'New setup, who dis?', createdAt: new Date(Date.now() - 2 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 22 * HOUR).toISOString() },
    { id: uid(), userId: 'p_lena', kind: 'image' as const, media: IMG('Sunrise miles', '#f59e0b', '#ef4444'), caption: '10k before breakfast 🏃‍♀️', createdAt: new Date(Date.now() - 5 * HOUR).toISOString(), expiresAt: new Date(Date.now() + 19 * HOUR).toISOString() },
  ];
  if (hasYou && !next.conversations.length) {
    next.conversations = [{ id: 'conv_maya_you', memberIds: ['p_you', 'p_maya'], createdAt: new Date(Date.now() - 2 * HOUR).toISOString() }];
    next.messages = [
      { id: uid(), conversationId: 'conv_maya_you', senderId: 'p_maya', body: 'Hey! Welcome to Circle 🎉 — this thread works like any other chat.', mediaKind: null, mediaRef: null, postId: null, createdAt: new Date(Date.now() - 80 * 60_000).toISOString(), readAt: null },
    ];
    next.saves = next.saves.length ? next.saves : [{ userId: 'p_you', postId: next.posts[0]?.id ?? '', createdAt: new Date(Date.now() - 6 * HOUR).toISOString() }].filter((s) => s.postId);
  }
  next.extrasV2 = true;
  return next;
}

/* ------------------------------------------------------------- selectors */

export function isBlockedPair(state: AppState, a: string, b: string): boolean {
  return state.blocks.some(
    (x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a),
  );
}

export function blockedIdsFor(state: AppState, userId: string): Set<string> {
  const set = new Set<string>();
  for (const b of state.blocks) {
    if (b.blockerId === userId) set.add(b.blockedId);
    if (b.blockedId === userId) set.add(b.blockerId);
  }
  return set;
}

export function currentUserProfile(state: AppState): Profile | null {
  if (!state.session) return null;
  return state.profiles.find((p) => p.id === state.session!.id) ?? null;
}

export function profileById(state: AppState, id: string): Profile | null {
  return state.profiles.find((p) => p.id === id) ?? null;
}

export function profileByUsername(state: AppState, username: string): Profile | null {
  const u = username.toLowerCase();
  return state.profiles.find((p) => p.username?.toLowerCase() === u) ?? null;
}

/** Live posts visible to `viewer`: not deleted, author active, blocks enforced (FEED-4). */
export function visiblePosts(state: AppState, viewerId: string | null): Post[] {
  const blocked = viewerId ? blockedIdsFor(state, viewerId) : new Set<string>();
  return state.posts
    .filter((p) => !p.deletedAt)
    .filter((p) => {
      const author = profileById(state, p.authorId);
      return author && !author.isSuspended && !blocked.has(p.authorId);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

interface TimedItem {
  item: FeedItem;
  ts: string;
  key: string;
}

function pageOf(entries: TimedItem[], cursor: string | null, limit: number): FeedPage {
  const filtered = cursor
    ? entries.filter((e) => e.ts < cursor.split('~')[0]! || (e.ts === cursor.split('~')[0]! && e.key < cursor.split('~')[1]!))
    : entries;
  const page = filtered.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((e) => e.item),
    nextCursor: filtered.length > page.length && last ? `${last.ts}~${last.key}` : null,
  };
}

/**
 * Following feed (FEED-1 + F-REP): own posts + posts from followed users,
 * merged with their reposts. When both exist for one post, the later event
 * wins so nothing renders twice. Reverse-chronological, 20 per page.
 */
export function selectFollowingFeed(state: AppState, viewerId: string, cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
  const following = new Set(state.follows.filter((f) => f.followerId === viewerId).map((f) => f.followingId));
  following.add(viewerId);
  const posts = visiblePosts(state, viewerId);

  const best = new Map<string, TimedItem>();
  const offer = (e: TimedItem) => {
    const prev = best.get(e.key);
    if (!prev || e.ts > prev.ts) best.set(e.key, e);
  };

  for (const post of posts) {
    if (following.has(post.authorId)) {
      offer({ item: { post, reposterId: null, repostedAt: null }, ts: post.createdAt, key: post.id });
    }
  }
  const postById = new Map(posts.map((p) => [p.id, p]));
  for (const r of state.reposts) {
    if (!following.has(r.userId)) continue;
    const post = postById.get(r.postId);
    if (!post) continue;
    offer({ item: { post, reposterId: r.userId, repostedAt: r.createdAt }, ts: r.createdAt, key: post.id });
  }

  const entries = [...best.values()].sort((a, b) => (a.ts === b.ts ? b.key.localeCompare(a.key) : b.ts.localeCompare(a.ts)));
  return pageOf(entries, cursor, limit);
}

/** Engagement score over the last 7 days (FEED-2 + F-REP boost). */
export function exploreScore(post: Post): number {
  const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / HOUR;
  const fresh = Math.max(0, 1 - ageHours / (7 * 24));
  return post.likeCount + post.commentCount * 2 + post.repostCount * 3 + fresh * 5;
}

export function selectExploreFeed(state: AppState, viewerId: string | null, cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
  const items = visiblePosts(state, viewerId)
    .slice()
    .sort((a, b) => exploreScore(b) - exploreScore(a) || b.createdAt.localeCompare(a.createdAt));
  const start = cursor ? parseInt(cursor, 10) || 0 : 0;
  const page = items.slice(start, start + limit);
  return {
    items: page.map((post) => ({ post, reposterId: null, repostedAt: null })),
    nextCursor: start + limit < items.length ? String(start + limit) : null,
  };
}

export function selectAuthorFeed(state: AppState, viewerId: string | null, authorId: string, cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
  const entries: TimedItem[] = visiblePosts(state, viewerId)
    .filter((p) => p.authorId === authorId)
    .map((post) => ({ item: { post, reposterId: null, repostedAt: null }, ts: post.createdAt, key: post.id }));
  return pageOf(entries, cursor, limit);
}

/** Hashtag feed (F-HAS): case-insensitive tag match with body fallback. */
export function selectHashtagFeed(state: AppState, viewerId: string | null, rawTag: string, cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
  const tag = rawTag.toLowerCase().replace(/^#/, '');
  const entries: TimedItem[] = visiblePosts(state, viewerId)
    .filter((p) => p.hashtags.includes(tag) || new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p.body))
    .map((post) => ({ item: { post, reposterId: null, repostedAt: null }, ts: post.createdAt, key: post.id }));
  return pageOf(entries, cursor, limit);
}

/** Trending hashtags over the last 7 days (F-HAS). */
export function trendingHashtags(state: AppState, viewerId: string | null, top = 10): Array<{ tag: string; count: number }> {
  const cutoff = Date.now() - 7 * 24 * HOUR;
  const counts = new Map<string, number>();
  for (const p of visiblePosts(state, viewerId)) {
    if (new Date(p.createdAt).getTime() < cutoff) continue;
    for (const t of p.hashtags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, top);
}

export function selectSavedFeed(state: AppState, viewerId: string, cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
  const saved = state.saves.filter((s) => s.userId === viewerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const byId = new Map(visiblePosts(state, viewerId).map((p) => [p.id, p]));
  const entries: TimedItem[] = [];
  for (const s of saved) {
    const post = byId.get(s.postId);
    if (post) entries.push({ item: { post, reposterId: null, repostedAt: null }, ts: s.createdAt, key: post.id });
  }
  return pageOf(entries, cursor, limit);
}

export function selectSearchUsers(state: AppState, viewerId: string | null, q: string, limit = 20): Profile[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const blocked = viewerId ? blockedIdsFor(state, viewerId) : new Set<string>();
  return state.profiles
    .filter((p) => p.username && !p.isSuspended && !blocked.has(p.id))
    .filter((p) => p.username!.toLowerCase().startsWith(query) || p.displayName.toLowerCase().startsWith(query))
    .sort((a, b) => a.username!.length - b.username!.length)
    .slice(0, limit);
}

/** Active (non-expired) stories grouped by author, newest authors first (F-STO). */
export function activeStories(state: AppState, viewerId: string | null): Array<{ profile: Profile; stories: Story[] }> {
  const blocked = viewerId ? blockedIdsFor(state, viewerId) : new Set<string>();
  const live = state.stories.filter(
    (s) => new Date(s.expiresAt).getTime() > Date.now() && !blocked.has(s.userId),
  );
  const groups = new Map<string, Story[]>();
  for (const s of live) {
    const author = profileById(state, s.userId);
    if (!author || author.isSuspended) continue;
    groups.set(s.userId, [...(groups.get(s.userId) ?? []), s]);
  }
  const result = [...groups.entries()].map(([userId, stories]) => ({
    profile: profileById(state, userId)!,
    stories: stories.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));
  result.sort((a, b) => {
    if (a.profile.id === viewerId) return -1;
    if (b.profile.id === viewerId) return 1;
    const aLast = a.stories[a.stories.length - 1]!.createdAt;
    const bLast = b.stories[b.stories.length - 1]!.createdAt;
    return bLast.localeCompare(aLast);
  });
  return result;
}

/* --- social graph / engagement counts --- */
export function followerCount(state: AppState, userId: string): number {
  return state.follows.filter((f) => f.followingId === userId).length;
}
export function followingCount(state: AppState, userId: string): number {
  return state.follows.filter((f) => f.followerId === userId).length;
}
export function isFollowing(state: AppState, me: string, them: string): boolean {
  return state.follows.some((f) => f.followerId === me && f.followingId === them);
}
export function hasLiked(state: AppState, me: string | null, postId: string): boolean {
  if (!me) return false;
  return state.likes.some((l) => l.userId === me && l.postId === postId);
}
export function hasReposted(state: AppState, me: string | null, postId: string): boolean {
  if (!me) return false;
  return state.reposts.some((r) => r.userId === me && r.postId === postId);
}
export function hasSaved(state: AppState, me: string | null, postId: string): boolean {
  if (!me) return false;
  return state.saves.some((s) => s.userId === me && s.postId === postId);
}
export function unreadCount(state: AppState, userId: string): number {
  return state.notifications.filter((n) => n.recipientId === userId && !n.readAt).length;
}
export function selectNotifications(state: AppState, userId: string) {
  return state.notifications
    .filter((n) => n.recipientId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* --- messaging selectors (F-DM) --- */
export interface ConversationView {
  conversation: Conversation;
  other: Profile;
  lastMessage: Message | null;
  unread: number;
}

export function conversationsFor(state: AppState, meId: string): ConversationView[] {
  const rows: ConversationView[] = [];
  for (const c of state.conversations) {
    if (!c.memberIds.includes(meId)) continue;
    const otherId = c.memberIds.find((m) => m !== meId)!;
    const other = profileById(state, otherId);
    if (!other) continue;
    const msgs = state.messages
      .filter((m) => m.conversationId === c.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = msgs[msgs.length - 1] ?? null;
    rows.push({
      conversation: c,
      other,
      lastMessage: last,
      unread: msgs.filter((m) => m.senderId !== meId && !m.readAt).length,
    });
  }
  return rows.sort((a, b) => (b.lastMessage?.createdAt ?? b.conversation.createdAt).localeCompare(a.lastMessage?.createdAt ?? a.conversation.createdAt));
}

export function unreadConversationCount(state: AppState, meId: string): number {
  return conversationsFor(state, meId).filter((c) => c.unread > 0).length;
}

export function threadMessages(state: AppState, conversationId: string): Message[] {
  return state.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/* ---------------------------------------------------------------- provider */

const EMPTY_STATE: AppState = {
  session: null, profiles: [], posts: [], comments: [], likes: [],
  follows: [], reposts: [], saves: [], blocks: [], stories: [],
  notifications: [], reports: [], conversations: [], messages: [],
};

const CANNED_COMMENTS = [
  'This made my day 😄',
  'Saving this one. Great write-up!',
  'Ok but this is genuinely useful 👏',
  'How did you pull this off?',
  'Underrated take, honestly.',
];

export class DemoProvider implements DataProvider {
  private state: AppState = EMPTY_STATE;
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.load();
          this.emit(); // cross-tab realtime sync (F-RT)
        }
      });
    }
  }

  /* --- persistence --- */
  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = migrateV2(JSON.parse(raw) as AppState);
        this.state = { ...EMPTY_STATE, ...parsed };
        this.purgeExpired();
        return;
      }
    } catch {
      /* corrupted store → reseed */
    }
    this.state = buildSeed();
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Circle: local storage write failed (quota?)', e);
    }
  }

  /** Posts purge 30 days after soft delete (POST-4); stories expire after 24 h (F-STO). */
  private purgeExpired() {
    const nowTs = Date.now();
    const cutoff = nowTs - 30 * 24 * HOUR;
    const doomed = this.state.posts.filter((p) => p.deletedAt && new Date(p.deletedAt).getTime() < cutoff);
    const expiredStories = this.state.stories.filter((s) => new Date(s.expiresAt).getTime() < nowTs);
    if (!doomed.length && !expiredStories.length) return;
    const ids = new Set(doomed.map((p) => p.id));
    this.state = {
      ...this.state,
      posts: this.state.posts.filter((p) => !ids.has(p.id)),
      comments: this.state.comments.filter((c) => !ids.has(c.postId)),
      likes: this.state.likes.filter((l) => !ids.has(l.postId)),
      reposts: this.state.reposts.filter((r) => !ids.has(r.postId)),
      saves: this.state.saves.filter((s) => !ids.has(s.postId)),
      stories: this.state.stories.filter((s) => !expiredStories.includes(s)),
    };
    for (const p of doomed) if (p.videoUrl) void deleteVideo(p.videoUrl);
    this.persist();
  }

  private commit(next: Partial<AppState>) {
    this.state = { ...this.state, ...next };
    this.persist();
    this.emit();
  }

  private emit() {
    for (const cb of this.listeners) cb();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): AppState => this.state;

  private me(): Profile | null {
    return currentUserProfile(this.state);
  }

  private requireAuth(): Result {
    if (!this.state.session) return { ok: false, error: 'Please sign in first.' };
    return { ok: true };
  }

  private requireActive(): Result {
    const auth = this.requireAuth();
    if (!auth.ok) return auth;
    const me = this.me();
    if (!me) return { ok: false, error: 'Profile not found.' };
    if (me.isSuspended) return { ok: false, error: 'Your account is suspended. Contact support.' };
    return { ok: true };
  }

  /** Spam guard (F-SAF): same content by the same author inside 10 minutes. */
  private isDuplicate(authorId: string, text: string): boolean {
    const norm = text.trim().toLowerCase();
    if (norm.length < 8) return false;
    const recent = Date.now() - 10 * 60_000;
    const hit = (t: string, at: string) => t.trim().toLowerCase() === norm && new Date(at).getTime() > recent;
    return (
      this.state.posts.some((p) => p.authorId === authorId && hit(p.body, p.createdAt)) ||
      this.state.comments.some((c) => c.authorId === authorId && hit(c.body, c.createdAt)) ||
      this.state.messages.some((m) => m.senderId === authorId && hit(m.body, m.createdAt))
    );
  }

  /* --- auth (AUTH-1..6) --- */
  signInWithGoogle(): Result {
    const id = 'p_you';
    let profile = this.state.profiles.find((p) => p.id === id);
    if (!profile) {
      // Trigger equivalent: first Google sign-in auto-creates the profile row (AUTH-2).
      profile = {
        id,
        username: null, // → routed to onboarding (PRD §5.3 step 6)
        displayName: 'Jordan Lee',
        bio: '',
        avatarUrl: avatarFor(id, 'Jordan Lee'),
        role: 'user',
        isSuspended: false,
        createdAt: now(),
      };
      this.commit({ profiles: [...this.state.profiles, profile] });
    }
    const session: SessionUser = {
      id,
      email: 'jordan.lee@gmail.com',
      name: profile.displayName,
      picture: profile.avatarUrl,
    };
    this.commit({ session });
    return { ok: true };
  }

  signInDemoAdmin(): Result {
    const session: SessionUser = {
      id: 'p_admin',
      email: 'admin@circle.app',
      name: 'Circle Admin',
      picture: avatarFor('p_admin', 'Circle Admin'),
    };
    this.commit({ session });
    return { ok: true };
  }

  signOut(): Result {
    this.commit({ session: null });
    return { ok: true };
  }

  /* --- onboarding / profile (PROF-1..4, MOD-5) --- */
  completeOnboarding(input: OnboardingInput): Result {
    const auth = this.requireAuth();
    if (!auth.ok) return auth;
    return this.applyProfileUpdate(this.state.session!.id, input, true);
  }

  updateProfile(input: OnboardingInput): Result {
    const auth = this.requireAuth();
    if (!auth.ok) return auth;
    return this.applyProfileUpdate(this.state.session!.id, input, false);
  }

  private applyProfileUpdate(userId: string, input: OnboardingInput, isNew: boolean): Result {
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(input.username)) {
      return { ok: false, error: 'Username must be 3–20 letters, numbers, or underscores.' };
    }
    if (input.displayName.trim().length < 1 || input.displayName.length > LIMITS.displayNameMax) {
      return { ok: false, error: `Display name must be 1–${LIMITS.displayNameMax} characters.` };
    }
    if (input.bio.length > LIMITS.bioMax) return { ok: false, error: `Bio must be ${LIMITS.bioMax} characters or fewer.` };
    const taken = this.state.profiles.some(
      (p) => p.id !== userId && p.username?.toLowerCase() === input.username.toLowerCase(),
    );
    if (taken) return { ok: false, error: 'That username is already taken.' };

    const profiles = this.state.profiles.map((p) =>
      p.id === userId
        ? {
            ...p,
            username: input.username,
            displayName: input.displayName.trim(),
            bio: input.bio.trim(),
            avatarUrl: input.avatarUrl?.trim() || p.avatarUrl,
          }
        : p,
    );
    this.commit({ profiles });
    if (isNew && this.state.session) {
      const me = profiles.find((p) => p.id === userId)!;
      this.commit({ session: { ...this.state.session, name: me.displayName, picture: me.avatarUrl } });
    }
    return { ok: true };
  }

  deleteAccount(): Result {
    const auth = this.requireAuth();
    if (!auth.ok) return auth;
    const id = this.state.session!.id;
    // Mirrors `on delete cascade` across every table incl. v2 (AUTH-6).
    for (const p of this.state.posts.filter((x) => x.authorId === id)) {
      if (p.videoUrl) void deleteVideo(p.videoUrl);
    }
    for (const s of this.state.stories.filter((x) => x.userId === id)) {
      if (s.kind === 'video' && s.media) void deleteVideo(s.media);
    }
    const myConvs = this.state.conversations.filter((c) => c.memberIds.includes(id)).map((c) => c.id);
    this.commit({
      session: null,
      profiles: this.state.profiles.filter((p) => p.id !== id),
      posts: this.state.posts.filter((p) => p.authorId !== id),
      comments: this.state.comments.filter((c) => c.authorId !== id),
      likes: this.state.likes.filter((l) => l.userId !== id),
      follows: this.state.follows.filter((f) => f.followerId !== id && f.followingId !== id),
      reposts: this.state.reposts.filter((r) => r.userId !== id),
      saves: this.state.saves.filter((s) => s.userId !== id),
      blocks: this.state.blocks.filter((b) => b.blockerId !== id && b.blockedId !== id),
      stories: this.state.stories.filter((s) => s.userId !== id),
      notifications: this.state.notifications.filter((n) => n.recipientId !== id && n.actorId !== id),
      reports: this.state.reports.filter((r) => r.reporterId !== id),
      conversations: this.state.conversations.filter((c) => !c.memberIds.includes(id)),
      messages: this.state.messages.filter((m) => !myConvs.includes(m.conversationId)),
    });
    return { ok: true };
  }

  /* --- posts (POST-1..5, MOD-4, F-VID, F-HAS, F-SAF) --- */
  createPost(body: string, imageUrls: string[], videoUrl: string | null = null): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    if (!checkLimit('post', 5, 10 * 60_000)) return { ok: false, error: 'Slow down — posting limit reached (5 per 10 min).' };
    const text = body.trim();
    if (text.length > LIMITS.postMax) return { ok: false, error: `Posts must be ${LIMITS.postMax} characters or fewer.` };
    if (!text && !imageUrls.length && !videoUrl) return { ok: false, error: 'Posts need text, a photo, or a video.' };
    if (imageUrls.length > LIMITS.imagesPerPost) return { ok: false, error: `Up to ${LIMITS.imagesPerPost} images per post.` };
    if (videoUrl && imageUrls.length) return { ok: false, error: 'A post has either a video or photos — not both.' };
    if (countLinks(text) > LIMITS.linksPerPost) return { ok: false, error: `At most ${LIMITS.linksPerPost} links per post.` };
    const hashtags = extractHashtags(text);
    if ((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > LIMITS.hashtagsPerPost) {
      return { ok: false, error: `At most ${LIMITS.hashtagsPerPost} hashtags per post.` };
    }
    if (this.isDuplicate(this.state.session!.id, text)) return { ok: false, error: 'Looks like you just posted that.' };

    const post: Post = {
      id: uid(),
      authorId: this.state.session!.id,
      body: text,
      imageUrls,
      videoUrl,
      hashtags,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      editedAt: null,
      deletedAt: null,
      createdAt: now(),
    };
    this.commit({ posts: [post, ...this.state.posts] });
    return { ok: true };
  }

  editPost(postId: string, body: string): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (post.authorId !== this.state.session!.id) return { ok: false, error: 'You can only edit your own posts.' };
    const text = body.trim();
    if (text.length > LIMITS.postMax) return { ok: false, error: `Posts must be ${LIMITS.postMax} characters or fewer.` };
    if (!text && !post.imageUrls.length && !post.videoUrl) return { ok: false, error: 'Posts need text, a photo, or a video.' };
    this.commit({
      posts: this.state.posts.map((p) =>
        p.id === postId ? { ...p, body: text, hashtags: extractHashtags(text), editedAt: now() } : p,
      ),
    });
    return { ok: true };
  }

  deletePost(postId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: 'Post not found.' };
    const isAdmin = this.me()?.role === 'admin';
    if (post.authorId !== this.state.session!.id && !isAdmin) return { ok: false, error: 'Not allowed.' };
    this.commit({ posts: this.state.posts.map((p) => (p.id === postId ? { ...p, deletedAt: now() } : p)) });
    return { ok: true };
  }

  /* --- engagement (ENG-1..4) --- */
  toggleLike(postId: string): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (isBlockedPair(this.state, me, post.authorId)) return { ok: false, error: 'You cannot interact with this user.' };

    const liked = this.state.likes.some((l) => l.userId === me && l.postId === postId);
    const likes = liked
      ? this.state.likes.filter((l) => !(l.userId === me && l.postId === postId))
      : [{ userId: me, postId, createdAt: now() }, ...this.state.likes];

    const posts = this.state.posts.map((p) =>
      p.id === postId ? { ...p, likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)) } : p,
    );
    let notifications = this.state.notifications;
    if (!liked && post.authorId !== me) {
      notifications = [
        { id: uid(), recipientId: post.authorId, actorId: me, type: 'like' as const, postId, readAt: null, createdAt: now() },
        ...notifications,
      ];
    }
    this.commit({ posts, likes, notifications });
    return { ok: true };
  }

  addComment(postId: string, body: string, imageUrls: string[] = []): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    if (!checkLimit('comment', 20, 10 * 60_000)) return { ok: false, error: 'Slow down — commenting limit reached.' };
    const me = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (isBlockedPair(this.state, me, post.authorId)) return { ok: false, error: 'You cannot interact with this user.' };
    const text = body.trim();
    if (text.length > LIMITS.commentMax) return { ok: false, error: `Comments must be ${LIMITS.commentMax} characters or fewer.` };
    if (!text && !imageUrls.length) return { ok: false, error: 'Comments need text or a photo.' };
    if (imageUrls.length > LIMITS.imagesPerComment) return { ok: false, error: `Up to ${LIMITS.imagesPerComment} photos per comment.` };
    if (text && this.isDuplicate(me, text)) return { ok: false, error: 'Looks like you just sent that.' };

    const comment: Comment = { id: uid(), postId, authorId: me, body: text, imageUrls, createdAt: now() };
    const notifications =
      post.authorId === me
        ? this.state.notifications
        : [
            { id: uid(), recipientId: post.authorId, actorId: me, type: 'comment' as const, postId, readAt: null, createdAt: now() },
            ...this.state.notifications,
          ];
    this.commit({
      comments: [comment, ...this.state.comments],
      posts: this.state.posts.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)),
      notifications,
    });
    return { ok: true };
  }

  deleteComment(commentId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const comment = this.state.comments.find((c) => c.id === commentId);
    if (!comment) return { ok: false, error: 'Comment not found.' };
    const me = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === comment.postId);
    const isPostOwner = post?.authorId === me;
    const isAdmin = this.me()?.role === 'admin';
    if (comment.authorId !== me && !isPostOwner && !isAdmin) return { ok: false, error: 'Not allowed.' };
    this.commit({
      comments: this.state.comments.filter((c) => c.id !== commentId),
      posts: this.state.posts.map((p) =>
        p.id === comment.postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
      ),
    });
    return { ok: true };
  }

  /* --- reposts & saves (F-REP, F-SAV) --- */
  toggleRepost(postId: string): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (post.authorId === me) return { ok: false, error: 'You cannot repost your own post.' };
    if (isBlockedPair(this.state, me, post.authorId)) return { ok: false, error: 'You cannot interact with this user.' };

    const existing = this.state.reposts.find((r) => r.userId === me && r.postId === postId);
    if (existing) {
      this.commit({
        reposts: this.state.reposts.filter((r) => !(r.userId === me && r.postId === postId)),
        posts: this.state.posts.map((p) => (p.id === postId ? { ...p, repostCount: Math.max(0, p.repostCount - 1) } : p)),
      });
      return { ok: true };
    }
    const row: Repost = { userId: me, postId, createdAt: now() };
    const notifications =
      post.authorId === me
        ? this.state.notifications
        : [
            { id: uid(), recipientId: post.authorId, actorId: me, type: 'repost' as const, postId, readAt: null, createdAt: now() },
            ...this.state.notifications,
          ];
    this.commit({
      reposts: [row, ...this.state.reposts],
      posts: this.state.posts.map((p) => (p.id === postId ? { ...p, repostCount: p.repostCount + 1 } : p)),
      notifications,
    });
    return { ok: true };
  }

  toggleSave(postId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    const existing = this.state.saves.find((s) => s.userId === me && s.postId === postId);
    if (existing) {
      this.commit({ saves: this.state.saves.filter((s) => !(s.userId === me && s.postId === postId)) });
      return { ok: true };
    }
    // Saves are private — no notification (F-SAV).
    this.commit({ saves: [{ userId: me, postId, createdAt: now() }, ...this.state.saves] });
    return { ok: true };
  }

  /* --- social graph (FOL-1..3, MOD-3) --- */
  toggleFollow(userId: string): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    if (me === userId) return { ok: false, error: 'You cannot follow yourself.' };
    if (isBlockedPair(this.state, me, userId)) return { ok: false, error: 'You cannot follow this user.' };
    const target = profileById(this.state, userId);
    if (!target?.username) return { ok: false, error: 'Profile not found.' };
    if (!checkLimit('follow', 30, 10 * 60_000)) return { ok: false, error: 'Slow down — follow limit reached.' };

    const existing = this.state.follows.find((f) => f.followerId === me && f.followingId === userId);
    if (existing) {
      this.commit({ follows: this.state.follows.filter((f) => !(f.followerId === me && f.followingId === userId)) });
      return { ok: true };
    }
    const follow: Follow = { followerId: me, followingId: userId, createdAt: now() };
    const notifications = [
      { id: uid(), recipientId: userId, actorId: me, type: 'follow' as const, postId: null, readAt: null, createdAt: now() },
      ...this.state.notifications,
    ];
    this.commit({ follows: [follow, ...this.state.follows], notifications });
    return { ok: true };
  }

  blockUser(userId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    if (me === userId) return { ok: false, error: 'You cannot block yourself.' };
    const block: Block = { blockerId: me, blockedId: userId, createdAt: now() };
    const severedConvs = this.state.conversations
      .filter((c) => c.memberIds.length === 2 && c.memberIds.includes(me) && c.memberIds.includes(userId))
      .map((c) => c.id);
    this.commit({
      blocks: [...this.state.blocks, block],
      // Blocking severs follows both ways and hides the shared DM thread (F-SAF).
      // Feed/stories visibility is enforced by blockedIdsFor(), so other users'
      // rows (reposts, saves) are left untouched.
      follows: this.state.follows.filter(
        (f) => !((f.followerId === me && f.followingId === userId) || (f.followerId === userId && f.followingId === me)),
      ),
      conversations: this.state.conversations.filter((c) => !severedConvs.includes(c.id)),
      messages: this.state.messages.filter((m) => !severedConvs.includes(m.conversationId)),
    });
    return { ok: true };
  }

  unblockUser(userId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    this.commit({ blocks: this.state.blocks.filter((b) => !(b.blockerId === this.state.session!.id && b.blockedId === userId)) });
    return { ok: true };
  }

  /* --- safety (MOD-1..2) --- */
  submitReport(targetType: ReportTarget, targetId: string, reason: ReportReason, details: string | null): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const report: Report = {
      id: uid(),
      reporterId: this.state.session!.id,
      targetType,
      targetId,
      reason,
      details: details?.slice(0, 500) ?? null,
      status: 'open',
      createdAt: now(),
    };
    this.commit({ reports: [report, ...this.state.reports] });
    return { ok: true };
  }

  resolveReport(reportId: string, status: 'dismissed' | 'actioned'): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    if (this.me()?.role !== 'admin') return { ok: false, error: 'Admins only.' };
    this.commit({ reports: this.state.reports.map((r) => (r.id === reportId ? { ...r, status } : r)) });
    return { ok: true };
  }

  setSuspended(userId: string, suspended: boolean): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    if (this.me()?.role !== 'admin') return { ok: false, error: 'Admins only.' };
    this.commit({ profiles: this.state.profiles.map((p) => (p.id === userId ? { ...p, isSuspended: suspended } : p)) });
    return { ok: true };
  }

  /* --- stories (F-STO) --- */
  createStory(input: StoryInput): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    if (!checkLimit('story', 10, 60 * 60_000)) return { ok: false, error: 'Story limit reached (10 per hour).' };
    const caption = input.caption.trim().slice(0, LIMITS.storyCaptionMax);
    if (input.kind === 'text' && !caption) return { ok: false, error: 'Text stories need a caption.' };
    if (input.kind !== 'text' && !input.media) return { ok: false, error: 'Pick a photo or video first.' };
    const story: Story = {
      id: uid(),
      userId: this.state.session!.id,
      kind: input.kind,
      media: input.kind === 'text' ? null : input.media,
      caption,
      createdAt: now(),
      expiresAt: new Date(Date.now() + LIMITS.storyTtlMs).toISOString(), // 24 h TTL
    };
    this.commit({ stories: [story, ...this.state.stories] });
    return { ok: true };
  }

  deleteStory(storyId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const story = this.state.stories.find((s) => s.id === storyId);
    if (!story) return { ok: false, error: 'Story not found.' };
    if (story.userId !== this.state.session!.id && this.me()?.role !== 'admin') return { ok: false, error: 'Not allowed.' };
    if (story.kind === 'video' && story.media) void deleteVideo(story.media);
    this.commit({ stories: this.state.stories.filter((s) => s.id !== storyId) });
    return { ok: true };
  }

  /* --- direct messaging (F-DM) --- */
  startConversation(otherId: string): ConversationResult {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    if (me === otherId) return { ok: false, error: 'You cannot message yourself.' };
    if (isBlockedPair(this.state, me, otherId)) return { ok: false, error: 'You cannot message a blocked user.' };
    const other = profileById(this.state, otherId);
    if (!other?.username) return { ok: false, error: 'User not found.' };

    const existing = this.state.conversations.find((c) => c.memberIds.length === 2 && c.memberIds.includes(me) && c.memberIds.includes(otherId));
    if (existing) return { ok: true, conversationId: existing.id };

    const conversation: Conversation = { id: uid(), memberIds: [me, otherId], createdAt: now() };
    this.commit({ conversations: [conversation, ...this.state.conversations] });
    return { ok: true, conversationId: conversation.id };
  }

  sendMessage(conversationId: string, body: string, media: { kind: MediaKind; ref: string } | null, postId: string | null): Result {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    const conv = this.state.conversations.find((c) => c.id === conversationId);
    if (!conv || !conv.memberIds.includes(me)) return { ok: false, error: 'This conversation is not available.' };
    if (!checkLimit('dm', 20, 10 * 60_000)) return { ok: false, error: 'Slow down — messaging limit reached (20 per 10 min).' };

    const otherId = conv.memberIds.find((m) => m !== me)!;
    if (isBlockedPair(this.state, me, otherId)) return { ok: false, error: 'You cannot message a blocked user.' };

    const text = body.trim().slice(0, LIMITS.dmMax);
    if (!text && !media && !postId) return { ok: false, error: 'Write a message first.' };
    if (postId && !this.state.posts.some((p) => p.id === postId && !p.deletedAt)) return { ok: false, error: 'That post is gone.' };
    if (text && this.isDuplicate(me, text)) return { ok: false, error: 'Looks like you just sent that.' };

    const message: Message = {
      id: uid(),
      conversationId,
      senderId: me,
      body: text,
      mediaKind: media?.kind ?? null,
      mediaRef: media?.ref ?? null,
      postId,
      createdAt: now(),
      readAt: null,
    };
    this.commit({ messages: [...this.state.messages, message] });
    return { ok: true };
  }

  markConversationRead(conversationId: string): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    this.commit({
      messages: this.state.messages.map((m) =>
        m.conversationId === conversationId && m.senderId !== me && !m.readAt ? { ...m, readAt: now() } : m,
      ),
    });
    return { ok: true };
  }

  /* --- notifications (NOT-1..2) --- */
  markNotificationsRead(): Result {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const me = this.state.session!.id;
    this.commit({
      notifications: this.state.notifications.map((n) => (n.recipientId === me && !n.readAt ? { ...n, readAt: now() } : n)),
    });
    return { ok: true };
  }

  /* --- feeds & search (FEED-1..4) --- */
  getFollowingFeed(cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
    const me = this.state.session?.id;
    if (!me) return { items: [], nextCursor: null };
    return selectFollowingFeed(this.state, me, cursor, limit);
  }

  getExploreFeed(cursor: string | null, limit = LIMITS.feedPageSize): FeedPage {
    return selectExploreFeed(this.state, this.state.session?.id ?? null, cursor, limit);
  }

  searchUsers(q: string, limit = 20): Profile[] {
    return selectSearchUsers(this.state, this.state.session?.id ?? null, q, limit);
  }

  /**
   * DEV realtime demo (F-RT): fabricates an incoming like/comment/repost/follow
   * from a real seeded profile so notification UI updates live, exactly as it
   * would over Supabase Realtime in production.
   */
  simulateIncomingActivity(): string | null {
    const me = this.state.session?.id;
    if (!me) return null;
    const actors = this.state.profiles.filter(
      (p) => p.id !== me && p.username && !p.isSuspended && !isBlockedPair(this.state, me, p.id),
    );
    if (!actors.length) return null;
    const actor = actors[Math.floor(Math.random() * actors.length)]!;
    const myPosts = this.state.posts.filter((p) => p.authorId === me && !p.deletedAt);
    const roll = Math.random();

    if (myPosts.length && roll < 0.75) {
      const post = myPosts[Math.floor(Math.random() * myPosts.length)]!;
      if (roll < 0.4) {
        if (this.state.likes.some((l) => l.userId === actor.id && l.postId === post.id)) return null;
        this.commit({
          likes: [{ userId: actor.id, postId: post.id, createdAt: now() }, ...this.state.likes],
          posts: this.state.posts.map((p) => (p.id === post.id ? { ...p, likeCount: p.likeCount + 1 } : p)),
          notifications: [
            { id: uid(), recipientId: me, actorId: actor.id, type: 'like', postId: post.id, readAt: null, createdAt: now() },
            ...this.state.notifications,
          ],
        });
        return `${actor.displayName} liked your post`;
      }
      if (roll < 0.65) {
        const body = CANNED_COMMENTS[Math.floor(Math.random() * CANNED_COMMENTS.length)]!;
        if (this.isDuplicate(actor.id, body)) return null;
        this.commit({
          comments: [{ id: uid(), postId: post.id, authorId: actor.id, body, imageUrls: [], createdAt: now() }, ...this.state.comments],
          posts: this.state.posts.map((p) => (p.id === post.id ? { ...p, commentCount: p.commentCount + 1 } : p)),
          notifications: [
            { id: uid(), recipientId: me, actorId: actor.id, type: 'comment', postId: post.id, readAt: null, createdAt: now() },
            ...this.state.notifications,
          ],
        });
        return `${actor.displayName} commented on your post`;
      }
      if (this.state.reposts.some((r) => r.userId === actor.id && r.postId === post.id)) return null;
      this.commit({
        reposts: [{ userId: actor.id, postId: post.id, createdAt: now() }, ...this.state.reposts],
        posts: this.state.posts.map((p) => (p.id === post.id ? { ...p, repostCount: p.repostCount + 1 } : p)),
        notifications: [
          { id: uid(), recipientId: me, actorId: actor.id, type: 'repost', postId: post.id, readAt: null, createdAt: now() },
          ...this.state.notifications,
        ],
      });
      return `${actor.displayName} reposted your post`;
    }

    if (this.state.follows.some((f) => f.followerId === actor.id && f.followingId === me)) return null;
    this.commit({
      follows: [{ followerId: actor.id, followingId: me, createdAt: now() }, ...this.state.follows],
      notifications: [
        { id: uid(), recipientId: me, actorId: actor.id, type: 'follow', postId: null, readAt: null, createdAt: now() },
        ...this.state.notifications,
      ],
    });
    return `${actor.displayName} followed you`;
  }
}

/* ----------------------------------------------------------------- react */

export const provider: DataProvider = new DemoProvider();

// Dev hook: lets e2e/debug tooling exercise the data layer directly.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __circle: DataProvider }).__circle = provider;
}

/** Reactive access to app state (useSyncExternalStore). */
export function useAppState(): AppState {
  return useSyncExternalStore(provider.subscribe, provider.getSnapshot, provider.getSnapshot);
}

/** Convenience for mutations in components. */
export function useActions(): DataProvider {
  return provider;
}

/** Reactive like/save/repost flags for the current user. */
export function useHasLiked(postId: string): boolean {
  const state = useAppState();
  return hasLiked(state, state.session?.id ?? null, postId);
}
export function useHasSaved(postId: string): boolean {
  const state = useAppState();
  return hasSaved(state, state.session?.id ?? null, postId);
}
export function useHasReposted(postId: string): boolean {
  const state = useAppState();
  return hasReposted(state, state.session?.id ?? null, postId);
}
