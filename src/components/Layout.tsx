import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bookmark, Home, LogOut, MessageCircle, Search, Settings, Shield, User as UserIcon } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import NotificationBell from './NotificationBell';
import { Toaster, toast } from './Toast';
import { currentUserProfile, unreadConversationCount, unreadCount, useActions, useAppState } from '../lib/store';

function Brand() {
  return (
    <NavLink to="/home" className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-black/40">C</span>
      Circle
    </NavLink>
  );
}

/** Authenticated app shell: sticky glass header, search, bell, account menu, mobile tab bar. */
export default function Layout() {
  const state = useAppState();
  const me = currentUserProfile(state);
  const actions = useActions();
  const navigate = useNavigate();
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
    { to: '/explore', icon: Search, label: 'Explore' },
    { to: '/messages', icon: MessageCircle, label: 'Chats', badge: dmUnread },
    { to: '/notifications', icon: Shield, label: 'Alerts', badge: true },
  ];

  return (
    <div className="min-h-dvh pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-glass shadow-lg shadow-black/50 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Brand />
          <form onSubmit={onSearch} className="relative ml-auto hidden flex-1 max-w-xs md:block" role="search">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              aria-label="Search users by username or display name"
              className="input input-icon py-2"
            />
          </form>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <NavLink
              to="/messages"
              aria-label={`Messages${dmUnread ? `, ${dmUnread} unread` : ''}`}
              className={({ isActive }) =>
                `relative rounded-full p-2 transition hover:bg-white/[0.06] ${isActive ? 'text-brand-600' : 'text-slate-600'}`
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
            <details ref={accountRef} className="relative">
              <summary className="flex cursor-pointer list-none items-center rounded-full p-1 hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden">
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
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-white/[0.06]"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </details>
          </div>
        </div>
        {me.isSuspended && (
          <p role="status" className="bg-red-500/10 px-4 py-1.5 text-center text-xs font-medium text-red-700 backdrop-blur">
            Your account is suspended — you can browse, but posting and interactions are disabled.
          </p>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
      <Toaster />

      {/* Mobile tab bar (responsive 360px → desktop, §8) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-glass shadow-lg shadow-black/50 backdrop-blur-2xl md:hidden" aria-label="Primary">
        {tabs.map(({ to, icon: Icon, label, badge }) => {
          const count = to === '/messages' ? dmUnread : to === '/notifications' ? unreadCount(state, me.id) : 0;
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
                    {count}
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
    <NavLink to={to} className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-white/[0.06]">
      {icon} {label}
    </NavLink>
  );
}
