import { useMemo, useState } from 'react';
import { Search, Tent, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  cabinInterestTagsOf,
  cabinMembersOf,
  currentUserProfile,
  interestCatalog,
  joinedCabinCount,
  ownedCabinCount,
  suggestCabinsByInterests,
  useAppState,
  useDataReady,
} from '../lib/store';
import { LIMITS } from '../types';
import { ListSkeleton } from '../components/Skeleton';

const PAGE = 12;

/** `/cabins` — Explore Cabins (CAB-03): search, interest filter, suggestions,
 *  member counts, pagination. "My cabins" pins my rooms on top. */
export default function Cabins() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const ready = useDataReady();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const cabins = state.cabins ?? [];
  const myIds = useMemo(
    () =>
      new Set(
        (state.cabinMembers ?? [])
          .filter((m) => m.userId === me?.id && m.status === 'active')
          .map((m) => m.cabinId),
      ),
    [state.cabinMembers, me?.id],
  );

  const suggestions = me ? suggestCabinsByInterests(state, me.id, 3) : [];
  const mine = useMemo(() => cabins.filter((c) => myIds.has(c.id)), [cabins, myIds]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return cabins
      .filter((c) => !myIds.has(c.id))
      .filter((c) => (!query ? true : c.name.toLowerCase().includes(query) || (c.description ?? '').toLowerCase().includes(query)))
      .filter((c) => {
        if (!tag) return true;
        return (state.cabinInterests ?? []).some((ci) => ci.cabinId === c.id && ci.interestId === tag);
      });
  }, [cabins, myIds, q, tag, state.cabinInterests]);

  const shown = filtered.slice(0, page * PAGE);
  const owned = me ? ownedCabinCount(state, me.id) : 0;
  const joined = me ? joinedCabinCount(state, me.id) : 0;

  function CabinRow({ id }: { id: string }) {
    const cabin = cabins.find((c) => c.id === id);
    if (!cabin) return null;
    const tags = cabinInterestTagsOf(state, cabin.id);
    const members = cabinMembersOf(state, cabin.id).length || cabin.memberCount;
    return (
      <li>
        <Link to={`/cabins/${cabin.id}`} className="card flex items-center gap-3 p-4 transition hover:shadow">
          {cabin.imageUrl ? (
            <img src={cabin.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" loading="lazy" />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden>
              <Tent size={20} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <b className="truncate text-sm">{cabin.name}</b>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  cabin.type === 'request' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {cabin.type === 'request' ? 'Request' : 'Open'}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {members} {members === 1 ? 'member' : 'members'}
              {tags.length > 0 && <> · {tags.map((t) => t.name).join(', ')}</>}
            </span>
            {cabin.description && <span className="mt-0.5 block truncate text-xs text-slate-400">{cabin.description}</span>}
          </span>
        </Link>
      </li>
    );
  }

  if (!me) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Explore Cabins</h1>
        <Link
          to="/cabins/new"
          className={`btn-primary text-xs ${owned >= LIMITS.cabinCreateMax ? 'pointer-events-none opacity-50' : ''}`}
          aria-disabled={owned >= LIMITS.cabinCreateMax}
          title={owned >= LIMITS.cabinCreateMax ? `You can own at most ${LIMITS.cabinCreateMax} cabins` : undefined}
        >
          <UserPlus size={14} /> Create
        </Link>
      </div>

      {!ready ? (
        <ListSkeleton n={4} />
      ) : (
        <>
          {/* My cabins (CAB-04 shortcut) */}
          {mine.length > 0 && (
            <section aria-label="My cabins">
              <h2 className="mb-2 text-sm font-semibold text-slate-600">
                My cabins <span className="text-xs font-normal text-slate-400">({joined}/{joinedCabinCount(state, me.id)} joined, {owned}/{LIMITS.cabinCreateMax} owned)</span>
              </h2>
              <ul className="space-y-2">
                {mine.map((c) => (
                  <CabinRow key={c.id} id={c.id} />
                ))}
              </ul>
            </section>
          )}

          {/* Suggested for you (INT-07 cabin half) */}
          {suggestions.length > 0 && (
            <section aria-label="Suggested cabins">
              <h2 className="mb-2 text-sm font-semibold text-slate-600">Suggested for you</h2>
              <ul className="space-y-2">
                {suggestions.map((c) => (
                  <CabinRow key={c.id} id={c.id} />
                ))}
              </ul>
            </section>
          )}

          {/* Search + interest filter */}
          <div className="card space-y-3 p-4">
            <label className="relative block">
              <span className="sr-only">Search cabins</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search cabins…"
                className="input input-icon py-2"
              />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by interest">
              {interestCatalog(state).map((i) => (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={tag === i.id}
                  onClick={() => {
                    setTag(tag === i.id ? null : i.id);
                    setPage(1);
                  }}
                  className={`tap44 rounded-full border px-2.5 py-1 text-xs transition ${
                    tag === i.id
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-brand-400 hover:bg-brand-50'
                  }`}
                >
                  {i.name}
                </button>
              ))}
            </div>
          </div>

          {/* Everything else */}
          {filtered.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Tent size={22} />
              </div>
              <h2 className="mt-3 font-semibold">No cabins match</h2>
              <p className="mt-1 text-sm text-slate-600">
                {q || tag ? 'Try a different search or filter.' : 'Be the first — create one around an interest you love.'}
              </p>
              <Link to="/cabins/new" className="btn-primary mt-4 inline-flex">
                Create a cabin
              </Link>
            </div>
          ) : (
            <>
              <ul className="space-y-2" aria-label="Cabins">
                {shown.map((c) => (
                  <CabinRow key={c.id} id={c.id} />
                ))}
              </ul>
              {shown.length < filtered.length && (
                <button type="button" onClick={() => setPage((p) => p + 1)} className="btn-ghost w-full">
                  Load more ({filtered.length - shown.length} left)
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
