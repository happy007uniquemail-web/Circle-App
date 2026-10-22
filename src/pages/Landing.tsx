import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, Sparkles, Heart } from 'lucide-react';
import { currentUserProfile, useActions, useAppState } from '../lib/store';
import type { Result } from '../lib/store';

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.8l7.8 6C12.3 14 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.6-4.9 7.3l7.6 5.9c4.4-4.1 7.1-10.2 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.2a14.6 14.6 0 0 1 0-8.4l-7.8-6a23.5 23.5 0 0 0 0 20.4l7.8-6z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.4-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-4.5-13.6-10.4l-7.8 6C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

const FEATURES = [
  { icon: MessageCircle, title: 'Post in seconds', text: 'Share up to 500 characters and up to 4 photos — resize handled for you.' },
  { icon: Heart, title: 'Engage', text: 'Like and comment on posts from people you follow, with live counts.' },
  { icon: Search, title: 'Discover', text: 'Explore trending posts and search people by username or name.' },
  { icon: Sparkles, title: 'One-click sign-in', text: 'Continue with Google — no passwords, no forms, straight to your feed.' },
];

/** Public landing page with the Google sign-in button (AUTH-1). */
export default function Landing() {
  const actions = useActions();
  const state = useAppState();
  const navigate = useNavigate();

  async function afterSignIn(result: Result | Promise<Result>) {
    const r = await result;
    if (!r.ok) return;
    const profile = currentUserProfile(actions.getSnapshot());
    navigate(profile?.username ? '/home' : '/onboarding');
  }

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <span className="flex items-center gap-2 text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-black/40">C</span>
          Circle
        </span>
        <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
          <a href="/terms" className="hover:text-slate-900">Terms</a>
          <a href="/privacy" className="hover:text-slate-900">Privacy</a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-16 text-center">
          <p className="mx-auto mb-4 w-fit rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-brand-700 backdrop-blur-md">
            MVP preview · demo mode
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Your circle, <span className="text-brand-600">in one place.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Sign in with Google, follow a few people, and go from landing page to first post in under two minutes.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <button onClick={() => afterSignIn(actions.signInWithGoogle())} className="btn-primary w-full max-w-xs py-3 text-base shadow-lg shadow-brand-600/20">
              <GoogleG /> Continue with Google
            </button>
            <button onClick={() => afterSignIn(actions.signInDemoAdmin())} className="btn-ghost text-xs text-slate-500">
              Sign in as demo admin (view moderation queue)
            </button>
            <p className="text-xs text-slate-400">
              Demo environment — no real Google account is contacted.
              {state.session ? ' (Existing session restored.)' : ''}
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-4xl gap-4 px-4 pb-20 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card p-5 text-left">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-brand-600 backdrop-blur-md">
                <Icon size={20} />
              </div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-500">
        © 2026 Circle · <a href="/terms" className="underline hover:text-slate-700">Terms</a> ·{' '}
        <a href="/privacy" className="underline hover:text-slate-700">Privacy</a>
      </footer>
    </div>
  );
}
