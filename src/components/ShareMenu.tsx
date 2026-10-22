import { useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, Share2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Post } from '../types';
import Avatar from './Avatar';
import Modal from './Modal';
import { toast } from './Toast';
import { conversationsFor, useAppState } from '../lib/store';

/**
 * Share sheet (F-SHR): copy link, native Web Share, or send straight into a DM
 * (the thread opens pre-attached via `?share=post:<id>`).
 */
export default function ShareMenu({ post, onClose }: { post: Post; onClose: () => void }) {
  const state = useAppState();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const me = state.session?.id;
  const convs = me ? conversationsFor(state, me).slice(0, 6) : [];
  const url = `${window.location.origin}/p/${post.id}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Link copied to clipboard.', 'success');
    } catch {
      toast(`Copy this link: ${url}`, 'info');
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Circle post', text: post.body.slice(0, 80), url });
      onClose();
    } catch {
      /* user dismissed the share sheet */
    }
  }

  function sendTo(conversationId: string) {
    onClose();
    navigate(`/messages/${conversationId}?share=post:${post.id}`);
  }

  return (
    <Modal onClose={onClose} label="Share post" className="max-w-md" showClose={false}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between pr-8">
          <h2 className="text-lg font-bold">Share post</h2>
          <button onClick={onClose} aria-label="Close share dialog" className="tap44 absolute right-2 top-2 rounded-full p-1.5 text-slate-500 hover:bg-white/[0.06]">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-600">
          <p className="line-clamp-2">{post.body || 'Photo post'}</p>
        </div>

        <div className="mt-4 space-y-1">
          <button onClick={copyLink} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/[0.06]">
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-slate-500" />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>

          <a href={`/p/${post.id}`} target="_blank" rel="noopener" onClick={onClose} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/[0.06]">
            <ExternalLink size={16} className="text-slate-500" /> Open post in new tab
          </a>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button onClick={nativeShare} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/[0.06]">
              <Share2 size={16} className="text-slate-500" /> Share via device…
            </button>
          )}
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            <MessageCircle size={13} /> Send in a message
          </p>
          {convs.length === 0 ? (
            <div className="text-sm text-slate-500">
              <p>No conversations yet.</p>
              <button onClick={() => { onClose(); navigate('/explore'); }} className="btn-ghost mt-1 text-brand-600">
                <Users size={14} /> Find people to message
              </button>
            </div>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {convs.map((c) => (
                <li key={c.conversation.id}>
                  <button onClick={() => sendTo(c.conversation.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/[0.06]">
                    <Avatar src={c.other.avatarUrl} name={c.other.displayName} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <b>{c.other.displayName}</b>
                      <span className="text-slate-500"> @{c.other.username}</span>
                    </span>
                    <span className="text-xs font-semibold text-brand-600">Send</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
