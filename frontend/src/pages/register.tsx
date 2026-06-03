import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (process.env.NEXT_PUBLIC_ALLOW_SIGNUP !== "true") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] text-slate-400 px-4 text-center">
        <div>
          <p>Registration is disabled.</p>
          <Link href="/login" className="text-cyan-400 mt-4 inline-block">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
          ...(email.trim() ? { email: email.trim() } : {}),
        }),
      });
      await router.replace("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e17] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#070b12] p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white mb-2">Create account</h1>
        <p className="text-sm text-slate-400 mb-6">
          Choose a username and password for Bitiq Lab.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Username</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white"
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers, underscore only"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Email (optional)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white"
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
            className="w-full rounded-lg bg-cyan-600 py-2.5 font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="text-cyan-400">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
