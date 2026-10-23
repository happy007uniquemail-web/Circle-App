import { useState } from 'react';
import { CheckCircle2, EyeOff, ShieldCheck, Trash2, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from '../components/Toast';
import { timeAgo } from '../lib/format';
import { profileById, useActions, useAppState } from '../lib/store';
import type { Report } from '../types';

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  hate: 'Hate speech',
  nsfw: 'NSFW',
  other: 'Other',
};

/** `/admin/reports` — moderation queue with dismiss / remove / suspend (MOD-2). */
export default function AdminReports() {
  const state = useAppState();
  const actions = useActions();
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const reports = state.reports.filter((r) => filter === 'all' || r.status === 'open');
  const openCount = state.reports.filter((r) => r.status === 'open').length;

  async function resolve(id: string, status: 'dismissed' | 'actioned') {
    const r = await actions.resolveReport(id, status);
    toast(r.ok ? `Report ${status}.` : r.error ?? 'Action failed.', r.ok ? 'success' : 'error');
  }

  async function removeContent(report: Report) {
    const r =
      report.targetType === 'post' ? await actions.deletePost(report.targetId)
      : report.targetType === 'comment' ? await actions.deleteComment(report.targetId)
      : report.targetType === 'cabin_message' ? await actions.deleteCabinMessage(report.targetId) // CHT-12
      : null;
    if (!r) return;
    if (!r.ok) return toast(r.error ?? 'Could not remove content.', 'error');
    const resolved = await actions.resolveReport(report.id, 'actioned');
    toast(
      resolved.ok ? 'Content removed.' : resolved.error ?? 'Content removed, but the report could not be resolved.',
      resolved.ok ? 'success' : 'error',
    );
  }

  async function toggleSuspend(report: Report) {
    // Suspend the reported user, or the author of a reported post/comment.
    let targetId = report.targetId;
    if (report.targetType === 'post') targetId = state.posts.find((p) => p.id === report.targetId)?.authorId ?? '';
    if (report.targetType === 'comment') targetId = state.comments.find((c) => c.id === report.targetId)?.authorId ?? '';
  // CHT-12: suspend the message author or the cabin owner.
  if (report.targetType === 'cabin_message') targetId = (state.cabinMessages ?? []).find((m) => m.id === report.targetId)?.senderId ?? '';
  if (report.targetType === 'cabin') targetId = (state.cabins ?? []).find((c) => c.id === report.targetId)?.ownerId ?? '';
    const target = profileById(state, targetId);
    if (!target) return;
    const r = await actions.setSuspended(target.id, !target.isSuspended);
    toast(r.ok ? `${target.isSuspended ? 'Restored' : 'Suspended'} @${target.username}.` : r.error ?? 'Action failed.', r.ok ? 'success' : 'error');
  }

  function preview(report: Report) {
    if (report.targetType === 'post') {
      const post = state.posts.find((p) => p.id === report.targetId);
      if (!post) return <span className="text-sm italic text-slate-400">Post already removed</span>;
      const author = profileById(state, post.authorId);
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm backdrop-blur-md">
          <Link to={`/p/${post.id}`} className="line-clamp-2 font-medium text-slate-700 hover:underline">{post.body}</Link>
          <span className="text-xs text-slate-500">by {author ? `@${author.username}` : 'unknown'}</span>
        </div>
      );
    }
    if (report.targetType === 'comment') {
      const comment = state.comments.find((c) => c.id === report.targetId);
      if (!comment) return <span className="text-sm italic text-slate-400">Comment already removed</span>;
      const author = profileById(state, comment.authorId);
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm backdrop-blur-md">
          <Link to={`/p/${comment.postId}`} className="line-clamp-2 font-medium text-slate-700 hover:underline">“{comment.body}”</Link>
          <span className="text-xs text-slate-500">by {author ? `@${author.username}` : 'unknown'}</span>
        </div>
      );
    }
    // CHT-12: cabin message / cabin previews.
    if (report.targetType === 'cabin_message') {
      const msg = (state.cabinMessages ?? []).find((m) => m.id === report.targetId);
      if (!msg || msg.isDeleted) return <span className="text-sm italic text-slate-400">Message already removed</span>;
      const author = profileById(state, msg.senderId);
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm backdrop-blur-md">
          <Link to={`/cabins/${msg.cabinId}`} className="line-clamp-2 font-medium text-slate-700 hover:underline">
            {msg.body ?? 'Photo'}
          </Link>
          <span className="text-xs text-slate-500">by {author ? `@${author.username}` : 'unknown'} · in a cabin chat</span>
        </div>
      );
    }
    if (report.targetType === 'cabin') {
      const cabin = (state.cabins ?? []).find((c) => c.id === report.targetId);
      if (!cabin) return <span className="text-sm italic text-slate-400">Cabin already deleted</span>;
      const owner = profileById(state, cabin.ownerId);
      return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm backdrop-blur-md">
          <Link to={`/cabins/${cabin.id}`} className="font-medium text-slate-700 hover:underline">
            {cabin.name} <span className="text-slate-500">({cabin.type})</span>
          </Link>
          <div className="mt-0.5 text-xs text-slate-500">
            {cabin.description ?? 'No description'} · owner {owner ? `@${owner.username}` : 'unknown'}
          </div>
        </div>
      );
    }
    const user = profileById(state, report.targetId);
    if (!user) return <span className="text-sm italic text-slate-400">Account already deleted</span>;
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm backdrop-blur-md">
        <Link to={`/u/${user.username}`} className="font-medium text-slate-700 hover:underline">
          {user.displayName} <span className="text-slate-500">@{user.username}</span>
        </Link>
        <div className="mt-0.5 text-xs text-slate-500">
          {user.isSuspended ? <span className="font-semibold text-red-600">suspended</span> : 'active'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck size={20} className="text-brand-600" /> Moderation queue
        </h1>
        <div className="flex items-center gap-2 text-sm">
          {openCount > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{openCount} open</span>
          )}
          <div
            className="flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 backdrop-blur-md"
            role="tablist"
            aria-label="Report filter"
            onKeyDown={(e) => {
              // Roving tabs (UI-08): ← → toggles between the two filters.
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              setFilter((f) => (f === 'open' ? 'all' : 'open'));
            }}
          >
            {(['open', 'all'] as const).map((f) => (
              <button
                key={f}
                id={`reports-tab-${f}`}
                role="tab"
                aria-selected={filter === f}
                aria-controls="reports-panel"
                tabIndex={filter === f ? 0 : -1}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${filter === f ? 'bg-brand-800 text-white' : 'text-slate-500'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div id="reports-panel" role="tabpanel" aria-labelledby={`reports-tab-${filter}`} tabIndex={0} className="focus:outline-none">
        {reports.length === 0 ? (
        <div className="card p-8 text-center">
          <CheckCircle2 size={28} className="mx-auto text-emerald-500" />
          <h2 className="mt-2 font-semibold">All clear</h2>
          <p className="mt-1 text-sm text-slate-600">No {filter === 'open' ? 'open ' : ''}reports. Target: 90% resolved within 48 hours.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const reporter = profileById(state, r.reporterId);
            return (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {REASON_LABEL[r.reason]}
                  </span>
                  <span className="text-slate-500">reported {r.targetType}</span>
                  <span className="text-slate-400">· {timeAgo(r.createdAt)} ago by {reporter ? `@${reporter.username}` : 'unknown'}</span>
                  {r.status !== 'open' && (
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'dismissed' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                      {r.status}
                    </span>
                  )}
                </div>
                {r.details && <p className="mt-1.5 text-sm text-slate-600">“{r.details}”</p>}
                <div className="mt-2">{preview(r)}</div>

                {r.status === 'open' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => void resolve(r.id, 'dismissed')} className="btn-ghost border border-white/15 bg-white/[0.05] text-xs">
                      <CheckCircle2 size={14} /> Dismiss
                    </button>
                    {r.targetType !== 'user' && r.targetType !== 'cabin' && (
                      <button onClick={() => void removeContent(r)} className="btn-ghost border border-red-200 text-xs text-red-600 hover:bg-red-50">
                        <Trash2 size={14} /> Remove content
                      </button>
                    )}
                    <button onClick={() => void toggleSuspend(r)} className="btn-ghost border border-red-200 text-xs text-red-600 hover:bg-red-50">
                      <UserX size={14} /> Suspend / restore account
                    </button>
                    <button onClick={() => void resolve(r.id, 'actioned')} className="btn-ghost border border-white/15 bg-white/[0.05] text-xs">
                      <EyeOff size={14} /> Mark actioned
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          </ul>
        )}
      </div>
    </div>
  );
}
