import { MessageCircle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { timeAgo } from '../lib/format';
import { conversationsFor, useAppState } from '../lib/store';
import Avatar from '../components/Avatar';

function preview(text: string): string {
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

/** `/messages` — conversation list with unread badges (F-DM). */
export default function Messages() {
  const state = useAppState();
  const me = state.session?.id;
  if (!me) return null;
  const rows = conversationsFor(state, me);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Messages</h1>
        <Link to="/explore" className="btn-ghost text-xs">
          <Users size={14} /> Find people
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
            <MessageCircle size={22} />
          </div>
          <h2 className="mt-3 font-semibold">No conversations yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            Open someone’s profile and tap <b>Message</b>, or share a post into a chat.
          </p>
          <Link to="/explore" className="btn-primary mt-4 inline-flex">Find people</Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ conversation, other, lastMessage, unread }) => (
            <li key={conversation.id}>
              <Link
                to={`/messages/${conversation.id}`}
                className={`card flex items-center gap-3 p-4 transition hover:shadow ${unread ? 'border-brand-200 bg-brand-50/40' : ''}`}
              >
                <Avatar src={other.avatarUrl} name={other.displayName} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="truncate text-sm">{other.displayName}</b>
                    {lastMessage && <span className="shrink-0 text-xs text-slate-400">{timeAgo(lastMessage.createdAt)}</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                    {lastMessage?.postId && <span className="font-medium text-brand-600">📎 shared a post</span>}
                    {lastMessage?.mediaKind === 'image' && <span className="font-medium text-brand-600">📷 photo</span>}
                    {lastMessage?.mediaKind === 'video' && <span className="font-medium text-brand-600">🎬 video</span>}
                    <span className="truncate">{lastMessage?.body ? preview(lastMessage.body) : 'Say hi 👋'}</span>
                  </span>
                </span>
                {unread > 0 && (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand-800 px-1.5 text-[11px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
