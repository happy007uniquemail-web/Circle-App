import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { ReportReason, ReportTarget } from '../types';
import { useActions } from '../lib/store';
import Modal from './Modal';
import { toast } from './Toast';

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate', label: 'Hate speech' },
  { value: 'nsfw', label: 'NSFW or sensitive content' },
  { value: 'other', label: 'Something else' },
];

/** Report a post, comment, or user with a reason category (MOD-1). */
export default function ReportModal({
  target,
  targetId,
  label,
  onClose,
}: {
  target: ReportTarget;
  targetId: string;
  label: string;
  onClose: () => void;
}) {
  const actions = useActions();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    const result = await actions.submitReport(target, targetId, reason, details.trim() || null);
    setSending(false);
    if (!result.ok) return toast(result.error ?? 'Could not submit report.', 'error');
    toast('Report submitted — our admins review reports within 48 hours.', 'success');
    onClose();
  }

  return (
    <Modal onClose={onClose} label={`Report ${label}`} className="max-w-md" showClose={false}>
      <form onSubmit={submit} className="p-5">
        <div className="mb-4 flex items-center justify-between pr-8">
          <h2 className="text-lg font-bold">Report {label}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="tap44 absolute right-2 top-2 rounded-full p-1.5 text-slate-500 hover:bg-white/[0.06]"
          >
            <X size={18} />
          </button>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-semibold">Reason *</legend>
          {REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-white/[0.06]">
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-4 w-4 accent-brand-600"
              />
              {r.label}
            </label>
          ))}
        </fieldset>

        <label className="mt-4 block text-sm font-semibold" htmlFor="report-details">
          Details <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="report-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="What should we know?"
          className="input mt-1.5 resize-none"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={sending} className="btn-primary">Submit report</button>
        </div>
      </form>
    </Modal>
  );
}
