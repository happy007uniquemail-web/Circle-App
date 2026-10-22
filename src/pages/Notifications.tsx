import { useEffect } from 'react';
import { AtSign, Heart, MessageCircle, Repeat2, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatedList } from '../components/AnimatedList';
import Avatar from '../components/Avatar';
import { ListSkeleton } from '../components/Skeleton';
import { timeAgo } from '../lib/format';
import { profileById, selectNotifications, useActions, useAppState, useDataReady } from '../lib/store';

const ICONS = {
  follow: { Icon: UserPlus, cls: 'bg-brand-50 text-brand-600' },
  like: { Icon: Heart, cls: 'bg-rose-50 text-rose-600' },
  comment: { Icon: MessageCircle, cls: 'bg-emerald-50 text-emerald-600' },
  repost: { Icon: Repeat2, cls: 'bg-teal-50 text-teal-600' },
} as const;

function describe(type: string): string {
  if (type === 'follow') return 'followed you';
  if (type === 'like') return 'liked your post';
  if (type === 'repost') return 'reposted your post';
  return 'commented on your post';
}

/** `/notifications` — in-app notifications + mark-as-read (NOT-1, NOT-2). */
export default function Notifications() {
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const me = state.session?.id;
  const ready = useDataReady();

  // Visiting the page marks everything read (badge clears) — a manual
  // "Mark all as read" button is provided too.
  useEffect(() => {
    if (!me) return;
    const t = window.setTimeout(() => void actions.markNotificationsRead(), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  if (!me) return null;
  const items = selectNotifications(state, me);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Notifications</h1>
        <button onClick={() => void actions.markNotificationsRead()} className="btn-ghost text-xs">
          Mark all as read
        </button>
      </div>

      {!ready ? (
        <ListSkeleton n={4} />
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600">
            <AtSign size={22} />
          </div>
          <h2 className="mt-3 font-semibold">Nothing yet</h2>
          <p className="mt-1 text-sm text-slate-600">When someone follows you, likes, or comments on your post, it shows up here.</p>
          <Link to="/explore" className="btn-primary mt-4 inline-flex">Find people</Link>
        </div>
      ) : (
        // Motion-Primitives AnimatedList prepends items (renders newest on
        // top), so feed it oldest-first to keep the newest-first final order.
        <AnimatedList className="w-full gap-2" role="list" delay={120}>
          {[...items].reverse().map((n) => {
            const actor = profileById(state, n.actorId);
            const { Icon, cls } = ICONS[n.type];
            if (!actor) return null;
            return (
              <div key={n.id} role="listitem" className="w-full">
                <button
                  onClick={() => navigate(n.postId ? `/p/${n.postId}` : `/u/${actor.username}`)}
                  className={`card flex w-full items-center gap-3 p-4 text-left transition hover:shadow ${n.readAt ? '' : 'border-brand-100 bg-brand-50/40'}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>
                    <Icon size={16} />
                  </span>
                  <Avatar src={actor.avatarUrl} name={actor.displayName} size={32} />
                  <span className="min-w-0 flex-1 text-sm">
                    <b className="font-semibold">{actor.displayName}</b>{' '}
                    <span className="text-slate-600">{describe(n.type)}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{timeAgo(n.createdAt)} ago</span>
                  </span>
                  {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="unread" />}
                </button>
              </div>
            );
          })}
        </AnimatedList>
      )}
    </div>
  );
}
