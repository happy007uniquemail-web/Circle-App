import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  Bookmark,
  Compass,
  Home,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  Shield,
  Tent,
  User as UserIcon,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { ConfirmHost } from './ConfirmDialog';
import FeedFilter from './FeedFilter';
import FeedTabs from './FeedTabs';
import LogoMark from './LogoMark';
import NotificationBell from './NotificationBell';
import RightDrawer from './RightDrawer';
import SearchBox from './SearchBox';
import SidePanel from './SidePanel';
import { Toaster, toast } from './Toast';
import { useOnlineStatus } from '../lib/hooks';
import {
  currentUserProfile,
  totalCabinUnread,
  unreadConversationCount,
  unreadCount,
  useActions,
  useAppState,
  useDataReady,
} from '../lib/store';

function Brand() {
  return (
    <NavLink
      to="/home"
      aria-label="Circle home"
      className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-txt-main"
    >
      <LogoMark size={32} />
      <span className="hidden sm:inline">Circle</span>
    </NavLink>
  );
}

/**
 * One sidebar entry (NAV-02…05): accent-gradient pill when active, muted ink
 * + glass wash on hover otherwise. Labels render only at ≥1200px (wide); the
 * 768–1199px icon rail keeps the accessible name via aria-label and shows a
 * glass tooltip on hover/focus (.rail-tip in index.css).
 */
function NavItem({
  to,
  icon: Icon,
  label,
  badge,
  end,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `rail-link flex min-h-11 w-full items-center justify-center gap-3 rounded-full px-3 text-sm font-medium transition wide:justify-start wide:px-4 ${
          isActive
            ? 'grad-accent text-white shadow-md'
            : 'text-txt-muted hover:bg-hover-wash hover:text-txt-main'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative shrink-0">
            <Icon size={20} aria-hidden />
            {typeof badge === 'number' && badge > 0 && (
              <span
                className={`badge absolute -right-2 -top-1.5 ${isActive ? 'badge-on-accent' : ''}`}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          <span className="hidden wide:inline">{label}</span>
          <span aria-hidden className="rail-tip glass rounded-xl px-2.5 py-1.5 text-xs font-medium text-txt-main">
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

/** Mobile bottom tab bar entry (NAV-06): active = gradient icon well. */
function TabLink({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `tap44 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 transition ${
          isActive ? 'font-semibold text-txt-main' : 'font-medium text-txt-muted'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`relative grid h-6 w-10 place-items-center rounded-full ${
              isActive ? 'grad-accent text-white shadow-md' : ''
            }`}
          >
            <Icon size={19} aria-hidden />
            {typeof badge === 'number' && badge > 0 && (
              <span className="badge absolute -right-1 -top-1.5 shadow">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </span>
          <span className="truncate text-[11px] leading-none">{label}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Authenticated app shell — UI Design TRD §5/§6.1/§6.2.
 *
 * Layout is a viewport-height grid over the wallpaper: one rounded frosted
 * "app panel" (LAY-01/02/03) whose header is fixed in place (TOP-04) and
 * whose centre column is the ONLY thing that scrolls (no page-level double
 * scroll). Breakpoints: <768 bottom tab bar + single column · 768–1199
 * 72px icon rail · ≥1200 (wide) full sidebar + right panel, 24px margins.
 * The right panel moves into a drawer (LAY-04) below 1200px.
 *
 * <main> is keyed by pathname so each navigation starts at scrollTop 0 —
 * a plain scroll effect would race pages that scroll themselves (chat
 * auto-scroll to the newest message).
 */
export default function Layout() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const actions = useActions();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnlineStatus();
  const ready = useDataReady();
  const [drawer, setDrawer] = useState(false);
  const accountRef = useRef<HTMLDetailsElement>(null);

  // Account menu returns to normal on any click outside it (toggle still closes on re-click).
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = accountRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.removeAttribute('open');
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // F-RT: live incoming-activity toasts (DEV simulator / cross-tab events).
  useEffect(() => {
    function onActivity(e: Event) {
      toast(`${(e as CustomEvent<string>).detail} — just now`, 'info');
    }
    window.addEventListener('circle:activity', onActivity);
    return () => window.removeEventListener('circle:activity', onActivity);
  }, []);

  if (!state.session) return null;
  // Session exists but the profile row hasn't hydrated yet (UI-04): show a
  // spinner instead of a blank shell, and a retry path if hydration failed.
  if (!me) {
    return ready ? (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-sm p-8 text-center">
          <h1 className="text-lg font-bold">Couldn’t load your profile</h1>
          <p className="mt-1 text-sm text-slate-600">Check your connection and try again.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => void actions.refresh()} className="btn-ghost">Retry</button>
            <button onClick={signOut} className="btn-primary">Sign out</button>
          </div>
        </div>
      </div>
    ) : (
      <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading Circle">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
      </div>
    );
  }
  const dmUnread = unreadConversationCount(state, me.id);
  const notifUnread = unreadCount(state, me.id);
  const cabinUnread = totalCabinUnread(state, me.id); // CHT-07 nav badge

  function signOut() {
    actions.signOut();
    navigate('/');
  }

  // NAV-01 order (Home…Settings) plus Circle's own destinations that must
  // stay reachable (Explore/Saved, and Moderation for admins). Themes joins
  // before Settings when its page ships (UI TRD Phase 6).
  const sideNav = [
    { to: '/home', icon: Home, label: 'Home' },
    { to: `/u/${me.username}`, icon: UserIcon, label: 'Profile', end: true },
    { to: '/notifications', icon: Bell, label: 'Activity', badge: notifUnread },
    { to: '/cabins', icon: Tent, label: 'Cabins', badge: cabinUnread },
    { to: '/messages', icon: MessageCircle, label: 'Messages', badge: dmUnread },
    { to: '/explore', icon: Compass, label: 'Explore' },
    { to: '/saved', icon: Bookmark, label: 'Saved' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ] satisfies ReadonlyArray<{
    to: string;
    icon: LucideIcon;
    label: string;
    badge?: number;
    end?: boolean;
  }>;

  return (
    <div className="flex h-dvh flex-col overflow-hidden wide:p-[var(--panel-pad)]">
      {/* The single glass "window" over the wallpaper (§5.1): full-bleed with
          no radius below 1200px (mobile/tablet), centred with margins at wide. */}
      <div className="glass relative mx-auto flex min-h-0 w-full max-w-[var(--panel-max)] flex-1 flex-col rounded-none border-0 pt-[env(safe-area-inset-top)] wide:rounded-3xl wide:border">
        {/* ── Top bar (§6.2) ────────────────────────────────────────────── */}
        <header className="glass-bar z-40 flex-none border-b border-border-subtle wide:rounded-t-3xl">
          <div className="relative flex h-[var(--topbar-h)] items-center gap-2 px-3 md:px-4">
            <Brand />

            {/* TOP-01 text tabs sit between brand and search — desktop only
                (§5.1). Below 1200px the row can't fit them without overlapping
                the search pill, so the pill tabs in row 2 carry them instead. */}
            <div className="mx-1 hidden min-w-0 flex-1 wide:block">
              <FeedTabs />
            </div>

            <div className="ml-auto flex items-center gap-1">
              {/* Mobile search: icon that expands over this row (§5.2) */}
              <div className="md:hidden">
                <SearchBox variant="icon" />
              </div>

              {/* TOP-02 desktop search pill */}
              <div className="hidden w-full max-w-[15rem] md:block lg:max-w-[16.5rem]">
                <SearchBox variant="pill" />
              </div>

              {/* TOP-03 feed filters — desktop keeps it in the top bar;
                  mobile/tablet render it beside the pill tabs in row 2. */}
              <FeedFilter className="hidden wide:block" />

              {/* LAY-04: right panel as a drawer below the wide breakpoint */}
              <button
                type="button"
                onClick={() => setDrawer(true)}
                aria-haspopup="dialog"
                aria-expanded={drawer}
                aria-label="Open discover panel"
                className="tap44 rounded-full p-2 text-txt-muted transition hover:bg-hover-wash hover:text-txt-main wide:hidden"
              >
                <Users size={20} aria-hidden />
              </button>

              {/* Messages has no slot in the TRD's 5-item tab bar (NAV-06),
                  so the mobile header keeps this shortcut below 768px; the
                  icon rail covers every width from 768px up. */}
              <NavLink
                to="/messages"
                aria-label={`Messages${dmUnread ? `, ${dmUnread} unread` : ''}`}
                className={({ isActive }) =>
                  `tap44 relative rounded-full p-2 transition hover:bg-hover-wash md:hidden ${
                    isActive ? 'text-brand-600' : 'text-txt-muted'
                  }`
                }
              >
                <MessageCircle size={20} aria-hidden />
                {dmUnread > 0 && (
                  <span className="badge absolute -right-0.5 -top-0.5 shadow">
                    {dmUnread > 99 ? '99+' : dmUnread}
                  </span>
                )}
              </NavLink>

              <NotificationBell />

              <details
                ref={accountRef}
                className="relative"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') accountRef.current?.removeAttribute('open');
                }}
              >
                <summary
                  aria-label="Account menu"
                  className="tap44 flex cursor-pointer list-none items-center rounded-full p-1 hover:bg-hover-wash [&::-webkit-details-marker]:hidden"
                >
                  <Avatar src={me.avatarUrl} name={me.displayName} size={32} />
                </summary>
                <div
                  onClick={(e) => e.currentTarget.parentElement?.removeAttribute('open')}
                  className="glass absolute right-0 mt-2 w-56 overflow-hidden rounded-xl py-1"
                >
                  <div className="border-b border-border-subtle px-4 py-3">
                    <p className="truncate text-sm font-semibold">{me.displayName}</p>
                    <p className="truncate text-xs text-txt-subtle">@{me.username}</p>
                  </div>
                  <MenuLink to={`/u/${me.username}`} icon={<UserIcon size={15} />} label="View profile" />
                  <MenuLink to="/saved" icon={<Bookmark size={15} />} label="Saved posts" />
                  <MenuLink to="/messages" icon={<MessageCircle size={15} />} label="Messages" />
                  <MenuLink to="/cabins" icon={<Tent size={15} />} label="Cabins" />
                  <MenuLink to="/settings" icon={<Settings size={15} />} label="Settings" />
                  {me.role === 'admin' && (
                    <MenuLink to="/admin/reports" icon={<Shield size={15} />} label="Moderation queue" />
                  )}
                  <button
                    onClick={signOut}
                    className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-sm text-txt-muted hover:bg-hover-wash"
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              </details>
            </div>
          </div>

          {/* Row 2 below 1200px (§5.2): horizontally scrollable feed pills +
              filter — the only home for both between 768–1199px, where row 1
              has no room left for them (TOP-04 no overlap). */}
          <div className="flex items-center gap-2 px-3 pb-2 wide:hidden">
            <FeedTabs variant="pills" className="flex-1" />
            <FeedFilter className="shrink-0" />
          </div>

          {!online && (
            <p role="status" className="bg-amber-50/90 px-4 py-1.5 text-center text-xs font-medium text-amber-700 backdrop-blur">
              You’re offline — some actions may fail until you reconnect.
            </p>
          )}
          {me.isSuspended && (
            <p role="status" className="bg-red-500/10 px-4 py-1.5 text-center text-xs font-medium text-red-700 backdrop-blur">
              Your account is suspended — you can browse, but posting and interactions are disabled.
            </p>
          )}
        </header>

        {/* ── 3-column body (§5.1): rail/sidebar · scrolling centre · panel ─ */}
        <div className="shell-body flex-1">
          <aside className="hidden min-h-0 overflow-y-auto border-r border-border-subtle py-4 md:block">
            <nav aria-label="Main" className="flex h-full min-h-0 flex-col gap-1 px-2 wide:px-3">
              {sideNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
              {me.role === 'admin' && (
                <NavItem to="/admin/reports" icon={Shield} label="Moderation" />
              )}
              <div className="mx-1 my-2 h-px bg-border-subtle" aria-hidden />
              <button
                type="button"
                onClick={signOut}
                aria-label="Logout"
                className="rail-link flex min-h-11 w-full items-center justify-center gap-3 rounded-full px-3 text-sm font-medium text-txt-muted transition hover:bg-hover-wash hover:text-txt-main wide:justify-start wide:px-4"
              >
                <LogOut size={20} aria-hidden />
                <span className="hidden wide:inline">Logout</span>
                <span aria-hidden className="rail-tip glass rounded-xl px-2.5 py-1.5 text-xs font-medium text-txt-main">
                  Logout
                </span>
              </button>
            </nav>
          </aside>

          <main
            key={location.pathname}
            id="main-scroll"
            className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 py-5 wide:px-6 wide:py-6"
          >
            <Outlet />
            {/* Footer scrolls with the centre column — anchored, no floating (BLK-02). */}
            <footer className="mt-8 border-t border-border-subtle pt-5 pb-2 text-center text-xs text-txt-subtle">
              <span aria-hidden>© 2026 Circle</span>
              {' · '}
              <NavLink to="/terms" className="hover:underline">
                Terms
              </NavLink>
              {' · '}
              <NavLink to="/privacy" className="hover:underline">
                Privacy
              </NavLink>
            </footer>
          </main>

          <aside
            className="hidden min-h-0 overflow-y-auto border-l border-border-subtle wide:block wide:px-5 wide:py-6"
            aria-label="Discover"
          >
            <SidePanel />
          </aside>
        </div>
      </div>

      {/* ── Mobile bottom tab bar (NAV-06): 56px + safe-area, ≥44px targets ─ */}
      <nav
        aria-label="Primary"
        className="glass-bar z-40 flex min-h-[calc(var(--tabbar-h)_+_env(safe-area-inset-bottom))] shrink-0 border-t border-border-subtle pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <TabLink to="/home" icon={Home} label="Home" />
        <TabLink to="/cabins" icon={Tent} label="Cabins" badge={cabinUnread} />
        <button
          type="button"
          onClick={() => navigate('/home?compose=1')}
          aria-label="Create a post"
          className="tap44 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 text-txt-muted transition hover:text-txt-main"
        >
          <span className="grid h-6 w-10 place-items-center rounded-full grad-accent text-white shadow-md">
            <Plus size={19} aria-hidden />
          </span>
          <span className="truncate text-[11px] font-medium leading-none">Create</span>
        </button>
        <TabLink to="/notifications" icon={Bell} label="Activity" badge={notifUnread} />
        <NavLink
          to={`/u/${me.username}`}
          className={({ isActive }) =>
            `tap44 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-1.5 transition ${
              isActive ? 'font-semibold text-txt-main' : 'font-medium text-txt-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Avatar
                src={me.avatarUrl}
                name={me.displayName}
                size={22}
                className={`ring-2 ${isActive ? 'ring-accent-primary' : 'ring-transparent'}`}
              />
              <span className="truncate text-[11px] leading-none">Profile</span>
            </>
          )}
        </NavLink>
      </nav>

      <RightDrawer open={drawer} onClose={() => setDrawer(false)} />
      <Toaster />
      <ConfirmHost />
    </div>
  );
}

function MenuLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm text-txt-muted hover:bg-hover-wash"
    >
      {icon} {label}
    </NavLink>
  );
}
