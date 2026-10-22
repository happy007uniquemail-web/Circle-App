import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { interestCatalog, useAppState } from '../lib/store';
import { LIMITS } from '../types';
import type { Interest } from '../types';

/**
 * INT-04: searchable interest chips grouped by category.
 *
 * - selected state: filled brand chip + `aria-pressed`
 * - counter: "4/10", flips to amber at the cap
 * - keyboard: every chip is a real <button> (Tab + Enter/Space)
 * - narrow screens: chips wrap; nothing is fixed-width (works at 320 px)
 *
 * The 3-minimum is the onboarding flow's rule (skippable by design), so it is
 * passed in as `min` and shown as a hint only; the 10-maximum is mirrored
 * here and enforced in the DB by the 0007 `user_interests_limit` trigger.
 */
export default function InterestPicker({
  value,
  onChange,
  max = LIMITS.interestsMax,
  min,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  min?: number;
}) {
  const state = useAppState();
  const [query, setQuery] = useState('');
  const catalog = interestCatalog(state);
  const picked = new Set(value);
  const full = value.length >= max;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? catalog.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.slug.includes(q) ||
            i.category.toLowerCase().includes(q),
        )
      : catalog;
    const by = new Map<string, Interest[]>();
    for (const i of filtered) by.set(i.category, [...(by.get(i.category) ?? []), i]);
    return [...by.entries()];
  }, [catalog, query]);

  function toggle(id: string) {
    if (picked.has(id)) return onChange(value.filter((x) => x !== id));
    if (full) return; // the counter + disabled chips explain the cap
    onChange([...value, id]);
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search interests</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search interests…"
            className="input input-icon py-2"
          />
        </label>
        <span
          aria-live="polite"
          className={`shrink-0 text-sm font-semibold tabular-nums ${full ? 'text-amber-600' : 'text-slate-500'}`}
          title={full ? 'Maximum reached' : undefined}
        >
          {value.length}/{max}
        </span>
      </div>
      {min !== undefined && value.length > 0 && value.length < min && (
        <p className="mt-1.5 text-xs text-slate-500">
          Pick at least {min} — you can change these anytime.
        </p>
      )}
      {groups.length === 0 ? (
        <p className="mt-3 rounded-xl border border-slate-100 p-3 text-sm text-slate-500">
          No interests match “{query}”.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{category}</h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {items.map((i) => {
                  const on = picked.has(i.id);
                  const disabled = !on && full;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? 'Remove' : 'Add'} interest ${i.name}`}
                      disabled={disabled}
                      onClick={() => toggle(i.id)}
                      className={`tap44 rounded-full border px-3 py-1.5 text-sm transition ${
                        on
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : disabled
                            ? 'cursor-not-allowed border-slate-100 text-slate-300'
                            : 'border-slate-200 text-slate-700 hover:border-brand-400 hover:bg-brand-50'
                      }`}
                    >
                      {i.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
