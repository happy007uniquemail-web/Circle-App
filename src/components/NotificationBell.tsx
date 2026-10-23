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
      className="btn-icon relative"
    >
      <Bell size={20} />
      {unread > 0 && (
        <span className="badge badge-danger absolute -right-0.5 -top-0.5 shadow">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
