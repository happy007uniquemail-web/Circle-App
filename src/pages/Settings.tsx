import { useState, type FormEvent } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import ImageUploader from '../components/ImageUploader';
import { toast } from '../components/Toast';
import { avatarFor, isValidUsername, timeAgo } from '../lib/format';
import { blockedIdsFor, currentUserProfile, profileById, useActions, useAppState } from '../lib/store';
import { LIMITS } from '../types';

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

  if (!state.session || !me) return null;

  const blocked = [...blockedIdsFor(state, me.id)]
    .map((id) => profileById(state, id))
    .filter((p): p is NonNullable<typeof p> => !!p);

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

      <section className="card p-5">
        <h2 className="font-semibold">Edit profile</h2>
        <div className="mt-4 flex items-center gap-4">
          <Avatar src={avatarUrl || me.avatarUrl} name={displayName || me.displayName} size={64} />
          <ImageUploader
            value={avatarUrl ? [avatarUrl] : []}
            onChange={(urls) => setAvatarUrl(urls[0] ?? '')}
            max={1}
            maxEdge={LIMITS.avatarMaxEdgePx}
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
