import { ShieldCheck } from 'lucide-react';
import Avatar from '../components/Avatar';
import { toast } from '../components/Toast';
import { currentUserProfile, profileById, useActions, useAppState } from '../lib/store';
import type { PrivacyInput, WhoCan } from '../types';

/**
 * `/settings/privacy` — PRV-01/04/05/06/09/10.
 *
 * Every control saves the instant it changes (instant-save, toast on failure —
 * PRV-10) and uses plain language rather than schema names. Server-side the
 * same fields are enforced by RLS in `0006_privacy.sql`; this page only
 * toggles them.
 */

const VISIBILITY: ReadonlyArray<{ value: 'public' | 'followers' | 'private'; label: string; hint: string }> = [
  { value: 'public', label: 'Public', hint: 'Anyone can see your posts and find your profile.' },
  { value: 'followers', label: 'Followers only', hint: 'Only people who follow you can see your posts. Anyone can still follow you.' },
  { value: 'private', label: 'Private', hint: 'Only people you approve can follow you, and only followers see your posts.' },
];

const WHO_CAN: ReadonlyArray<{ value: WhoCan; label: string }> = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'followers', label: 'People who follow you' },
  { value: 'nobody', label: 'Nobody' },
];

/** Toggle row: label + hint on the left, switch on the right (NOT-09 markup parity). */
function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  ariaLabel,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <span className="text-sm">
        <b className="font-semibold">{label}</b>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={() => onChange(!checked)}
        className={`tap44 relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </li>
  );
}

export default function PrivacySettings() {
  const state = useAppState();
  const actions = useActions();
  const me = currentUserProfile(state);

  if (!state.session || !me) return null;

  /** Instant save — patch one field, toast on failure (PRV-10). */
  async function save(input: PrivacyInput, failure: string) {
    const r = await actions.updatePrivacy(input);
    if (!r.ok) toast(r.error ?? failure, 'error');
  }

  const muted = (state.mutes ?? [])
    .filter((m) => m.muterId === me!.id)
    .map((m) => profileById(state, m.mutedId))
    .filter((p): p is NonNullable<typeof p> => !!p);

  async function unmute(userId: string, name: string) {
    const r = await actions.unmuteUser(userId);
    if (!r.ok) return toast(r.error ?? 'Could not unmute.', 'error');
    toast(`Unmuted ${name}.`, 'success');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6">
      <header className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-brand-600" aria-hidden />
        <div>
          <h1 className="text-xl font-bold">Privacy &amp; safety</h1>
          <p className="text-sm text-slate-500">Changes save immediately.</p>
        </div>
      </header>

      {/* PRV-01: account visibility */}
      <section className="card p-5" aria-labelledby="privacy-visibility">
        <h2 id="privacy-visibility" className="font-semibold">
          Who can see your posts
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Turning this to <b>Private</b> keeps your followers but hides your posts from everyone who isn’t approved yet.
        </p>
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">Account visibility</legend>
          {VISIBILITY.map((v) => (
            <label
              key={v.value}
              className="tap44 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-100 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
            >
              <input
                type="radio"
                name="visibility"
                value={v.value}
                checked={(me.visibility ?? 'public') === v.value}
                onChange={() => void save({ visibility: v.value }, 'Could not update visibility.')}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-600)]"
              />
              <span className="text-sm">
                <b className="font-semibold">{v.label}</b>
                <span className="block text-xs text-slate-500">{v.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      {/* PRV-04: per-field toggles */}
      <section className="card p-5" aria-labelledby="privacy-fields">
        <h2 id="privacy-fields" className="font-semibold">
          What your profile shows
        </h2>
        <p className="mt-1 text-sm text-slate-500">Choose which details other people can see on your profile.</p>
        <ul className="mt-3 space-y-2">
          <SwitchRow
            label="Date you joined"
            hint="Show “Joined” on your profile"
            checked={me.showJoinDate !== false}
            ariaLabel="Show join date on profile"
            onChange={(next) => void save({ showJoinDate: next }, 'Could not update join date setting.')}
          />
          <SwitchRow
            label="Followers & following lists"
            hint="Let people browse who follows you and who you follow"
            checked={me.showFollowLists !== false}
            ariaLabel="Show follower and following lists"
            onChange={(next) => void save({ showFollowLists: next }, 'Could not update follow list setting.')}
          />
          <SwitchRow
            label="Appear in search"
            hint="Let people find you by name or username in search and suggestions"
            checked={me.discoverable !== false}
            ariaLabel="Appear in search"
            onChange={(next) => void save({ discoverable: next }, 'Could not update search setting.')}
          />
          <SwitchRow
            label="Interests"
            hint="Show your interest tags on your profile"
            checked={me.showInterest !== false}
            ariaLabel="Show interests on profile"
            onChange={(next) => void save({ showInterest: next }, 'Could not update interests setting.')}
          />
        </ul>
      </section>

      {/* PRV-05 / PRV-06: who may contact you */}
      <section className="card p-5" aria-labelledby="privacy-contact">
        <h2 id="privacy-contact" className="font-semibold">
          Who can contact you
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <label htmlFor="dm-permission" className="text-sm">
              <b className="font-semibold">Direct messages</b>
              <span className="block text-xs text-slate-500">Who may start a conversation with you.</span>
            </label>
            <select
              id="dm-permission"
              value={me.dmPermission ?? 'everyone'}
              onChange={(e) =>
                void save({ dmPermission: e.target.value as WhoCan }, 'Could not update message permission.')
              }
              className="tap44 mt-2 w-full rounded-xl border border-[var(--input-b)] bg-transparent px-3 py-2 text-sm"
            >
              {WHO_CAN.map((o) => (
                <option key={o.value} value={o.value} className="bg-white text-slate-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cabin-permission" className="text-sm">
              <b className="font-semibold">Cabin invites</b>
              <span className="block text-xs text-slate-500">Who may invite you to cabins.</span>
            </label>
            <select
              id="cabin-permission"
              value={me.cabinInvitePermission ?? 'everyone'}
              onChange={(e) =>
                void save({ cabinInvitePermission: e.target.value as WhoCan }, 'Could not update cabin invite permission.')
              }
              className="tap44 mt-2 w-full rounded-xl border border-[var(--input-b)] bg-transparent px-3 py-2 text-sm"
            >
              {WHO_CAN.map((o) => (
                <option key={o.value} value={o.value} className="bg-white text-slate-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* PRV-08: mutes (their content stays hidden from my feeds, no block) */}
      <section className="card p-5" aria-labelledby="privacy-muted">
        <h2 id="privacy-muted" className="font-semibold">
          Muted accounts
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Their posts are hidden from your feeds. They aren’t notified and can still follow or message you.
        </p>
        {muted.length === 0 ? (
          <p className="mt-3 rounded-xl border border-slate-100 p-3 text-sm text-slate-500">You haven’t muted anyone.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {muted.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar src={p.avatarUrl} name={p.displayName} size={36} />
                  <span className="min-w-0 text-sm">
                    <b className="block truncate font-semibold">{p.displayName}</b>
                    <span className="block truncate text-xs text-slate-500">@{p.username}</span>
                  </span>
                </span>
                <button
                  onClick={() => void unmute(p.id, p.displayName)}
                  className="tap44 shrink-0 rounded-full border border-slate-200 px-4 py-1.5 text-sm font-semibold hover:bg-slate-50"
                >
                  Unmute
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
