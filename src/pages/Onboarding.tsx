import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Circle as CircleIcon, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ImageUploader from '../components/ImageUploader';
import { avatarFor, isValidUsername } from '../lib/format';
import { currentUserProfile, useActions, useAppState } from '../lib/store';
import { LIMITS } from '../types';

/** First-run flow: unique username + optional bio/avatar + ToS acceptance (PROF-1/2, MOD-5). */
export default function Onboarding() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const actions = useActions();
  const navigate = useNavigate();

  const [username, setUsername] = useState(me?.username ?? '');
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl ?? '');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameStatus = useMemo(() => {
    const u = username.trim();
    if (!u) return { kind: 'idle' as const, msg: '3–20 characters: letters, numbers, underscores' };
    if (!isValidUsername(u)) return { kind: 'bad' as const, msg: '3–20 letters, numbers, or underscores only.' };
    const taken = state.profiles.some((p) => p.id !== me?.id && p.username?.toLowerCase() === u.toLowerCase());
    if (taken) return { kind: 'bad' as const, msg: 'That username is already taken.' };
    return { kind: 'ok' as const, msg: `${u} is available` };
  }, [username, state.profiles, me?.id]);

  if (!me) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (usernameStatus.kind !== 'ok') return setError('Pick a valid, available username.');
    if (!agreed) return setError('Please accept the Terms of Service and Privacy Policy.');
    const result = await actions.completeOnboarding({
      username: username.trim(),
      displayName: displayName.trim() || me!.displayName,
      bio,
      avatarUrl: avatarUrl || avatarFor(me!.id, displayName || me!.displayName),
    });
    if (!result.ok) return setError(result.error ?? 'Something went wrong.');
    navigate('/home', { replace: true });
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-lg items-center gap-2 px-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-black/40">C</span>
        <span className="font-bold">Welcome to Circle, {me.displayName.split(' ')[0]}</span>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-16">
        <div className="card p-6">
          <h1 className="text-xl font-bold">Set up your profile</h1>
          <p className="mt-1 text-sm text-slate-600">This takes less than a minute — your username is how people find you.</p>

          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="avatar" className="mb-2 block text-sm font-semibold">Profile photo</label>
              <ImageUploader
                value={avatarUrl ? [avatarUrl] : []}
                onChange={(urls) => setAvatarUrl(urls[0] ?? '')}
                max={1}
                maxEdge={LIMITS.avatarMaxEdgePx}
                label="Upload a photo (optional)"
              />
            </div>

            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-semibold">Username *</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">@</span>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                  autoComplete="username"
                  maxLength={20}
                  className="input input-icon"
                  placeholder="jordanlee"
                  required
                />
              </div>
              <p className={`mt-1 flex items-center gap-1 text-xs ${
                usernameStatus.kind === 'ok' ? 'text-emerald-600' : usernameStatus.kind === 'bad' ? 'text-red-600' : 'text-slate-500'
              }`}>
                {usernameStatus.kind === 'ok' && <CheckCircle2 size={13} />}
                {usernameStatus.kind === 'bad' && <XCircle size={13} />}
                {usernameStatus.kind === 'idle' && <CircleIcon size={13} />}
                {usernameStatus.msg}
              </p>
            </div>

            <div>
              <label htmlFor="displayName" className="mb-1.5 block text-sm font-semibold">Display name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={LIMITS.displayNameMax}
                className="input"
                placeholder="Jordan Lee"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="bio" className="text-sm font-semibold">Bio</label>
                <span className={`text-xs ${bio.length > LIMITS.bioMax ? 'text-red-600' : 'text-slate-400'}`}>
                  {bio.length}/{LIMITS.bioMax}
                </span>
              </div>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={LIMITS.bioMax}
                rows={3}
                className="input resize-none"
                placeholder="What are you into?"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
                required
              />
              <span>
                I agree to the <a href="/terms" target="_blank" className="text-brand-600 underline">Terms of Service</a> and{' '}
                <a href="/privacy" target="_blank" className="text-brand-600 underline">Privacy Policy</a>. *
              </span>
            </label>

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button type="submit" className="btn-primary w-full">Create my profile</button>
          </form>
        </div>
      </main>
    </div>
  );
}
