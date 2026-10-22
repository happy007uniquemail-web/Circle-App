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
          <div className="prose-sm mt-6 space-y-5 text-sm leading-relaxed text-slate-700">{children}</div>
        </article>
      </main>
    </div>
  );
}

/** `/terms` — public Terms of Service (MOD-5). */
export default function Terms() {
  return (
    <DocShell title="Terms of Service" updated="October 19, 2026">
      <section>
        <h2 className="font-semibold text-slate-900">1. Acceptance</h2>
        <p>By creating an account or using Circle (“the Service”), you agree to these Terms. If you do not agree, do not use the Service. During onboarding you must explicitly accept these Terms and the Privacy Policy.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">2. Your account</h2>
        <p>You sign in with Google. You are responsible for activity under your account. Usernames must be 3–20 characters (letters, numbers, underscores) and may not impersonate others or mislead. You must be at least 13 years old.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">3. Your content</h2>
        <p>You own the posts, images, and comments you create. You grant Circle a non-exclusive, worldwide license to host, display, and process that content solely to operate the Service. You may edit or delete your content at any time; deletions are removed from active systems immediately and purged from backups within 30 days.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">4. Acceptable use</h2>
        <p>You may not post content that is unlawful, harassing, hateful, sexually explicit in a non-consensual context, or that infringes others’ rights. Spam, coordinated manipulation, and automated posting are prohibited. We may limit posting rates to protect the Service.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">5. Moderation</h2>
        <p>Content can be reported by any user. Moderators may dismiss reports, remove content, or suspend accounts that violate these Terms. You may appeal a suspension by contacting support. We aim to resolve reports within 48 hours.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">6. Termination</h2>
        <p>You may delete your account at any time from Settings; this permanently removes your profile, posts, comments, and likes. We may suspend or terminate accounts that breach these Terms, applicable law, or create risk for other users.</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">7. Disclaimers</h2>
        <p>The Service is provided “as is” without warranties of any kind. To the maximum extent permitted by law, Circle is not liable for indirect or consequential damages. Our total liability is limited to the amount you paid us in the 12 months before the claim (currently $0).</p>
      </section>
      <section>
        <h2 className="font-semibold text-slate-900">8. Changes & contact</h2>
        <p>We will post any material changes here with an updated date. Continued use after changes means acceptance. Questions: <a href="mailto:legal@circle.app" className="text-brand-600 underline">legal@circle.app</a>.</p>
      </section>
    </DocShell>
  );
}
