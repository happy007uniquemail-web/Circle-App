import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { AdminRoute, ProtectedRoute, PublicOnly } from './lib/auth';
import Home from './pages/Home';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import PostDetail from './pages/PostDetail';

// Route-level code splitting (F-OPT): only Landing/Home/PostDetail load eagerly.
const Explore = lazy(() => import('./pages/Explore'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));
const Settings = lazy(() => import('./pages/Settings'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
const Messages = lazy(() => import('./pages/Messages'));
const MessageThread = lazy(() => import('./pages/MessageThread'));
const Hashtag = lazy(() => import('./pages/Hashtag'));
const Saved = lazy(() => import('./pages/Saved'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));

function RouteFallback() {
  return (
    <div className="grid place-items-center py-24" role="status" aria-label="Loading page">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
    </div>
  );
}

/** Route table — PRD §7.1 + v2 additions (F-DM, F-HAS, F-SAV). */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
      <Route path="/terms" element={<Suspense fallback={<RouteFallback />}><Terms /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<RouteFallback />}><Privacy /></Suspense>} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/home" element={<Home />} />
        <Route path="/explore" element={<Suspense fallback={<RouteFallback />}><Explore /></Suspense>} />
        <Route path="/u/:username" element={<Suspense fallback={<RouteFallback />}><Profile /></Suspense>} />
        <Route path="/p/:id" element={<PostDetail />} />
        <Route path="/notifications" element={<Suspense fallback={<RouteFallback />}><Notifications /></Suspense>} />
        <Route path="/messages" element={<Suspense fallback={<RouteFallback />}><Messages /></Suspense>} />
        <Route path="/messages/:id" element={<Suspense fallback={<RouteFallback />}><MessageThread /></Suspense>} />
        <Route path="/hashtag/:tag" element={<Suspense fallback={<RouteFallback />}><Hashtag /></Suspense>} />
        <Route path="/saved" element={<Suspense fallback={<RouteFallback />}><Saved /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<RouteFallback />}><Settings /></Suspense>} />
        <Route
          path="/admin/reports"
          element={<AdminRoute><Suspense fallback={<RouteFallback />}><AdminReports /></Suspense></AdminRoute>}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
