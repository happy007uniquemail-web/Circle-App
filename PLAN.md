# Circle — Implementation Plan (derived from PRD-social-media-app.md)

| | |
|---|---|
| **Source** | `D:\Downloads_Files\PRD-social-media-app.md` (v1.0, Draft) |
| **Project root** | `D:\Circle` |
| **Status** | Plan approved for execution → Phased delivery with previews |

---

## 1. PRD Analysis

### 1.1 What the PRD asks for
- **Product**: "Circle" — a web social platform: Google sign-in → profile → short posts (text + up to 4 images) → follow → like/comment, with feeds, search, notifications, and moderation.
- **Core loop to protect**: `post → discover → like/comment → follow`, with a landing→first-post path under 2 minutes.
- **MVP success bar**: the 8 acceptance criteria in §13 of the PRD (Google sign-in, onboarding, posts, follows/feed, likes & comments persist, RLS isolation verified, report/block/admin, production deploy).

### 1.2 Scope by priority
| Priority | Included | Items |
|---|---|---|
| **P0 (must)** | ✅ Full | Google-style auth flow, onboarding/username rules, profiles, posts (500 chars, ≤4 images, soft delete), follow system, like/comment, Following feed (cursor, 20/page), rate limiting, ToS/Privacy pages |
| **P1 (should)** | ✅ Full | Post edit + "edited" label, follower/following lists, Explore feed (7-day engagement score), user search, blocked-user exclusion, notifications + unread badge, report/block, admin dashboard, account deletion |
| **P2 (post-launch)** | ⛔ Out (schema-ready only) | Email digests, algorithmic/ML ranking, DMs, video, ads, native apps |

### 1.3 Key constraints from the PRD
- **Stack**: React + Vite + TypeScript + Tailwind, Supabase (PostgreSQL + RLS + Storage + Realtime), Netlify/Vercel hosting.
- **Data**: 8 tables (profiles, posts, comments, likes, follows, blocks, notifications, reports), RLS on **every** table, denormalized `like_count`/`comment_count`, triggers for notifications.
- **Non-functional**: LCP < 2.5 s, feed p95 < 300 ms, WCAG 2.1 AA, 360 px → desktop responsive, no secrets in client.

### 1.4 Open questions — resolved for this build (defaults, changeable)
| # | Question | Decision |
|---|---|---|
| 1 | Public (logged-out) posts? | **No** — signed-in only, matches RLS ("Anyone authenticated") |
| 2 | Private accounts at launch? | **No** — all profiles public (non-goal for MVP) |
| 3 | Username changes? | **Changeable in Settings**, same uniqueness/format rules, cooldown noted in UI copy |
| 4 | Launch regions / language? | English-only, default region (GDPR/CCPA basics kept) |
| 5 | DMs next release? | Deferred — tracked as post-MVP |

### 1.5 Risks that shape the plan
- **Empty feed on day 1** → onboarding suggests accounts to follow; Explore seeded with popular posts.
- **Misconfigured RLS** → all policies shipped as versioned SQL in `supabase/migrations/`, testable in CI.
- **Supabase vendor lock-in** → business logic in portable SQL/RPC; frontend talks to a thin data-provider interface.
- **No live Supabase/Google credentials in this environment** → the app runs in **Demo mode** (localStorage-backed provider implementing the same interface); a `SupabaseProvider` drop-in slot + full SQL migrations are included so wiring real credentials is config-only.

---

## 2. Architecture (this build)

```
src/
  main.tsx, App.tsx            # bootstrap + router (all PRD §7.1 routes)
  types.ts                     # shared domain types (mirrors schema)
  lib/
    store.ts                   # DataProvider interface + DemoProvider (localStorage)
    supabase.ts                # env-driven client slot (VITE_SUPABASE_URL / _ANON_KEY)
    auth.tsx                   # AuthProvider, useAuth, ProtectedRoute, AdminRoute
    rateLimit.ts               # client-side rate limits (MOD-4) + input sanitization
    format.ts                  # relative time, counters, validation helpers
  components/
    Layout, Avatar, PostCard, PostComposer, ImageUploader (client resize),
    LikeButton (optimistic), FollowButton (optimistic), CommentList,
    InfiniteFeed (cursor, 20/page), UserSearch, NotificationBell,
    ReportModal, BlockedGuard
  pages/
    Landing, Onboarding, Home, Explore, Profile, PostDetail,
    Notifications, Settings, AdminReports, Terms, Privacy
supabase/migrations/
  0001_init.sql                # schema + triggers + RPCs + RLS + storage policies
```

**Data contract**: every page uses `DataProvider` methods (`getFeed`, `createPost`, `toggleLike`, …). `DemoProvider` = full local implementation (runnable now); `SupabaseProvider` = same methods over PostgREST/RPC (activate by setting env vars).

---

## 3. Delivery Phases (mirrors PRD §10, with preview checkpoints)

| Phase | Scope | Preview checkpoint | Status |
|---|---|---|---|
| **P0 — Foundation** | Scaffold (Vite/React/TS/Tailwind), routing, auth + onboarding, types, store, PLAN.md | This plan + Landing/Onboarding | ✅ done |
| **P1 — Core loop** | Posts (create/edit/delete, image resize ≤4), profiles, follow, Following feed, post detail | Feed + Composer + Profile | ✅ done |
| **P2 — Engagement** | Likes, comments, notifications + unread badge, optimistic counters | Post detail + Notifications | ✅ done |
| **P3 — Discovery & Safety** | Explore (7-day score), search, report/block, admin dashboard, rate limiting | Explore + Admin | ✅ done |
| **P4 — Hardening** | SQL migrations w/ RLS, ToS/Privacy, a11y/responsive pass, README, build verification | Full app in browser + SQL | ✅ done (prod deploy = ops step) |

**Verification per phase**: `npm run build` (tsc + vite) must pass; running app opened in the Review pane after P0, P2 and P4.
All verification performed is listed in `README.md` → *Verification performed*.

---

## 4. Acceptance mapping (PRD §13 → where it's verified)

| Criterion | Verified in |
|---|---|
| Google-style sign-in → onboarding | `Landing`, `Onboarding` (demo OAuth mimics redirect flow) |
| Unique username → home feed | `Onboarding` validation (3–20, `^[a-zA-Z0-9_]+$`, case-insensitive) |
| Create/view/delete post with images | `PostComposer`, `PostCard`, `PostDetail` |
| Follow → posts in Following feed | `FollowButton`, `Home` (cursor pagination) |
| Likes/comments persist | `DemoProvider` (localStorage) / SQL tables |
| Users can't touch others' data | RLS policies in `0001_init.sql` + `ProtectedRoute` |
| Report/block + admin action | `ReportModal`, `Settings`, `AdminReports` |
| Production deploy checklist | `README.md` (Netlify/Vercel + Supabase setup) |

---

# 5. Feature Expansion v2 (current phase)

Scope added beyond PRD v1.0 at product owner request (PRD §1.4 non-goals superseded for video/DM).

| ID | Feature | Design decisions |
|---|---|---|
| **F-REP** | **Repost / undo-repost** | `reposts` table (PK user+post), denormalized `posts.repost_count`, notification type `repost`, repost entries merged into Following feed with “X reposted” header (deduped by post, later event wins) |
| **F-SHR** | **Share post** | Share menu: copy link (`/p/:id`), native `navigator.share` when available, **send to DM** (pre-fills thread composer via `?share=post:id`) |
| **F-STO** | **Ephemeral stories (24 h)** | `stories` table, `expires_at = created_at + 24h`, purged on load; story ring on Home, tap-through viewer with progress bars + autoplay, image/video/text stories, own-story add; expired content invisible everywhere (safety) |
| **F-VID** | **Video posts** | 1 video XOR 4 images per post; ≤10 MB, ≤60 s, mp4/webm/mov validated via metadata probe; stored as **Blob in IndexedDB** (`vid:` keys) to keep localStorage lean; `preload="metadata"` player |
| **F-CMI** | **Photos in comments** | `comments.image_urls[]` ≤2, client-resized to 800 px |
| **F-SAV** | **Save & download media** | Bookmark saves (`saves` table) → `/saved` page; per-post **Download** action for photos/videos (blob-aware) |
| **F-HAS** | **Hashtags** | Extracted to `posts.hashtags[]` (≤10/tag ≤30 chars, GIN-indexed in SQL), rendered as links, `/hashtag/:tag` feed, trending hashtags panel on Explore |
| **F-DM** | **Direct messaging** | 1:1 `conversations` + `messages` (text, 1 media, or shared post); `/messages` + `/messages/:id`; member-only access, block enforcement, DM rate limit (20/10 min), duplicate-content guard, read receipts, unread badge; Message button on profiles |
| **F-RT** | **Realtime notifications** | Store pub/sub + cross-tab `storage` sync (live across tabs), DEV activity simulator driving incoming like/comment/follow toasts, bell pulse; Supabase Realtime wiring documented for production |
| **F-SAF** | **Safety hardening** | Block exclusion across feeds/stories/DMs, duplicate-content spam guard, link cap (3/post), hashtag caps, story/DM rate limits, video duration+type validation, existing report/block/admin queue unchanged |
| **F-OPT** | **Optimization** | Route-level code splitting (`React.lazy` + Suspense), `memo(PostCard)`, memoized selectors, lazy/async images, metadata-only video preload, cursor pagination (20/page), no web fonts, gzip bundle check |

**New/changed routes**: `/messages`, `/messages/:id`, `/saved`, `/hashtag/:tag` · header + mobile nav gain Messages; avatar menu gains Saved.

| Phase | Scope | Status |
|---|---|---|
| **V2-1 Data** | types v2, store v2 (reposts/saves/stories/DM/selectors/migration), video media store | ✅ done |
| **V2-2 Feed UX** | FeedItem model, PostCard (repost header/share/save/video), hashtag rendering, comments+photos | ✅ verified in browser |
| **V2-3 Stories** | Story ring, viewer, composer, expiry | ✅ verified (incl. text-story creation) |
| **V2-4 DM + realtime** | Messages pages, nav badges, simulator, Message button | ✅ verified (share→DM round-trip) |
| **V2-5 Harden** | SQL `0002_features.sql`, safety limits, lazy routes, build + walkthrough verification | ✅ build green, 12 route chunks |
