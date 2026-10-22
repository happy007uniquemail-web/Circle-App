import { initials } from '../lib/format';

interface Props {
  src: string;
  name: string;
  size?: number;
  className?: string;
}

/** Rounded avatar with alt text (a11y) and initials fallback. */
export default function Avatar({ src, name, size = 40, className = '' }: Props) {
  return (
    <img
      src={src}
      alt={`${name}'s avatar`}
      width={size}
      height={size}
      loading="lazy"
      onError={(e) => {
        // Fallback to initials block if the data URL ever fails.
        const el = e.currentTarget;
        el.style.background = '#6366f1';
        el.style.color = '#fff';
        el.alt = initials(name);
      }}
      className={`shrink-0 rounded-full object-cover ring-1 ring-slate-200 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
