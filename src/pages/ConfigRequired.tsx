/**
 * Rendered by the entry point when the build has no Supabase credentials.
 * Keeps official mode strict: there is no offline/demo fallback.
 */
export default function ConfigRequired() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="glass w-full max-w-lg rounded-3xl border p-8">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 font-bold text-white shadow-md shadow-black/40">
          C
        </div>
        <h1 className="text-xl font-bold">Backend not configured</h1>
        <p className="mt-2 text-sm text-slate-600">
          Circle runs in official Supabase mode only, and this build was produced without credentials.
        </p>
        <p className="mt-4 text-sm font-medium">Set both variables, then rebuild and redeploy:</p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-black/80 p-4 text-xs text-white">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>`}
        </pre>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Locally, copy <code>.env.example</code> to <code>.env</code> and fill in the values. On Netlify, add them under
          Site configuration → Environment variables and trigger a new deploy. Vite bakes these values in at build
          time, so a redeploy is required after changing them.
        </p>
      </div>
    </main>
  );
}
