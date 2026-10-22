import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { provider } from './lib/store';
import './index.css';

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
