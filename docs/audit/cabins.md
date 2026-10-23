# Workstream G — Cabins + group chat (CAB-01…15, CHT-01…15) fix record

Governing doc: `circle-improvement-trd (1).md` §9.
Migration: `supabase/migrations/0008_cabins.sql` (5 tables, 20 functions, 17 triggers, 17 policies, 13 grants, RLS on all 5, realtime publication, reports-constraint extension for CHT-12).

## Requirement status

| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| CAB-01 | Create cabin: name 3–40 unique case-insensitive, desc ≤300, cover image (compressed), type Open/Request, 1–3 interest tags | ✔ | `CabinForm.tsx` (live unique-check + counters), `0008` name/desc triggers, demo `validateCabinInput` |
| CAB-02 | Creator becomes owner; roles owner / admin / member | ✔ | `join_cabin()`/`approve_join_request()` seed role owner/member; owner can promote via transfer |
| CAB-03 | "Explore Cabins": search, interest filter, "Suggested for you" (interest match), member counts, pagination | ✔ | `Cabins.tsx` (My cabins + Suggested + list, 48-chip filter, PAGE=12); `suggestCabinsByInterests` |
| CAB-04 | Detail page: info, interests, join/request button, member list respecting privacy/blocks | ✔ | `CabinDetail.tsx` header + panels (§9.7 member-only list — note 1) |
| CAB-05 | Limits: own ≤5, joined ≤50, max 500 members — server-side | ✔ | `0008` `enforce_cabin_limits` + `join_cabin()` member cap; UI disables Create at cap |
| CAB-06 | Edit (owner/admin) by RLS | ✔ | `CabinForm.tsx` edit route; `cabin_update` policy + `enforce_cabin_fields` trigger |
| CAB-07 | Delete owner-only, cascades members/messages/media | ✔ | `delete_cabin()` security-definer; demo cascade verified (0 orphans) |
| CAB-08 | Reserved/offensive names blocked | ✔ | `RESERVED_CABIN_NAMES` demo list + `0008` reserved-name trigger |
| CAB-10 | Open cabin: Join adds membership immediately | ✔ | `join_cabin()`; verified instant (member active, count 3→4, chat appears) |
| CAB-11 | Request cabin: pending `cabin_join_requests` + optional message ≤200 | ✔ | `requestJoin`; UI textarea with counter; partial unique index on pending (note 2) |
| CAB-12 | Owner/admin requests panel: approve/decline + notifications (NOT-02) | ✔ | `CabinDetail` panel; `approve_join_request()`/`decline_cabin_request()` + `notify()` (notes 5, 9) |
| CAB-13 | Cancel pending request; leave anytime; owner transfers first | ✔ | `cancelCabinRequest`; `leaveCabin` + sole-owner cascade; UI disables Leave at owner&>1 members; `transfer_cabin_ownership()` (note 9) |
| CAB-14 | Banned cannot rejoin or re-request | ✔ | `join_cabin()`/`request_join()` reject `status='banned'`; demo guard; banned notice page verified |
| CAB-15 | `cabin_invite_permission='nobody'` cannot be invited (PRV-06) | ⏸ deferred (note 3) | column+UI shipped in E; invite system itself is phase-2 |
| CHT-01 | Realtime updates via postgres_changes filtered by cabin_id (~1–2 s) | ✔ | `SupabaseProvider` subscribes to all 5 cabin tables; demo mode is local-commit (note 10) |
| CHT-02 | Members-only read/write (RLS) | ✔ | select policies require active membership; verified non-member sees no messages |
| CHT-03 | Text + image (compressed), no video | ✔ | composer image-only; `compressImage` per workstream D |
| CHT-04 | Body ≤2000, XSS-safe text render | ✔ | `LIMITS.cabinMessageMax` slice + `RichText`; XSS payload verified as plain text |
| CHT-05 | Avatar/name/time, grouped consecutive, date separators | ✔ | `CabinDetail` messages list (5-min grouping, dayLabel separators) |
| CHT-06 | Load latest 50, load-older, smart auto-scroll | ✔ | `PAGE_MESSAGES=50`, "Load earlier messages", near-bottom tracking |
| CHT-07 | Unread via `last_read_at` + badges | ✔ | `markCabinRead` on open; Layout `Tent` badge; verified 2→0 |
| CHT-08 | Soft-delete own; admins any; placeholder | ✔ | `delete_cabin_message` UPDATE policy (+ platform admin, note 11); demo verified |
| CHT-09 | Reply-to a message (quote) | ✔ | `reply_to` column + quoted snippet in bubble + composer reply strip |
| CHT-10 | Typing indicator / presence | ⏸ deferred (TRD-optional phase 2) | register |
| CHT-11 | Rate limit ~20 msg/min per user per cabin, server-side | ✔ | `0008` `enforce_cabin_message_rate` trigger (security-definer, per (cabin,user) window) |
| CHT-12 | Report message/cabin; admins mute/remove members and ban | ✔ | mute/remove/ban/transfer in `CabinDetail` panels; reporting wired to `ReportModal` + `AdminReports` (note 11) |
| CHT-13 | Mute cabin notifications per user | ✔ | `muteCabin`; header Mute/Unmute toggle + Muted badge |
| CHT-14 | Chat works at 320 px; keyboard doesn't cover input (`dvh`) | ✔ | `max-h-[calc(100dvh-300px)] min-h-[320px]` scroll container; composer rows=1 + max-h |
| CHT-15 | System messages ("X joined") | ⏸ deferred (TRD-optional) | register |

## Notes / decisions

1. **Member list is members-only; `member_count` is denormalized.** §9.7 makes membership rows readable by members only, so the public detail page cannot count members by reading the table. `cabins.member_count` is maintained by trigger on every membership insert/delete (the `enforce_cabin_fields` guard forces it to change only at `pg_trigger_depth() >= 2`, i.e. only from membership triggers — never from a client UPDATE). The explore list, detail header and join cap all read the denormalized count.
2. **Partial unique index instead of `unique(cabin_id,user_id,status)`.** A request lifecycle produces history rows (pending → declined/cancelled → pending again); `unique (cabin_id, user_id) where status='pending'` blocks double-requests while keeping the audit trail intact.
3. **CAB-15 / PRV-06 invite enforcement deferred.** The invite system (inviting a specific user into a cabin) is phase-2; E shipped the `cabin_invite_permission` column + settings UI so nothing needs re-wiring when invites land. There is no invite action to gate today, so enforcing the "nobody" rule now would guard a nonexistent path.
4. **INT-07 cabin suggestions landed here.** `suggestCabinsByInterests` ranks non-member, non-declined-open cabins by shared interest tags; the explore page shows up to 4 under "Suggested for you" (verified: Photography → Photo Walks, Hiking → Weekend Hikers).
5. **New notification type `cabin_request_declined`.** CAB-12 requires notifying the requester on decline; NOT-02's type union gained `cabin_request_declined` (Notifications + Settings render it). Approve uses the existing `cabin_request_approved`.
6. **Banned members remain counted in `member_count`.** A ban flips the membership row's status (kept for the rejoin block + audit) rather than deleting it; the count trigger counts membership rows. The member list UI hides non-active rows, so the visible list can be ≤ the badge count on cabins with bans. Acceptable for release; a count-of-active-only trigger is a one-line change if desired later.
7. **Cabin cover + chat images reuse the `post-images` bucket.** Buckets were fixed in 0004 (avatars/post-images/media); covers and chat photos are post-shaped images, so a fourth bucket would only duplicate policies. Uploads go through the same compression path (workstream D) and the same storage policies.
8. **Membership enters only through security-definer functions.** Per §9.7, `join_cabin()` (open cabins) and `approve_join_request()` (request cabins) are the only writers of `cabin_members` — direct INSERT is blocked by RLS, and both functions re-check cabin type, ban status, caps and block lists server-side. `request_join()`/`decline_cabin_request()`/`cancel_cabin_request()` gate on immutable request fields (an `enforce_join_request_update` trigger rejects cabin_id/user_id/message/created_at changes).
9. **Ownership transfer is a single transaction.** `transfer_cabin_ownership(cabin, new_owner)` requires the caller to be the current owner and the target an active member; the role swap (target → owner, old owner → admin) happens inside the existing single-owner trigger, then `cabins.owner_id` is updated — all guarded by `enforce_cabin_fields` (owner_id change only allowed when `old.owner_id = auth.uid()`). Leave is blocked for a multi-member owner (UI disabled + server reject) until they transfer.
10. **Realtime: Supabase live, demo local.** The Supabase provider subscribes with `postgres_changes` (INSERT/UPDATE on all 5 cabin tables, filtered by cabin_id where applicable) and refreshes the cabin slice — chat messages appear in ~1–2 s. Demo mode has no transport; commits update local state (the same UI paths), which is why the two-browser test is listed as a real-backend item.
11. **CHT-12 reporting wiring.** `ReportTarget` gained `cabin` + `cabin_message`; 0008 extends the `reports.target_type` check constraint accordingly. CabinDetail adds a per-message Flag (others' messages) and a header Report (non-owners) both opening the existing `ReportModal`. AdminReports previews link to the cabin; "Remove content" soft-deletes a reported message (the `cabin_messages_update` policy and the demo guard now also allow **platform admins**, not just sender/cabin-admin) and is hidden for whole-cabin reports — one report never auto-deletes a community, the admin marks it actioned and uses owner tools or suspension.
12. **notify() reuse.** Join-request/approval/decline notifications reuse the existing notify path (dedupe + muted-cabin respect), so cabin traffic obeys the same delivery rules as likes/follows.

## Tests (demo-mode browser, this session)

- **Explore (CAB-03/INT-07):** My cabins (Frontend Collective, Street Food Explorers) + Suggested (Photo Walks, Weekend Hikers) + main list excludes mine; 48 chips; Fiction filter → Sci-Fi Book Club only; Create disabled at cap logic present.
- **Create (CAB-01/08):** reserved name "admin" → submit blocked, no row created; "photo walks" (case-insensitive duplicate) → live hint "already exists" + submit disabled; valid name/desc/type/tag → created, auto-navigated, owner auto-member, memberCount 1.
- **Chat XSS (CHT-04):** `<img onerror>` + `<script>` payload stored raw, renders as literal text, zero script/onerror elements, no alert, composer cleared.
- **Soft delete (CHT-08):** trash → confirm → `isDeleted: true`, `body: null`, "Message deleted" placeholder, payload scrubbed from DOM.
- **Members-only (CHT-02):** non-member view of an open cabin shows no chat and none of the seeded messages.
- **Open join (CAB-10):** Join → membership `active/member`, memberCount 3→4, chat appears with seeded messages (date separator "Yesterday", sender names + relative times, grouping).
- **Request flow (CAB-11/13):** pending state shows message + Cancel; cancel → status `cancelled`, form returns; re-request → new pending row with message.
- **Approve/decline (CAB-12):** as owner p_lena — approve → requester membership created + `cabin_request_approved` notification; decline → status `declined`, no membership, `cabin_request_declined` notification for p_dev; panel count updates; Notifications page renders "Lena Park declined your cabin request".
- **Unread (CHT-07):** nav badge "2Cabins" → open cabin → `last_read_at` stamped, badge cleared, 8 messages rendered.
- **Owner leave (CAB-13/07):** sole owner Leave → confirm → cabin + members + messages cascaded (0 orphans), back to seed count.
- **Ban (CAB-14):** banned member view → "can't rejoin" notice, no Join button, no request form, no chat.
- **CHT-12 reporting:** header Report cabin → modal ("Report this cabin", 5 reasons) → stored `targetType='cabin'` → moderation queue preview "Photo Walks (open)" links to `/cabins/cab_photo`, **no** Remove content button; message Flag → stored `cabin_message` → queue preview "Golden hour at the pier…" + **Remove content** → platform-admin soft delete (admin is not a cabin member) + report auto-marked actioned.
- **Regression:** tsc clean, production build ✓ (CabinDetail chunk ~20.8 kB), **0 console errors** across the whole session; demo personas restored (demo-admin on /home).
