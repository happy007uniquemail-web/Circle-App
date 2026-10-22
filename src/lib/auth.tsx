/** Session helpers, route guards, and auth redirects (AUTH-5). */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { currentUserProfile, useAppState } from './store';

/** Unauthenticated users are sent to the landing page (AUTH-5). */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const state = useAppState();
  const location = useLocation();
  if (!state.session) return <Navigate to="/" replace state={{ from: location }} />;
  // First sign-in has no username yet → onboarding (§5.3 step 6).
  const profile = currentUserProfile(state);
  if (profile && !profile.username && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  // Step 2 (?interests) is exempt: it runs after the profile exists but must
  // stay on the onboarding route (INT-03); skipping it just lands on /home.
  if (profile?.username && location.pathname === '/onboarding' && !location.search.startsWith('?interests')) {
    return <Navigate to="/home" replace />;
  }
  return <>{children}</>;
}

/** Only `role = 'admin'` may enter (MOD-2). */
export function AdminRoute({ children }: { children: ReactNode }) {
  const state = useAppState();
  const profile = currentUserProfile(state);
  if (!state.session) return <Navigate to="/" replace />;
  if (profile && !profile.username) return <Navigate to="/onboarding" replace />;
  if (profile?.role !== 'admin') return <Navigate to="/home" replace />;
  return <>{children}</>;
}

/** Signed-in users never see the landing page. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const state = useAppState();
  const profile = currentUserProfile(state);
  if (state.session) return <Navigate to={profile?.username ? '/home' : '/onboarding'} replace />;
  return <>{children}</>;
}
