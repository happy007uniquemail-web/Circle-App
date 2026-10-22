import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Bookmark,
  Compass,
  Home,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import { ConfirmHost } from './ConfirmDialog';
import NotificationBell from './NotificationBell';
import SidePanel from './SidePanel';
import { Toaster, toast } from './Toast';
import { useOnlineStatus } from '../lib/hooks';
import { currentUserProfile, unreadConversationCount, unreadCount, useActions, useAppState } from '../lib/store';

function Brand() {
  return (
    <NavLink to="/home" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-black/40">C</span>
      Circle
    </NavLink>
  );
}

/** Authenticated app shell: sticky glass header, optional desktop sidebars,
 *  growing main column, anchored footer, mobile tab bar (BLK-02/05). */
export default function Layout() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const actions = useActions();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const [q, setQ] = useState('');
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

  if (!state.session || !me) return null;
  const dmUnread = unreadConversationCount(state, me.id);
  const notifUnread = unreadCount(state, me.id);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    navigate(`/explore${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  }

  function signOut() {
    actions.signOut();
    navigate('/');
  }

  const tabs = [
    { to: '/home', icon: Home, label: 'Home' },
    { to: '/explore', icon: Compass, label: 'Explore' },
    { to: '/messages', icon: MessageCircle, label: 'Chats', badge: dmUnread },
    { to: '/notifications', icon: Shield, label: 'Alerts', badge: notifUnread },
  ];

  const sideNav = [
    { to: '/home', icon: Home, label: 'Home' },
    { to: '/explore', icon: Compass, label: 'Explore' },
    { to: '/messages', icon: MessageCircle, label: 'Messages', badge: dmUnread },
    { to: '/notifications', icon: Shield, label: 'Notifications', badge: notifUnread },
    { to: '/saved', icon: Bookmark, label: 'Saved' },
    { to: `/u/${me.username}`, icon: UserIcon, label: 'Profile' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    ...(me.role === 'admin' ? [{ to: '/admin/reports', icon: Shield, label: 'Moderation' }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-glass shadow-lg shadow-black/50 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-center gap-3 px-4">
          <Brand />
          <form onSubmit={onSearch} className="relative hidden max-w-xs flex-1 md:block" role="search">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              aria-label="Search users by username or display name"
              className="input input-icon py-2"
            />
          </form>
          <div className="ml-auto flex items-center gap-1">
            {/* Duplicated by the desktop sidebar — hidden on lg+ (BLK-05) */}
            <NavLink
              to="/messages"
              aria-label={`Messages${dmUnread ? `, ${dmUnread} unread` : ''}`}
              className={({ isActive }) =>
                `tap44 relative rounded-full p-2 transition hover:bg-white/[0.06] lg:hidden ${isActive ? 'text-brand-600' : 'text-slate-600'}`
              }
            >
              <MessageCircle size={20} />
              {dmUnread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-800 px-1 text-[10px] font-bold text-white shadow">
                  {dmUnread}
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
                className="tap44 flex cursor-pointer list-none items-center rounded-full p-1 hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden"
              >
                <Avatar src={me.avatarUrl} name={me.displayName} size={32} />
              </summary>
              <div
                onClick={(e) => e.currentTarget.parentElement?.removeAttribute('open')}
                className="glass absolute right-0 mt-2 w-56 overflow-hidden rounded-xl py-1"
              >
                <div className="border-b border-white/10 px-4 py-3">
                  <p className="truncate text-sm font-semibold">{me.displayName}</p>
                  <p className="truncate text-xs text-slate-500">@{me.username}</p>
                </div>
                <MenuLink to={`/u/${me.username}`} icon={<UserIcon size={15} />} label="View profile" />
                <MenuLink to="/saved" icon={<Bookmark size={15} />} label="Saved posts" />
                <MenuLink to="/messages" icon={<MessageCircle size={15} />} label="Messages" />
                <MenuLink to="/settings" icon={<Settings size={15} />} label="Settings" />
                {me.role === 'admin' && <MenuLink to="/admin/reports" icon={<Shield size={15} />} label="Moderation queue" />}
                <button
                  onClick={signOut}
                  className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-white/[0.06]"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </details>
          </div>
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

      {/* Wide screens: nav rail + content + secondary rail instead of empty
          margins (BLK-05). Main grows so short pages don't float (BLK-02). */}
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-start gap-6 px-4">
        <aside className="sticky top-20 hidden w-52 shrink-0 py-6 lg:block" aria-label="Primary">
          <nav className="space-y-1">
            {sideNav.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition hover:bg-white/[0.05] ${
                    isActive ? 'bg-white/[0.05] text-brand-600' : 'text-slate-600'
                  }`
                }
              >
                <span className="relative">
                  <Icon size={20} />
                  {typeof badge === 'number' && badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-800 px-1 text-[10px] font-bold text-white">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </span>
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 py-6">
          <Outlet />
        </main>

        <aside className="sticky top-20 hidden w-72 shrink-0 py-6 xl:block" aria-label="Discover">
          <SidePanel />
        </aside>
      </div>

      {/* Footer stays anchored at the bottom on every width (BLK-02). */}
      <footer className="border-t border-white/[0.06] py-5 text-center text-xs text-slate-500">
        <span aria-hidden>© 2026 Circle</span>
        {' · '}
        <NavLink to="/terms" className="hover:underline">Terms</NavLink>
        {' · '}
        <NavLink to="/privacy" className="hover:underline">Privacy</NavLink>
      </footer>

      <Toaster />
      <ConfirmHost />

      {/* Mobile tab bar (responsive 360px → desktop, §8) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-glass shadow-lg shadow-black/50 backdrop-blur-2xl md:hidden" aria-label="Primary">
        {tabs.map(({ to, icon: Icon, label, badge }) => {
          const count = to === '/messages' ? dmUnread : to === '/notifications' ? notifUnread : 0;
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`
              }
            >
              <span className="relative">
                <Icon size={20} />
                {!!badge && count > 0 && (
                  <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-800 px-1 text-[10px] font-bold text-white">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </span>
              {label}
            </NavLink>
          );
        })}
        <NavLink
          to={`/u/${me.username}`}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-brand-600' : 'text-slate-500'}`
          }
        >
          <Avatar src={me.avatarUrl} name={me.displayName} size={20} />
          You
        </NavLink>
      </nav>
    </div>
  );
}

function MenuLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} className="flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-white/[0.06]">
      {icon} {label}
    </NavLink>
  );
}
