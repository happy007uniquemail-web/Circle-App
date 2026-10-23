import type { KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FEED_MODES,
  normalizeFeedMode,
  readFeedFilters,
  writeFeedParams,
  type FeedMode,
} from '../lib/feedModes';

/**
 * TOP-01: For you / Popular / Latest / Trending feed tabs as role="tablist".
 * State lives in ?feed= on /home (URL-shareable, no reload); clicking from
 * another page opens /home with the mode carried over, filters preserved.
 *
 * variant "text"  — desktop top bar: bold label + small accent underline.
 * variant "pills" — the mobile horizontally scrollable pill row (<768px).
 */
export default function FeedTabs({
  variant = 'text',
  className = '',
}: {
  variant?: 'text' | 'pills';
  className?: string;
}) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const active = normalizeFeedMode(params.get('feed'));

  function select(mode: FeedMode) {
    const search = writeFeedParams(mode, readFeedFilters(params));
    if (location.pathname === '/home') navigate({ search }, { replace: true });
    else navigate({ pathname: '/home', search });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'));
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? tabs.length - 1
          : e.key === 'ArrowRight'
            ? (i + 1) % tabs.length
            : (i - 1 + tabs.length) % tabs.length;
    tabs[next]?.focus();
    select(FEED_MODES[next]!.id);
  }

  const isText = variant === 'text';

  return (
    <div
      role="tablist"
      aria-label="Feed mode"
      onKeyDown={onKeyDown}
      className={
        isText
          ? 'hidden items-center gap-1 wide:flex'
          : `no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto ${className}`
      }
    >
      {FEED_MODES.map(({ id, label }) =>
        isText ? (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => select(id)}
            className={`tap44 relative whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
              active === id
                ? 'font-bold text-txt-main'
                : 'font-medium text-txt-muted hover:bg-hover-wash hover:text-txt-main'
            }`}
          >
            {label}
            {active === id && (
              <span aria-hidden className="absolute inset-x-3 bottom-0.5 h-1 rounded-full bg-accent-primary" />
            )}
          </button>
        ) : (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => select(id)}
            className={`tap44 shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              active === id
                ? 'grad-accent text-white shadow-md'
                : 'border border-border-subtle bg-input-bg text-txt-muted hover:text-txt-main'
            }`}
          >
            {label}
          </button>
        ),
      )}
    </div>
  );
}
