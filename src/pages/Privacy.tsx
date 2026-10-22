import { Link } from 'react-router-dom';

function DocShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-black/40">C</span> Circle
        </Link>
        <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">← Back</Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20">
        <article className="card p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">Last updated {updated}</p>
          <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-700">{children}</div>
        </article>
      </main>
    </div>
  );
}

/** `/privacy` — public Privacy Policy (MOD-5, §8 Privacy NFR). */
export default function Privacy() {
  return (
    <DocShell title="Privacy Policy" updated="October 19, 2026">
      <section>
        <h2 className="font-semibold text-slate-900">1. What we collect</h2>
        <p>We request only the basic Google scopes <code className="rounded bg-slate-100 px-1">openid</code>, <code className="rounded bg-slate-100 px-1">email</code>, <code className="rounded bg-slate-100 px-1">profile</code> — which gives us your name, email address, and profile picture. We additionally store the content you choose to publish: posts, images, comments, likes, follows, and blocks.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">2. Why we collect it</h2>
        <p>To run the Service: authenticate you, show your profile and posts, personalise your Following feed, send in-app notifications, and keep the platform safe through reporting and moderation. We do not sell your data and we do not use your content for advertising.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">3. Where it lives</h2>
        <p>Data is stored in a managed PostgreSQL database with row-level security enforcing per-user access, and images in managed object storage. Transport is HTTPS only. Access is limited to the application and authorised operators.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">4. Retention & deletion</h2>
        <p>Content you delete is removed from active systems immediately and purged from backups within 30 days. When you delete your account, we remove your profile, posts, comments, likes, follows, and uploaded media — honouring deletion requests within 30 days as required by GDPR/CCPA.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">5. Your rights</h2>
        <p>Depending on your region, you may have the right to access, correct, export, or delete your personal data, and to object to certain processing. Exercise these anytime in Settings (export on request via <a href="mailto:privacy@circle.app" className="text-brand-600 underline">privacy@circle.app</a>). You may also lodge a complaint with your supervisory authority.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">6. Cookies</h2>
        <p>We use strictly necessary storage to keep you signed in (session tokens are httpOnly and secure). No third-party advertising or cross-site tracking cookies are set.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">7. Contact</h2>
        <p>Privacy questions: <a href="mailto:privacy@circle.app" className="text-brand-600 underline">privacy@circle.app</a>. We aim to respond within 30 days.</p>
      </section>
    </DocShell>
  );
}
