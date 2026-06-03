import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#070b12] p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-violet-600 text-lg font-bold text-white">
            B
          </span>
          <div>
            <h1 className="text-xl font-semibold text-white">Bitiq Lab</h1>
            <p className="text-sm text-slate-400">
              Same email and password as Supabase Auth
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gradient-to-r from-cyan-600 to-violet-600 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "true" && (
          <p className="mt-6 text-center text-sm text-slate-400">
            No account?{" "}
            <Link href="/register" className="text-cyan-400 hover:text-cyan-300">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
