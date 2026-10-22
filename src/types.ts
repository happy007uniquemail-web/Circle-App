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
  | 'cabin_invite';
export type ReportTarget = 'post' | 'comment' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'nsfw' | 'other';
export type ReportStatus = 'open' | 'dismissed' | 'actioned';
export type MediaKind = 'image' | 'video';

/** 1:1 with auth.users (Google OAuth subject = id) */
export interface Profile {
  id: string;
  username: string | null; // null until onboarding completes (PROF-1)
  displayName: string;
  bio: string;
  avatarUrl: string;
  role: Role;
  isSuspended: boolean;
  createdAt: string;
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

/** Anything rendered in a timeline: a post, optionally stamped by a reposter. */
export interface FeedItem {
  post: Post;
  reposterId: string | null;
  repostedAt: string | null;
}

/** Everything persisted by the data provider (DemoProvider = localStorage). */
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
