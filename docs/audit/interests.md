# Workstream F — Interests (INT-01 … INT-09) fix record

Governing doc: `circle-improvement-trd (1).md` §8.
Migration: `supabase/migrations/0007_interests.sql` (142 lines; 48 seed rows, 2 indexes, 4 policy pairs, 1 trigger + 1 function).

## Requirement status

| ID | Requirement | Status | Where |
|----|-------------|--------|-------|
| INT-01 | `interests` table (id, slug, name, category, is_active), ~40–60 curated seeds grouped by category | ✅ | `0007`: 12 categories × 4 = **48** rows, `on conflict (slug) do nothing` (idempotent re-runs) |
| INT-02 | `user_interests (user_id, interest_id)` unique pair | ✅ | `0007`: composite PK `(user_id, interest_id)` |
| INT-03 | Onboarding step: pick **min 3, max 10**, skippable with a reminder | ✅ (min = UI, max = DB — note 1) | `Onboarding.tsx` step 2; `user_interests_limit` trigger; Home reminder banner |
| INT-04 | Picker: searchable chips grouped by category, selected state, "4/10" counter, keyboard accessible, 320 px | ✅ | `src/components/InterestPicker.tsx` |
| INT-05 | Interests panel in Settings, instant save | ✅ | `Settings.tsx` "Interests" section; every chip toggle calls `setInterests` (optimistic, rollback on failure) |
| INT-06 | Interests as tags on profile, respecting `show_interests` | ✅ | `Profile.tsx` tag list; privacy switch "Interests" (`show_interests` column, PRV-04) |
| INT-07 | Interests power cabin suggestions, people suggestions, feed filter | ✅ people + selectors now; cabin suggestions land with G (note 2) | `suggestPeopleByInterests`, `sharedInterestCount`, SidePanel + Home `SuggestedFollows` ranking |
| INT-08 | Custom interest proposals → pending, admin approves | ⏸ deferred (TRD-optional — note 3) | — |
| INT-09 | Indexes on `user_interests(interest_id)` and `(user_id)` | ✅ | `0007`: `user_interests_user_idx`, `user_interests_interest_idx` |

## Notes / decisions

1. **INT-03 min-3 is UI-only; max-10 is DB-enforced.** The 3-minimum is an *onboarding flow* rule that is skippable by design (TRD: "skippable with a reminder"), so it cannot be a DB constraint — a user who skips legitimately holds 0 picks. The 10-maximum is a data rule and is enforced authoritatively by the `user_interests_limit` BEFORE INSERT trigger (`enforce_interest_limit`, security-definer, `v_count >= 10` raises). The picker caps selection, `setInterests` checks before writing (all three layers agree), and the DB rolls back anything that slips past. The picker sends delete-then-insert (replace), so the live count is re-checked per row.
2. **INT-07 scope this release.** The AC is "at least cabin and people suggestions": people suggestions shipped now (SidePanel "To follow" ranks by `sharedInterestCount` then followers with a "· N interests in common" hint; Home `SuggestedFollows` ranks the same way). Cabins don't exist until Workstream G, so cabin suggestions wire up there against the same selectors (`interestsOf`/`sharedInterestCount` already exported). The "For you"/"All" feed filter is the third INT-07 bullet and is **deferred with the AC's blessing** — the feed stays reverse-chronological Following (FEED-1 untouched).
3. **INT-08 deferred.** TRD marks custom-interest proposals optional. Implementing them needs an admin moderation queue (new surface on AdminReports), profanity/spam screening of free text, and an `is_active` lifecycle (propose → pending → approved) — a Workstream-sized feature for an explicitly optional item. The schema already anticipates it: `interests.is_active` exists and the `interests_select_active` policy hides inactive rows from clients, so a future proposal flow only needs the insert path + admin UI.
4. **RLS: `user_interests` select is open to authenticated.** Rows are bare (user, interest) pairs — no content — and they are the join key for *other people's* suggestions, so a self-only select would make matching impossible. PRV-04's `show_interests` governs **display** (Profile tag list), not row readability — same split as follows/counts under PRV-04. Insert/delete are own-rows-only via `auth.uid()`.
5. **Inactive interests are invisible to clients** (`interests_select_active` uses `using (is_active)`), pre-positioning INT-08 without leaking pending proposals. Admin tooling reads via the service role (bypasses RLS).
6. **Demo seed mirrors the catalog** (`SEED_INTERESTS` in store.ts, stable ids `int_<slug_underscored>`) with `SEED_PICKS` giving 8 personas 4 picks each, so INT-07 suggestions have matches out of the box. `p_you` starts with **0 picks** on purpose — it exercises the onboarding step and the Home reminder. `migrateV2` fills catalog + picks for pre-F persisted states.
7. **Supabase parity.** `hydrate()` fetches `interests` + `user_interests`; `mapInterest`/`mapUserInterest` map rows; `setInterests` does an optimistic replace with rollback (delete-then-insert; single round-trip pair). The `show_interests` column is now read by `mapProfile` and written by `updatePrivacy` — completing PRV-04's pre-wired toggle.
8. **The interest step lives at `/onboarding?interests`.** `lib/auth.tsx` has a pre-existing guard that kicks any completed profile off `/onboarding` (it fires the moment `completeOnboarding` writes the username). Step 2 is therefore URL-flagged and the guard exempts `?interests`; Save/Skip both navigate to `/home`, and a later plain revisit of `/onboarding` still redirects to `/home` — a skipped step stays skipped, exactly as "skippable" requires.

## Tests (demo-mode browser, this session)

- Fresh seed boots with catalog (48) + 32 persona picks; `p_you` has none → Home reminder banner shows ("Pick at least 3 interests…").
- Onboarding: profile form → step 2 renders picker (12 category groups, "0/10" counter); "Save & continue" disabled at 0/1/2 picks; chip clicks increment ("3/10" enables save); at 10/10 unselected chips disable + counter turns amber; Save persists picks; Skip navigates with reminder copy.
- Picker: search "run" filters to Running (+ category match); no-match query shows the empty state; chips are `<button aria-pressed>` (keyboard Tab+Enter works).
- Settings: Interests panel instant-saves per chip toggle (state row appears immediately); cap keeps the UI from ever sending >10 (the DB trigger is the authority for anything that bypasses the UI — see note 1).
- Privacy: "Interests" switch saved `showInterest:false`; as another viewer the owner's tags disappeared while their own tags stayed visible; restored → tags visible again (PRV-06 ↔ INT-06).
- Profile tags: 10 selected interests rendered as chips on the owner's profile.
- Profile tags: persona tags render as chips; toggling my "Interests" privacy switch off hides my tags from another viewer while I still see my own.
- SidePanel: suggestion ranked by overlap ("2 interests in common" hint) ahead of higher-follower non-matches.
- Max-10 mirror: demo `setInterests` rejects 11 ids with the same message the DB raises.
- 0 console errors throughout.

## Deferred (with reasons)

- INT-08 custom-interest proposals (TRD-optional; needs moderation queue + screening — see note 3).
- INT-07 "For you"/"All" feed filter (AC satisfied by cabin+people suggestions; cabins land in G).
- Cabin suggestions themselves (cabins are Workstream G; selectors exported and ready).
