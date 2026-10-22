# Circle

A social web app MVP — sign in with Google, build a profile, post text + photos or a short video, follow people, like, comment, repost, share, bookmark, and chat — with stories, hashtags, direct messages, live notifications, and moderation.

Built from [`PLAN.md`](./PLAN.md) (derived from `PRD-social-media-app.md` v1.0 + the v2 feature expansion at the product owner's request).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run preview    # serve the production build
```

No configuration needed: the app boots in **demo mode** — a localStorage-backed data provider (`DemoProvider`) with seeded users, posts, comments, likes, open reports, stories, and a demo DM thread. Videos live in IndexedDB blobs (only a `vid:` key goes into localStorage) so the quota stays healthy.

| Demo entry point | What it shows |
|---|---|
| **Continue with Google** | Simulated OAuth → onboarding (username/bio/avatar + ToS) → home feed, story ring, DM with Maya |
| **Sign in as demo admin** | `/admin/reports` moderation queue (dismiss / remove / suspend) |

> Tip: clear site data (or run `localStorage.removeItem('circle.state.v1')`) to reset the demo world.

In `npm run dev`, an activity simulator fires an incoming like/comment/repost/follow every 60–120 s while the tab is visible, so live notification badges and toasts are observable without a backend (see **Realtime** below).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| Routing | React Router v6, lazy route chunks (route table mirrors PRD §7.1 + v2) |
| Data | `DataProvider` contract → `DemoProvider` (local) / Supabase (production slot) |
| Media | Images resized client-side (data URLs); videos ≤60 s stored as blobs in **IndexedDB** (`src/lib/media.ts`) |
| Database | PostgreSQL schema + RLS in `supabase/migrations/0001_init.sql` + `0002_features.sql` |
| Icons | lucide-react |

## v2 feature expansion

| Feature | Where | Notes |
|---|---|---|
| Repost / undo | `PostCard`, `toggleRepost`, `reposts` table | Notification on repost; repost entries merge into the Following feed ("X reposted" header, deduped by post) |
| Share post | `ShareMenu` | Copy link, native Web Share, or send into a DM (thread pre-attaches via `?share=post:<id>`) |
| Stories (24 h) | `components/Stories.tsx` | Ring on Home, tap-through viewer with progress bars + autoplay, image/video/text, purged at expiry |
| Video posts | `PostComposer`, `VideoPlayer` | 1 video XOR 4 photos; ≤10 MB, ≤60 s, metadata-validated; blob in IndexedDB |
| Photos in comments | `CommentList` | ≤2 resized photos per comment |
| Save & download | bookmark button, `/saved`, post menu | Private bookmarks; "Save media to device" for photos/videos |
| Hashtags | `RichText`, `/hashtag/:tag`, Explore panel | ≤10 tags/post, ≤30 chars, GIN-indexed, trending (7 d) panel |
| Direct messages | `/messages`, `/messages/:id` | Text/photo/video/shared-post bubbles, read receipts, unread badges, member-only + block-aware, 20 msg/10 min |
| Live notifications | store pub/sub + cross-tab sync + DEV simulator | Supabase Realtime wiring documented below |
| Safety | `rateLimit.ts`, store guards | Duplicate-content guard, link cap (3), hashtag caps, story/DM rate limits, block enforcement everywhere, video validation |
| Optimization | `App.tsx`, `InfiniteFeed` | Lazy routes (85 KB gzip initial), `memo(PostCard)`, memoized selectors, lazy/async images, metadata-only video preload |

---

## Project structure

```
src/
  App.tsx                  route table (/, /onboarding, /home, /explore, /u/:username,
                           /p/:id, /notifications, /messages, /messages/:id, /hashtag/:tag,
                           /saved, /settings, /admin/reports, /terms, /privacy) — lazy chunks
  types.ts                 domain types (mirror the SQL schema) + limits
  lib/
    store.ts               DataProvider contract, DemoProvider, feed/hashtag/story/DM selectors
    media.ts               IndexedDB video blobs, video validation, media downloads
    auth.tsx               ProtectedRoute / AdminRoute / PublicOnly guards
    rateLimit.ts           client-side rate limiting (posts, comments, follows, DMs, stories)
    format.ts              timeAgo, counters, avatar/image SVG helpers, hashtag extraction
  components/              Layout, PostCard, PostComposer, ImageUploader, InfiniteFeed,
                           LikeButton, FollowButton, CommentList, NotificationBell,
                           ReportModal, ShareMenu, RichText, VideoPlayer, Stories
                           (viewer/composer/bar), Toast, Avatar
  pages/                   Landing, Onboarding, Home, Explore, Profile, PostDetail,
                           Notifications, Messages, MessageThread, Hashtag, Saved,
                           Settings, AdminReports, Terms, Privacy
supabase/
  migrations/0001_init.sql schema, triggers, get_following_feed RPC, RLS, storage buckets
  migrations/0002_features.sql reposts, saves, stories, conversations/messages, video +
                           hashtags columns, get_home_feed RPC, trending-hashtag RPC,
                           RLS for every new table, media bucket, Realtime publication
```

---

## Switching to Supabase (production)

The frontend only talks to the `DataProvider` interface (`src/lib/store.ts`). To go live:

1. **Create a Supabase project** and apply both migrations (order matters):
   ```bash
   supabase link --project-ref <ref>
   supabase db push   # 0001_init.sql, then 0002_features.sql
   ```
   Then schedule the story purge — either enable **pg_cron** and run
   `select cron.schedule('purge-stories', '17 * * * *', $$delete from stories where expires_at < now()$$);`
   or call `purge_expired_stories()` from a scheduled Edge Function.
2. **Google OAuth** (PRD §5.3 checklist):
   - Create a *Web application* OAuth client in Google Cloud Console.
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Authorized JS origins: your domain + `http://localhost:5173`
   - Paste Client ID/Secret into Supabase Auth → Google provider; configure the consent screen.
3. **Env vars** (`.env`):
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
4. **Implement `SupabaseProvider`** against the same interface:
   - Auth: `signInWithOAuth({ provider: 'google' })`, session in httpOnly/secure storage via the built-in flow.
   - Reads: PostgREST selects + `get_home_feed` RPC (repost-aware cursor feed) + `get_trending_hashtags`.
   - Writes: inserts/updates (RLS enforces ownership); storage uploads to `avatars/{uid}/`, `post-images/{uid}/`, `media/{uid}/` (videos).
   - **Realtime**: subscribe after auth —
     ```ts
     channel(`rt:me:${uid}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${uid}` }, onNotif)
     channel(`rt:conv:${convId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, onMsg)
     ```
     The tables are already added to the `supabase_realtime` publication in `0002_features.sql`.
5. Swap the singleton at the bottom of `store.ts` when env vars are present.

RLS already encodes the security matrix from PRD §6.4: every table has policies; `notifications` inserts happen only via the `security definer` trigger; storage paths are scoped to `auth.uid()`.

---

## Verification performed

- `npm run build` — `tsc --noEmit` + Vite production bundle pass (initial bundle 85 KB gzip; 12 lazy route chunks).
- **v1 flows** (browser): sign-in → onboarding (live username validation, ToS gate) → empty-state follow suggestions → posting → Following feed → like/comment → search (`?q=`) → follow → profile tabs → notifications (badge + mark-read) → report modal → admin dismiss → settings → persistence across reload.
- **v2 flows** (browser, on migrated v1 state): story ring + viewer (progress bars, captions, expiry countdown) + text-story creation → repost with "X reposted" feed header + notification → share menu → send-to-DM → thread with post-attachment bubble → `#design` hashtag link → `/hashtag/design` feed → Explore trending-tags panel → `/saved` bookmark collection → photo-comment uploader (0/2) on post detail → notifications with repost icons → live badge updates from the activity simulator + a second live browser session (cross-session storage sync).
- Direct data-layer checks: rate limiting (6th post/10 min rejected), blocking hides content both ways + severs DM threads, soft-delete excludes posts from all feeds, admin-only route redirect, duplicate-content guard, hashtag/link caps.

## MVP acceptance criteria (PRD §13 + v2 expansion)

- [x] Sign in → onboarding with no manual account creation
- [x] Unique username → home feed
- [x] Create, view, and delete a post (text + images, client-resized; video ≤60 s)
- [x] Follow others → posts appear in Following feed (incl. their reposts)
- [x] Likes and comments persist across reloads (localStorage; SQL tables in prod)
- [x] Cross-user access blocked by RLS policies (SQL) + route guards (UI); DMs member-only
- [x] Reporting and blocking function; admins can action reports
- [x] Repost, share-to-DM, bookmarks, hashtags, ephemeral stories, live notifications
- [ ] Deployed to production with HTTPS, backups, legal pages — **ops step**: Netlify/Vercel + Supabase (checklist below)

### Deploy checklist
- [ ] Netlify/Vercel site connected to the repo (`npm run build`, publish `dist`)
- [ ] Supabase project + migration applied; Google OAuth verified (start early — PRD risk)
- [ ] Daily database backups enabled (dashboard → backups)
- [ ] Custom domain + HTTPS; CSP headers
- [ ] `/terms` and `/privacy` published (already in the bundle)
- [ ] Seed first follows / surface Explore to avoid the empty-feed cold start

---

## Notes

- **Scope**: all P0 + P1 requirements implemented, plus the v2 expansion (repost/share/stories/video/DMs/hashtags/saves/realtime). P2 (email digests) intentionally out, schema-ready.
- **Limits**: posts ≤500 chars (or media-only), comments ≤300, bio ≤160, display name ≤50, username `^[a-zA-Z0-9_]{3,20}$` case-insensitive unique; ≤4 images ≤5 MB (resized to ≤1000 px JPEG) **or** 1 video ≤10 MB ≤60 s (mp4/webm/mov); ≤2 photos per comment; ≤10 hashtags/post (≤30 chars each); ≤3 links/post; DMs ≤1000 chars (20/10 min); stories ≤10/hour, 24 h TTL.
- **Spam guards**: duplicate-content detection (same author, same body, 10 min window) across posts/comments/DMs; posting 5/10 min, commenting 20/10 min, follows 30/10 min.
- **Soft delete**: posts are hidden immediately, purged after 30 days (video blobs released from IndexedDB); expired stories purged on load (+ SQL `purge_expired_stories()`).
- **Accessibility**: semantic landmarks, labelled controls, visible focus rings, alt text, 360 px → desktop layout with a mobile tab bar.
