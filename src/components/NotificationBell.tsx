import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { unreadCount, useAppState } from '../lib/store';

/** Unread badge + link to the notifications page (NOT-2). */
export default function NotificationBell() {
  const state = useAppState();
  if (!state.session) return null;
  const unread = unreadCount(state, state.session.id);
  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      className="relative rounded-full p-2 text-slate-600 transition hover:bg-white/[0.06]"
    >
      <Bell size={20} />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
