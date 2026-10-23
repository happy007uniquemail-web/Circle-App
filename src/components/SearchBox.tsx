import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Search, Tent } from 'lucide-react';
import Avatar from './Avatar';
import { currentUserProfile, useAppState } from '../lib/store';
import { selectSearchCabins, selectSearchPosts, selectSearchUsers } from '../lib/searchAll';

/**
 * TOP-02 search: pill input with the placeholder "Search people, posts,
 * cabins", 300 ms debounce, and a grouped People / Posts / Cabins dropdown
 * that is keyboard navigable (Arrow keys move, Enter opens, Esc closes).
 * Enter with no highlighted option falls back to /explore?q= as before.
 *
 * variant "pill" — desktop top bar (always visible ≥768px).
 * variant "icon" — mobile top bar: tapping expands to a full-width field.
 */

type Variant = 'pill' | 'icon';
type RowKind = 'person' | 'post' | 'cabin';

interface Row {
  to: string;
  kind: RowKind;
  title: string;
  sub: string;
  avatar?: { src: string; name: string };
}

interface Res {
  q: string;
  rows: Row[];
}

const GROUP_LABEL: Record<RowKind, string> = { person: 'People', post: 'Posts', cabin: 'Cabins' };

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function groupsOf(rows: Row[]): Array<{ label: string; kind: RowKind; from: number; to: number }> {
  const out: Array<{ label: string; kind: RowKind; from: number; to: number }> = [];
  rows.forEach((r, i) => {
    const last = out[out.length - 1];
    if (last && last.kind === r.kind) last.to = i + 1;
    else out.push({ label: GROUP_LABEL[r.kind], kind: r.kind, from: i, to: i + 1 });
  });
  return out;
}

function ResultsDropdown({
  id,
  res,
  active,
  onHover,
  onPick,
  onAll,
}: {
  id: string;
  res: Res;
  active: number;
  onHover: (i: number) => void;
  onPick: (i: number) => void;
  onAll: () => void;
}) {
  const groups = groupsOf(res.rows);
  return (
    <div className="glass absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl p-2">
      {res.rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-txt-subtle">No matches for “{res.q}”.</p>
      ) : (
        <div id={id} role="listbox" aria-label="Search results">
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <p
                aria-hidden
                className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-txt-subtle"
              >
                {g.label}
              </p>
              {res.rows.slice(g.from, g.to).map((r, j) => {
                const i = g.from + j;
                return (
                  <button
                    key={r.to}
                    type="button"
                    role="option"
                    id={`${id}-${i}`}
                    aria-selected={active === i}
                    onMouseMove={() => onHover(i)}
                    onClick={() => onPick(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      active === i ? 'bg-hover-wash' : ''
                    }`}
                  >
                    {r.avatar ? (
                      <Avatar src={r.avatar.src} name={r.avatar.name} size={32} />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-input-bg text-brand-600">
                        <Tent size={16} aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm ${
                          r.kind === 'post' ? 'text-txt-main' : 'font-semibold text-txt-main'
                        }`}
                      >
                        {r.title}
                      </span>
                      <span className="block truncate text-xs text-txt-subtle">{r.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {res.rows.length > 0 && (
        <button
          type="button"
          onClick={onAll}
          className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-brand-600 transition hover:bg-hover-wash"
        >
          See all results for “{res.q}” <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

export default function SearchBox({ variant = 'pill' }: { variant?: Variant }) {
  const state = useAppState();
  const me = currentUserProfile(state);
  const navigate = useNavigate();
  const uid = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const [raw, setRaw] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [expanded, setExpanded] = useState(false); // icon variant only

  const q = useDebounced(raw, 300); // TOP-02: 300ms debounce

  const res = useMemo<Res | null>(() => {
    const query = q.trim();
    if (!query) return null;
    const viewerId = me?.id ?? null;
    const people = selectSearchUsers(state, viewerId, query, 4);
    const posts = selectSearchPosts(state, viewerId, query, 4);
    const cabins = selectSearchCabins(state, query, 4);
    const rows: Row[] = [
      ...people.map((p) => ({
        to: `/u/${p.username}`,
        kind: 'person' as const,
        title: p.displayName,
        sub: `@${p.username}`,
        avatar: { src: p.avatarUrl, name: p.displayName },
      })),
      ...posts.map((p) => {
        const author = state.profiles.find((x) => x.id === p.authorId);
        return {
          to: `/p/${p.id}`,
          kind: 'post' as const,
          title: p.body,
          sub: author?.displayName ?? 'Post',
          avatar: author ? { src: author.avatarUrl, name: author.displayName } : undefined,
        };
      }),
      ...cabins.map((c) => ({
        to: `/cabins/${c.id}`,
        kind: 'cabin' as const,
        title: c.name,
        sub: `${c.memberCount} ${c.memberCount === 1 ? 'member' : 'members'}`,
      })),
    ];
    return { q: query, rows };
  }, [q, state, me?.id]);

  const show = open && res !== null;

  function collapse() {
    setExpanded(false);
    setOpen(false);
    setActive(-1);
    requestAnimationFrame(() => btnRef.current?.focus());
  }

  function pick(i: number) {
    const r = res?.rows[i];
    if (!r) return;
    navigate(r.to);
    setRaw('');
    setOpen(false);
    setActive(-1);
    setExpanded(false);
  }

  function submit() {
    const t = raw.trim();
    navigate(t ? `/explore?q=${encodeURIComponent(t)}` : '/explore');
    setOpen(false);
    setActive(-1);
    setExpanded(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation(); // close search first, before any global handler
      if (active >= 0) setActive(-1);
      else if (open) setOpen(false);
      else if (variant === 'icon' && expanded) collapse();
      return;
    }
    if (!res) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, res.rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && res.rows[active]) pick(active);
      else submit();
    }
  }

  // Close when a click lands outside the whole widget (and when keyboard
  // focus leaves it), so the dropdown never lingers over the page.
  useEffect(() => {
    if (!show && !expanded) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setActive(-1);
      setExpanded(false); // outside click also collapses the mobile field
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [show, expanded]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const field = (
    <>
      <form role="search" onSubmit={onSubmit} className="relative w-full">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-txt-subtle"
        />
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
              setOpen(false);
              setActive(-1);
            }
          }}
          role="combobox"
          aria-expanded={show}
          aria-controls={uid}
          aria-activedescendant={show && active >= 0 ? `${uid}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label="Search people, posts, cabins"
          placeholder="Search people, posts, cabins"
          className="input input-icon py-2"
        />
      </form>
      {show && res && (
        <ResultsDropdown
          id={uid}
          res={res}
          active={active}
          onHover={setActive}
          onPick={pick}
          onAll={submit}
        />
      )}
    </>
  );

  if (variant === 'pill') {
    return (
      <div ref={wrapRef} className="relative w-full">
        {field}
      </div>
    );
  }

  // icon variant: collapsed = one tap target; expanded = full-width field
  // replacing the header row (TRD §5.2 <768px "expands to full-width search").
  return (
    <div ref={wrapRef} className="contents">
      {!expanded && (
        <button
          ref={btnRef}
          type="button"
          aria-label="Search"
          onClick={() => setExpanded(true)}
          className="tap44 rounded-full p-2 text-txt-muted transition hover:bg-hover-wash hover:text-txt-main"
        >
          <Search size={20} aria-hidden />
        </button>
      )}
      {expanded && (
        <div className="absolute inset-0 z-50 flex items-center gap-1.5 border-b border-border-subtle bg-surface px-2">
          <button
            type="button"
            aria-label="Close search"
            onClick={collapse}
            className="tap44 shrink-0 rounded-full p-2 text-txt-muted transition hover:bg-hover-wash"
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
          <div className="relative min-w-0 flex-1">{field}</div>
        </div>
      )}
    </div>
  );
}
