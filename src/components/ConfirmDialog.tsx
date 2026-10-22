import { useEffect, useState } from 'react';
import Modal from './Modal';

interface PendingConfirm {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
}

let listener: ((p: PendingConfirm | null) => void) | null = null;
let nextId = 1;

/**
 * In-app confirm dialog (UI-11) — drop-in replacement for `window.confirm`
 * (cancellable, keyboard accessible, trapped focus). Mount `<ConfirmHost/>`
 * once in the app shell.
 */
export function confirmAction(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const item: PendingConfirm = {
      id: nextId++,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      resolve: (ok) => {
        listener?.(null);
        resolve(ok);
      },
    };
    listener?.(item);
  });
}

/** Mount once inside the app shell (next to `<Toaster/>`). */
export function ConfirmHost() {
  const [item, setItem] = useState<PendingConfirm | null>(null);
  useEffect(() => {
    listener = setItem;
    return () => {
      listener = null;
    };
  }, []);

  if (!item) return null;
  const dismiss = () => item.resolve(false);

  return (
    <Modal onClose={dismiss} label={item.title} className="max-w-sm p-6" showClose={false}>
      <h2 className="text-lg font-bold">{item.title}</h2>
      <p className="mt-2 text-sm text-slate-600">{item.message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={dismiss} className="btn-ghost">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => item.resolve(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-red-500 px-5 text-sm font-semibold text-white transition hover:brightness-110"
        >
          {item.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
