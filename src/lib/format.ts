/** Formatting + small validation helpers shared across the UI. */

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

/** Minimal input sanitization (XSS defense-in-depth; React escapes by default). */
export function sanitize(text: string): string {
  return text.replace(/<[^>]*>/g, '').slice(0, 1000);
}

/** Normalize + extract hashtags for storage (F-HAS): `#Tag` → `tag`. */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.match(/#[\p{L}\p{N}_]+/gu) ?? []) {
    const tag = raw.slice(1).toLowerCase();
    if (tag.length <= 30) seen.add(tag);
    if (seen.size >= 10) break;
  }
  return [...seen];
}

/** Count http(s) links — spam guard (F-SAF, max 3 per post). */
export function countLinks(text: string): number {
  return (text.match(/https?:\/\//gi) ?? []).length;
}

/** Initials fallback used for avatars. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444'];

/** Deterministic SVG avatar (works offline, no external requests). */
export function avatarFor(id: string, name: string): string {
  const code = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = AVATAR_COLORS[code % AVATAR_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="${bg}"/><text x="48" y="48" font-family="system-ui,sans-serif" font-size="36" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="central">${initials(name)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Deterministic gradient image used to seed demo posts (offline-friendly). */
export function svgImage(label: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><text x="40" y="460" font-family="system-ui,sans-serif" font-size="34" font-weight="600" fill="rgba(255,255,255,.92)">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
