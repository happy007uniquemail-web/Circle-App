import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';

export type Hobby = { id: string; name: string };

/** The logo's four colours, reused as washes so every chip pairs them. */
const CHIP_WASH = [
  'bg-[#FCE9E4] text-[#B23A2B] ring-[#F2B8AB]',   // coral red
  'bg-[#E4F5E9] text-[#1E7A3C] ring-[#9FD6AF]',   // green
  'bg-[#F8F1E1] text-[#7A5B24] ring-[#E3D2A6]',   // cream
  'bg-[#E7EDF6] text-[#2A3F5C] ring-[#B9C7DB]',   // navy
];

/**
 * Interests live under a collapsible "Hobbies" card.
 * Adaptive: collapsed by default it previews the first chips plus a "+N"
 * counter, so a long tag list never pushes the profile stats off-screen;
 * expanding reveals all chips, colour-cycled through the brand palette.
 */
export default function HobbiesSection({ hobbies, maxPreview = 6 }: { hobbies: Hobby[]; maxPreview?: number }) {
  const [open, setOpen] = useState(false);
  if (!hobbies.length) return null;

  const hidden = hobbies.length - maxPreview;
  const visible = open ? hobbies : hobbies.slice(0, maxPreview);

  return (
    <section aria-label="Hobbies" className="card p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <Sparkles size={16} className="text-[#B23A2B]" aria-hidden />
          Hobbies
          <span className="rounded-full bg-[#0F1B2D] px-2 py-0.5 text-[11px] font-semibold text-[#F8F1E1]">
            {hobbies.length}
          </span>
        </span>
        <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {visible.map((h, i) => (
          <li
            key={h.id}
            className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ring-1 ${CHIP_WASH[i % CHIP_WASH.length]}`}
          >
            {h.name}
          </li>
        ))}
        {!open && hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-full bg-[#0F1B2D] px-3 py-1 text-xs font-semibold text-[#F8F1E1] shadow-sm transition hover:opacity-90"
            >
              +{hidden} more
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
