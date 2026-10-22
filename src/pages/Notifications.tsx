import { useEffect, useMemo, useState } from 'react';
import { AtSign, Bell, Check, HandHeart, Heart, MessageCircle, Repeat2, UserPlus, UserCheck, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatedList } from '../components/AnimatedList';
import Avatar from '../components/Avatar';
import { ListSkeleton } from '../components/Skeleton';
import { toast } from '../components/Toast';
import { timeAgo } from '../lib/format';
import { profileById, selectNotifications, useActions, useAppState, useDataReady } from '../lib/store';
import type { AppNotification } from '../types';

const ICONS: Record<string, { Icon: typeof Heart; cls: string }> = {
  follow: { Icon: UserPlus, cls: 'bg-brand-50 text-brand-600' },
  like: { Icon: Heart, cls: 'bg-rose-50 text-rose-600' },
  comment: { Icon: MessageCircle, cls: 'bg-emerald-50 text-emerald-600' },
  repost: { Icon: Repeat2, cls: 'bg-teal-50 text-teal-600' },
  mention: { Icon: AtSign, cls: 'bg-sky-50 text-sky-600' },
  follow_request: { Icon: UserCheck, cls: 'bg-amber-50 text-amber-600' },
  follow_request_approved: { Icon: UserCheck, cls: 'bg-emerald-50 text-emerald-600' },
  cabin_join_request: { Icon: HandHeart, cls: 'bg-orange-50 text-orange-600' },
  cabin_request_approved: { Icon: HandHeart, cls: 'bg-emerald-50 text-emerald-600' },
  cabin_invite: { Icon: HandHeart, cls: 'bg-purple-50 text-purple-600' },
};

function describe(type: string): string {
  switch (type) {
    case 'follow':
      return 'followed you';
    case 'like':
      return 'liked your post';
    case 'repost':
      return 'reposted your post';
    case 'comment':
      return 'commented on your post';
    case 'mention':
      return 'mentioned you';
    case 'follow_request':
      return 'wants to follow you';
    case 'follow_request_approved':
      return 'approved your follow request';
    case 'cabin_join_request':
      return 'requested to join your cabin';
    case 'cabin_request_approved':
      return 'approved your cabin request';
    case 'cabin_invite':
      return 'invited you to a cabin';
    default:
      return 'interacted with you';
  }
}

/** Where a tap should land, using the trigger-supplied entity context. */
function targetFor(n: AppNotification, actorUsername: string): string {
  const postId = n.data?.post_id ?? (n.entityType === 'post' ? n.entityId : null);
  if (['like', 'comment', 'repost', 'mention'].includes(n.type) && postId) return `/p/${postId}`;
  if (n.type.startsWith('cabin') && n.entityId) return `/cabins/${n.entityId}`;
  return `/u/${actorUsername}`;
}

const PAGE = 20;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** `/notifications` — grouped, paginated, entity-linked list (NOT-01…NOT-08). */
export default function Notifications() {
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const me = state.session?.id;
  const ready = useDataReady();
  const [limit, setLimit] = useState(PAGE);

  // Visiting the page marks everything read (badge clears) — a manual
  // "Mark all as read" button is provided too.
  useEffect(() => {
    if (!me) return;
    const t = window.setTimeout(() => void actions.markNotificationsRead(), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const items = useMemo(() => (me ? selectNotifications(state, me) : []), [state, me]);
  const { today, earlier } = useMemo(() => {
    const t: AppNotification[] = [];
    const e: AppNotification[] = [];
    for (const n of items) (isToday(n.createdAt) ? t : e).push(n);
    return { today: t, earlier: e };
  }, [items]);

  if (!me) return null;

  const visible = items.slice(0, limit);
  const hasMore = items.length > limit;

  // PRV-03: approve/decline a follow request straight from the notification.
  async function decide(followerId: string, accept: boolean) {
    const r = accept ? await actions.approveFollow(followerId) : await actions.declineFollow(followerId);
    if (!r.ok) return toast(r.error ?? 'Could not update request.', 'error');
    toast(accept ? 'Follow request approved.' : 'Follow request declined.', 'success');
  }

  function renderRow(n: AppNotification) {
    const actor = profileById(state, n.actorId);
    const { Icon, cls } = ICONS[n.type] ?? ICONS.follow!;
    if (!actor) return null;

    // PRV-03: follow requests are actionable inline — approve or decline
    // without leaving the page (the profile page has the same controls).
    if (n.type === 'follow_request') {
      return (
        <div
          key={n.id}
          role="listitem"
          className={`card flex w-full items-center gap-3 p-4 ${n.isRead ? '' : 'border-brand-100 bg-brand-50/40'}`}
        >
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>
            <Icon size={16} aria-hidden />
          </span>
          <Avatar src={actor.avatarUrl} name={actor.displayName} size={32} />
          <button
            onClick={() => navigate(targetFor(n, actor.username ?? ''))}
            className="min-w-0 flex-1 text-left text-sm hover:opacity-80"
          >
            <b className="font-semibold">{actor.displayName}</b>{' '}
            <span className="text-slate-600">{describe(n.type)}</span>
            <span className="ml-1.5 text-xs text-slate-400">{timeAgo(n.createdAt)} ago</span>
          </button>
          <span className="flex shrink-0 gap-1">
            <button
              onClick={() => void decide(n.actorId, true)}
              aria-label={`Approve follow request from @${actor.username}`}
              className="tap44 rounded-full bg-brand-600 p-2 text-white hover:bg-brand-700"
            >
              <Check size={15} aria-hidden />
            </button>
            <button
              onClick={() => void decide(n.actorId, false)}
              aria-label={`Decline follow request from @${actor.username}`}
              className="tap44 rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            >
              <X size={15} aria-hidden />
            </button>
          </span>
        </div>
      );
    }

    return (
      <div key={n.id} role="listitem" className="w-full">
        <button
          onClick={() => navigate(targetFor(n, actor.username ?? ''))}
          className={`card flex w-full items-center gap-3 p-4 text-left transition hover:shadow ${n.isRead ? '' : 'border-brand-100 bg-brand-50/40'}`}
        >
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>
            <Icon size={16} aria-hidden />
          </span>
          <Avatar src={actor.avatarUrl} name={actor.displayName} size={32} />
          <span className="min-w-0 flex-1 text-sm">
            <b className="font-semibold">{actor.displayName}</b>{' '}
            <span className="text-slate-600">{describe(n.type)}</span>
            <span className="ml-1.5 text-xs text-slate-400">{timeAgo(n.createdAt)} ago</span>
          </span>
          {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="unread" />}
        </button>
      </div>
    );
  }

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
            <Bell size={22} aria-hidden />
          </div>
          <h2 className="mt-3 font-semibold">Nothing yet</h2>
          <p className="mt-1 text-sm text-slate-600">When someone follows you, likes, or comments on your post, it shows up here.</p>
          <Link to="/explore" className="btn-primary mt-4 inline-flex">Find people</Link>
        </div>
      ) : (
        <div className="space-y-5">
          {today.length > 0 && (
            <section aria-label="Today">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Today</h2>
              {/* AnimatedList prepends, so feed oldest-first for newest-on-top. */}
              <AnimatedList className="w-full gap-2" role="list" delay={120}>
                {today.slice(0, limit).reverse().map(renderRow)}
              </AnimatedList>
            </section>
          )}
          {earlier.length > 0 && (
            <section aria-label="Earlier">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Earlier</h2>
              <AnimatedList className="w-full gap-2" role="list" delay={120}>
                {earlier.slice(0, Math.max(0, limit - today.length)).reverse().map(renderRow)}
              </AnimatedList>
            </section>
          )}
          {hasMore && (
            <button onClick={() => setLimit((l) => l + PAGE)} className="btn-ghost w-full py-2.5 text-xs">
              Load more ({items.length - visible.length} older)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
