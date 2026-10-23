import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { applyUiPrefs, loadUiPrefs, watchSystemUiPrefs } from './lib/uiPrefs';
import { provider } from './lib/store';
import './index.css';

/**
 * UI Design TRD THM-01/04: re-apply theme/wallpaper/accent prefs at boot.
 * The pre-paint script in index.html already set data-* before first paint;
 * this adds the accent stops (not in the inline script) and re-syncs, then
 * follows live OS changes while mode is "system"/reduceEffects is null.
 */
applyUiPrefs(loadUiPrefs());
watchSystemUiPrefs();

/**
 * Realtime notifications demo (F-RT, DEV only): while the tab is visible,
 * fabricate an incoming like/comment/repost/follow every 60–120 s so live
 * bell badges + toasts are observable without a backend. Production replaces
 * this with Supabase Realtime (see README §Realtime).
 */
if (import.meta.env.DEV) {
  const tick = () => {
    if (document.visibilityState === 'visible') {
      const desc = provider.simulateIncomingActivity();
      if (desc) window.dispatchEvent(new CustomEvent('circle:activity', { detail: desc }));
    }
    window.setTimeout(tick, 60_000 + Math.random() * 60_000);
  };
  window.setTimeout(tick, 45_000);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
