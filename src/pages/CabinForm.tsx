import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Info, Loader2, Tent } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '../components/Toast';
import ImageUploader from '../components/ImageUploader';
import InterestPicker from '../components/InterestPicker';
import { cabinById, canModerateCabin, currentUserProfile, ownedCabinCount, useActions, useAppState, useDataReady } from '../lib/store';
import { LIMITS } from '../types';
import type { CabinType } from '../types';

/**
 * `/cabins/new` + `/cabins/:id/edit` — CAB-01 (create) and CAB-06 (owner/admin edit).
 *
 * Rules mirrored from the 0008 triggers (server remains authoritative):
 * - name 3–40, unique case-insensitive, reserved words blocked (CAB-01/08)
 * - description ≤300 (CAB-01), image compressed client-side per workstream D
 * - 1–10 interest tags required, min 1 (CAB-01; cap raised 3→10 in 0009), type open | request (§14: request
 *   cabins are visible in discovery)
 */
export default function CabinForm() {
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const me = currentUserProfile(state);

  const cabin = editing ? cabinById(state, id!) : null;
  const ready = useDataReady();

  const [name, setName] = useState(cabin?.name ?? '');
  const [description, setDescription] = useState(cabin?.description ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(cabin?.imageUrl ?? null);
  const [type, setType] = useState<CabinType>(cabin?.type ?? 'open');
  const [tags, setTags] = useState<string[]>(
    editing ? (state.cabinInterests ?? []).filter((ci) => ci.cabinId === cabin?.id).map((ci) => ci.interestId) : [],
  );
  const [busy, setBusy] = useState(false);

  // The cabin row lands after hydration (Supabase) — seed the form when it does.
  useEffect(() => {
    if (!cabin) return;
    setName(cabin.name);
    setDescription(cabin.description ?? '');
    setImageUrl(cabin.imageUrl ?? null);
    setType(cabin.type);
    setTags((state.cabinInterests ?? []).filter((ci) => ci.cabinId === cabin.id).map((ci) => ci.interestId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabin?.id]);

  // Live CAB-01 checks (DB enforces the same rules on submit).
  const trimmedName = name.trim();
  const nameLen = trimmedName.length;
  const duplicate = useMemo(
    () =>
      (state.cabins ?? []).some(
        (c) => c.id !== id && c.name.toLowerCase() === trimmedName.toLowerCase(),
      ),
    [state.cabins, id, trimmedName],
  );
  const nameOk =
    nameLen >= LIMITS.cabinNameMin && nameLen <= LIMITS.cabinNameMax && !duplicate;
  const descOk = description.trim().length <= LIMITS.cabinDescMax;
  const tagsOk = tags.length >= LIMITS.cabinTagsMin && tags.length <= LIMITS.cabinTagsMax;
  const canSubmit = nameOk && descOk && tagsOk && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const payload = {
      name: trimmedName,
      description: description.trim() || null,
      imageUrl,
      type,
      interestIds: tags,
    };
    const r = editing ? await actions.updateCabin(id!, payload) : await actions.createCabin(payload);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not save the cabin.', 'error');
    toast(editing ? 'Cabin updated.' : 'Cabin created — you are its owner.', 'success');
    navigate(editing ? `/cabins/${id}` : `/cabins/${(r as { id?: string }).id}`);
  }

  if (!me) return null;
  if (editing && !cabin) {
    return ready ? (
      <p className="card p-6 text-sm text-slate-600">Cabin not found — it may have been deleted.</p>
    ) : (
      <p className="card p-6 text-sm text-slate-500" role="status">Loading cabin…</p>
    );
  }
  if (editing && cabin && !canModerateCabin(state, cabin.id, me.id)) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold">You can’t edit this cabin</h1>
        <p className="mt-1 text-sm text-slate-600">Only the cabin’s owner or an admin can change its details.</p>
        <button onClick={() => navigate(`/cabins/${cabin.id}`)} className="btn-primary mt-4">Back to cabin</button>
      </div>
    );
  }
  const atCreateCap = !editing && ownedCabinCount(state, me.id) >= LIMITS.cabinCreateMax;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate(editing ? `/cabins/${id}` : '/cabins')}
          aria-label="Back"
          className="tap44 rounded-full p-2 text-slate-500 hover:bg-white/[0.06]"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold">{editing ? 'Edit cabin' : 'Create a cabin'}</h1>
      </header>

      {atCreateCap && (
        <p className="card border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          You already own {LIMITS.cabinCreateMax} cabins — the maximum. Delete one first to create another.
        </p>
      )}

      <form onSubmit={submit} className="card space-y-5 p-5">
        {/* Cover image (CAB-01: compressed per workstream D) */}
        <div>
          <span className="mb-1.5 block text-sm font-semibold">Cover photo</span>
          <ImageUploader
            value={imageUrl ? [imageUrl] : []}
            onChange={(urls) => setImageUrl(urls[0] ?? null)}
            max={1}
            label="Add a cover"
            maxEdge={LIMITS.avatarMaxEdgePx}
          />
        </div>

        {/* Name */}
        <div>
          <label htmlFor="cabin-name" className="mb-1.5 block text-sm font-semibold">
            Name <span className="text-slate-400 font-normal">(required)</span>
          </label>
          <input
            id="cabin-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.cabinNameMax + 10}
            placeholder="e.g. Weekend Hikers"
            className="input"
            autoFocus
          />
          <p className="mt-1 flex items-center justify-between text-xs">
            <span className={duplicate ? 'text-red-600' : 'text-slate-500'}>
              {duplicate ? 'A cabin with that name already exists.' : 'Unique, 3–40 characters.'}
            </span>
            <span className={`tabular-nums ${nameOk || nameLen === 0 ? 'text-slate-400' : 'text-red-600'}`}>
              {nameLen}/{LIMITS.cabinNameMax}
            </span>
          </p>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="cabin-desc" className="mb-1.5 block text-sm font-semibold">
            Description <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="cabin-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={LIMITS.cabinDescMax + 50}
            placeholder="What is this cabin about?"
            className="input resize-y"
          />
          <p className={`mt-1 text-right text-xs tabular-nums ${descOk ? 'text-slate-400' : 'text-red-600'}`}>
            {description.trim().length}/{LIMITS.cabinDescMax}
          </p>
        </div>

        {/* Type */}
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Joining</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['open', 'Open', 'Anyone can join instantly.'],
                ['request', 'Request', 'You approve who joins.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 transition ${
                  type === value ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-brand-400'
                }`}
              >
                <input
                  type="radio"
                  name="cabin-type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="mt-0.5 accent-brand-600"
                />
                <span>
                  <b className="block text-sm">{label}</b>
                  <span className="text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Interest tags (CAB-01: 1–10, min 1 required) */}
        <div>
          <span className="mb-1.5 block text-sm font-semibold">
            Interest tags <span className="text-slate-400 font-normal">({LIMITS.cabinTagsMin}–{LIMITS.cabinTagsMax} required)</span>
          </span>
          <InterestPicker value={tags} onChange={setTags} max={LIMITS.cabinTagsMax} min={LIMITS.cabinTagsMin} />
          {tags.length === 0 && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
              <Info size={12} aria-hidden /> Tags power “Suggested for you” — pick at least one.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={!canSubmit || atCreateCap}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Tent size={16} aria-hidden />}
            {editing ? 'Save changes' : 'Create cabin'}
          </button>
          <button type="button" onClick={() => navigate(editing ? `/cabins/${id}` : '/cabins')} className="btn-ghost">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
