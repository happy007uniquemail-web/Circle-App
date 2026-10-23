/**
 * Dropdown search — UI Design TRD §6.2 TOP-02 (grouped People / Posts /
 * Cabins). UI-layer selectors over in-memory state: People reuses the store's
 * own searchUsers (PRV-09/08/07 respected); posts go through visiblePosts;
 * cabins mirror the Cabins page's discovery rule (public names/descriptions,
 * member counts are discovery-safe).
 */
import { selectSearchUsers, visiblePosts } from './store';
import type { AppState, Cabin, Post } from '../types';

export function selectSearchPosts(
  state: AppState,
  viewerId: string | null,
  q: string,
  limit = 4,
): Post[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const tag = query.replace(/^#/, '');
  return visiblePosts(state, viewerId)
    .filter((p) => p.body.toLowerCase().includes(query) || p.hashtags.some((t) => t.includes(tag)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function selectSearchCabins(state: AppState, q: string, limit = 4): Cabin[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  return (state.cabins ?? [])
    .filter((c) => c.name.toLowerCase().includes(query) || (c.description ?? '').toLowerCase().includes(query))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export { selectSearchUsers };
