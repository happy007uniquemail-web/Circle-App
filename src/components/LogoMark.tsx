import { useState } from 'react';

/**
 * App mark.
 *
 * Renders the brand logo (/logo.png) when the asset exists in /public;
 * falls back to the "C" gradient tile so no spot can ever show a broken
 * image box. Sizes are per-callsite: 32 (nav brand), 40 (landing/pre-ob).
 */
export default function LogoMark({ size = 32, rounded = 'rounded-xl' }: { size?: number; rounded?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.55) }}
        className={`grid shrink-0 place-items-center bg-gradient-to-br from-brand-500 to-brand-800 font-bold text-white shadow-md ${rounded}`}
      >
        C
      </span>
    );
  }
  return (
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`shrink-0 bg-white object-cover shadow-md ${rounded}`}
      style={{ width: size, height: size }}
    />
  );
}
