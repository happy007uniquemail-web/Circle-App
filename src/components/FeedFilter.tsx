import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Filter } from 'lucide-react';
import { currentUserProfile, interestTagsOf, useAppState } from '../lib/store';
import {
  TIME_FILTERS,
  TYPE_FILTERS,
  feedFilterCount,
  normalizeFeedMode,
  readFeedFilters,
  writeFeedParams,
  type FeedFilters,
} from '../lib/feedModes';

/**
 * TOP-03: square gradient filter button (40px) opening a popover that filters
 * the home feed by interests (INT-xx picks), content type and time. State
 * lives in the URL (?type=, ?time=, ?ints=) and always lands on /home, since
 * that is the feed the filters act on.
 */

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="chip tap44 whitespace-nowrap px-3 py-1.5 text-xs">
      {children}
    </button>
  );
}

export default function FeedFilter({ className = '' }: { className?: string }) {
  const state = useAppState();
  const me = currentUserProfile(state);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const filters = readFeedFilters(params);
  const count = feedFilterCount(filters);
  const picks = me ? interestTagsOf(state, me.id) : [];

  useEffect(() => {
    if (!open) return;
    // Move focus to the first control inside the popover (a11y).
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function commit(patch: Partial<FeedFilters>) {
    const next = { ...filters, ...patch };
    const feed = normalizeFeedMode(params.get('feed'));
    // The filters act on the home feed — always (re)land there, in place.
    navigate({ pathname: '/home', search: writeFeedParams(feed, next) }, { replace: true });
  }

  const toggleInterest = (id: string) =>
    commit({
      interests: filters.interests.includes(id)
        ? filters.interests.filter((x) => x !== id)
        : [...filters.interests, id],
    });

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count ? `Feed filters, ${count} active` : 'Feed filters'}
        onClick={() => setOpen((o) => !o)}
        className="tap44 relative grid h-10 w-10 place-items-center rounded-xl grad-accent text-white shadow-md transition hover:brightness-110 active:brightness-95"
      >
        <Filter size={18} aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-border-subtle bg-surface px-1 text-[10px] font-bold text-txt-main"
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label="Feed filters"
          className="glass absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-72 space-y-4 overflow-y-auto rounded-2xl p-4"
        >
          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-txt-subtle">
              Content type
            </legend>
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTERS.map((t) => (
                <Chip key={t.id} active={filters.type === t.id} onClick={() => commit({ type: t.id })}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-txt-subtle">Time</legend>
            <div className="flex flex-wrap gap-2">
              {TIME_FILTERS.map((t) => (
                <Chip key={t.id} active={filters.time === t.id} onClick={() => commit({ time: t.id })}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-txt-subtle">
              Interests
            </legend>
            {picks.length === 0 ? (
              <p className="text-xs text-txt-subtle">
                No interests yet —{' '}
                <Link to="/settings" className="font-semibold text-brand-600 hover:underline" onClick={() => setOpen(false)}>
                  pick some in Settings
                </Link>{' '}
                to filter by them.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {picks.map((it) => (
                  <Chip key={it.id} active={filters.interests.includes(it.id)} onClick={() => toggleInterest(it.id)}>
                    {it.name}
                  </Chip>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex items-center justify-between border-t border-border-subtle pt-3">
            <button
              type="button"
              disabled={count === 0}
              onClick={() => commit({ type: 'all', time: 'any', interests: [] })}
              className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                btnRef.current?.focus();
              }}
              className="btn-primary px-4 py-1.5 text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
