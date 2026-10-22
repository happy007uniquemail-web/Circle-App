# AUD-09 / AUD-10 — Storage audit

## 1. Buckets (created by migrations)

| Bucket | Public | `file_size_limit` | `allowed_mime_types` | Created in |
|---|---|---|---|---|
| `avatars` | ✅ | ❌ **none** | ❌ **none** | 0001 |
| `post-images` | ✅ | ❌ **none** | ❌ **none** | 0001 |
| `media` (video) | ✅ | ❌ **none** (10 MB only enforced in client code) | ❌ **none** | 0002 |

**AUD-09 result: no bucket enforces size or MIME → IMG-07 / VID-07 fail. A direct API upload with the anon key can store any size any type (up to the plan's global per-request cap).**

## 2. Object policies

| Policy | Command | Gate |
|---|---|---|
| `avatars_public_read` | select | bucket = avatars |
| `avatars_owner_write` / `_update` / `_delete` | insert/update/delete | owner folder `(foldername(name))[1] = auth.uid()` — **no MIME/size gate** |
| `post_images_public_read` | select | bucket = post-images |
| `post_images_owner_write` | insert | owner folder + `pg_input_is_valid(coalesce(content_type,''), 'mime')` — ⚠️ **see finding F-S1** |
| `post_images_owner_delete` | delete | owner folder |
| `media_public_read` | select | bucket = media |
| `media_owner_write` | insert | owner folder + `content_type in ('video/mp4','video/webm','video/quicktime')` — ✅ MIME whitelist, **no size** |
| `media_owner_delete` | delete | owner folder |

**F-S1 (correctness risk):** `pg_input_is_valid(..., 'mime')` only checks that a string *parses* as a MIME type — it does **not** check "is an image" (`text/html` would pass), and it depends on a type name `mime` that must resolve at evaluation time inside the policy. Replace with an explicit image MIME whitelist + bucket-level `allowed_mime_types` (Workstream D migration).

## 3. Upload paths in the code (AUD-10)

| # | Path | Entry point | Client validation today | Server enforcement today |
|---|---|---|---|---|
| 1 | Post/comment photos + avatar | `components/ImageUploader.tsx` → `data:` URL → `uploadImages()`/`uploadRef()` (store.ts) | MIME allow-list (JPEG/PNG/WebP), **5 MB** cap, canvas resize to ≤1000 px JPEG q0.78 (inline, per-component) | bucket: MIME-syntactic only, **no size** |
| 2 | Story images | `components/Stories.tsx` (own inline canvas resize, q0.82) | MIME allow-list, 5 MB | same as #1 |
| 3 | Story/DM video | `lib/media.ts validateVideo()` → `putVideo()` (IndexedDB) → `uploadRef('media')` | MIME allow-list, **10 MB**, duration ≤60 s — ❌ no resolution check, no bitrate check | bucket: MIME whitelist, **no size** |
| 4 | DM photos | `pages/MessageThread.tsx` (own inline canvas resize, q0.8) | MIME allow-list, 5 MB | same as #1 |
| 5 | Avatar | Onboarding/Settings → `ImageUploader` → `uploadRef('avatars')` | as #1 (no 512 px avatar variant) | owner-folder only |

**Findings (AUD-10):**
- F-U1: three separate inline canvas-resize implementations with different targets (1000/≈1600?, q0.78/0.82/0.8) — no single limits file (TRD §6.6) and no WebP output.
- F-U2: no pre-compress cap of 10 MB (IMG-01) — current 5 MB; no hard **post**-compress cap of 2 MB (IMG-05).
- F-U3: no compression progress / before-after size UI (IMG-06).
- F-U4: no magic-byte validation (IMG-02 wants MIME **and** signature sniffing).
- F-U5: video: no 1080p resolution cap (VID-03), no ≤8 Mbps bitrate derivation (VID-04), size cap 10 MB not the proposed 50 MB (VID-02, configurable).
- F-U6: no per-user quota, no upload rate limit, no orphan cleanup (QTA-01…06).
- F-U7: no abort/cancel on uploads (VID-08 abort support), no TUS resumable option.

## 4. What Workstream D must deliver (mapping)

- `src/config/limits.ts` — one file with TRD §6.6 defaults (+ banners/comments extras).
- Client: unified `compressImage()` (1600 px post / 512 px avatar, WebP q≈0.8 fallback JPEG, EXIF dropped by canvas re-encode, 10 MB pre / 2 MB post cap with re-compress step), progress UI, magic-byte sniff, video duration+size+resolution+bitrate checks.
- Migration `0004_media_safety.sql`: bucket `file_size_limit` + `allowed_mime_types` for all 3 buckets, image write policy fix (F-S1), `user_storage_usage` table + triggers or function-based quota accounting, per-hour upload rate guard, optional orphan-cleanup job (pg_cron, like 0003's DO block).
- Code-split note: `post-images` write policy must accept the new WebP output (`image/webp` already passes only if policy says so → explicit list covers it).
