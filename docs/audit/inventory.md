# AUD-01 — Route & component inventory

Stack verified against the repo: **React 18 + TypeScript + Vite 5 + Tailwind CSS v4 + react-router-dom 6 + @supabase/supabase-js 2 + lucide-react + motion**. Hosting: Netlify SPA (`netlify.toml` fallback `/* → /index.html`). Backend: Supabase when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are real, otherwise in-browser `DemoProvider` (same UI for both).

## 1. Routes (`src/App.tsx`)

| Path | Page | Guard | Code-split |
|---|---|---|---|
| `/` | Landing | `PublicOnly` | eager |
| `/terms` | Terms | — | lazy |
| `/privacy` | Privacy | — | lazy |
| `/onboarding` | Onboarding | `ProtectedRoute` | eager |
| `/home` | Home | `ProtectedRoute` + Layout | eager |
| `/explore` | Explore | " | lazy |
| `/u/:username` | Profile | " | lazy |
| `/p/:id` | PostDetail | " | eager |
| `/notifications` | Notifications | " | lazy |
| `/messages` | Messages | " | lazy |
| `/messages/:id` | MessageThread | " | lazy |
| `/hashtag/:tag` | Hashtag | " | lazy |
| `/saved` | Saved | " | lazy |
| `/settings` | Settings | " | lazy |
| `/admin/reports` | AdminReports | `AdminRoute` | lazy |
| `*` | → redirect `/` | — | — |

Guards live in `src/lib/auth.tsx` (`ProtectedRoute`, `PublicOnly`, `AdminRoute`). Route-level `Suspense` fallback = spinner (`RouteFallback`).

## 2. Components (`src/components/`)

| Component | Responsibility |
|---|---|
| `Layout.tsx` | Authenticated app shell: sidebar/topbar + `<Outlet/>` + mobile bottom nav + toast host |
| `PostCard.tsx` | Post rendering: author, text (RichText), media grid, actions, inline edit |
| `PostComposer.tsx` | New post: text, photos (ImageUploader), video (media.ts) |
| `ImageUploader.tsx` | File pick → inline canvas resize → `data:` URL previews (max N) |
| `CommentList.tsx` | Comments list + composer (photos in comments) |
| `LikeButton.tsx` | Optimistic like with rollback |
| `FollowButton.tsx` | Optimistic follow/unfollow (will gain follow-request states in Workstream E) |
| `InfiniteFeed.tsx` | Cursor pagination, loading/empty sentinels, pull-…(scroll) |
| `Stories.tsx` | Story rail + story composer/viewer (24 h) |
| `NotificationBell.tsx` | Header link + unread badge |
| `VideoPlayer.tsx` | Muted, tap-to-play video with poster handling |
| `ShareMenu.tsx` | Copy-link/share sheet |
| `ReportModal.tsx` | Report a post/comment/user |
| `RichText.tsx` | Renders post text as text: mentions/hashtags/links (no `innerHTML`) |
| `Avatar.tsx` | Image with initials fallback |
| `Toast.tsx` | Toast host (`aria-live`) |
| `AnimatedList.tsx` | motion-primitives list wrapper |

## 3. Libraries (`src/lib/`)

| File | Responsibility |
|---|---|
| `store.ts` | `DataProvider` interface, `DemoProvider` (localStorage seed), `SupabaseProvider` (hydrate → selectors, optimistic writes, realtime → debounced re-hydrate), React context/hooks, selectors (feeds, unreadCount, …) |
| `supabase.ts` | Client singleton, `realBackend`, `uploadRef`/`uploadImages`, `friendlyError` |
| `auth.tsx` | Session context + route guards |
| `media.ts` | IndexedDB video blob store, `validateVideo`, download helper |
| `limits` (today `types.ts#LIMITS`) | Central limits — **will move to `src/config/limits.ts` (TRD §6.6)** |
| `format.ts` | timeAgo, initials avatar SVG |
| `rateLimit.ts` | Client-side action rate limiting (demo UX only) |
| `utils.ts` | cn() class merge, slug/highlight helpers |

## 4. Pages (`src/pages/`) — data views

Home (following+explore feeds), Explore (trending/people/hashtags), Profile (tabs: posts/media/likes), PostDetail (thread), Notifications, Messages, MessageThread (1:1 chat), Hashtag, Saved, Settings, Onboarding, AdminReports, Landing, Terms, Privacy.

## 5. Types (`src/types.ts`)

Domain rows (`Profile`, `Post`, `Comment`, `Like`, `Follow`, `Repost`, `Save`, `Block`, `Story`, `AppNotification`, `Report`, `Conversation`, `Message`), `AppState`, `LIMITS`.

## 6. Migrations (`supabase/migrations/`)

`0001_init.sql` (core schema + RLS + storage), `0002_features.sql` (reposts/saves/stories/DM/video/hashtags + realtime publication), `0003_admin_realtime.sql` (admin policies, realtime for posts/comments/stories/profiles, pg_cron story purge). New TRD migrations continue as `0004+`.
