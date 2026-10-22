# AUD-08 — Database audit (Supabase Postgres)

Source of truth: `supabase/migrations/0001_init.sql`, `0002_features.sql`, `0003_admin_realtime.sql`.
Reviewed against TRD §10.1 (SEC-01 default-deny), §5.2 (NOT-01/03/04), §7 (PRV), §9 (CAB), §6.5 (QTA).

## 1. Tables & RLS status (SEC-01)

| Table | RLS | Notes |
|---|---|---|
| profiles | ✅ enabled | insert via `handle_new_user` trigger only; update own (+ admin via 0003) |
| posts | ✅ | soft delete (`deleted_at`); select policy `posts_select_visible_or_admin` (0003 replaced `posts_select_not_deleted`) |
| comments | ✅ | |
| likes | ✅ | `like_count` trigger |
| follows | ✅ | **no `status` column** (see §4 GAP-PRV-1) |
| blocks | ✅ | |
| notifications | ✅ | created only by security-definer triggers (0001/0002) |
| reports | ✅ | admin-only select/update/delete |
| reposts | ✅ | `repost_count` trigger; no-self-repost enforced in insert policy (subquery, not CHECK) |
| saves | ✅ | private to owner |
| stories | ✅ | 24 h TTL enforced in select/insert policies; purge function `purge_expired_stories()` |
| conversations / conversation_members / messages | ✅ | membership-gated; block enforcement in `messages_insert_member` |
| storage.objects | ✅ (policies) | see `storage.md` |

**Result: every table has RLS enabled → SEC-01 ✅ (verified by grep of all three migrations).**

## 2. Indexes

- posts: `posts_author_created_idx`, `posts_created_idx` (partial `where deleted_at is null`), `posts_hashtags_gin_idx`, `posts_created_at_live_idx`
- comments: `comments_post_idx`
- follows: `follows_following_idx`
- notifications: `notifications_recipient_idx (recipient_id, created_at desc)`
- reports: `reports_status_idx`
- reposts: `reposts_post_idx`; saves: `saves_user_idx`; stories: `stories_live_idx`
- conversation_members: `conversation_members_user_idx`; messages: `messages_conv_idx`

**Gap:** no index on `(recipient_id, is_read, created_at desc)` (required by NOT-01); no FK-style index on `comments.author_id`, `posts.author_id` beyond the composite (acceptable at current scale).

## 3. Notification path review (AUD-11 / NOT-00)

Trace: **event → DB row → client → badge → read.**

| Stage | Implementation | Status |
|---|---|---|
| Event → row | `create_notification()` trigger on follows/likes/comments (0001), `repost_notification()` on reposts (0002), `security definer`, skips self | ✅ server-side (NOT-02 partial — only these 4 events) |
| Dedupe | **none** — repeated like/unlike cycles or comment bursts create duplicate rows | ❌ NOT-03 |
| Muting | no settings table/column; rows are always created | ❌ NOT-09 |
| Row shape | `recipient_id, actor_id, type, post_id, read_at, created_at` | ⚠️ NOT-01 wants `entity_type/entity_id/data/is_read` + composite index |
| RLS | select/update/delete own only; **no insert policy** → only security-definer triggers can insert | ✅ NOT-04 |
| Delivery | `SupabaseProvider.attachRealtime()` subscribes `postgres_changes` on 9 tables (RLS-filtered), debounced 750 ms **full re-hydration** (store.ts:1524-1541) | ⚠️ works, but NOT-05 asks for a notification-filtered subscription; no per-row insert event |
| Unsubscribe | `teardown()` calls `sb.removeChannel()` on logout (store.ts:1548-1550) | ✅ |
| Badge | `unreadCount()` + `NotificationBell` — cap shows `9+` | ⚠️ NOT-06 wants `99+` and a DB-matching count |
| Page | `/notifications`: empty state ✅, mark-all ✅, tap navigates ✅; no Today/Earlier grouping, no pagination (hydrates max 300), no per-category settings | ⚠️ NOT-07/09 partial |
| Realtime publication | `0002` adds notifications/messages/likes/reposts/follows; `0003` adds posts/comments/stories/profiles (`if not exists`) | ✅ — **only effective once 0002+0003 are executed** |

**Root causes for missing/broken notifications (NOT-00 conclusion):**
1. Events outside follow/like/comment/repost (follow requests, cabin events — not yet designed) never create rows → no trigger exists yet.
2. No dedupe → burst noise (cosmetic, not absence).
3. No mute categories.
4. Badge/live updates depend on the whole-state refresh loop; if `0002`/`0003` have not been run, the publication has no tables → no realtime at all (operational, not code).

## 4. Gaps found (drives later workstreams)

| Gap | Impact | Workstream |
|---|---|---|
| `follows` has no `status` (pending/accepted) | cannot implement PRV-03 follow requests | E (migration) |
| `profiles` lacks `visibility`, `dm_permission`, `show_*`, `discoverable` | PRV-01/04/05/09 | E (migration) |
| notifications shape/dedupe/mute (see §3) | NOT-01/03/09 | C (migration) |
| no `user_storage_usage` / quota structures | QTA-01/02 | D (migration) |
| no `interests` / `user_interests` tables | INT-01/02/09 | F (migration) |
| no cabins tables (`cabins`, `cabin_members`, `cabin_join_requests`, `cabin_messages`, `cabin_interests`) | CAB/CHT | G (migration) |
| `messages` cannot be deleted (no delete policy) and `conversation_members` has no delete policy | pre-existing v2 design: block = visibility only | documented, unchanged |
| search: app-side only (no `pg_trgm`/FTS index on profiles/posts) | Explore page scans hydrated state | unchanged this release (out of TRD scope) |

## 5. Trigger/function inventory

| Function | Purpose | Security |
|---|---|---|
| `handle_new_user()` | profile row on signup | definer, on `auth.users` insert |
| `update_like_count()` / `update_comment_count()` / `update_repost_count()` | denormalised counters | definer |
| `create_notification()` | follow/like/comment notifications (self-skip) | definer |
| `repost_notification()` | repost notifications (self-skip) | definer |
| `purge_expired_stories()` | hard-delete expired stories (manual / pg_cron via 0003 DO block) | definer |
| `get_following_feed()`, `get_home_feed()`, `get_trending_hashtags()` | RPC feeds (client currently uses hydrated selectors instead) | invoker |
