/**
 * Data layer (v2).
 *
 * `DataProvider` is the single contract every page talks to. The only
 * implementation is `SupabaseProvider` (Supabase Auth + PostgREST + Storage
 * + Realtime); the app refuses to boot without backend credentials.
 *
 * Reads go through reactive selectors over `getSnapshot()` (instant
 * optimistic UI); query methods exist for the remote provider.
 */
import { useSyncExternalStore } from 'react';
import type {
  AppNotification,
  AppState,
  Block,
  Cabin,
  CabinInput,
  CabinInterest,
  CabinJoinRequest,
  CabinMember,
  CabinMessage,
  Comment,
  Conversation,
  FeedItem,
  FeedPage,
  Follow,
  Interest,
  LikeRow,
  MediaKind,
  Message,
  Mute,
  Post,
  PrivacyInput,
  Profile,
  Report,
  ReportReason,
  ReportTarget,
  Repost,
  Result,
  Save,
  Story,
  UserInterest,
} from '../types';
import { LIMITS } from '../types';
import { countLinks, extractHashtags } from './format';
import { friendlyError, supabase, deleteMediaUrls, uploadImages, uploadRef } from './supabase';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

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

/** Some actions resolve synchronously; network-backed ones return a Promise. */
export type MaybePromise<T> = T | Promise<T>;

export interface DataProvider {
  subscribe(cb: () => void): () => void;
  getSnapshot(): AppState;
  signInWithGoogle(): MaybePromise<Result>;
  signUpWithEmail(email: string, password: string): MaybePromise<Result>;
  signInWithEmail(email: string, password: string): MaybePromise<Result>;
  signOut(): MaybePromise<Result>;
  completeOnboarding(input: OnboardingInput): MaybePromise<Result>;
  updateProfile(input: OnboardingInput): MaybePromise<Result>;
  deleteAccount(): MaybePromise<Result>;
  createPost(body: string, imageUrls: string[], videoUrl?: string | null): MaybePromise<Result>;
  editPost(postId: string, body: string): MaybePromise<Result>;
  deletePost(postId: string): MaybePromise<Result>;
  toggleLike(postId: string): MaybePromise<Result>;
  toggleRepost(postId: string): MaybePromise<Result>;
  toggleSave(postId: string): MaybePromise<Result>;
  addComment(postId: string, body: string, imageUrls?: string[]): MaybePromise<Result>;
  deleteComment(commentId: string): MaybePromise<Result>;
  toggleFollow(userId: string): MaybePromise<Result>;
  /** PRV-03: approve/decline a pending follow request (target only). */
  approveFollow(followerId: string): MaybePromise<Result>;
  declineFollow(followerId: string): MaybePromise<Result>;
  blockUser(userId: string): MaybePromise<Result>;
  unblockUser(userId: string): MaybePromise<Result>;
  /** PRV-08: mute/unmute a user's content in my feeds. */
  muteUser(userId: string): MaybePromise<Result>;
  unmuteUser(userId: string): MaybePromise<Result>;
  /** INT-03/05: replace my interest picks (min 3 is the onboarding rule; max 10 is DB-enforced). */
  setInterests(ids: string[]): MaybePromise<Result>;
  /** PRV-01/04/05/06/09: instant-save privacy settings. */
  updatePrivacy(input: PrivacyInput): MaybePromise<Result>;
  submitReport(targetType: ReportTarget, targetId: string, reason: ReportReason, details: string | null): MaybePromise<Result>;
  resolveReport(reportId: string, status: 'dismissed' | 'actioned'): MaybePromise<Result>;
  markNotificationsRead(): MaybePromise<Result>;
  /** Mute/unmute notification categories for the signed-in user (NOT-09). */
  setNotificationMutes(types: string[]): MaybePromise<Result>;
  setSuspended(userId: string, suspended: boolean): MaybePromise<Result>;
  createStory(input: StoryInput): MaybePromise<Result>;
  deleteStory(storyId: string): MaybePromise<Result>;
  startConversation(otherId: string): MaybePromise<ConversationResult>;
  sendMessage(conversationId: string, body: string, media: { kind: MediaKind; ref: string } | null, postId: string | null): MaybePromise<Result>;
  markConversationRead(conversationId: string): MaybePromise<Result>;
  /* --- cabins (Workstream G: CAB-01..15, CHT-01..14) --- */
  /** CAB-01/02: create; caller becomes owner (server trigger inserts the row). */
  createCabin(input: CabinInput): MaybePromise<Result & { id?: string }>;
  /** CAB-06: owner/admin edit (name, description, image, type, tags). */
  updateCabin(cabinId: string, patch: Partial<CabinInput>): MaybePromise<Result>;
  /** CAB-07: owner-only delete; cascades members/messages/interests. */
  deleteCabin(cabinId: string): MaybePromise<Result>;
  /** CAB-10: join an open cabin instantly (server checks limits/bans). */
  joinCabin(cabinId: string): MaybePromise<Result>;
  /** CAB-13: leave (owner must transfer first — server-enforced). */
  leaveCabin(cabinId: string): MaybePromise<Result>;
  /** CAB-11: request to join a request-type cabin (message ≤200). */
  requestJoin(cabinId: string, message: string): MaybePromise<Result>;
  /** CAB-13: cancel my pending request. */
  cancelCabinRequest(requestId: string): MaybePromise<Result>;
  /** CAB-12: owner/admin approves (server function inserts membership). */
  approveCabinRequest(requestId: string): MaybePromise<Result>;
  /** CAB-12: owner/admin declines; requester is notified. */
  declineCabinRequest(requestId: string): MaybePromise<Result>;
  /** CHT-03/04: send text (≤2000) and/or one compressed image; realtime fan-out. */
  sendCabinMessage(cabinId: string, body: string, imageRef: string | null, replyTo: string | null): MaybePromise<Result & { id?: string }>;
  /** CHT-08: soft delete (sender or admin); body/image become null. */
  deleteCabinMessage(messageId: string): MaybePromise<Result>;
  /** CHT-07: stamp last_read_at = now for my membership row. */
  markCabinRead(cabinId: string): MaybePromise<Result>;
  /** CHT-13: mute/unmute a cabin's notifications (my membership row). */
  muteCabin(cabinId: string, muted: boolean): MaybePromise<Result>;
  /** CHT-12: owner/admin removes a member (not the owner — server guard). */
  removeCabinMember(cabinId: string, userId: string): MaybePromise<Result>;
  /** CHT-12: owner/admin bans; CAB-14 blocks rejoin (server-enforced). */
  banCabinMember(cabinId: string, userId: string): MaybePromise<Result>;
  /** CAB-13: owner transfers ownership to an active member. */
  transferCabinOwnership(cabinId: string, userId: string): MaybePromise<Result>;
  getFollowingFeed(cursor: string | null, limit?: number): MaybePromise<FeedPage>;
  getExploreFeed(cursor: string | null, limit?: number): MaybePromise<FeedPage>;
  searchUsers(q: string, limit?: number): MaybePromise<Profile[]>;
  /** True once initial hydration has finished — pages render skeletons until then (UI-04). */
  ready(): boolean;
  /** Re-run hydration; the Retry action behind error states (UI-06). */
  refresh(): MaybePromise<Result>;
}

const HOUR = 3600_000;
const now = () => new Date().toISOString();

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

/** PRV-08: users this person muted (their content is hidden from their feeds). */
export function mutedIdsFor(state: AppState, userId: string): Set<string> {
  return new Set((state.mutes ?? []).filter((m) => m.muterId === userId).map((m) => m.mutedId));
}

/** PRV-03: a pending follow request from `me` to `them`, if any. */
export function pendingRequest(state: AppState, me: string, them: string): Follow | null {
  return state.follows.find((f) => f.followerId === me && f.followingId === them && f.status === 'pending') ?? null;
}

/** PRV-03/PRV-11: can `viewerId` see `authorId`'s posts? Accepted follows only. */
export function canViewPostsOf(state: AppState, viewerId: string | null, authorId: string): boolean {
  if (!viewerId) return false;
  if (viewerId === authorId) return true;
  const author = profileById(state, authorId);
  const viewer = profileById(state, viewerId);
  if (!author) return false;
  if (viewer?.role === 'admin') return true; // moderation stays complete
  if (author.visibility === 'public' || !author.visibility) return true;
  return isFollowing(state, viewerId, authorId);
}

/** PRV-05: does `otherId`'s DM setting allow `viewerId` to message them? */
export function dmAllows(state: AppState, viewerId: string, otherId: string): boolean {
  const other = profileById(state, otherId);
  const perm = other?.dmPermission ?? 'everyone';
  if (perm === 'everyone') return true;
  if (perm === 'nobody') return false;
  return isFollowing(state, viewerId, otherId);
}

/* ------------------------------------------------ interests (INT-01 … INT-07) */

/** INT-01: the curated catalog this build ships with. */
export function interestCatalog(state: AppState): Interest[] {
  return state.interests ?? [];
}

/** INT-02: interest ids this person picked. */
export function interestsOf(state: AppState, userId: string): string[] {
  return (state.userInterests ?? [])
    .filter((ui) => ui.userId === userId)
    .map((ui) => ui.interestId);
}

/** INT-06: catalog rows for a person's picks (UI respects show_interests). */
export function interestTagsOf(state: AppState, userId: string): Interest[] {
  const picked = new Set(interestsOf(state, userId));
  return interestCatalog(state).filter((i) => picked.has(i.id));
}

/** INT-07: how many interests two people share (suggestion score). */
export function sharedInterestCount(state: AppState, a: string, b: string): number {
  const theirs = new Set(interestsOf(state, b));
  return interestsOf(state, a).filter((id) => theirs.has(id)).length;
}

/**
 * INT-07: people ranked by shared interests, then follower count.
 * Respects PRV-09 (discoverable), PRV-08 (mutes) and blocks; already-followed
 * people drop out. Cabin suggestions (INT-07) land with Workstream G.
 */
export function suggestPeopleByInterests(state: AppState, viewerId: string, limit = 5): Profile[] {
  const blocked = blockedIdsFor(state, viewerId);
  const muted = mutedIdsFor(state, viewerId);
  const following = new Set(
    state.follows
      .filter((f) => f.followerId === viewerId && f.status !== 'pending')
      .map((f) => f.followingId),
  );
  return state.profiles
    .filter(
      (p) =>
        p.username &&
        !p.isSuspended &&
        p.id !== viewerId &&
        !blocked.has(p.id) &&
        !muted.has(p.id) &&
        !following.has(p.id) &&
        p.discoverable !== false,
    )
    .map((p) => ({ p, overlap: sharedInterestCount(state, viewerId, p.id) }))
    .filter((x) => x.overlap > 0)
    .sort((x, y) => y.overlap - x.overlap || followerCount(state, y.p.id) - followerCount(state, x.p.id))
    .slice(0, limit)
    .map((x) => x.p);
}

/* --------------------------------------------------------------- cabins (G) */

export function cabinById(state: AppState, id: string): Cabin | null {
  return (state.cabins ?? []).find((c) => c.id === id) ?? null;
}

/** My membership row for a cabin (any status — includes 'banned', CAB-14). */
export function cabinMembershipOf(state: AppState, cabinId: string, userId: string): CabinMember | null {
  return (state.cabinMembers ?? []).find((m) => m.cabinId === cabinId && m.userId === userId) ?? null;
}

/** Active members of a cabin (member list is member-only on the server). */
export function cabinMembersOf(state: AppState, cabinId: string): CabinMember[] {
  return (state.cabinMembers ?? []).filter((m) => m.cabinId === cabinId && m.status === 'active');
}

/** CAB-01: interest tags attached to a cabin. */
export function cabinInterestTagsOf(state: AppState, cabinId: string): Interest[] {
  const ids = new Set((state.cabinInterests ?? []).filter((ci) => ci.cabinId === cabinId).map((ci) => ci.interestId));
  return interestCatalog(state).filter((i) => ids.has(i.id));
}

/** CAB-02/CHT-12: can this user moderate (owner or admin role, active)? */
export function canModerateCabin(state: AppState, cabinId: string, userId: string | null): boolean {
  if (!userId) return false;
  const m = cabinMembershipOf(state, cabinId, userId);
  return !!m && m.status === 'active' && (m.role === 'owner' || m.role === 'admin');
}

export function isCabinOwner(state: AppState, cabinId: string, userId: string | null): boolean {
  if (!userId) return false;
  const m = cabinMembershipOf(state, cabinId, userId);
  return !!m && m.status === 'active' && m.role === 'owner';
}

/** CHT-07: unread = messages after my last_read_at from other active members. */
export function cabinUnreadCount(state: AppState, cabinId: string, userId: string): number {
  const me = cabinMembershipOf(state, cabinId, userId);
  if (!me || me.status !== 'active') return 0;
  const since = me.lastReadAt;
  return (state.cabinMessages ?? []).filter(
    (m) => m.cabinId === cabinId && !m.isDeleted && m.senderId !== userId && m.createdAt > since,
  ).length;
}

/** Nav badge: total unread across my cabins (CHT-07). */
export function totalCabinUnread(state: AppState, userId: string | null): number {
  if (!userId) return 0;
  return (state.cabinMembers ?? [])
    .filter((m) => m.userId === userId && m.status === 'active')
    .reduce((sum, m) => sum + cabinUnreadCount(state, m.cabinId, userId), 0);
}

/** CAB-12: pending requests for a cabin (owner/admin view). */
export function cabinPendingRequests(state: AppState, cabinId: string): CabinJoinRequest[] {
  return (state.cabinJoinRequests ?? []).filter((r) => r.cabinId === cabinId && r.status === 'pending');
}

/** My pending request on a cabin, if any (CAB-11/13: one at a time). */
export function myCabinRequest(state: AppState, cabinId: string, userId: string | null): CabinJoinRequest | null {
  if (!userId) return null;
  return (
    (state.cabinJoinRequests ?? []).find((r) => r.cabinId === cabinId && r.userId === userId && r.status === 'pending') ?? null
  );
}

/** CAB-05: my owned / joined counts (client mirrors of the DB triggers). */
export function ownedCabinCount(state: AppState, userId: string): number {
  const owned = new Set((state.cabins ?? []).filter((c) => c.ownerId === userId).map((c) => c.id));
  return owned.size;
}

export function joinedCabinCount(state: AppState, userId: string): number {
  return (state.cabinMembers ?? []).filter((m) => m.userId === userId && m.status === 'active').length;
}

/**
 * INT-07 (cabin half): cabins ranked by shared-interest overlap, excluding
 * ones I'm in or was banned from. Open + request cabins both surface (§14 Q4).
 */
export function suggestCabinsByInterests(state: AppState, viewerId: string, limit = 3): Cabin[] {
  const interests = new Set(interestsOf(state, viewerId));
  if (!interests.size) return [];
  return (state.cabins ?? [])
    .filter((c) => {
      const mine = cabinMembershipOf(state, c.id, viewerId);
      return !mine; // not a member and not banned (banned rows must not resurface)
    })
    .map((c) => ({
      c,
      overlap: (state.cabinInterests ?? []).filter((ci) => ci.cabinId === c.id && interests.has(ci.interestId)).length,
    }))
    .filter((x) => x.overlap > 0)
    .sort((x, y) => y.overlap - x.overlap || y.c.memberCount - x.c.memberCount)
    .slice(0, limit)
    .map((x) => x.c);
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
  const muted = viewerId ? mutedIdsFor(state, viewerId) : new Set<string>();
  return state.posts
    .filter((p) => !p.deletedAt)
    .filter((p) => {
      const author = profileById(state, p.authorId);
      if (!author || author.isSuspended || blocked.has(p.authorId)) return false;
      if (muted.has(p.authorId)) return false; // PRV-08
      // PRV-02/PRV-11: mirrors posts_select_visible — followers-only/private
      // authors' posts are hidden from non-followers.
      return canViewPostsOf(state, viewerId, p.authorId);
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
  // PRV-03: pending requests grant no feed access — accepted follows only.
  const following = new Set(state.follows.filter((f) => f.followerId === viewerId && f.status !== 'pending').map((f) => f.followingId));
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
  const muted = viewerId ? mutedIdsFor(state, viewerId) : new Set<string>();
  return state.profiles
    .filter((p) => p.username && !p.isSuspended && !blocked.has(p.id) && !muted.has(p.id))
    .filter((p) => p.discoverable !== false) // PRV-09: non-discoverable excluded from search
    .filter((p) => p.username!.toLowerCase().startsWith(query) || p.displayName.toLowerCase().startsWith(query))
    .sort((a, b) => a.username!.length - b.username!.length)
    .slice(0, limit);
}

/** Active (non-expired) stories grouped by author, newest authors first (F-STO). */
export function activeStories(state: AppState, viewerId: string | null): Array<{ profile: Profile; stories: Story[] }> {
  const blocked = viewerId ? blockedIdsFor(state, viewerId) : new Set<string>();
  const muted = viewerId ? mutedIdsFor(state, viewerId) : new Set<string>();
  const live = state.stories.filter(
    (s) => new Date(s.expiresAt).getTime() > Date.now() && !blocked.has(s.userId) && !muted.has(s.userId),
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
  return state.follows.filter((f) => f.followingId === userId && f.status !== 'pending').length;
}
export function followingCount(state: AppState, userId: string): number {
  return state.follows.filter((f) => f.followerId === userId && f.status !== 'pending').length;
}
export function isFollowing(state: AppState, me: string, them: string): boolean {
  // PRV-03: only accepted follows count; pending requests grant nothing.
  return state.follows.some((f) => f.followerId === me && f.followingId === them && f.status !== 'pending');
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
  return state.notifications.filter((n) => n.recipientId === userId && !n.isRead).length;
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
  notifications: [], reports: [], conversations: [], messages: [], mutedNotifications: [],
};

/* ------------------------------------------------------------- supabase */

type Row = Record<string, unknown>;
const rs = (v: unknown): string => (typeof v === 'string' ? v : '');
const rn = (v: unknown): number => (typeof v === 'number' ? v : 0);
const rOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const rArr = (v: unknown): string[] => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : []);
const rAt = (v: unknown): string => (typeof v === 'string' ? v : now());

const mapProfile = (r: Row): Profile => ({
  id: rs(r.id),
  username: rOrNull(r.username),
  displayName: rs(r.display_name),
  bio: rs(r.bio),
  avatarUrl: rs(r.avatar_url),
  role: r.role === 'admin' ? 'admin' : 'user',
  isSuspended: r.is_suspended === true,
  createdAt: rAt(r.created_at),
  // Workstream E (PRV-01/04/05/06/09): DB rows always carry these; defaults
  // are expressed as undefined-tolerant accessors so seed literals still type-check.
  visibility: (r.visibility as Profile['visibility']) ?? 'public',
  showJoinDate: r.show_join_date !== false,
  showFollowLists: r.show_follow_lists !== false,
  dmPermission: (r.dm_permission as Profile['dmPermission']) ?? 'everyone',
  cabinInvitePermission: (r.cabin_invite_permission as Profile['cabinInvitePermission']) ?? 'everyone',
  discoverable: r.discoverable !== false,
  showInterest: r.show_interests !== false, // INT-06 (PRV-04)
});
const mapPost = (r: Row): Post => ({
  id: rs(r.id),
  authorId: rs(r.author_id),
  body: rs(r.body),
  imageUrls: rArr(r.image_urls),
  videoUrl: rOrNull(r.video_url),
  hashtags: rArr(r.hashtags),
  likeCount: rn(r.like_count),
  commentCount: rn(r.comment_count),
  repostCount: rn(r.repost_count),
  editedAt: rOrNull(r.edited_at),
  deletedAt: rOrNull(r.deleted_at),
  createdAt: rAt(r.created_at),
});
const mapComment = (r: Row): Comment => ({
  id: rs(r.id),
  postId: rs(r.post_id),
  authorId: rs(r.author_id),
  body: rs(r.body),
  imageUrls: rArr(r.image_urls),
  createdAt: rAt(r.created_at),
});
const mapLike = (r: Row): LikeRow => ({ userId: rs(r.user_id), postId: rs(r.post_id), createdAt: rAt(r.created_at) });
const mapFollow = (r: Row): Follow => ({
  followerId: rs(r.follower_id),
  followingId: rs(r.following_id),
  status: r.status === 'pending' ? 'pending' : 'accepted', // PRV-03
  createdAt: rAt(r.created_at),
});

const mapMute = (r: Row): Mute => ({
  muterId: rs(r.muter_id),
  mutedId: rs(r.muted_id),
  createdAt: rAt(r.created_at),
});

const mapInterest = (r: Row): Interest => ({
  id: rs(r.id),
  slug: rs(r.slug),
  name: rs(r.name),
  category: rs(r.category),
  isActive: r.is_active !== false,
});

const mapUserInterest = (r: Row): UserInterest => ({
  userId: rs(r.user_id),
  interestId: rs(r.interest_id),
  createdAt: rAt(r.created_at),
});

const mapCabin = (r: Row): Cabin => ({
  id: rs(r.id),
  name: rs(r.name),
  description: (r.description as string | null) ?? null,
  imageUrl: (r.image_url as string | null) ?? null,
  type: (r.type as Cabin['type']) ?? 'open',
  ownerId: rs(r.owner_id),
  maxMembers: (r.max_members as number) ?? 500,
  memberCount: (r.member_count as number) ?? 0,
  createdAt: rAt(r.created_at),
});

const mapCabinInterest = (r: Row): CabinInterest => ({ cabinId: rs(r.cabin_id), interestId: rs(r.interest_id) });

const mapCabinMember = (r: Row): CabinMember => ({
  cabinId: rs(r.cabin_id),
  userId: rs(r.user_id),
  role: (r.role as CabinMember['role']) ?? 'member',
  status: (r.status as CabinMember['status']) ?? 'active',
  muted: r.muted === true,
  lastReadAt: rAt(r.last_read_at),
  joinedAt: rAt(r.joined_at),
});

const mapCabinRequest = (r: Row): CabinJoinRequest => ({
  id: rs(r.id),
  cabinId: rs(r.cabin_id),
  userId: rs(r.user_id),
  message: (r.message as string | null) ?? null,
  status: (r.status as CabinJoinRequest['status']) ?? 'pending',
  createdAt: rAt(r.created_at),
});

const mapCabinMessage = (r: Row): CabinMessage => ({
  id: rs(r.id),
  cabinId: rs(r.cabin_id),
  senderId: rs(r.sender_id),
  body: (r.body as string | null) ?? null,
  imageUrl: (r.image_url as string | null) ?? null,
  replyTo: (r.reply_to as string | null) ?? null,
  isDeleted: r.is_deleted === true,
  createdAt: rAt(r.created_at),
});
const mapSave = (r: Row): Save => ({ userId: rs(r.user_id), postId: rs(r.post_id), createdAt: rAt(r.created_at) });
const mapRepost = (r: Row): Repost => ({ userId: rs(r.user_id), postId: rs(r.post_id), createdAt: rAt(r.created_at) });
const mapBlock = (r: Row): Block => ({
  blockerId: rs(r.blocker_id),
  blockedId: rs(r.blocked_id),
  createdAt: rAt(r.created_at),
});
const mapStory = (r: Row): Story => ({
  id: rs(r.id),
  userId: rs(r.user_id),
  kind: rs(r.kind) as Story['kind'],
  media: rOrNull(r.media),
  caption: rs(r.caption),
  createdAt: rAt(r.created_at),
  expiresAt: rAt(r.expires_at),
});
const mapNotif = (r: Row): AppNotification => ({
  id: rs(r.id),
  recipientId: rs(r.user_id),
  actorId: rs(r.actor_id),
  type: rs(r.type) as AppNotification['type'],
  entityType: rs(r.entity_type),
  entityId: rOrNull(r.entity_id),
  data: (r.data ?? {}) as Record<string, string>,
  isRead: !!r.is_read,
  createdAt: rAt(r.created_at),
});
const mapReport = (r: Row): Report => ({
  id: rs(r.id),
  reporterId: rs(r.reporter_id),
  targetType: rs(r.target_type) as ReportTarget,
  targetId: rs(r.target_id),
  reason: rs(r.reason) as ReportReason,
  details: rOrNull(r.details),
  status: rs(r.status) as Report['status'],
  createdAt: rAt(r.created_at),
});
const mapMessage = (r: Row): Message => ({
  id: rs(r.id),
  conversationId: rs(r.conversation_id),
  senderId: rs(r.sender_id),
  body: rs(r.body),
  mediaKind: rOrNull(r.media_kind) as MediaKind | null,
  mediaRef: rOrNull(r.media),
  postId: rOrNull(r.post_id),
  createdAt: rAt(r.created_at),
  readAt: rOrNull(r.read_at),
});

/**
 * Production provider — Supabase Auth + PostgREST + Storage + Realtime.
 *
 * Hydrates a complete `AppState` so every existing selector keeps working,
 * applies mutations optimistically against that snapshot (rolling back on
 * server errors, which pages already surface via toast), and reconciles with
 * a debounced re-hydration whenever realtime reports a change. Row-Level
 * Security in `supabase/migrations` enforces the real security matrix.
 */
class SupabaseProvider implements DataProvider {
  private listeners = new Set<() => void>();
  private state: AppState = EMPTY_STATE;
  private uid: string | null = null;
  private refreshTimer: number | null = null;
  private channel: ReturnType<SupabaseClient['channel']> | null = null;
  private isReady = false;

  constructor(private sb: SupabaseClient) {
    void this.bootstrap();
    this.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.teardown();
        this.commit({ session: null });
        return;
      }
      if (session && session.user.id !== this.uid) void this.signInAs(session);
    });
  }

  private async bootstrap(): Promise<void> {
    const { data } = await this.sb.auth.getSession();
    if (data.session && data.session.user.id !== this.uid) await this.signInAs(data.session);
  }

  private async signInAs(session: Session): Promise<void> {
    const user = session.user;
    this.uid = user.id;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    this.state = {
      ...EMPTY_STATE,
      session: {
        id: user.id,
        email: rs(user.email),
        name: rs(meta.full_name ?? meta.name) || rs(user.email).split('@')[0] || 'Circle user',
        picture: rs(meta.avatar_url ?? meta.picture),
      },
    };
    this.isReady = false; // skeletons until this session's data lands (UI-04)
    this.emit(); // signed-in shell renders immediately; data follows
    await this.hydrate();
    this.attachRealtime();
  }

  /** Fetch everything the selectors read (caps documented in README). */
  private async hydrate(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    const sb = this.sb;
    const rows = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> => {
      const { data, error } = await q;
      if (error) throw new Error(friendlyError(error));
      return (data as Row[]) ?? [];
    };
    try {
      const [profiles, posts, comments, follows, likes, saves, reposts, blocks, mutes, stories, notifications, reports, conversations, prefs, interestRows, userInterestRows, cabinRows, cabinInterestRows, cabinMemberRows, cabinRequestRows, cabinMessageRows] =
        await Promise.all([
          rows(sb.from('profiles').select('*').limit(5000)),
          rows(sb.from('posts').select('*').order('created_at', { ascending: false }).limit(1000)),
          rows(sb.from('comments').select('*').order('created_at', { ascending: false }).limit(2000)),
          rows(sb.from('follows').select('*').limit(5000)),
          rows(sb.from('likes').select('*').eq('user_id', uid).limit(5000)),
          rows(sb.from('saves').select('*').eq('user_id', uid).limit(5000)),
          rows(sb.from('reposts').select('*').limit(5000)),
          rows(sb.from('blocks').select('*').limit(5000)),
          rows(sb.from('mutes').select('*').eq('muter_id', uid).limit(1000)), // PRV-08
          rows(sb.from('stories').select('*').limit(500)),
          rows(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(300)),
          rows(sb.from('reports').select('*').order('created_at', { ascending: false }).limit(500)),
          rows(sb.from('conversations').select('*').order('created_at', { ascending: false }).limit(500)),
          rows(sb.from('notification_prefs').select('*').eq('user_id', uid).limit(1)),
          rows(sb.from('interests').select('*').limit(200)), // INT-01
          rows(sb.from('user_interests').select('*').limit(5000)), // INT-02 (pairs are non-sensitive; PRV-04 governs display)
          rows(sb.from('cabins').select('*').order('created_at', { ascending: false }).limit(1000)), // G
          rows(sb.from('cabin_interests').select('*').limit(3000)), // G
          rows(sb.from('cabin_members').select('*').limit(5000)), // G (RLS: my memberships + cabins I'm in)
          rows(sb.from('cabin_join_requests').select('*').order('created_at', { ascending: false }).limit(500)), // G (RLS: mine + cabins I moderate)
          rows(sb.from('cabin_messages').select('*').order('created_at', { ascending: false }).limit(1000)), // G (RLS: member-only)
        ]);
      const convIds = conversations.map((c) => rs(c.id));
      const [memberRows, messageRows]: [Row[], Row[]] = convIds.length
        ? await Promise.all([
            rows(sb.from('conversation_members').select('*').in('conversation_id', convIds).limit(2000)),
            rows(
              sb.from('messages').select('*').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(1000),
            ),
          ])
        : [[], []];
      const memberIds = new Map<string, string[]>();
      for (const m of memberRows) {
        const cid = rs(m.conversation_id);
        memberIds.set(cid, [...(memberIds.get(cid) ?? []), rs(m.user_id)]);
      }
      this.state = {
        ...this.state, // keep session (+ any in-flight optimistic write)
        profiles: profiles.map(mapProfile),
        posts: posts.map(mapPost),
        comments: comments.map(mapComment),
        follows: follows.map(mapFollow),
        likes: likes.map(mapLike),
        saves: saves.map(mapSave),
        reposts: reposts.map(mapRepost),
        blocks: blocks.map(mapBlock),
        mutes: mutes.map(mapMute),
        interests: interestRows.map(mapInterest), // INT-01
        userInterests: userInterestRows.map(mapUserInterest), // INT-02
        cabins: cabinRows.map(mapCabin), // G
        cabinInterests: cabinInterestRows.map(mapCabinInterest),
        cabinMembers: cabinMemberRows.map(mapCabinMember),
        cabinJoinRequests: cabinRequestRows.map(mapCabinRequest),
        cabinMessages: cabinMessageRows.map(mapCabinMessage).reverse(), // oldest → newest (parity with DMs)
        stories: stories.map(mapStory),
        notifications: notifications.map(mapNotif),
        mutedNotifications: (prefs[0]?.muted_types as string[] | undefined) ?? [],
        reports: reports.map(mapReport),
        conversations: conversations.map((c) => ({
          id: rs(c.id),
          memberIds: memberIds.get(rs(c.id)) ?? [],
          createdAt: rAt(c.created_at),
        })),
        messages: messageRows.map(mapMessage).reverse(), // stored oldest → newest (thread order)
      };
      this.isReady = true; // UI-04: first hydration done — skeletons can retire
      this.emit();
    } catch (e) {
      console.error('[circle] hydrate failed:', e);
      // Still retire the skeletons: empty states + toasts + Retry beat an
      // infinite skeleton when the network is down (UI-06).
      this.isReady = true;
      this.emit();
    }
  }

  /** Realtime events → debounced full refresh (simple, always consistent). */
  private attachRealtime(): void {
    if (this.channel) return;
    const uid = this.uid;
    if (!uid) return;
    const ch = this.sb.channel(`rt:${uid}`);
    for (const table of ['messages', 'likes', 'follows', 'reposts', 'posts', 'comments', 'stories', 'profiles', 'cabin_messages', 'cabins', 'cabin_members', 'cabin_interests', 'cabin_join_requests'] as const) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => this.scheduleRefresh());
    }
    // NOT-05: notifications arrive filtered to this user's rows only.
    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
      () => this.scheduleRefresh(),
    );
    ch.subscribe();
    this.channel = ch;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.hydrate();
    }, 750);
  }

  private teardown(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.channel) {
      void this.sb.removeChannel(this.channel);
      this.channel = null;
    }
    this.uid = null;
    this.isReady = false;
  }

  /* --- store plumbing --- */
  private commit(next: Partial<AppState>) {
    this.state = { ...this.state, ...next };
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

  /** UI-04: skeletons render until the first hydration lands. */
  ready = (): boolean => this.isReady;
  refresh = async (): Promise<Result> => {
    if (!this.uid) return { ok: false, error: 'Please sign in first.' };
    await this.hydrate();
    return { ok: true };
  };

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
  async signInWithGoogle(): Promise<Result> {
    const { data, error } = await this.sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) return { ok: false, error: friendlyError(error) };
    if (data.url) window.location.assign(data.url); // full-page OAuth flow
    return { ok: true };
  }

  async signUpWithEmail(email: string, password: string): Promise<Result> {
    const { error } = await this.sb.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true }; // session → the Landing effect routes; else confirm-email flow
  }

  async signInWithEmail(email: string, password: string): Promise<Result> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true };
  }

  async signOut(): Promise<Result> {
    const { error } = await this.sb.auth.signOut();
    this.teardown();
    this.commit({ session: null });
    return error ? { ok: false, error: friendlyError(error) } : { ok: true };
  }

  /* --- onboarding / profile (PROF-1..4, MOD-5) --- */
  completeOnboarding(input: OnboardingInput): Promise<Result> {
    return this.applyProfileUpdate(input);
  }
  updateProfile(input: OnboardingInput): Promise<Result> {
    return this.applyProfileUpdate(input);
  }

  private async applyProfileUpdate(input: OnboardingInput): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(input.username)) {
      return { ok: false, error: 'Username must be 3–20 letters, numbers, or underscores.' };
    }
    if (input.displayName.trim().length < 1 || input.displayName.length > LIMITS.displayNameMax) {
      return { ok: false, error: `Display name must be 1–${LIMITS.displayNameMax} characters.` };
    }
    if (input.bio.length > LIMITS.bioMax) return { ok: false, error: `Bio must be ${LIMITS.bioMax} characters or fewer.` };
    const taken = this.state.profiles.some(
      (p) => p.id !== meId && p.username?.toLowerCase() === input.username.toLowerCase(),
    );
    if (taken) return { ok: false, error: 'That username is already taken.' };

    let avatarUrl = input.avatarUrl?.trim() || this.me()?.avatarUrl || '';
    try {
      if (avatarUrl && !/^https?:\/\//.test(avatarUrl)) avatarUrl = await uploadRef(avatarUrl, 'avatars', meId);
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
    const displayName = input.displayName.trim();
    const bio = input.bio.trim();
    const { error } = await this.sb
      .from('profiles')
      .update({ username: input.username, display_name: displayName, bio, avatar_url: avatarUrl || null })
      .eq('id', meId);
    if (error) return { ok: false, error: friendlyError(error) };

    const current = this.me();
    const updated: Profile = {
      ...(current ?? {
        id: meId,
        username: '',
        displayName,
        bio: '',
        avatarUrl: '',
        role: 'user' as const,
        isSuspended: false,
        createdAt: now(),
      }),
      username: input.username,
      displayName,
      bio,
      avatarUrl: avatarUrl || current?.avatarUrl || '',
    };
    this.commit({
      profiles: current ? this.state.profiles.map((p) => (p.id === meId ? updated : p)) : [...this.state.profiles, updated],
      session: this.state.session ? { ...this.state.session, name: displayName, picture: updated.avatarUrl } : null,
    });
    return { ok: true };
  }

  async deleteAccount(): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const run = async (q: PromiseLike<{ error: { message: string } | null }>): Promise<void> => {
      const { error } = await q;
      if (error) throw new Error(friendlyError(error));
    };
    const or = (col: string) => `${col}.eq.${meId}`;
    try {
      await run(this.sb.from('posts').delete().eq('author_id', meId)); // cascades comments/likes/reposts/saves
      await run(this.sb.from('stories').delete().eq('user_id', meId));
      await run(this.sb.from('saves').delete().eq('user_id', meId));
      await run(this.sb.from('reposts').delete().eq('user_id', meId));
      await run(this.sb.from('follows').delete().or(`${or('follower_id')},${or('following_id')}`));
      await run(this.sb.from('blocks').delete().or(`${or('blocker_id')},${or('blocked_id')}`));
      await run(this.sb.from('notifications').delete().or(`${or('user_id')},${or('actor_id')}`));
      await run(this.sb.from('reports').delete().eq('reporter_id', meId));
      // Keep the auth user, blank the public profile — signing up again restarts onboarding.
      await run(
        this.sb
          .from('profiles')
          .update({ username: null, display_name: 'Deleted user', bio: '', avatar_url: null })
          .eq('id', meId),
      );
      await this.sb.auth.signOut();
      this.teardown();
      this.commit({ ...EMPTY_STATE });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- posts (POST-1..5, MOD-4, F-VID, F-HAS, F-SAF) --- */
  async createPost(body: string, imageUrls: string[], videoUrl: string | null = null): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
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

    const meId = this.state.session!.id;
    try {
      const [images, video] = await Promise.all([
        imageUrls.length ? uploadImages(imageUrls, 'post-images', meId) : Promise.resolve([] as string[]),
        videoUrl ? uploadRef(videoUrl, 'media', meId) : Promise.resolve(null as string | null),
      ]);
      const { data, error } = await this.sb
        .from('posts')
        .insert({ author_id: meId, body: text, image_urls: images, video_url: video, hashtags })
        .select()
        .single();
      if (error) return { ok: false, error: friendlyError(error) };
      this.commit({ posts: [mapPost(data as Row), ...this.state.posts] });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async editPost(postId: string, body: string): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (post.authorId !== this.state.session!.id) return { ok: false, error: 'You can only edit your own posts.' };
    const text = body.trim();
    if (text.length > LIMITS.postMax) return { ok: false, error: `Posts must be ${LIMITS.postMax} characters or fewer.` };
    if (!text && !post.imageUrls.length && !post.videoUrl) return { ok: false, error: 'Posts need text, a photo, or a video.' };
    const hashtags = extractHashtags(text);
    const editedAt = now();
    const { error } = await this.sb.from('posts').update({ body: text, hashtags, edited_at: editedAt }).eq('id', postId);
    if (error) return { ok: false, error: friendlyError(error) };
    this.commit({ posts: this.state.posts.map((p) => (p.id === postId ? { ...p, body: text, hashtags, editedAt } : p)) });
    return { ok: true };
  }

  async deletePost(postId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const post = this.state.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: 'Post not found.' };
    const meId = this.state.session!.id;
    const isAdmin = this.me()?.role === 'admin';
    if (post.authorId !== meId && !isAdmin) return { ok: false, error: 'Not allowed.' };
    if (post.authorId === meId) {
      const deletedAt = now();
      const { error } = await this.sb.from('posts').update({ deleted_at: deletedAt }).eq('id', postId);
      if (error) return { ok: false, error: friendlyError(error) };
      this.commit({ posts: this.state.posts.map((p) => (p.id === postId ? { ...p, deletedAt } : p)) });
      void deleteMediaUrls([...post.imageUrls, post.videoUrl]); // QTA-04: no orphans
      return { ok: true };
    }
    // Admin moderation removes the row outright (RLS delete policy allows admins).
    const { error } = await this.sb.from('posts').delete().eq('id', postId);
    if (error) return { ok: false, error: friendlyError(error) };
    void deleteMediaUrls([...post.imageUrls, post.videoUrl]); // QTA-04: no orphans
    this.commit({
      posts: this.state.posts.filter((p) => p.id !== postId),
      comments: this.state.comments.filter((c) => c.postId !== postId),
    });
    return { ok: true };
  }

  /* --- engagement (ENG-1..4) --- */
  async toggleLike(postId: string): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (isBlockedPair(this.state, meId, post.authorId)) return { ok: false, error: 'You cannot interact with this user.' };

    const liked = this.state.likes.some((l) => l.userId === meId && l.postId === postId);
    const before = this.state;
    const likes = liked
      ? this.state.likes.filter((l) => !(l.userId === meId && l.postId === postId))
      : [{ userId: meId, postId, createdAt: now() }, ...this.state.likes];
    const posts = this.state.posts.map((p) =>
      p.id === postId ? { ...p, likeCount: Math.max(0, p.likeCount + (liked ? -1 : 1)) } : p,
    );
    this.commit({ posts, likes }); // optimistic flip (server trigger keeps the count)
    try {
      const { error } = liked
        ? await this.sb.from('likes').delete().eq('user_id', meId).eq('post_id', postId)
        : await this.sb.from('likes').insert({ user_id: meId, post_id: postId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before; // roll back
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async addComment(postId: string, body: string, imageUrls: string[] = []): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (isBlockedPair(this.state, meId, post.authorId)) return { ok: false, error: 'You cannot interact with this user.' };
    const text = body.trim();
    if (text.length > LIMITS.commentMax) return { ok: false, error: `Comments must be ${LIMITS.commentMax} characters or fewer.` };
    if (!text && !imageUrls.length) return { ok: false, error: 'Comments need text or a photo.' };
    if (imageUrls.length > LIMITS.imagesPerComment) return { ok: false, error: `Up to ${LIMITS.imagesPerComment} photos per comment.` };
    if (text && this.isDuplicate(meId, text)) return { ok: false, error: 'Looks like you just sent that.' };
    try {
      const images = imageUrls.length ? await uploadImages(imageUrls, 'post-images', meId) : [];
      const { data, error } = await this.sb
        .from('comments')
        .insert({ post_id: postId, author_id: meId, body: text, image_urls: images })
        .select()
        .single();
      if (error) return { ok: false, error: friendlyError(error) };
      this.commit({
        comments: [mapComment(data as Row), ...this.state.comments],
        posts: this.state.posts.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async deleteComment(commentId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const comment = this.state.comments.find((c) => c.id === commentId);
    if (!comment) return { ok: false, error: 'Comment not found.' };
    const meId = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === comment.postId);
    const isPostOwner = post?.authorId === meId;
    const isAdmin = this.me()?.role === 'admin';
    if (comment.authorId !== meId && !isPostOwner && !isAdmin) return { ok: false, error: 'Not allowed.' };
    const { error } = await this.sb.from('comments').delete().eq('id', commentId);
    if (error) return { ok: false, error: friendlyError(error) };
    this.commit({
      comments: this.state.comments.filter((c) => c.id !== commentId),
      posts: this.state.posts.map((p) =>
        p.id === comment.postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
      ),
    });
    return { ok: true };
  }

  /* --- reposts & saves (F-REP, F-SAV) --- */
  async toggleRepost(postId: string): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    if (post.authorId === meId) return { ok: false, error: 'You cannot repost your own post.' };
    if (isBlockedPair(this.state, meId, post.authorId)) return { ok: false, error: 'You cannot interact with this user.' };

    const existing = this.state.reposts.find((r) => r.userId === meId && r.postId === postId);
    const before = this.state;
    if (existing) {
      this.commit({
        reposts: this.state.reposts.filter((r) => !(r.userId === meId && r.postId === postId)),
        posts: this.state.posts.map((p) => (p.id === postId ? { ...p, repostCount: Math.max(0, p.repostCount - 1) } : p)),
      });
      try {
        const { error } = await this.sb.from('reposts').delete().eq('user_id', meId).eq('post_id', postId);
        if (error) throw error;
        return { ok: true };
      } catch (e) {
        this.state = before;
        this.emit();
        return { ok: false, error: friendlyError(e) };
      }
    }
    this.commit({
      reposts: [{ userId: meId, postId, createdAt: now() }, ...this.state.reposts],
      posts: this.state.posts.map((p) => (p.id === postId ? { ...p, repostCount: p.repostCount + 1 } : p)),
    });
    try {
      const { error } = await this.sb.from('reposts').insert({ user_id: meId, post_id: postId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async toggleSave(postId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const post = this.state.posts.find((p) => p.id === postId && !p.deletedAt);
    if (!post) return { ok: false, error: 'Post not found.' };
    const existing = this.state.saves.find((s) => s.userId === meId && s.postId === postId);
    const before = this.state;
    if (existing) {
      this.commit({ saves: this.state.saves.filter((s) => !(s.userId === meId && s.postId === postId)) });
      try {
        const { error } = await this.sb.from('saves').delete().eq('user_id', meId).eq('post_id', postId);
        if (error) throw error;
        return { ok: true };
      } catch (e) {
        this.state = before;
        this.emit();
        return { ok: false, error: friendlyError(e) };
      }
    }
    // Saves are private — no notification (F-SAV).
    this.commit({ saves: [{ userId: meId, postId, createdAt: now() }, ...this.state.saves] });
    try {
      const { error } = await this.sb.from('saves').insert({ user_id: meId, post_id: postId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- social graph (FOL-1..3, MOD-3) --- */
  async toggleFollow(userId: string): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    if (meId === userId) return { ok: false, error: 'You cannot follow yourself.' };
    if (isBlockedPair(this.state, meId, userId)) return { ok: false, error: 'You cannot follow this user.' };
    const target = profileById(this.state, userId);
    if (!target?.username) return { ok: false, error: 'Profile not found.' };
    const existing = this.state.follows.find((f) => f.followerId === meId && f.followingId === userId);
    const before = this.state;
    if (existing) {
      // Unfollow, or cancel a pending request (same row, same button).
      this.commit({ follows: this.state.follows.filter((f) => !(f.followerId === meId && f.followingId === userId)) });
      try {
        const { error } = await this.sb.from('follows').delete().eq('follower_id', meId).eq('following_id', userId);
        if (error) throw error;
        return { ok: true };
      } catch (e) {
        this.state = before;
        this.emit();
        return { ok: false, error: friendlyError(e) };
      }
    }
    // PRV-03: the server trigger downgrades to 'pending' for private accounts;
    // we set it here too so the UI reflects the request immediately.
    const status = target.visibility === 'private' ? 'pending' : 'accepted';
    this.commit({ follows: [{ followerId: meId, followingId: userId, status, createdAt: now() }, ...this.state.follows] });
    try {
      const { error } = await this.sb.from('follows').insert({ follower_id: meId, following_id: userId, status });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async approveFollow(followerId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({
      follows: this.state.follows.map((f) =>
        f.followerId === followerId && f.followingId === meId ? { ...f, status: 'accepted' as const } : f,
      ),
    });
    try {
      // RLS: only following_id (= me) may approve; the UPDATE trigger sends
      // follow_request_approved to the requester.
      const { error } = await this.sb
        .from('follows')
        .update({ status: 'accepted' })
        .eq('follower_id', followerId)
        .eq('following_id', meId)
        .eq('status', 'pending');
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async declineFollow(followerId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({ follows: this.state.follows.filter((f) => !(f.followerId === followerId && f.followingId === meId)) });
    try {
      const { error } = await this.sb
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', meId)
        .eq('status', 'pending');
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async muteUser(userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    if (meId === userId) return { ok: false, error: 'You cannot mute yourself.' };
    if ((this.state.mutes ?? []).some((m) => m.muterId === meId && m.mutedId === userId)) return { ok: true };
    const before = this.state;
    this.commit({ mutes: [...(this.state.mutes ?? []), { muterId: meId, mutedId: userId, createdAt: now() }] });
    try {
      const { error } = await this.sb.from('mutes').upsert({ muter_id: meId, muted_id: userId }, { onConflict: 'muter_id,muted_id' });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async unmuteUser(userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({ mutes: (this.state.mutes ?? []).filter((m) => !(m.muterId === meId && m.mutedId === userId)) });
    try {
      const { error } = await this.sb.from('mutes').delete().eq('muter_id', meId).eq('muted_id', userId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async setInterests(ids: string[]): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    // Mirror of the 0007 user_interests_limit trigger, checked up front so the
    // optimistic write never travels to a row the DB would reject.
    if (ids.length > LIMITS.interestsMax) {
      return { ok: false, error: `You can pick at most ${LIMITS.interestsMax} interests.` };
    }
    const uniq = [...new Set(ids)];
    const before = this.state;
    const createdAt = now();
    // Optimistic replace (INT-05: instant save); the DB is authoritative and
    // any insert rejection rolls the snapshot back below.
    this.commit({
      userInterests: [
        ...(this.state.userInterests ?? []).filter((ui) => ui.userId !== meId),
        ...uniq.map((interestId) => ({ userId: meId, interestId, createdAt })),
      ],
    });
    try {
      const { error: delErr } = await this.sb.from('user_interests').delete().eq('user_id', meId);
      if (delErr) throw delErr;
      if (uniq.length) {
        const { error } = await this.sb
          .from('user_interests')
          .insert(uniq.map((interest_id) => ({ user_id: meId, interest_id })));
        if (error) throw error;
      }
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async updatePrivacy(input: PrivacyInput): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const patch: Partial<Profile> = {};
    const db: Record<string, unknown> = {};
    if (input.visibility !== undefined) { patch.visibility = input.visibility; db.visibility = input.visibility; }
    if (input.showJoinDate !== undefined) { patch.showJoinDate = input.showJoinDate; db.show_join_date = input.showJoinDate; }
    if (input.showFollowLists !== undefined) { patch.showFollowLists = input.showFollowLists; db.show_follow_lists = input.showFollowLists; }
    if (input.dmPermission !== undefined) { patch.dmPermission = input.dmPermission; db.dm_permission = input.dmPermission; }
    if (input.cabinInvitePermission !== undefined) { patch.cabinInvitePermission = input.cabinInvitePermission; db.cabin_invite_permission = input.cabinInvitePermission; }
    if (input.discoverable !== undefined) { patch.discoverable = input.discoverable; db.discoverable = input.discoverable; }
    if (input.showInterest !== undefined) { patch.showInterest = input.showInterest; db.show_interests = input.showInterest; } // INT-06
    const before = this.state;
    this.commit({ profiles: this.state.profiles.map((p) => (p.id === meId ? { ...p, ...patch } : p)) });
    try {
      const { error } = await this.sb.from('profiles').update(db).eq('id', meId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async blockUser(userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    if (meId === userId) return { ok: false, error: 'You cannot block yourself.' };
    const severedConvs = this.state.conversations
      .filter((c) => c.memberIds.length === 2 && c.memberIds.includes(meId) && c.memberIds.includes(userId))
      .map((c) => c.id);
    const before = this.state;
    this.commit({
      blocks: [...this.state.blocks, { blockerId: meId, blockedId: userId, createdAt: now() }],
      // Blocking severs follows and hides the shared DM thread (F-SAF); the
      // other direction is enforced server-side by the RLS visibility policies.
      follows: this.state.follows.filter(
        (f) => !((f.followerId === meId && f.followingId === userId) || (f.followerId === userId && f.followingId === meId)),
      ),
      conversations: this.state.conversations.filter((c) => !severedConvs.includes(c.id)),
      messages: this.state.messages.filter((m) => !severedConvs.includes(m.conversationId)),
    });
    try {
      const { error } = await this.sb.from('blocks').insert({ blocker_id: meId, blocked_id: userId });
      if (error) throw error;
      await this.sb.from('follows').delete().eq('follower_id', meId).eq('following_id', userId);
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async unblockUser(userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({ blocks: this.state.blocks.filter((b) => !(b.blockerId === meId && b.blockedId === userId)) });
    try {
      const { error } = await this.sb.from('blocks').delete().eq('blocker_id', meId).eq('blocked_id', userId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- safety (MOD-1..2) --- */
  async submitReport(
    targetType: ReportTarget,
    targetId: string,
    reason: ReportReason,
    details: string | null,
  ): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    try {
      const { data, error } = await this.sb
        .from('reports')
        .insert({
          reporter_id: this.state.session!.id,
          target_type: targetType,
          target_id: targetId,
          reason,
          details: details?.slice(0, 500) ?? null,
        })
        .select()
        .single();
      if (error) return { ok: false, error: friendlyError(error) };
      this.commit({ reports: [mapReport(data as Row), ...this.state.reports] });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async resolveReport(reportId: string, status: 'dismissed' | 'actioned'): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    if (this.me()?.role !== 'admin') return { ok: false, error: 'Admins only.' };
    const { error } = await this.sb.from('reports').update({ status }).eq('id', reportId);
    if (error) return { ok: false, error: friendlyError(error) };
    this.commit({ reports: this.state.reports.map((r) => (r.id === reportId ? { ...r, status } : r)) });
    return { ok: true };
  }

  async setSuspended(userId: string, suspended: boolean): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    if (this.me()?.role !== 'admin') return { ok: false, error: 'Admins only.' };
    const before = this.state;
    this.commit({ profiles: this.state.profiles.map((p) => (p.id === userId ? { ...p, isSuspended: suspended } : p)) });
    try {
      const { error } = await this.sb.from('profiles').update({ is_suspended: suspended }).eq('id', userId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- stories (F-STO) --- */
  async createStory(input: StoryInput): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const caption = input.caption.trim().slice(0, LIMITS.storyCaptionMax);
    if (input.kind === 'text' && !caption) return { ok: false, error: 'Text stories need a caption.' };
    if (input.kind !== 'text' && !input.media) return { ok: false, error: 'Pick a photo or video first.' };
    const meId = this.state.session!.id;
    try {
      const media =
        input.kind === 'text' ? null : await uploadRef(input.media!, input.kind === 'video' ? 'media' : 'post-images', meId);
      const { data, error } = await this.sb
        .from('stories')
        .insert({
          user_id: meId,
          kind: input.kind,
          media,
          caption,
          expires_at: new Date(Date.now() + LIMITS.storyTtlMs).toISOString(),
        })
        .select()
        .single();
      if (error) return { ok: false, error: friendlyError(error) };
      this.commit({ stories: [mapStory(data as Row), ...this.state.stories] });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async deleteStory(storyId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const story = this.state.stories.find((s) => s.id === storyId);
    if (!story) return { ok: false, error: 'Story not found.' };
    if (story.userId !== this.state.session!.id && this.me()?.role !== 'admin') return { ok: false, error: 'Not allowed.' };
    const { error } = await this.sb.from('stories').delete().eq('id', storyId);
    if (error) return { ok: false, error: friendlyError(error) };
    void deleteMediaUrls([story.media]); // QTA-04: no orphans
    this.commit({ stories: this.state.stories.filter((s) => s.id !== storyId) });
    return { ok: true };
  }

  /* --- direct messaging (F-DM) --- */
  async startConversation(otherId: string): Promise<ConversationResult> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    if (meId === otherId) return { ok: false, error: 'You cannot message yourself.' };
    if (isBlockedPair(this.state, meId, otherId)) return { ok: false, error: 'You cannot message a blocked user.' };
    const other = profileById(this.state, otherId);
    if (!other?.username) return { ok: false, error: 'User not found.' };
    // PRV-05: mirror of the conversation_members_insert_member policy gate.
    if (!dmAllows(this.state, meId, otherId)) {
      const perm = other.dmPermission ?? 'everyone';
      return {
        ok: false,
        error: perm === 'nobody' ? 'This person isn’t accepting messages.' : 'This person only accepts messages from followers.',
      };
    }

    const existing = this.state.conversations.find(
      (c) => c.memberIds.length === 2 && c.memberIds.includes(meId) && c.memberIds.includes(otherId),
    );
    if (existing) return { ok: true, conversationId: existing.id };

    try {
      const { data: conv, error } = await this.sb.from('conversations').insert({}).select().single();
      if (error) return { ok: false, error: friendlyError(error) };
      const cid = rs(conv.id);
      const first = await this.sb.from('conversation_members').insert({ conversation_id: cid, user_id: meId });
      if (first.error) return { ok: false, error: friendlyError(first.error) };
      const second = await this.sb.from('conversation_members').insert({ conversation_id: cid, user_id: otherId });
      if (second.error) return { ok: false, error: friendlyError(second.error) };
      const conversation: Conversation = { id: cid, memberIds: [meId, otherId], createdAt: now() };
      this.commit({ conversations: [conversation, ...this.state.conversations] });
      return { ok: true, conversationId: cid };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async sendMessage(
    conversationId: string,
    body: string,
    media: { kind: MediaKind; ref: string } | null,
    postId: string | null,
  ): Promise<Result> {
    const guard = this.requireActive();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const conv = this.state.conversations.find((c) => c.id === conversationId);
    if (!conv || !conv.memberIds.includes(meId)) return { ok: false, error: 'This conversation is not available.' };

    const otherId = conv.memberIds.find((m) => m !== meId)!;
    if (isBlockedPair(this.state, meId, otherId)) return { ok: false, error: 'You cannot message a blocked user.' };

    const text = body.trim().slice(0, LIMITS.dmMax);
    if (!text && !media && !postId) return { ok: false, error: 'Write a message first.' };
    if (postId && !this.state.posts.some((p) => p.id === postId && !p.deletedAt)) return { ok: false, error: 'That post is gone.' };
    if (text && this.isDuplicate(meId, text)) return { ok: false, error: 'Looks like you just sent that.' };

    try {
      const mediaRef = media ? await uploadRef(media.ref, media.kind === 'video' ? 'media' : 'post-images', meId) : null;
      const { data, error } = await this.sb
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: meId,
          body: text,
          media_kind: media?.kind ?? null,
          media: mediaRef,
          post_id: postId,
        })
        .select()
        .single();
      if (error) return { ok: false, error: friendlyError(error) };
      this.commit({ messages: [...this.state.messages, mapMessage(data as Row)] });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async markConversationRead(conversationId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({
      messages: this.state.messages.map((m) =>
        m.conversationId === conversationId && m.senderId !== meId && !m.readAt ? { ...m, readAt: now() } : m,
      ),
    });
    try {
      const { error } = await this.sb
        .from('messages')
        .update({ read_at: now() })
        .eq('conversation_id', conversationId)
        .neq('sender_id', meId)
        .is('read_at', null);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- cabins (Workstream G) ---
   * Optimistic writes mirroring the DB (triggers + RLS)
   * is authoritative and every failure rolls the snapshot back. */

  async createCabin(input: CabinInput): Promise<Result & { id?: string }> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const tags = [...new Set(input.interestIds)];
    if (tags.length < LIMITS.cabinTagsMin || tags.length > LIMITS.cabinTagsMax) {
      return { ok: false, error: `Pick ${LIMITS.cabinTagsMin}–${LIMITS.cabinTagsMax} interest tags.` };
    }
    const before = this.state;
    try {
      // CAB-01: cover compressed per D; same post-images bucket.
      const imageUrl = input.imageUrl ? await uploadRef(input.imageUrl, 'post-images', meId) : null;
      const id = crypto.randomUUID();
      this.commit({
        cabins: [
          { id, name: input.name.trim(), description: input.description?.trim() || null, imageUrl, type: input.type, ownerId: meId, maxMembers: LIMITS.cabinMembersMax, memberCount: 1, createdAt: now() },
          ...(this.state.cabins ?? []),
        ],
        cabinInterests: [...tags.map((interestId) => ({ cabinId: id, interestId })), ...(this.state.cabinInterests ?? [])],
        cabinMembers: [
          { cabinId: id, userId: meId, role: 'owner', status: 'active', muted: false, lastReadAt: now(), joinedAt: now() },
          ...(this.state.cabinMembers ?? []),
        ],
      });
      const { data, error } = await this.sb
        .from('cabins')
        .insert({ id, name: input.name.trim(), description: input.description?.trim() || null, image_url: imageUrl, type: input.type, owner_id: meId })
        .select('id')
        .single();
      if (error) throw error;
      const cabinId = rs(data.id);
      if (tags.length) {
        const { error: tagErr } = await this.sb
          .from('cabin_interests')
          .insert(tags.map((interest_id) => ({ cabin_id: cabinId, interest_id })));
        if (tagErr) throw tagErr;
      }
      return { ok: true, id: cabinId };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async updateCabin(cabinId: string, patch: Partial<CabinInput>): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    if (!canModerateCabin(this.state, cabinId, this.state.session!.id)) {
      return { ok: false, error: 'Only the owner or an admin can edit this cabin.' };
    }
    const before = this.state;
    const cabin = cabinById(this.state, cabinId);
    if (!cabin) return { ok: false, error: 'Cabin not found.' };
    const db: Record<string, unknown> = {};
    let imageUrl = cabin.imageUrl;
    try {
      if (patch.imageUrl !== undefined) {
        // Fresh picks arrive as data URLs; unchanged covers stay remote URLs.
        imageUrl = patch.imageUrl;
        if (patch.imageUrl && patch.imageUrl.startsWith('data:')) {
          imageUrl = await uploadRef(patch.imageUrl, 'post-images', this.state.session!.id);
        }
        db.image_url = imageUrl;
      }
      if (patch.name !== undefined) db.name = patch.name.trim();
      if (patch.description !== undefined) db.description = patch.description?.trim() || null;
      if (patch.type !== undefined) db.type = patch.type;
      this.commit({
        cabins: (this.state.cabins ?? []).map((c) =>
          c.id === cabinId
            ? {
                ...c,
                name: patch.name !== undefined ? patch.name.trim() : c.name,
                description: patch.description !== undefined ? patch.description?.trim() || null : c.description,
                imageUrl,
                type: patch.type !== undefined ? patch.type : c.type,
              }
            : c,
        ),
        cabinInterests:
          patch.interestIds !== undefined
            ? [
                ...[...new Set(patch.interestIds)].map((interestId) => ({ cabinId, interestId })),
                ...(this.state.cabinInterests ?? []).filter((ci) => ci.cabinId !== cabinId),
              ]
            : this.state.cabinInterests,
      });
      if (Object.keys(db).length) {
        const { error } = await this.sb.from('cabins').update(db).eq('id', cabinId);
        if (error) throw error;
      }
      if (patch.interestIds !== undefined) {
        const { error: delErr } = await this.sb.from('cabin_interests').delete().eq('cabin_id', cabinId);
        if (delErr) throw delErr;
        const tags = [...new Set(patch.interestIds)];
        if (tags.length) {
          const { error: tagErr } = await this.sb
            .from('cabin_interests')
            .insert(tags.map((interest_id) => ({ cabin_id: cabinId, interest_id })));
          if (tagErr) throw tagErr;
        }
      }
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async deleteCabin(cabinId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const before = this.state;
    const cabin = cabinById(this.state, cabinId);
    if (!cabin) return { ok: false, error: 'Cabin not found.' };
    this.commit({
      cabins: (this.state.cabins ?? []).filter((c) => c.id !== cabinId),
      cabinInterests: (this.state.cabinInterests ?? []).filter((ci) => ci.cabinId !== cabinId),
      cabinMembers: (this.state.cabinMembers ?? []).filter((m) => m.cabinId !== cabinId),
      cabinJoinRequests: (this.state.cabinJoinRequests ?? []).filter((r) => r.cabinId !== cabinId),
      cabinMessages: (this.state.cabinMessages ?? []).filter((m) => m.cabinId !== cabinId),
    });
    try {
      // Storage cleanup is client-side (same pattern as deletePost).
      if (cabin.imageUrl) await deleteMediaUrls([cabin.imageUrl]).catch(() => undefined);
      const { error } = await this.sb.from('cabins').delete().eq('id', cabinId); // cascades per FKs
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async joinCabin(cabinId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({
      cabinMembers: [
        ...(this.state.cabinMembers ?? []).filter((m) => !(m.cabinId === cabinId && m.userId === meId)),
        { cabinId, userId: meId, role: 'member', status: 'active', muted: false, lastReadAt: now(), joinedAt: now() },
      ],
      cabins: (this.state.cabins ?? []).map((c) => (c.id === cabinId ? { ...c, memberCount: c.memberCount + 1 } : c)),
    });
    try {
      const { error } = await this.sb.rpc('join_cabin', { p_cabin: cabinId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async leaveCabin(cabinId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    const cabin = cabinById(this.state, cabinId);
    const soleOwner = cabin?.ownerId === meId && cabinMembersOf(this.state, cabinId).length === 1;
    if (soleOwner) {
      // Sole-owner leave retires the cabin (server AFTER DELETE trigger).
      return this.deleteCabin(cabinId);
    }
    this.commit({
      cabinMembers: (this.state.cabinMembers ?? []).filter((m) => !(m.cabinId === cabinId && m.userId === meId)),
      cabins: (this.state.cabins ?? []).map((c) => (c.id === cabinId ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c)),
    });
    try {
      const { error } = await this.sb.from('cabin_members').delete().eq('cabin_id', cabinId).eq('user_id', meId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async requestJoin(cabinId: string, message: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    if (message.length > LIMITS.cabinRequestMsgMax) {
      return { ok: false, error: `Join messages are capped at ${LIMITS.cabinRequestMsgMax} characters.` };
    }
    const before = this.state;
    const id = crypto.randomUUID();
    this.commit({
      cabinJoinRequests: [
        { id, cabinId, userId: meId, message: message.trim() || null, status: 'pending', createdAt: now() },
        ...(this.state.cabinJoinRequests ?? []),
      ],
    });
    try {
      // notify(owner+admins) happens in the DB insert trigger (0008).
      const { error } = await this.sb
        .from('cabin_join_requests')
        .insert({ id, cabin_id: cabinId, user_id: meId, message: message.trim() || null });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async cancelCabinRequest(requestId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const before = this.state;
    this.commit({
      cabinJoinRequests: (this.state.cabinJoinRequests ?? []).map((r) =>
        r.id === requestId ? { ...r, status: 'cancelled' } : r,
      ),
    });
    try {
      const { error } = await this.sb.from('cabin_join_requests').delete().eq('id', requestId); // cancel = remove
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async approveCabinRequest(requestId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const req = (this.state.cabinJoinRequests ?? []).find((r) => r.id === requestId);
    if (!req) return { ok: false, error: 'Request not found.' };
    const before = this.state;
    this.commit({
      cabinJoinRequests: (this.state.cabinJoinRequests ?? []).map((r) =>
        r.id === requestId ? { ...r, status: 'approved' } : r,
      ),
      cabinMembers: [
        ...(this.state.cabinMembers ?? []).filter((m) => !(m.cabinId === req.cabinId && m.userId === req.userId)),
        { cabinId: req.cabinId, userId: req.userId, role: 'member', status: 'active', muted: false, lastReadAt: now(), joinedAt: now() },
      ],
      cabins: (this.state.cabins ?? []).map((c) => (c.id === req.cabinId ? { ...c, memberCount: c.memberCount + 1 } : c)),
    });
    try {
      // security-definer function: membership insert + status + notify (0008).
      const { error } = await this.sb.rpc('approve_join_request', { p_request: requestId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async declineCabinRequest(requestId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const before = this.state;
    this.commit({
      cabinJoinRequests: (this.state.cabinJoinRequests ?? []).map((r) =>
        r.id === requestId ? { ...r, status: 'declined' } : r,
      ),
    });
    try {
      // notify(requester) happens in the DB update trigger (0008).
      const { error } = await this.sb.from('cabin_join_requests').update({ status: 'declined' }).eq('id', requestId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async sendCabinMessage(cabinId: string, body: string, imageRef: string | null, replyTo: string | null): Promise<Result & { id?: string }> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const trimmed = body.trim();
    if (trimmed.length > LIMITS.cabinMessageMax) {
      return { ok: false, error: `Messages are capped at ${LIMITS.cabinMessageMax} characters.` };
    }
    const before = this.state;
    try {
      // CHT-03: images only (no video) — same post-images bucket + D pipeline.
      const imageUrl = imageRef ? await uploadRef(imageRef, 'post-images', meId) : null;
      const id = crypto.randomUUID();
      this.commit({
        cabinMessages: [
          ...(this.state.cabinMessages ?? []),
          { id, cabinId, senderId: meId, body: trimmed || null, imageUrl, replyTo, isDeleted: false, createdAt: now() },
        ],
        cabinMembers: (this.state.cabinMembers ?? []).map((m) =>
          m.cabinId === cabinId && m.userId === meId ? { ...m, lastReadAt: now() } : m,
        ),
      });
      const { error } = await this.sb
        .from('cabin_messages')
        .insert({ id, cabin_id: cabinId, sender_id: meId, body: trimmed || null, image_url: imageUrl, reply_to: replyTo });
      if (error) throw error;
      return { ok: true, id };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async deleteCabinMessage(messageId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const before = this.state;
    this.commit({
      cabinMessages: (this.state.cabinMessages ?? []).map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, body: null, imageUrl: null } : m,
      ),
    });
    try {
      const { error } = await this.sb.from('cabin_messages').update({ is_deleted: true }).eq('id', messageId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async markCabinRead(cabinId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    this.commit({
      cabinMembers: (this.state.cabinMembers ?? []).map((m) =>
        m.cabinId === cabinId && m.userId === meId ? { ...m, lastReadAt: now() } : m,
      ),
    });
    try {
      const { error } = await this.sb
        .from('cabin_members')
        .update({ last_read_at: now() })
        .eq('cabin_id', cabinId)
        .eq('user_id', meId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async muteCabin(cabinId: string, muted: boolean): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    this.commit({
      cabinMembers: (this.state.cabinMembers ?? []).map((m) =>
        m.cabinId === cabinId && m.userId === meId ? { ...m, muted } : m,
      ),
    });
    try {
      const { error } = await this.sb
        .from('cabin_members')
        .update({ muted })
        .eq('cabin_id', cabinId)
        .eq('user_id', meId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async removeCabinMember(cabinId: string, userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const before = this.state;
    const cabin = cabinById(this.state, cabinId);
    this.commit({
      cabinMembers: (this.state.cabinMembers ?? []).filter((m) => !(m.cabinId === cabinId && m.userId === userId)),
      cabins: cabin ? (this.state.cabins ?? []).map((c) => (c.id === cabinId ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c)) : this.state.cabins,
    });
    try {
      // RLS + BEFORE DELETE trigger: only owner/admin, never the owner row.
      const { error } = await this.sb.from('cabin_members').delete().eq('cabin_id', cabinId).eq('user_id', userId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async banCabinMember(cabinId: string, userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const before = this.state;
    this.commit({
      cabinMembers: (this.state.cabinMembers ?? []).map((m) =>
        m.cabinId === cabinId && m.userId === userId ? { ...m, status: 'banned' } : m,
      ),
      cabins: (this.state.cabins ?? []).map((c) =>
        c.id === cabinId && c.ownerId !== userId ? { ...c, memberCount: Math.max(0, c.memberCount - 1) } : c,
      ),
    });
    try {
      // RLS + BEFORE UPDATE trigger: only owner/admin, never the owner row.
      const { error } = await this.sb.from('cabin_members').update({ status: 'banned' }).eq('cabin_id', cabinId).eq('user_id', userId);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async transferCabinOwnership(cabinId: string, userId: string): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({
      cabinMembers: (this.state.cabinMembers ?? []).map((m) => {
        if (m.cabinId !== cabinId) return m;
        if (m.userId === userId) return { ...m, role: 'owner' as const };
        if (m.userId === meId) return { ...m, role: 'admin' as const };
        return m;
      }),
      cabins: (this.state.cabins ?? []).map((c) => (c.id === cabinId ? { ...c, ownerId: userId } : c)),
    });
    try {
      // security-definer: role swap (single-owner trigger demotes old owner)
      // + cabins.owner_id update, atomically (0008).
      const { error } = await this.sb.rpc('transfer_cabin_ownership', { p_cabin: cabinId, p_new_owner: userId });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- notifications (NOT-1..2) --- */
  async markNotificationsRead(): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({
      notifications: this.state.notifications.map((n) => (n.recipientId === meId && !n.isRead ? { ...n, isRead: true } : n)),
    });
    try {
      const { error } = await this.sb.from('notifications').update({ is_read: true }).eq('user_id', meId).eq('is_read', false);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  async setNotificationMutes(types: string[]): Promise<Result> {
    const guard = this.requireAuth();
    if (!guard.ok) return guard;
    const meId = this.state.session!.id;
    const before = this.state;
    this.commit({ mutedNotifications: [...types] });
    try {
      const { error } = await this.sb
        .from('notification_prefs')
        .upsert({ user_id: meId, muted_types: types, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      this.state = before;
      this.emit();
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* --- feeds & search (FEED-1..4) — same selectors, over hydrated rows --- */
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

}

/* ----------------------------------------------------------------- react */

// The entry point renders a setup screen instead of importing this module when
// credentials are missing, so this guard is only a backstop for direct imports.
if (!supabase) {
  throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

/** Live Supabase provider — the app's only data backend. */
export const provider: DataProvider = new SupabaseProvider(supabase);

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

/** True once the provider has hydrated its first snapshot (UI-04 skeletons). */
export function useDataReady(): boolean {
  useAppState(); // re-render when hydration flips the provider's ready flag
  return provider.ready();
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
