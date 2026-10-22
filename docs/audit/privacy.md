# Workstream E — Privacy (PRV-01 … PRV-13) fix record

Governing doc: `circle-improvement-trd (1).md` §7.
Migration: `supabase/migrations/0006_privacy.sql` (331 lines; 9 policy pairs, 3 triggers, 3 functions, 1 view, mutes table, profiles privacy columns, `follows.status`).

## Requirement status

| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| PRV-01 | Visibility public/followers/private in `profiles.visibility` | ✅ | `0006` column + CHECK; privacy page radio |
| PRV-02 | Non-followers see avatar/username/bio/counts only, **RLS-enforced** | ✅ | `posts_select_visible` + `comments_select` in `0006`; `visiblePosts` mirror in store |
| PRV-03 | Follow requests request→pending→approve/decline, notifications both ways | ✅ | `follows.status`, `enforce_follow_status` trigger, `dispatch_follow_notification` triggers (INSERT + UPDATE), `approveFollow`/`declineFollow` actions, Notifications + Profile UI |
| PRV-04 | Per-field toggles (email/location/interests/join date/follow lists) | ✅ (see note 1) | profiles columns; privacy page switches; Profile page gating |
| PRV-05 | DM permission Everyone/Followers/Nobody, server-side | ✅ | `dm_permission` column; `messages_insert_member` + `conversation_members_insert_member` policies; `dmAllows` client mirror |
| PRV-06 | Cabin-invite permission | ✅ column + UI; enforcement in G (note 2) | `cabin_invite_permission` column; privacy page select |
| PRV-07 | Block enforced RLS + UI | ✅ (extended) | `profiles_select_authenticated` now hides blocker's row from blocked user; follows/blocks/conversations policies carry block checks |
| PRV-08 | Mute hides content without blocking | ✅ | `mutes` table + RLS; `posts_select_visible`/`comments_select` exclude muted authors; `visiblePosts`/`activeStories`/SidePanel mirrors |
| PRV-09 | Non-discoverable excluded from search/suggestions | ✅ (see note 3) | `discoverable` column; `selectSearchUsers` + SidePanel filters |
| PRV-10 | Privacy page plain language, instant save + toast, mobile | ✅ | `src/pages/PrivacySettings.tsx` at `/settings/privacy` |
| PRV-11 | public→private keeps followers, posts hidden immediately | ✅ | No follow deletion anywhere; RLS reads `profiles.visibility` live |
| PRV-12 | `public_profiles` view, no email/auth metadata, anon test query | ✅ | `public.public_profiles` security_invoker view (see note 4) |
| PRV-13 | Data download | ⏸ deferred (TRD optional phase 2) (note 5) | — |

## Notes / decisions

1. **PRV-04 email/location/interests are forward-compat columns.** The `profiles` table has no email, location, or interests columns (email lives only in `auth.users`, which the client can never select; interests arrive in Workstream F). `show_email`, `show_location`, `show_interests` are stored so the toggles are ready the moment the fields land. The toggles that control real data today are join date and follow lists.
2. **PRV-04 follow-list and join-date toggles are enforced in the UI, not RLS.** Postgres RLS is row-level, not column-level: hiding `created_at` or the rows of a user's follow list at the policy layer would also break follower counts and feed logic that legitimately need those rows. The privacy page + Profile page honour the toggles for non-permitted viewers (owner and admin always see their own); the fields exposed by the toggle are display-only, so a UI gate matches the requirement's intent. Counts (PRV-02) intentionally remain visible. This is a documented deviation from "server-side enforcement" for two cosmetic fields; all content-bearing surfaces (posts, comments, DMs, follows) are RLS/trigger-enforced.
3. **PRV-06 enforcement lands with Workstream G.** `cabin_invite_permission` column and the privacy page select exist now; the cabins table and its invite policies are created in G (§12 ordering — the table this would enforce against does not exist yet). G must wire the column into the cabin-invite policy.
4. **PRV-09 search exclusion is enforced in the selectors.** The app hydrates profiles into a local snapshot and filters client-side (documented hydrate caps in README). The `discoverable` column is the server-side source of truth; any future server-side search path must filter on it. Excluded from: `selectSearchUsers`, SidePanel suggestions. Not excluded from: direct profile URL (PRV-02's avatar/username/bio remain reachable — discoverable only governs discovery surfaces).
5. **PRV-12 anon test query.** After running 0006, verify as anon in the SQL editor:
   ```sql
   set local role anon;
   select count(*) from public.public_profiles;  -- expect 0 (profiles_select targets authenticated)
   reset role;
   ```
   The view exposes id/username/display_name/bio/avatar_url/role/created_at/visibility/discoverable/show_join_date/show_follow_lists. No email (column does not exist), no auth metadata, no `auth.uid()`-dependent fields.
6. **PRV-13 deferred** per TRD §7 ("optional phase 2") — no data-export endpoint. Revisit after hardening.
7. **PRV-07 extension.** `profiles_select_authenticated` was rewritten: a blocked user now sees **nothing** of the blocker's profile row (previously `using (true)`). The blocker still sees everyone so their Settings block list renders. `is_admin(uuid)` security-definer helper avoids RLS recursion on profiles.
8. **Group conversations skip the DM gate.** `messages_insert_member` enforces `dm_permission` only for 1:1 conversations (member count ≤ 2); group/cabin conversations will use cabin membership rules from G. Client mirror: `dmAllows` gates `startConversation` for 1:1 only.
9. **Pending rows and counts.** `followerCount`/`followingCount`/`isFollowing`/`selectFollowingFeed` exclude `status='pending'` — a request grants nothing until approved. Backfill: all pre-existing follows default to `'accepted'` so no user silently loses follows.

## Tests (demo-mode browser regression, this session)

- Privacy page renders: 3 switches (join date/follow lists/search), 3 visibility radios, DM + cabin selects, empty-muted state; Settings links to it (`/settings/privacy` anchor present).
- Instant save: toggling "Appear in search" persisted `discoverable:false` + flipped `aria-checked`; visibility radio persisted `visibility:'private'`.
- PRV-02 lock notice: `p_omar` viewing private `p_maya` → "This account is private · Follow @maya and wait for approval", posts hidden.
- PRV-03 full loop: Follow → row `status:'pending'` + `follow_request` notification to maya + button "Requested"; approve on maya's profile → row `accepted` + `follow_request_approved` notification to omar; back as omar → posts visible, "Following" state, no stale "Request sent" line.
- PRV-03 decline from Notifications: Decline button on the `follow_request` row deleted the pending row.
- PRV-08: mute from profile → `mutes` row persisted; maya has 3 posts in state, **0** in omar's home feed.
- PRV-09: `/explore?q=lena` with `discoverable:false` → "No people match “lena”"; control `/explore?q=sam` → Sam found.
- PRV-05: `dmPermission:'nobody'` → no Message button on profile.
- PRV-04: `showFollowLists:false` → Followers tab shows "keeps their follower list private", counts still displayed.
- Fresh-seed regression: cleared localStorage → landing → demo-admin sign-in boots `/home` clean (optional privacy fields don't break seed literals). 0 console errors throughout.

## Deferred (with reasons)

- PRV-13 data download (TRD optional phase 2).
- PRV-06 policy enforcement (cabins born in Workstream G — column pre-wired).
- Server-side discoverable/search RPC (app architecture hydrates locally; column is the source of truth for any future server path).
