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
  info: { cls: 'border-white/10 bg-glass text-slate-200', icon: Info },
  error: { cls: 'border-red-200/70 bg-red-50/85 text-red-800', icon: XCircle },
  success: { cls: 'border-emerald-200/70 bg-emerald-50/85 text-emerald-800', icon: CheckCircle2 },
};

/** Mount once inside the app shell. */
export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    listener = setList;
    return () => {
      listener = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end">
      {list.map((t) => {
        const { cls, icon: Icon } = STYLES[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-xl shadow-black/50 backdrop-blur-2xl ${cls}`}
          >
            <Icon size={16} className="shrink-0" />
            {t.msg}
          </div>
        );
      })}
    </div>
  );
}
