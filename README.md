# Circle

A social web app — sign in with Google, build a profile, post text + photos or a short video, follow people, like, comment, repost, share, and chat — with stories, hashtags, direct messages, live notifications, moderation, interest-based suggestions, privacy controls, and **cabins** (group spaces with their own chat).

Runs two ways from one build: **demo mode** (localStorage, seeded world, no backend) and **live mode** against Supabase (Auth + PostgREST + Storage + Realtime) — the provider is picked at boot from the env.

Built from [`PLAN.md`](./PLAN.md); hardened per `circle-improvement-trd (1).md` (workstreams audit → G, see *Workstreams* below).

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run preview    # serve the production build
```

No configuration needed: the app boots in **demo mode** — a localStorage-backed `DemoProvider` with seeded users, posts, comments, likes, open reports, stories, DMs, notifications, interests, and 5 demo cabins (memberships, requests, and chat included). Set the Supabase env variables (see *Going live* below) and the identical build boots `SupabaseProvider` against your real backend instead.

| Demo entry point | What it shows |
|---|---|
| **Continue with Google** | Simulated OAuth → onboarding (username/bio/avatar + ToS + interest picker) → home feed |
| **Sign in as demo admin** | `/admin/reports` moderation queue (dismiss / remove content / suspend, incl. cabin reports) |

> Tip: clear site data (or run `localStorage.removeItem('circle.state.v1')`) to reset the demo world.

In `npm run dev`, an activity simulator fires an incoming like/comment/repost/follow every 60–120 s while the tab is visible, so live notification badges and toasts are observable without a backend.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| Routing | React Router v6, lazy route chunks |
| Data | `DataProvider` contract → `DemoProvider` (local) / `SupabaseProvider` (Supabase Auth + PostgREST + Storage + Realtime) |
| Media | Images resized/compressed client-side then uploaded to Supabase Storage; videos ≤60 s validated, ≤50 MB (demo mode keeps blobs in **IndexedDB**) |
| Database | PostgreSQL schema + RLS in `supabase/migrations/0001`–`0008` |
| Icons | lucide-react |

## Project structure

```
src/
  App.tsx                  route table (/, /onboarding, /home, /explore, /u/:username,
                           /p/:id, /notifications, /messages, /messages/:id, /hashtag/:tag,
                           /saved, /cabins, /cabins/new, /cabins/:id[/edit], /settings,
                           /settings/privacy, /admin/reports, /terms, /privacy) — lazy chunks
  types.ts                 domain types (mirror the SQL schema)
  config/limits.ts         SINGLE SOURCE OF TRUTH for all limits (see *Limits*)
  lib/
    store.ts               DataProvider contract, DemoProvider, SupabaseProvider, all selectors
    supabase.ts            live-backend client (env detection, storage uploads, error mapping)
    media.ts               IndexedDB video blobs, video validation, media downloads
    compress.ts            image compression (resize → WebP/JPEG, quality, size report)
    auth.tsx               ProtectedRoute / AdminRoute / PublicOnly guards
    rateLimit.ts           client-side rate limiting (posts, comments, follows, DMs, stories)
    format.ts              timeAgo, counters, avatar/image SVG helpers, hashtag extraction
  components/              Layout, PostCard, PostComposer, ImageUploader, InfiniteFeed,
                           LikeButton, FollowButton, CommentList, NotificationBell,
                           ReportModal, ShareMenu, RichText, VideoPlayer, Stories,
                           InterestPicker, ConfirmDialog, Skeleton, Toast, Avatar
  pages/                   Landing, Onboarding, Home, Explore, Profile, PostDetail,
                           Notifications, Messages, MessageThread, Hashtag, Saved, Cabins,
                           CabinForm, CabinDetail, Settings, PrivacySettings, AdminReports,
                           Terms, Privacy
supabase/migrations/
  0001_init.sql            profiles, posts, comments, follows, likes, blocks, reports,
                           RLS everywhere, storage buckets, counters triggers
  0002_features.sql        reposts, saves, stories, conversations/messages, video +
                           hashtag columns + RPCs, Realtime publication
  0003_admin_realtime.sql  admin moderation policies, extra Realtime tables, story purge
  0004_media_safety.sql    per-user storage quotas (500 MB), upload rate limit (20/h),
                           bucket file-size caps, orphan cleanup, media delete hooks
  0005_notifications.sql   notifications table (NOT-01), security-definer notify path,
                           per-type read semantics, Realtime
  0006_privacy.sql         privacy switches (PRV-01..12), is_admin() helper,
                           asymmetric profile visibility, DM-gate enforcement
  0007_interests.sql       interests catalog (48 seeded), user_interests, ≤10 trigger
  0008_cabins.sql          cabins, members, join_requests, messages (+RQ), security-definer
                           join/approve/transfer functions, membership-gated RLS, member
                           counts, rate limit (20 msg/min), reports constraint extension
docs/audit/                per-workstream fix records (see *Workstreams*)
```

## Workstreams (improvement TRD)

The app was audited and hardened workstream-by-workstream; each has a fix record in `docs/audit/`:

| WS | Scope | Record |
|---|---|---|
| audit | inventory of schema / storage / UI debt | `docs/audit/{inventory,db,storage,ui}.md` |
| D | media safety: compression, quotas, upload limits, orphan cleanup | `docs/audit/storage.md` |
| A+B | UI polish + blank-space fixes | `docs/audit/ui.md` |
| C | notifications (NOT-01/02, realtime badges) | `docs/audit/db.md` |
| E | privacy controls (`/settings/privacy`, PRV-01..12) | `docs/audit/privacy.md` |
| F | interests (catalog, onboarding picker, suggestions) | `docs/audit/interests.md` |
| G | cabins + group chat (CAB-01..15, CHT-01..15) | `docs/audit/cabins.md` |
| hardening | SEC-04 headers, robots.txt, docs | this README + `netlify.toml` |

---

## Going live with Supabase (production)

The app picks its provider at boot (`src/lib/store.ts` factory): with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` configured it runs **`SupabaseProvider`**; without them it falls back to the offline **`DemoProvider`**. To go live:

1. **Create a Supabase project** and apply all eight migrations **in order** (SQL editor or CLI):
   ```bash
   supabase link --project-ref <ref>
   supabase db push   # 0001 → 0002 → … → 0008_cabins.sql
   ```
   Every migration is idempotent-safe to re-run where possible (`if exists` / `on conflict do nothing`); run them once each, in filename order. If a migration fails, copy the verbatim Postgres error — each file's objects are independent enough to fix forward.
2. **Enable Realtime** for the app's live tables (Supabase dashboard → Database → Replication): the migrations add them to the `supabase_realtime` publication, but verify `messages`, `notifications`, `cabin_messages` and the graph tables show as replicated.
3. **Auth providers** (Supabase dashboard → Authentication):
   - **Email**: enabled by default.
   - **Google**: create a *Web application* OAuth client in Google Cloud Console →
     - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     - Authorized JS origins: `https://<your-domain>` + `http://localhost:5173`
     - Paste Client ID/Secret into Supabase Auth → Google provider; save.
   - **URL configuration**: set Site URL to your production origin (e.g. `https://circyy.netlify.app`) and add `http://localhost:5173` to Redirect URLs so confirmation/OAuth return trips work locally.
4. **Env vars** — local `.env` (see `.env.example`) and the deploy host (Netlify → Site configuration → Environment variables):
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
   The anon key is safe to expose: every query goes through Row-Level Security. **Never** put the service-role key in front-end env vars or the repo (SEC-02).

### How `SupabaseProvider` works

- **Hydration**: on sign-in it loads a complete `AppState` (profiles, posts, comments, likes/saves, follows/reposts/blocks, stories, notifications, reports, DM conversations, interests, and all 5 cabin tables) so every selector keeps working.
- **Mutations**: optimistic snapshot first, PostgREST write second, rollback + toast on failure. Denormalized counters and membership counts are trigger-maintained in Postgres.
- **Membership-safe cabins**: cabin membership rows are only written by the security-definer functions `join_cabin()` / `approve_join_request()`; RLS gates chat read/write on active membership (CHT-02), and moderation (remove/ban/transfer) on cabin role.
- **Media**: `data:`/`vid:` refs upload to `avatars/{uid}/`, `post-images/{uid}/` (posts, comments, cabin covers, cabin chat photos), `media/{uid}/` (videos). Quotas + upload rate limits are enforced server-side (0004).
- **Realtime**: channels on the `supabase_realtime` publication — debounced re-hydration, so likes, messages, notifications, and cabin chat appear live (~1–2 s).
- **Account deletion**: the client cannot delete auth users, so delete wipes content rows, blanks the profile, then signs out.

RLS is the security matrix: every table has policies, default deny; notification inserts happen only via the security-definer `notify` path; storage paths are scoped to `auth.uid()`.

---

## Limits configuration

All client-visible limits live in **`src/config/limits.ts`** (`LIMITS`) — the single source imported by pages/components. The **server is authoritative**: matching constants are enforced in SQL (check constraints + triggers in `0001`–`0008`); the client values are UX checks layered on top. Keep the two in sync when changing anything — each `LIMITS` entry names its SQL counterpart in a comment.

Highlights: posts ≤500 chars, comments ≤300, bio ≤160; ≤4 images/post (≤2 MB each after compression, ≤1600 px) **or** 1 video (≤60 s, ≤50 MB, ≤1080p, ≤8 Mbps); ≤10 hashtags; DMs ≤1000 chars (20/10 min); stories 24 h TTL; interests 3–10 (10 DB-enforced); cabins — own ≤5, joined ≤50, 500 members max, name 3–40 unique, 1–3 tags, request message ≤200, chat ≤2000 chars at ~20 msg/min.

## Storage & quota monitoring (QTA)

Enforced server-side in `0004_media_safety.sql`:

- **Per-user quota**: 500 MB total (`user_storage_usage` view), over-quota uploads blocked with a clear message.
- **Upload rate**: 20 uploads/hour per user.
- **Bucket caps**: file-size limits per bucket (avatars 1 MB, images 2 MB post-compress, media 50 MB).
- **Orphans**: scheduled cleanup deletes storage objects unreferenced for 24 h; deleting a post/message/profile removes its media too.

**Monitoring (QTA-05)**: Supabase has no automatic storage alerting — watch **Dashboard → Storage** (or `select sum(size_bytes) from storage.objects`) and set dashboard/email alerts at **70%** (investigate) and **90%** (act: raise plan or purge) of the plan's storage quota. The `user_storage_usage` view answers "who is using what" for targeted cleanup.

---

## Security

- **SEC-04 headers** ship in `netlify.toml`: `Content-Security-Policy` (default-src 'self'; scripts self; images/media allow data:/blob:/Supabase Storage; `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo/payment off).
- **SEC-01/05**: RLS on every table + check constraints/triggers for all input rules (limits above).
- **SEC-02**: only the anon key in the front end; no secrets in the repo.
- **SEC-03**: user text renders via `RichText` as text (no `innerHTML`); XSS payloads display literally (verified in demo regression for posts, DMs, and cabin chat).
- **SEC-06**: auth redirects restricted to Site URL + `http://localhost:5173`.

## Verification performed

- `npm run build` — `tsc --noEmit` + Vite production bundle pass on every workstream.
- **Browser regression (demo mode) per workstream**, incl.: media compression + quota messages; notification badges/toasts; privacy switches hiding data from other viewers; interest picker caps; cabin create/join/request/approve/decline/ban flows, members-only chat, unread badges, XSS-plain-text chat, moderation queue actions (incl. cabin + message reports). 0 console errors across the suite.
- Direct data-layer checks: rate limiting, blocking, soft delete, admin-only routes, duplicate-content guard.
- Real-backend steps (migrations, two-browser realtime, direct-API RLS probes) are listed in each `docs/audit/*` record and in the deploy checklist.

## Deploy checklist

- [x] Netlify site connected to the repo (`npm run build`, publish `dist`, SPA redirect, security headers) — https://circyy.netlify.app
- [ ] Disable Netlify password protection (site must be publicly reachable)
- [ ] All eight migrations applied in order (`0001` → `0008`)
- [ ] Realtime publication verified for messages/notifications/cabin tables
- [ ] Supabase Auth: Email on; Google OAuth client + callback/origins whitelisted
- [ ] Supabase URL configuration: Site URL = production origin, `localhost:5173` in Redirect URLs
- [ ] `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set in Netlify env vars, then redeploy
- [ ] Daily database backups enabled (dashboard → backups)
- [ ] Storage usage alerts at 70% / 90% configured (see *Storage & quota monitoring*)
- [ ] `/terms` and `/privacy` reachable (already in the bundle); `/admin` disallowed in robots.txt

---

## Notes

- **Scope**: all P0 + P1 requirements, the v2 expansion (repost/share/stories/video/DMs/hashtags/saves), and the improvement TRD workstreams A–G. P2 (email digests, custom interest proposals, typing indicators, system chat messages, cabin invites) intentionally out — schema-ready, see `docs/audit/*` deferred registers.
- **Soft delete**: posts/comments/cabin messages are hidden immediately, purged after 30 days; expired stories purged on load (+ SQL `purge_expired_stories()`).
- **Accessibility**: semantic landmarks, labelled controls, visible focus rings, alt text, 320 px → desktop layout with a mobile tab bar; cabin chat is `dvh`-aware so the keyboard never covers the composer.
- **Demo mode is a first-class citizen**: it mirrors the live data model (same types, same guards) so UI work and regression runs need no backend.
