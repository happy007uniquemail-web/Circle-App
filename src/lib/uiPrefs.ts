/**
 * UI preferences — UI Design TRD §8 (THM-01 theme modes, THM-02 accent
 * presets, THM-03 wallpapers, THM-04 reduce-effects).
 *
 * Persisted under the localStorage key "circle.ui" and applied to <html> as
 * `data-theme` / `data-wallpaper` / `data-reduce-effects` plus five inline
 * accent custom properties. The pre-paint script in index.html duplicates the
 * attribute part so the FIRST paint already has the right theme (no flash);
 * this module owns runtime saves (Themes page, Phase 6) and re-application.
 * Keep the stored shape in sync with that script.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export type WallpaperId =
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'violet'
  | 'forest'
  | 'rose'
  | 'solid';

export type AccentId =
  | 'blue-violet'
  | 'indigo'
  | 'violet'
  | 'ocean'
  | 'forest'
  | 'sunset';

/** One accent preset = the five runtime accent stops (TOK-03).
 *  `strong*` stops sit behind WHITE text, so every preset's strong pair and
 *  gradient must hold ≥4.5:1 with white (GLS-04 / AUD-06 precedence rule). */
export interface AccentPreset {
  id: AccentId;
  name: string;
  /** Decorative stops — dots, borders, progress, ambient accents. */
  from: string;
  to: string;
  /** Flat accent — focus rings, chips, small fills (≥3:1 vs page). */
  solid: string;
  /** Gradient stops carrying white text (.btn-primary, active pills). */
  strongFrom: string;
  strongTo: string;
}

/** TRD §8 THM-02 wants 6–8 presets; 6 ship with the Themes page. */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'blue-violet', name: 'Blue violet', from: '#6FA8FF', to: '#4B6BFF', solid: '#4768F2', strongFrom: '#3D5AFE', strongTo: '#6242E0' },
  { id: 'indigo', name: 'Indigo', from: '#818CF8', to: '#4F46E5', solid: '#6366F1', strongFrom: '#4F46E5', strongTo: '#7C3AED' },
  { id: 'violet', name: 'Violet', from: '#C4B5FD', to: '#7C3AED', solid: '#7C3AED', strongFrom: '#6D28D9', strongTo: '#9333EA' },
  { id: 'ocean', name: 'Ocean', from: '#7DD3FC', to: '#2563EB', solid: '#2563EB', strongFrom: '#1D4ED8', strongTo: '#1E40AF' },
  { id: 'forest', name: 'Forest', from: '#6EE7B7', to: '#059669', solid: '#059669', strongFrom: '#047857', strongTo: '#065F46' },
  { id: 'sunset', name: 'Sunset', from: '#FDBA74', to: '#F43F5E', solid: '#E11D48', strongFrom: '#BE123C', strongTo: '#9F1239' },
];

/** THM-03: 6 gradient presets + solid (pure CSS, 0 KB network). */
export const WALLPAPERS: { id: WallpaperId; name: string }[] = [
  { id: 'aurora', name: 'Aurora' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'ocean', name: 'Ocean' },
  { id: 'violet', name: 'Violet' },
  { id: 'forest', name: 'Forest' },
  { id: 'rose', name: 'Rose' },
  { id: 'solid', name: 'Solid' },
];

export interface UiPrefs {
  /** Default 'light' (TRD mockup is light; THM-01 offers dark + system). */
  theme: ThemeMode;
  wallpaper: WallpaperId;
  accent: AccentId;
  /** null = follow the OS (prefers-reduced-transparency / -motion). */
  reduceEffects: boolean | null;
}

const KEY = 'circle.ui';
const DEFAULTS: UiPrefs = {
  theme: 'light',
  wallpaper: 'aurora',
  accent: 'blue-violet',
  reduceEffects: null,
};

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const prefersReducedEffects = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(prefers-reduced-transparency: reduce)').matches ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      theme: p.theme === 'dark' || p.theme === 'system' ? p.theme : DEFAULTS.theme,
      wallpaper: typeof p.wallpaper === 'string' ? (p.wallpaper as WallpaperId) : DEFAULTS.wallpaper,
      accent: typeof p.accent === 'string' ? (p.accent as AccentId) : DEFAULTS.accent,
      reduceEffects: p.reduceEffects === true || p.reduceEffects === false ? p.reduceEffects : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Merge a patch into the stored prefs and apply immediately. */
export function saveUiPrefs(patch: Partial<UiPrefs>): UiPrefs {
  const next: UiPrefs = { ...loadUiPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — still apply for this session */
  }
  applyUiPrefs(next);
  return next;
}

/** Resolve system → concrete value for the *current* OS state. */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode;
}

/**
 * Push prefs onto <html>. Idempotent — safe to call on boot (mirrors what the
 * pre-paint script already did) and again whenever a preference changes.
 * Accent stops are written inline so they override tokens.css in both themes;
 * the derived --accent-gradient/--accent-soft reference them via var() and
 * follow automatically (tokens.css).
 */
export function applyUiPrefs(prefs: UiPrefs = loadUiPrefs()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = resolveTheme(prefs.theme);

  root.setAttribute('data-theme', theme);
  root.setAttribute('data-wallpaper', prefs.wallpaper);

  const reduce =
    prefs.reduceEffects === null ? prefersReducedEffects() : prefs.reduceEffects;
  root.setAttribute('data-reduce-effects', reduce ? 'on' : 'off');

  const accent = ACCENT_PRESETS.find((a) => a.id === prefs.accent) ?? ACCENT_PRESETS[0];
  root.style.setProperty('--accent-from', accent.from);
  root.style.setProperty('--accent-to', accent.to);
  root.style.setProperty('--accent-solid', accent.solid);
  root.style.setProperty('--accent-strong-from', accent.strongFrom);
  root.style.setProperty('--accent-strong-to', accent.strongTo);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0A0A0C' : '#E9EDF7');
}

/**
 * Follow live OS changes while mode is "system" (theme) or reduceEffects is
 * null. Returns an unsubscribe function; call once at boot.
 */
export function watchSystemUiPrefs(): () => void {
  if (typeof window === 'undefined') return () => {};
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  const mqTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => {
    const p = loadUiPrefs();
    if (p.theme === 'system' || p.reduceEffects === null) applyUiPrefs(p);
  };
  mqDark.addEventListener('change', onChange);
  mqTransparency.addEventListener('change', onChange);
  mqMotion.addEventListener('change', onChange);
  return () => {
    mqDark.removeEventListener('change', onChange);
    mqTransparency.removeEventListener('change', onChange);
    mqMotion.removeEventListener('change', onChange);
  };
}
