import { useState, type FormEvent } from 'react';
import { LogOut, Monitor, Moon, Sun, Trash2, type LucideIcon } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import Avatar from '../components/Avatar';
import ImageUploader from '../components/ImageUploader';
import InterestPicker from '../components/InterestPicker';
import { toast } from '../components/Toast';
import { avatarFor, isValidUsername, timeAgo } from '../lib/format';
import { loadUiPrefs, saveUiPrefs, type ThemeMode } from '../lib/uiPrefs';
import { blockedIdsFor, currentUserProfile, interestsOf, profileById, useActions, useAppState } from '../lib/store';
import { LIMITS } from '../types';

/** Theme modes (THM-01): applied instantly via saveUiPrefs — no reload. */
const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string; hint: string; Icon: LucideIcon }> = [
  { value: 'light', label: 'Light', hint: 'Bright & clean', Icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Easy at night', Icon: Moon },
  { value: 'system', label: 'System', hint: 'Match device', Icon: Monitor },
];

/** Appearance/preferences card: Light / Dark / System segmented control. */
function AppearanceCard() {
  // The active mode lives in localStorage; reading it directly keeps the
  // highlight correct even if the account menu's quick picker changed it.
  const [, bump] = useState(0);
  const theme = loadUiPrefs().theme;

  function pick(next: ThemeMode) {
    saveUiPrefs({ theme: next }); // flips data-theme on <html> instantly
    bump((n) => n + 1);
  }

  return (
    <section className="card p-5" aria-labelledby="settings-appearance">
      <h2 id="settings-appearance" className="font-semibold">Appearance</h2>
      <p className="mt-1 text-sm text-slate-500">
        Choose Light or Dark, or let Circle follow your device — System updates automatically when your phone switches day/night.
      </p>
      <div role="radiogroup" aria-label="Theme" className="mt-3 grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map(({ value, label, hint, Icon }) => (
          <button
            key={value}
            role="radio"
            aria-checked={theme === value}
            onClick={() => pick(value)}
            className={`flex min-h-11 flex-col items-center gap-1 rounded-xl border p-3 text-center transition ${
              theme === value ? 'border-brand-500 bg-brand-50' : 'border-border-subtle hover:border-brand-400'
            }`}
          >
            <Icon size={18} className={theme === value ? 'text-brand-600' : 'text-txt-subtle'} aria-hidden />
            <span className="text-sm font-semibold">{label}</span>
            <span className="text-[11px] text-slate-500">{hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Mute categories (NOT-09): one switch per family; notify() honours the individual types. */
const NOTIF_CATEGORIES: ReadonlyArray<{ types: string[]; label: string; hint: string }> = [
  { types: ['like'], label: 'Likes', hint: 'When someone likes your post' },
  { types: ['comment', 'mention'], label: 'Comments & mentions', hint: 'Comments and @mentions on your posts' },
  { types: ['follow'], label: 'Follows', hint: 'New followers and follow requests' },
  { types: ['repost'], label: 'Reposts', hint: 'When someone reposts your post' },
  { types: ['cabin_invite', 'cabin_join_request', 'cabin_request_approved', 'cabin_request_declined'], label: 'Cabins', hint: 'Cabin invites, join requests, approvals, and declines' },
];

/** `/settings` — edit profile, manage blocks, sign out, delete account (PROF-2, MOD-3, AUTH-6). */
export default function Settings() {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);
  const navigate = useNavigate();

  const [username, setUsername] = useState(me?.username ?? '');
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  // INT-05: local mirror for instant-save; rolled back if the write fails.
  const [picks, setPicks] = useState<string[]>(() => (me ? interestsOf(state, me.id) : []));

  if (!state.session || !me) return null;

  const muted = state.mutedNotifications ?? [];
  const blocked = [...blockedIdsFor(state, me.id)]
    .map((id) => profileById(state, id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  async function toggleMute(types: string[]) {
    const allMuted = types.every((t) => muted.includes(t));
    const next = allMuted ? muted.filter((t) => !types.includes(t)) : [...new Set([...muted, ...types])];
    const r = await actions.setNotificationMutes(next);
    if (!r.ok) return toast(r.error ?? 'Could not update notification settings.', 'error');
  }

  /** INT-05: every chip toggle saves instantly; failures roll back to server truth. */
  async function savePicks(next: string[]) {
    setPicks(next);
    const r = await actions.setInterests(next);
    if (!r.ok) {
      setPicks(interestsOf(state, me!.id));
      toast(r.error ?? 'Could not save your interests.', 'error');
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidUsername(username)) return setError('Username must be 3–20 letters, numbers, or underscores.');
    const r = await actions.updateProfile({ username, displayName, bio, avatarUrl: avatarUrl || avatarFor(me!.id, displayName) });
    if (!r.ok) return setError(r.error ?? 'Could not save profile.');
    toast('Profile saved.', 'success');
  }

  async function deleteAccount() {
    const typed = window.prompt('Type DELETE to permanently remove your account, posts, comments, likes, and media.');
    if (typed !== 'DELETE') return;
    const r = await actions.deleteAccount();
    if (!r.ok) return toast(r.error ?? 'Could not delete account.', 'error');
    toast('Account deleted. We also purge backups within 30 days.', 'success');
    navigate('/', { replace: true });
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">Settings</h1>

      {/* PRV-10: entry point to the privacy page (visibility, toggles, contact permissions). */}
      <section className="card p-5">
        <h2 className="font-semibold">Privacy &amp; safety</h2>
        <p className="mt-1 text-sm text-slate-500">
          Control who sees your posts, what your profile shows, and who can contact or invite you.
        </p>
        <Link
          to="/settings/privacy"
          className="tap44 mt-3 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Open privacy settings
        </Link>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Edit profile</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar src={avatarUrl || me.avatarUrl} name={displayName || me.displayName} size={64} />
          <ImageUploader
            value={avatarUrl ? [avatarUrl] : []}
            onChange={(urls) => setAvatarUrl(urls[0] ?? '')}
            max={1}
            maxEdge={LIMITS.avatarMaxEdgePx}
            compressedMaxBytes={LIMITS.avatarMaxPostCompressBytes}
            label="Change photo"
          />
        </div>

        <form onSubmit={save} className="mt-5 space-y-4">
          <div>
            <label htmlFor="s-username" className="mb-1.5 block text-sm font-semibold">Username</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span>
              <input id="s-username" value={username} maxLength={20} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} className="input input-icon" />
            </div>
            <p className="mt-1 text-xs text-slate-400">3–20 letters, numbers, underscores — must be unique.</p>
          </div>
          <div>
            <label htmlFor="s-name" className="mb-1.5 block text-sm font-semibold">Display name</label>
            <input id="s-name" value={displayName} maxLength={LIMITS.displayNameMax} onChange={(e) => setDisplayName(e.target.value)} className="input" />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between">
              <label htmlFor="s-bio" className="text-sm font-semibold">Bio</label>
              <span className="text-xs text-slate-400">{bio.length}/{LIMITS.bioMax}</span>
            </div>
            <textarea id="s-bio" value={bio} maxLength={LIMITS.bioMax} rows={3} onChange={(e) => setBio(e.target.value)} className="input resize-none" />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" className="btn-primary">Save changes</button>
        </form>
      </section>

      <AppearanceCard />

      {/* INT-05: interests panel — every toggle saves instantly. */}
      <section className="card p-5" aria-labelledby="settings-interests">
        <h2 id="settings-interests" className="font-semibold">Interests</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tap to add or remove — changes save instantly. We match these against other people to suggest who to follow (and cabins, once you join some).
        </p>
        <div className="mt-3">
          <InterestPicker value={picks} onChange={(next) => void savePicks(next)} max={LIMITS.interestsMax} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Blocked accounts</h2>
        {blocked.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">You haven’t blocked anyone. Blocking hides content in both directions.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {blocked.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                <Avatar src={p.avatarUrl} name={p.displayName} size={32} />
                <span className="flex-1 truncate text-sm">
                  {p.displayName} <span className="text-slate-500">@{p.username}</span>
                </span>
                <button onClick={() => void actions.unblockUser(p.id)} className="btn-ghost text-xs">Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Notification preferences</h2>
        <p className="mt-1 text-sm text-slate-500">
          Muting stops new notifications of a type from being created server-side — nothing arrives and the badge stays quiet.
        </p>
        <ul className="mt-3 space-y-2">
          {NOTIF_CATEGORIES.map((c) => {
            const isMuted = c.types.every((t) => muted.includes(t));
            return (
              <li key={c.label} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                <span className="text-sm">
                  <b className="font-semibold">{c.label}</b>
                  <span className="block text-xs text-slate-500">{c.hint}</span>
                </span>
                <button
                  role="switch"
                  aria-checked={!isMuted}
                  aria-label={`${isMuted ? 'Unmute' : 'Mute'} ${c.label} notifications`}
                  onClick={() => void toggleMute(c.types)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${isMuted ? 'bg-slate-300' : 'bg-brand-600'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isMuted ? 'left-0.5' : 'left-[22px]'}`} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Account</h2>
        <dl className="mt-2 space-y-1 text-sm text-slate-600">
          <div className="flex justify-between"><dt>Signed in as</dt><dd className="font-medium">{state.session.email}</dd></div>
          <div className="flex justify-between"><dt>Member since</dt><dd>{timeAgo(me.createdAt)} ago</dd></div>
          <div className="flex justify-between"><dt>Role</dt><dd className="font-medium capitalize">{me.role}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => { actions.signOut(); navigate('/'); }} className="btn-ghost border border-white/15 bg-white/[0.05]">
            <LogOut size={15} /> Sign out
          </button>
          <button onClick={() => void deleteAccount()} className="btn-ghost border border-red-200 text-red-600 hover:bg-red-50">
            <Trash2 size={15} /> Delete account
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Deleting removes your profile, posts, comments, likes, and stored media (AUTH-6). Backups purge within 30 days.
        </p>
      </section>
    </div>
  );
}
