import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ConfigRequired from './pages/ConfigRequired';
import { applyUiPrefs, loadUiPrefs, watchSystemUiPrefs } from './lib/uiPrefs';
import { supabase } from './lib/supabase';
import './index.css';

/**
 * UI Design TRD THM-01/04: re-apply theme/wallpaper/accent prefs at boot.
 * The pre-paint script in index.html already set data-* before first paint;
 * this adds the accent stops (not in the inline script) and re-syncs, then
 * follows live OS changes while mode is "system"/reduceEffects is null.
 */
applyUiPrefs(loadUiPrefs());
watchSystemUiPrefs();

const root = createRoot(document.getElementById('root')!);

// Official mode only: without credentials the app never loads its data layer.
if (!supabase) {
  root.render(
    <StrictMode>
      <ConfigRequired />
    </StrictMode>,
  );
} else {
  void import('./App').then(({ default: App }) => {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  });
}
