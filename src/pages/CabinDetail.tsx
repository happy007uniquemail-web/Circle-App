import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Crown,
  Edit3,
  Flag,
  HandHeart,
  Hourglass,
  ImagePlus,
  Loader2,
  LogOut,
  Send,
  Tent,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LIMITS } from '../types';
import { timeAgo } from '../lib/format';
import { compressImage, formatBytes } from '../lib/compress';
import {
  cabinById,
  cabinInterestTagsOf,
  cabinMembersOf,
  cabinPendingRequests,
  cabinMembershipOf,
  canModerateCabin,
  isCabinOwner,
  myCabinRequest,
  profileById,
  useActions,
  useAppState,
  useDataReady,
} from '../lib/store';
import Avatar from '../components/Avatar';
import { confirmAction } from '../components/ConfirmDialog';
import { ChatSkeleton } from '../components/Skeleton';
import RichText from '../components/RichText';
import ReportModal from '../components/ReportModal';
import { toast } from '../components/Toast';

const PAGE_MESSAGES = 50; // CHT-06: latest 50 on open, then load-older

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * `/cabins/:id` — CAB-04 (detail) + CHT-01..14 (group chat) + CAB-12/13
 * (requests panel, moderation, ownership).
 *
 * Chat parity with DMs (MessageThread) with cabin specifics: members-only
 * content, unread stamping (CHT-07), soft delete (CHT-08), reply-to (CHT-09),
 * rate-limited composer with images only (CHT-03/04/11 — server-enforced),
 * mute (CHT-13) and a 320px/dvh scroll container (CHT-14).
 */
export default function CabinDetail() {
  const { id } = useParams<{ id: string }>();
  const state = useAppState();
  const actions = useActions();
  const navigate = useNavigate();
  const me = state.session?.id;
  const ready = useDataReady();

  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reqMsg, setReqMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_MESSAGES);
  const [reportMsgId, setReportMsgId] = useState<string | null>(null); // CHT-12
  const [reportingCabin, setReportingCabin] = useState(false); // CHT-12

  const listRef = useRef<HTMLUListElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const cabin = id ? cabinById(state, id) : null;
  const my = id && me ? cabinMembershipOf(state, id, me) : null;
  const activeMember = my?.status === 'active';
  const banned = my?.status === 'banned';
  const mod = id ? canModerateCabin(state, id, me ?? null) : false;
  const owner = id ? isCabinOwner(state, id, me ?? null) : false;
  const members = id ? cabinMembersOf(state, id) : [];
  const pending = id && mod ? cabinPendingRequests(state, id) : [];
  const myReq = id && me ? myCabinRequest(state, id, me) : null;
  const tags = id ? cabinInterestTagsOf(state, id) : [];

  const allMessages = useMemo(
    () =>
      (state.cabinMessages ?? [])
        .filter((m) => m.cabinId === id)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)),
    [state.cabinMessages, id],
  );
  const visible = allMessages.slice(Math.max(0, allMessages.length - visibleCount));

  // CHT-07: opening the cabin stamps last_read_at (nav badge clears).
  useEffect(() => {
    if (activeMember && id) void actions.markCabinRead(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeMember]);

  // CHT-06: smart auto-scroll — follow new messages only when near the bottom.
  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  async function attachPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const out = await compressImage(file, { maxEdge: LIMITS.dmImageMaxEdgePx });
      setPhoto(out.dataUrl);
      toast(`Photo ${formatBytes(out.beforeBytes)} → ${formatBytes(out.afterBytes)}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that photo.', 'error');
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!id) return;
    setBusy(true);
    nearBottomRef.current = true; // own message: jump to bottom
    const r = await actions.sendCabinMessage(id, body, photo, replyTo);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not send.', 'error');
    setBody('');
    setPhoto(null);
    setReplyTo(null);
  }

  async function join() {
    if (!id) return;
    setBusy(true);
    const r = await actions.joinCabin(id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not join.', 'error');
    toast('Welcome to the cabin!', 'success');
  }

  async function sendRequest() {
    if (!id) return;
    setBusy(true);
    const r = await actions.requestJoin(id, reqMsg);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? 'Could not send the request.', 'error');
    setReqMsg('');
    toast('Request sent — the owner will review it.', 'success');
  }

  async function cancelRequest() {
    if (!myReq) return;
    if (!(await confirmAction({ title: 'Cancel request?', message: 'You can request again later.', confirmLabel: 'Cancel request' }))) return;
    const r = await actions.cancelCabinRequest(myReq.id);
    if (!r.ok) return toast(r.error ?? 'Could not cancel.', 'error');
    toast('Request cancelled.', 'success');
  }

  async function leave() {
    if (!id) return;
    if (!(await confirmAction({ title: 'Leave this cabin?', message: 'You can rejoin open cabins anytime.', confirmLabel: 'Leave' }))) return;
    const r = await actions.leaveCabin(id);
    if (!r.ok) return toast(r.error ?? 'Could not leave.', 'error');
    toast('You left the cabin.', 'success');
    navigate('/cabins');
  }

  async function delMessage(msgId: string) {
    if (
      !(await confirmAction({
        title: 'Delete message?',
        message: 'It will show as “Message deleted” for everyone.',
        confirmLabel: 'Delete',
      }))
    )
      return;
    const r = await actions.deleteCabinMessage(msgId);
    if (!r.ok) return toast(r.error ?? 'Could not delete.', 'error');
  }

  async function removeMember(userId: string, name: string) {
    if (!id) return;
    if (
      !(await confirmAction({
        title: `Remove ${name}?`,
        message: 'They lose access immediately but can rejoin an open cabin.',
        confirmLabel: 'Remove',
      }))
    )
      return;
    const r = await actions.removeCabinMember(id, userId);
    if (!r.ok) return toast(r.error ?? 'Could not remove.', 'error');
    toast(`${name} removed.`, 'success');
  }

  async function banMember(userId: string, name: string) {
    if (!id) return;
    if (
      !(await confirmAction({
        title: `Ban ${name}?`,
        message: 'Banned members cannot rejoin this cabin.',
        confirmLabel: 'Ban',
      }))
    )
      return;
    const r = await actions.banCabinMember(id, userId);
    if (!r.ok) return toast(r.error ?? 'Could not ban.', 'error');
    toast(`${name} banned.`, 'success');
  }

  async function transfer(userId: string, name: string) {
    if (!id) return;
    if (
      !(await confirmAction({
        title: `Make ${name} the owner?`,
        message: 'You will be demoted to admin. Only the new owner can transfer it back.',
        confirmLabel: 'Transfer ownership',
      }))
    )
      return;
    const r = await actions.transferCabinOwnership(id, userId);
    if (!r.ok) return toast(r.error ?? 'Could not transfer.', 'error');
    toast(`Ownership transferred to ${name}.`, 'success');
  }

  async function deleteCabinFn() {
    if (!id || !cabin) return;
    if (
      !(await confirmAction({
        title: `Delete “${cabin.name}”?`,
        message: 'Members, messages, and files are removed for everyone. This cannot be undone.',
        confirmLabel: 'Delete cabin',
      }))
    )
      return;
    const r = await actions.deleteCabin(id);
    if (!r.ok) return toast(r.error ?? 'Could not delete.', 'error');
    toast('Cabin deleted.', 'success');
    navigate('/cabins');
  }

  if (!me) return null;

  if (!ready && !cabin) {
    return (
      <div className="card p-4">
        <ChatSkeleton />
      </div>
    );
  }

  if (!cabin) {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-lg font-bold">Cabin not found</h1>
        <p className="mt-1 text-sm text-slate-600">It may have been deleted, or you don’t have access.</p>
        <Link to="/cabins" className="btn-primary mt-4 inline-flex">
          Explore cabins
        </Link>
      </div>
    );
  }

  const ownerProfile = profileById(state, cabin.ownerId);
  const leaveBlocked = owner && members.length > 1; // CAB-13: transfer first

  return (
    <div className="space-y-3">
      {/* ---- Header (CAB-04) ---- */}
      <header className="card overflow-hidden">
        {cabin.imageUrl ? (
          <img src={cabin.imageUrl} alt="" className="h-28 w-full object-cover sm:h-36" />
        ) : (
          <div className="grid h-20 w-full place-items-center bg-gradient-to-br from-brand-500/20 to-purple-500/20 sm:h-28" aria-hidden>
            <Tent size={30} className="text-brand-600" />
          </div>
        )}
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3">
            <button onClick={() => navigate('/cabins')} aria-label="Back to cabins" className="tap44 -ml-1 rounded-full p-2 text-slate-500 hover:bg-white/[0.06]">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold">{cabin.name}</h1>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    cabin.type === 'request' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {cabin.type === 'request' ? 'Request to join' : 'Open'}
                </span>
                {my?.muted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    <BellOff size={10} aria-hidden /> Muted
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                <Users size={12} className="mr-1 inline -translate-y-px" aria-hidden />
                {members.length} {members.length === 1 ? 'member' : 'members'}
                {ownerProfile && (
                  <>
                    {' · '}owner{' '}
                    <Link to={`/u/${ownerProfile.username}`} className="font-semibold text-brand-600 hover:underline">
                      {ownerProfile.displayName}
                    </Link>
                  </>
                )}
              </p>
              {cabin.description && <p className="mt-1.5 text-sm text-slate-600">{cabin.description}</p>}
              {tags.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Interest tags">
                  {tags.map((t) => (
                    <li key={t.id} className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                      {t.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center gap-2">
            {activeMember && (
              <>
                <button
                  onClick={() => void actions.muteCabin(cabin.id, !my?.muted)}
                  className="btn-ghost text-xs"
                  title={my?.muted ? 'Unmute cabin notifications' : 'Mute cabin notifications'}
                >
                  {my?.muted ? <Bell size={14} /> : <BellOff size={14} />}
                  {my?.muted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={() => void leave()}
                  className="btn-ghost text-xs"
                  disabled={leaveBlocked}
                  title={leaveBlocked ? 'Transfer ownership before leaving' : undefined}
                >
                  <LogOut size={14} /> Leave
                </button>
              </>
            )}
            {mod && (
              <Link to={`/cabins/${cabin.id}/edit`} className="btn-ghost text-xs">
                <Edit3 size={14} /> Edit
              </Link>
            )}
            {owner && (
              <button onClick={() => void deleteCabinFn()} className="btn-ghost text-xs text-red-600 hover:bg-red-50">
                <Trash2 size={14} /> Delete
              </button>
            )}
            {!owner && (
              <button onClick={() => setReportingCabin(true)} className="btn-ghost text-xs text-red-600 hover:bg-red-50">
                <Flag size={14} /> Report
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---- Banned (CAB-14) ---- */}
      {banned && (
        <div className="card border-red-200 bg-red-50 p-5 text-center">
          <Ban size={22} className="mx-auto text-red-500" aria-hidden />
          <h2 className="mt-2 font-semibold text-red-800">You can’t rejoin this cabin</h2>
          <p className="mt-1 text-sm text-red-700">A cabin admin removed you. Contact them if you think this is a mistake.</p>
        </div>
      )}

      {/* ---- Non-member: join (CAB-10) or request (CAB-11) ---- */}
      {!activeMember && !banned && (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">
            {cabin.type === 'open' ? `Join ${cabin.name}` : 'Request to join'}
          </h2>
          {cabin.type === 'open' ? (
            <>
              <p className="text-sm text-slate-600">
                This cabin is open — anyone can join instantly. You’ll see its messages and be able to post.
              </p>
              <button onClick={() => void join()} disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <HandHeart size={16} aria-hidden />}
                Join cabin
              </button>
            </>
          ) : myReq ? (
            <>
              <p className="flex items-center gap-1.5 text-sm text-slate-600">
                <Hourglass size={14} className="text-amber-500" aria-hidden />
                Your request is pending review.
                {myReq.message && <span className="text-slate-400">— “{myReq.message}”</span>}
              </p>
              <div className="flex gap-2">
                <button onClick={() => void cancelRequest()} className="btn-ghost text-xs text-red-600 hover:bg-red-50">
                  <X size={14} /> Cancel request
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                The owner reviews each request. Add a short note to help them decide.
              </p>
              <textarea
                value={reqMsg}
                onChange={(e) => setReqMsg(e.target.value.slice(0, LIMITS.cabinRequestMsgMax))}
                rows={2}
                placeholder={`Why do you want to join? (≤${LIMITS.cabinRequestMsgMax} characters)`}
                aria-label="Join request message"
                className="input resize-y"
              />
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs tabular-nums ${reqMsg.length > LIMITS.cabinRequestMsgMax ? 'text-red-600' : 'text-slate-400'}`}>
                  {reqMsg.length}/{LIMITS.cabinRequestMsgMax}
                </span>
                <button onClick={() => void sendRequest()} disabled={busy} className="btn-primary disabled:opacity-50">
                  {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
                  Send request
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Requests panel (CAB-12) ---- */}
      {mod && pending.length > 0 && (
        <section className="card p-4" aria-label="Join requests">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Hourglass size={14} className="text-amber-500" aria-hidden />
            Join requests ({pending.length})
          </h2>
          <ul className="space-y-2">
            {pending.map((r) => {
              const who = profileById(state, r.userId);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
                  <Avatar src={who?.avatarUrl ?? ''} name={who?.displayName ?? 'Member'} size={30} />
                  <span className="min-w-0 flex-1">
                    <Link to={`/u/${who?.username ?? ''}`} className="block truncate text-sm font-semibold hover:underline">
                      {who?.displayName ?? 'Unknown member'}
                    </Link>
                    <span className="block truncate text-xs text-slate-500">
                      {r.message ? `“${r.message}”` : 'No message'} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      const res = await actions.approveCabinRequest(r.id);
                      if (!res.ok) return toast(res.error ?? 'Could not approve.', 'error');
                      toast('Request approved.', 'success');
                    }}
                    className="btn-primary !px-3 !py-1.5 text-xs"
                  >
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      const res = await actions.declineCabinRequest(r.id);
                      if (!res.ok) return toast(res.error ?? 'Could not decline.', 'error');
                      toast('Request declined.', 'success');
                    }}
                    className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                  >
                    Decline
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- Chat (members only: CHT-01..04, 06, 08, 09) ---- */}
      {activeMember && (
        <section className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md" aria-label="Cabin chat">
          <ul
            ref={listRef}
            onScroll={() => {
              const el = listRef.current;
              if (!el) return;
              nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
            }}
            className="max-h-[calc(100dvh-300px)] min-h-[320px] space-y-1 overflow-y-auto p-3" // CHT-14
          >
            {!ready ? (
              <ChatSkeleton />
            ) : allMessages.length > visible.length && (
              <li className="pb-1 text-center">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_MESSAGES)}
                  className="tap44 rounded-full px-3 py-1 text-xs text-brand-600 hover:bg-brand-50"
                >
                  Load earlier messages ({allMessages.length - visible.length} more)
                </button>
              </li>
            )}
            {visible.map((m, i) => {
              const prev = visible[i - 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const grouped =
                !!prev && !newDay && prev.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              const mine = m.senderId === me;
              const sender = profileById(state, m.senderId);
              const quoted = m.replyTo ? allMessages.find((x) => x.id === m.replyTo) : null;
              const canDelete = (mine || mod) && !m.isDeleted;
              return (
                <li key={m.id} className={grouped ? 'pt-0.5' : 'pt-2.5'}>
                  {newDay && (
                    <div className="my-2 flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="h-px flex-1 bg-white/10" aria-hidden />
                      {dayLabel(m.createdAt)}
                      <span className="h-px flex-1 bg-white/10" aria-hidden />
                    </div>
                  )}
                  <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    {!grouped && sender ? (
                      <Link to={`/u/${sender.username}`} className="mt-0.5 shrink-0">
                        <Avatar src={sender.avatarUrl} name={sender.displayName} size={26} />
                      </Link>
                    ) : (
                      <span className="w-[26px] shrink-0" aria-hidden />
                    )}
                    <div className={`min-w-0 max-w-[85%] ${mine ? 'text-right' : ''}`}>
                      {!grouped && sender && (
                        <span className="mb-0.5 block px-1 text-[11px] text-slate-400">
                          <Link to={`/u/${sender.username}`} className="font-semibold text-slate-500 hover:underline">
                            {sender.displayName}
                          </Link>{' '}
                          {timeAgo(m.createdAt)}
                        </span>
                      )}
                      <div
                        title={new Date(m.createdAt).toLocaleString()}
                        className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-[15px] shadow-sm ${
                          mine
                            ? 'rounded-br-none bg-gradient-to-r from-brand-500 to-purple-500 text-white'
                            : 'rounded-bl-none border border-white/10 bg-white/[0.07] text-slate-800 backdrop-blur-md'
                        }`}
                      >
                        {m.isDeleted ? (
                          <p className="text-sm italic text-slate-400">Message deleted</p> // CHT-08
                        ) : (
                          <>
                            {quoted && (
                              <span className={`mb-1.5 block rounded-lg border-l-2 px-2 py-1 text-xs ${mine ? 'border-white/50 bg-white/[0.12] opacity-90' : 'border-brand-400 bg-black/[0.05] text-slate-500'}`}>
                                <b className="block truncate">{profileById(state, quoted.senderId)?.displayName ?? 'Member'}</b>
                                <span className="line-clamp-2">{quoted.body ?? 'Photo'}</span>
                              </span>
                            )}
                            {m.imageUrl && (
                              <img src={m.imageUrl} alt="Cabin photo" loading="lazy" decoding="async" className="mb-1.5 max-h-72 w-full rounded-xl object-cover" />
                            )}
                            {m.body && <RichText text={m.body} className={mine ? 'text-white' : ''} />} {/* CHT-04: XSS-safe render */}
                            {canDelete && (
                              <span className={`mt-1 block ${mine ? 'text-right' : ''}`}>
                                <button
                                  onClick={() => void delMessage(m.id)}
                                  aria-label="Delete message"
                                  className={`tap44 rounded-full p-1 opacity-40 transition hover:opacity-100 ${mine ? 'hover:bg-white/15' : 'hover:bg-black/10'}`}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </span>
                            )}
                            {!mine && !m.isDeleted && (
                              <span className="mt-1 block">
                                <button
                                  onClick={() => setReportMsgId(m.id)}
                                  aria-label="Report message"
                                  className="tap44 rounded-full p-1 text-slate-400 opacity-40 transition hover:bg-black/10 hover:opacity-100"
                                >
                                  <Flag size={12} />
                                </button>
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {ready && allMessages.length === 0 && (
              <li className="py-10 text-center text-sm text-slate-400">No messages yet — start the conversation 👋</li>
            )}
            <div ref={bottomRef} />
          </ul>

          {/* Attachment + reply previews */}
          {(photo || replyTo) && (
            <div className="flex items-center gap-3 border-t border-white/10 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                {photo ? (
                  <img src={photo} alt="Attachment preview" className="h-16 rounded-lg object-cover" />
                ) : (
                  <>
                    <b className="text-xs uppercase tracking-wide text-brand-600">Replying</b>
                    <p className="line-clamp-2 text-slate-600">
                      {allMessages.find((x) => x.id === replyTo)?.body ?? 'Photo'}
                    </p>
                  </>
                )}
              </span>
              <button
                onClick={() => {
                  setPhoto(null);
                  setReplyTo(null);
                }}
                aria-label="Remove attachment"
                className="tap44 rounded-full p-1.5 text-slate-400 hover:bg-white/[0.06]"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Composer (CHT-03: images only, no video) */}
          <form onSubmit={send} className="flex items-end gap-2 border-t border-white/10 bg-surface-deep p-3">
            <label className="tap44 cursor-pointer rounded-full border border-slate-200 bg-slate-50 p-2 text-brand-600 hover:bg-brand-50" title="Attach photo">
              <span className="sr-only">Attach photo</span>
              <ImagePlus size={18} aria-hidden />
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { void attachPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, LIMITS.cabinMessageMax))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (body.trim() || photo) void send();
                }
              }}
              placeholder="Message the cabin…"
              rows={1}
              aria-label="Message text"
              className="input max-h-32 min-h-[44px] flex-1 resize-none py-2.5"
            />
            <button
              type="submit"
              disabled={busy || (!body.trim() && !photo)}
              className="btn-primary aspect-square !rounded-full px-3.5"
              aria-label="Send message"
            >
              <Send size={17} />
            </button>
          </form>
          <p className="px-3 pb-2 text-center text-[11px] text-slate-400">
            Enter to send · Shift+Enter for a new line · images only · rate-limited
          </p>
        </section>
      )}

      {/* ---- Members panel (CAB-04 list, CHT-12 moderation) ---- */}
      <details className="card p-4" open={mod && pending.length > 0}>
        <summary className="cursor-pointer select-none text-sm font-semibold">
          Members ({members.length})
        </summary>
        <ul className="mt-2 space-y-1">
          {members.map((m) => {
            const who = profileById(state, m.userId);
            const isTargetOwner = m.role === 'owner';
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-xl p-2 hover:bg-white/[0.04]">
                <Avatar src={who?.avatarUrl ?? ''} name={who?.displayName ?? 'Member'} size={32} />
                <span className="min-w-0 flex-1">
                  <Link to={`/u/${who?.username ?? ''}`} className="block truncate text-sm font-semibold hover:underline">
                    {who?.displayName ?? 'Unknown member'}
                  </Link>
                  <span className="text-xs text-slate-400">@{who?.username ?? 'member'}</span>
                </span>
                {m.role !== 'member' && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      isTargetOwner ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'
                    }`}
                  >
                    {isTargetOwner && <Crown size={10} aria-hidden />}
                    {m.role}
                  </span>
                )}
                {mod && !isTargetOwner && m.userId !== me && (
                  <span className="flex items-center gap-1">
                    {owner && (
                      <button
                        onClick={() => void transfer(m.userId, who?.displayName ?? 'this member')}
                        title="Make owner"
                        aria-label={`Make ${who?.displayName ?? 'member'} the owner`}
                        className="tap44 rounded-full p-2 text-amber-500 hover:bg-amber-50"
                      >
                        <Crown size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => void removeMember(m.userId, who?.displayName ?? 'this member')}
                      title="Remove from cabin"
                      aria-label={`Remove ${who?.displayName ?? 'member'}`}
                      className="tap44 rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <UserMinus size={14} />
                    </button>
                    <button
                      onClick={() => void banMember(m.userId, who?.displayName ?? 'this member')}
                      title="Ban (cannot rejoin)"
                      aria-label={`Ban ${who?.displayName ?? 'member'}`}
                      className="tap44 rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Ban size={14} />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </details>

      {/* CHT-12: report entry points */}
      {reportMsgId && (
        <ReportModal target="cabin_message" targetId={reportMsgId} label="this message" onClose={() => setReportMsgId(null)} />
      )}
      {reportingCabin && (
        <ReportModal target="cabin" targetId={cabin.id} label="this cabin" onClose={() => setReportingCabin(false)} />
      )}
    </div>
  );
}
