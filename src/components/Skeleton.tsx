/** Shimmer blocks for loading states (UI-04 — no blank screen while fetching). */

function Block({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
    />
  );
}

/** Feed-shaped skeleton: n post cards with avatar + text + media block. */
export function FeedSkeleton({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading posts">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Block className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Block className="h-3.5 w-32" />
              <Block className="h-2.5 w-20" />
            </div>
          </div>
          <Block className="h-3 w-full" />
          <Block className="h-3 w-4/5" />
          <Block className="aspect-[4/3] w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Profile header + tab content skeleton. */
export function ProfileSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading profile">
      <span className="sr-only">Loading…</span>
      <div className="card space-y-3 p-6">
        <div className="flex items-center gap-4">
          <Block className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Block className="h-4 w-40" />
            <Block className="h-3 w-24" />
          </div>
        </div>
        <Block className="h-3 w-full" />
      </div>
      <FeedSkeleton n={2} />
    </div>
  );
}

/** Chat thread skeleton: alternating bubbles. */
export function ChatSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading conversation">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <Block
          key={i}
          className={`${i % 2 ? 'ml-auto' : ''} h-10 w-2/3 rounded-2xl ${i % 3 === 2 ? 'w-1/2' : ''}`}
        />
      ))}
    </div>
  );
}

/** Simple list skeleton (notifications, messages, explore). */
export function ListSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card flex items-center gap-3 p-4">
          <Block className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Block className="h-3 w-1/2" />
            <Block className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
