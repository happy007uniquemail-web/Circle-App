// Domain types — mirror the PostgreSQL schema
// (supabase/migrations/0001_init.sql + 0002_features.sql)

export type Role = 'user' | 'admin';
export type NotifType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'repost'
  | 'mention'
  | 'follow_request'
  | 'follow_request_approved'
  | 'cabin_join_request'
  | 'cabin_request_approved'
  | 'cabin_request_declined'
  | 'cabin_invite';
export type ReportTarget = 'post' | 'comment' | 'user' | 'cabin' | 'cabin_message'; // CHT-12: cabin reporting
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'nsfw' | 'other';
export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export type MediaKind = 'image' | 'video';

/** 1:1 with auth.users (Google OAuth subject = id) */
export type Visibility = 'public' | 'followers' | 'private';
export type WhoCan = 'everyone' | 'followers' | 'nobody';

export interface Profile {
  id: string;
  username: string | null; // null until onboarding completes (PROF-1)
  displayName: string;
  bio: string;
  avatarUrl: string;
  role: Role;
  isSuspended: boolean;
  createdAt: string;
  /* Workstream E (PRV-01/04/05/06/09) — optional in state, always present from DB rows */
  visibility?: Visibility;
  showJoinDate?: boolean;
  showFollowLists?: boolean;
  dmPermission?: WhoCan;
  cabinInvitePermission?: WhoCan;
  discoverable?: boolean;
  /** INT-06/PRV-04: show the interest tags on the profile. */
  showInterest?: boolean;
}

/** Row of the N—N `mutes` table (PRV-08): muter hides muted's content. */
export interface Mute {
  muterId: string;
  mutedId: string;
  createdAt: string;
}

/** Catalog row of the curated `interests` table (INT-01). */
export interface Interest {
  id: string;
  slug: string;
  name: string;
  category: string;
  isActive: boolean;
}

/** Row of `user_interests` (INT-02): one person's pick from the catalog. */
export interface UserInterest {
  userId: string;
  interestId: string;
  createdAt: string;
}

/** Privacy settings patch (PRV-01/04/05/06/09) — instant-save page. */
export interface PrivacyInput {
  visibility?: Visibility;
  showJoinDate?: boolean;
  showFollowLists?: boolean;
  dmPermission?: WhoCan;
  cabinInvitePermission?: WhoCan;
  discoverable?: boolean;
  showInterest?: boolean; // INT-06: interests tag visibility (PRV-04)
}

/** The signed-in session (only Google scopes: openid, email, profile — AUTH-4) */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface Post {
  id: string;
  authorId: string;
  body: string; // 1–500 chars (POST-1)
  imageUrls: string[]; // ≤4 data URLs (POST-2)
  videoUrl: string | null; // `vid:` IndexedDB key (F-VID) — XOR with images
  hashtags: string[]; // normalized, ≤10 (F-HAS)
  likeCount: number;
  commentCount: number;
  repostCount: number; // denormalized (F-REP)
  editedAt: string | null;
  deletedAt: string | null; // soft delete (POST-4)
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  body: string; // 1–300 chars (ENG-2)
  imageUrls: string[]; // ≤2, resized (F-CMI)
  createdAt: string;
}

/** Row of the N—N `likes` table (one like per user per post — ENG-1). */
export interface LikeRow {
  userId: string;
  postId: string;
  createdAt: string;
}

export interface Follow {
  followerId: string;
  followingId: string;
  /** PRV-03: 'pending' rows are follow requests; legacy rows are 'accepted'. */
  status?: 'pending' | 'accepted';
  createdAt: string;
}

/** Row of `reposts` (F-REP). */
export interface Repost {
  userId: string;
  postId: string;
  createdAt: string;
}

/** Row of `saves` — private bookmarks (F-SAV). */
export interface Save {
  userId: string;
  postId: string;
  createdAt: string;
}

export interface Block {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

/** Ephemeral story, expires 24h after creation (F-STO). */
export interface Story {
  id: string;
  userId: string;
  kind: MediaKind | 'text';
  media: string | null; // data URL (image) or `vid:` key (video)
  caption: string; // ≤200 chars
  createdAt: string;
  expiresAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  type: NotifType;
  /** What the notification points at: 'post' | 'comment' | 'user' | 'cabin' … */
  entityType: string;
  entityId: string | null;
  /** Extra navigation context (e.g. { post_id }) supplied by the trigger. */
  data: Record<string, string>;
  isRead: boolean;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
}

/** 1:1 direct message thread (F-DM); memberIds always length 2 in MVP. */
export interface Conversation {
  id: string;
  memberIds: string[];
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string; // ≤1000 chars
  mediaKind: MediaKind | null;
  mediaRef: string | null; // data URL (image) or `vid:` key (video)
  postId: string | null; // shared post attachment
  createdAt: string;
  readAt: string | null;
}

/* -------------------------------------------------- cabins (Workstream G) */

export type CabinType = 'open' | 'request';
export type CabinRole = 'owner' | 'admin' | 'member';
export type CabinMemberStatus = 'active' | 'banned';
export type CabinRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

/** CAB-01/02: interest-based group room; owner/admin/member roles. */
export interface Cabin {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null; // compressed per D
  type: CabinType; // open | request (invite-only = phase 2)
  ownerId: string;
  maxMembers: number; // default 500
  memberCount: number; // trigger-maintained; discovery-safe
  createdAt: string;
}

export interface CabinInterest {
  cabinId: string;
  interestId: string;
}

export interface CabinMember {
  cabinId: string;
  userId: string;
  role: CabinRole;
  status: CabinMemberStatus;
  muted: boolean;
  lastReadAt: string; // CHT-07 unread tracking
  joinedAt: string;
}

export interface CabinJoinRequest {
  id: string;
  cabinId: string;
  userId: string;
  message: string | null; // ≤200 (CAB-11)
  status: CabinRequestStatus;
  createdAt: string;
}

export interface CabinMessage {
  id: string;
  cabinId: string;
  senderId: string;
  body: string | null; // ≤2000 (CHT-04); null after soft delete
  imageUrl: string | null; // CHT-03: images only, no video
  replyTo: string | null; // CHT-09
  isDeleted: boolean; // CHT-08 placeholder
  createdAt: string;
}

/** Payload for create/edit cabin forms (CAB-01). */
export interface CabinInput {
  name: string;
  description: string | null;
  imageUrl: string | null;
  type: CabinType;
  interestIds: string[]; // 1–3 required
}

/** Anything rendered in a timeline: a post, optionally stamped by a reposter. */
export interface FeedItem {
  post: Post;
  reposterId: string | null;
  repostedAt: string | null;
}

/** Complete snapshot hydrated by the data provider for selectors. */
export interface AppState {
  session: SessionUser | null;
  profiles: Profile[];
  posts: Post[];
  comments: Comment[];
  likes: LikeRow[];
  follows: Follow[];
  reposts: Repost[];
  saves: Save[];
  blocks: Block[];
  /** PRV-08: users I muted (their content is hidden from my feeds). */
  mutes?: Mute[];
  /** INT-01: curated interest catalog (populated by seed/0007 migration). */
  interests?: Interest[];
  /** INT-02: everyone's interest picks (needed to match people, INT-07). */
  userInterests?: UserInterest[];
  /** CAB-02: cabins the viewer can discover; members/messages hydrate on demand. */
  cabins?: Cabin[];
  cabinInterests?: CabinInterest[];
  cabinMembers?: CabinMember[];
  cabinJoinRequests?: CabinJoinRequest[];
  cabinMessages?: CabinMessage[];
  stories: Story[];
  notifications: AppNotification[];
  /** Muted notification types for the signed-in user (NOT-09). */
  mutedNotifications: string[];
  reports: Report[];
  conversations: Conversation[];
  messages: Message[];
  /** Seed/migration marker (v2 features seeded once for v1 states). */
  extrasV2?: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface Result {
  ok: boolean;
  error?: string;
}

// All limits live in one config file (TRD §6.6) — re-exported here so the
// existing `import { LIMITS } from '../types'` call sites keep working.
export { LIMITS } from './config/limits';
