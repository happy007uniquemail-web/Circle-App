# AUD-02…07, 12 — UI, accessibility, states & contrast audit

Findings from a full source scan (36 files) + WCAG contrast computation on the token set.
Browser-dependent checks (Lighthouse, live width/keyboard passes, console) are executed
against the running app during Workstreams A/B — see §6 for status.

## 1. AUD-06 — Colour contrast (WCAG AA, computed from `src/index.css` tokens)

| Pair | Ratio | Needs | Verdict |
|---|---|---|---|
| body `txt-main #f8fafc` on `bg #0a0a0c` / `surface #16161a` | 18.9 / 17.3 | 4.5 | ✅ |
| `txt-muted #94a3b8` on bg / surface | 7.7 / 7.0 | 4.5 | ✅ |
| **`txt-subtle #64748b` (≈`text-slate-400` timestamps, counters, placeholders) on bg / surface / surface-hover** | **4.16 / 3.79 / 3.48** | 4.5 | ❌ **C-1** |
| `brand-600 #818cf8` links on bg / surface | 6.6 / 6.1 | 4.5 | ✅ |
| `brand-700` chip text on `brand-50` chip | 8.7 | 4.5 | ✅ |
| white on `brand-800 #4338ca` badge fill | 7.9 | 4.5 | ✅ |
| **white on `btn-primary` gradient (`#6366f1→#a855f7→#ec4899`)** | **4.47 / 3.96 / 3.53** | 4.5 (14 px bold ≠ large text) | ❌ **C-2** |
| error `red-600 #f87171` on bg/surface; `red-700` on `red-50` | 7.2 / 6.5 / 9.0 | 4.5 | ✅ |
| `emerald-600/700`, `amber-700`, `rose-600`, `teal-600` on dark surfaces | 6.7–12.5 | 4.5 | ✅ |
| **`bg-red-500 #ef4444` bell badge + white text (leaked default Tailwind, unremapped)** | **3.76** | 4.5 | ❌ **C-3** |
| placeholder `#64748b` on input well | 3.45 | 4.5 | ❌ (same as C-1) |
| leak colors on surface: `pink-500 5.1`, `sky-400 8.4`, `amber-500 8.4`, `purple-500 4.6`, `fuchsia-500 5.2` | ≥4.5 | 4.5 | ✅ (colour-consistency issue only, see A-1) |
| focus ring `#6366f1` on bg (non-text) | 4.43 | 3.0 | ✅ |
| **`border-subtle #26262e` as input boundary on bg** (non-text) | **1.32** | 3.0 | ❌ **C-4** (inputs identify by border alone) |

**Failing pairs: C-1 (subtle text), C-2 (primary button), C-3 (bell badge), C-4 (input boundary).**

## 2. AUD-04/05/08 — Accessibility findings

- **Icon-only controls missing accessible name (3):** `Layout.tsx:98` account `<summary>` (name = avatar alt, misleading); `PostComposer.tsx:100-115` video `<label>` (title only); `MessageThread.tsx:199-206` attach photo/video `<label>`s (title only). Everything else has `aria-label` ✅.
- **Images:** all `<img>` have meaningful `alt` ✅.
- **Modals (UI-08 Esc + focus trap):**
  | Modal | role/aria-modal | Esc | Focus trap/restore |
  |---|---|---|---|
  | ReportModal | ✅ | ❌ | ❌ |
  | ShareMenu | ✅ | ❌ | ❌ |
  | Stories StoryViewer | ✅ | ✅ | ❌ |
  | StoryComposer | ✅ | ❌ | ❌ |
  | `<details>` menus (Layout account, PostCard post-menu) | n/a | ❌ Esc | n/a; **PostCard menu has no click-outside close** |
- Keyboard otherwise OK (native buttons/links; image grid has `role=button` + Enter/Space). `:focus-visible` outline defined ✅. `AdminReports` tabs: `role=tablist/tab` but missing `tabpanel` + arrow-key roving.
- `Toast` uses `role="status"` per-toast instead of a pre-existing `aria-live` region (minor).
- Touch targets (UI-07, <44 px): worst = ImageUploader remove (~20 px), PostComposer remove-video (~22), story arrows (~28), comment delete/report (~27), modal close (~30), **post footer actions repost/comment/save/share (~30-33) and like (~32)** — high-frequency controls. Bell/messages links ~36 px (also <44).

## 3. AUD-07 — State coverage (loading / empty / error / offline)

- Data layer: `DemoProvider` is synchronous; `SupabaseProvider` is async (`MaybePromise`) → real-backend mode *can* show stale/empty frames during initial hydration; route-level `Suspense` + `InfiniteFeed` "Loading more…" cover part of it.
- **Empty states:** ✅ present on Home(suggested)/Explore/Notifications/Messages/Thread/Saved/Hashtag/Comments/StoryBar/Admin.
- **Error states:** ⚠️ exist as dead-ends — "Post unavailable" / "Profile not found" / "Conversation unavailable" **without Retry**; failures elsewhere surface only as toasts (Admin, Comments, Stories, Notifications mark-read swallowed at `Notifications.tsx:34`).
- **Loading:** only route fallback + feed sentinel + VideoPlayer placeholder; **no skeleton loaders for feeds/profile/chat (UI-04 gap)**.
- **Offline:** **nothing** — no `navigator.onLine`, no online/offline listeners, no retry UI anywhere (grep-verified). → O-1.

## 4. AUD-01/03 support — layout & blank-space findings (BLK input)

- Shell (`Layout.tsx:67-133`): `min-h-dvh` root but **not a flex column**; `main` (`max-w-3xl`) does not grow; **no desktop footer** — short pages leave the bottom empty (floating-content feel on tall screens).
- No `100vh` anywhere; `dvh` used correctly (`min-h-dvh`, story `calc(100dvh-…)`); `MessageThread` list uses arbitrary `min-h-[45vh]`.
- Standalone pages (Landing/Terms/Privacy/Onboarding) roll their own shells with `pb-20`-style spacing — large paddings only in hero/legal (`pb-20`, `py-24` route fallback).
- Content max width = 768 px (`max-w-3xl`) on wide screens; TRD BLK-05 asks ~1200 px with sidebars — currently narrow column + empty margins.

## 5. UI-01/UI-10 — tokens & theme

- ~95 % tokenized via `@theme` (`--color-*`), component classes `.card/.input/.btn-primary/.btn-ghost/.glass`.
- **Leaks:** hex in `Avatar.tsx:22-23`, `lib/format.ts:58,64,70`, demo seeds `lib/store.ts:125-148…`, Landing Google SVG fills (brand-mandated → exempt); unremapped Tailwind ramps (`purple/pink/fuchsia/sky/amber-500/red-500/emerald-500`); **undefined `brand-200`/`brand-300` classes produce nothing** (`App.tsx:26` spinner border, `Messages.tsx:44` unread border, `Explore.tsx:25` hover border); 42× `white/[0.0x]` overlays (acceptable as glass effects — no color role).
- **Theme (UI-10):** dark-only by design; **no theme toggle / no `prefers-color-scheme` / no light theme exists** (see §7 decision), so "both themes" in UI-09 reduces to the dark theme above; no unstyled-flash risk (CSS-only background, `theme-color` meta set).

## 6. Browser-dependent checks — status

| ID | Check | Status |
|---|---|---|
| AUD-02 | Lighthouse mobile+desktop on home/profile/post/chat | pending — run against `localhost:5173` during A/B (needs Chrome/Lighthouse availability; otherwise deferred with reason) |
| AUD-03 | widths 320/375/414/768/1024/1440 | pending — live pass during A/B |
| AUD-04 | keyboard-only pass | pending — live pass during A/B (code review above shows the gaps) |
| AUD-12 | console errors on every page | pending — live pass during A/B |

## 7. Nielsen heuristics (§2.2) — notable gaps

Visibility of system status (no skeletons/offline), user control/undo (destructive actions: block/unfollow have confirm? — delete relies on toasts; UI-11 confirm dialogs to verify), error prevention (client limits OK), helpful error messages (no Retry paths), help/onboarding (onboarding exists ✅).
