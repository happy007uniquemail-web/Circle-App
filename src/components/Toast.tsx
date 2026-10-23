import { useEffect, useState } from 'react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';

type Kind = 'info' | 'error' | 'success';
interface Toast {
  id: number;
  msg: string;
  kind: Kind;
}

let toasts: Toast[] = [];
let listener: ((t: Toast[]) => void) | null = null;
let nextId = 1;

/** Fire a transient toast (used for validation + rate-limit feedback). */
export function toast(msg: string, kind: Kind = 'info') {
  const t = ToastItem(msg, kind);
  toasts = [...toasts, t];
  listener?.(toasts);
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listener?.(toasts);
  }, 3500);
}

function ToastItem(msg: string, kind: Kind): Toast {
  return { id: nextId++, msg, kind };
}

const STYLES: Record<Kind, { cls: string; icon: typeof Info }> = {
  info: { cls: 'text-txt-main [&_svg]:text-info', icon: Info },
  error: { cls: 'text-red-600', icon: XCircle },
  success: { cls: 'text-emerald-600', icon: CheckCircle2 },
};

/** Mount once inside the app shell. TST-01: glass pill, aria-live region —
 *  top-centre on mobile (clears the bottom tab bar), bottom-centre on
 *  desktop. */
export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    listener = setList;
    return () => {
      listener = null;
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 md:top-auto md:bottom-6"
    >
      {list.map((t) => {
        const { cls, icon: Icon } = STYLES[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-full border border-glass-border bg-glass-strong px-4 py-2.5 text-sm font-medium shadow-xl shadow-black/40 backdrop-blur-2xl ${cls}`}
          >
            <Icon size={16} className="shrink-0" />
            {t.msg}
          </div>
        );
      })}
    </div>
  );
}
