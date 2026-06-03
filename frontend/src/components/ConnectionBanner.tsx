import { useEffect, useState } from "react";
import { checkBackendHealth } from "@/lib/api";

export default function ConnectionBanner() {
  const [status, setStatus] = useState<{
    loading: boolean;
    apiOk?: boolean;
    dbOk?: boolean;
    message?: string;
  }>({ loading: true });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const result = await checkBackendHealth();
      if (cancelled) return;
      setStatus({
        loading: false,
        apiOk: result.ok,
        dbOk: result.database,
        message: result.message,
      });
    }

    run();
    const t = setInterval(run, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (status.loading || (status.apiOk && status.dbOk)) {
    return null;
  }

  if (status.apiOk && status.dbOk === false) {
    return (
      <div
        role="alert"
        className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        <strong className="font-semibold">Database not connected.</strong>{" "}
        The API is up but Supabase is failing on Railway. In your Railway
        service variables, set{" "}
        <code className="text-amber-200">SUPABASE_URL</code> and{" "}
        <code className="text-amber-200">SUPABASE_SERVICE_ROLE_KEY</code> from
        the Supabase dashboard (Project Settings → API). If the project was
        paused, restore it first.
        {status.message && (
          <p className="mt-2 text-xs text-amber-200/80">{status.message}</p>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      <strong className="font-semibold">Cannot reach the API.</strong>{" "}
      {status.message ||
        "Check that the frontend is deployed with the latest build (API proxy enabled)."}
    </div>
  );
}
