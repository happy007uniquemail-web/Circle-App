/**
 * Client-side rate limiting (MOD-4).
 * Demo-mode guardrails; the production equivalent is a Supabase Edge Function /
 * database-level throttle — this keeps the UX honest either way.
 */

const buckets = new Map<string, number[]>();

export function checkLimit(bucket: string, max: number, windowMs: number): boolean {
  const nowTs = Date.now();
  const hits = (buckets.get(bucket) ?? []).filter((t) => nowTs - t < windowMs);
  if (hits.length >= max) {
    buckets.set(bucket, hits);
    return false;
  }
  hits.push(nowTs);
  buckets.set(bucket, hits);
  return true;
}

export function resetLimits(): void {
  buckets.clear();
}
