import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import {
  sessionStorageManager,
  type SessionSettings,
} from "@/lib/sessionStorage";

interface PastSession {
  session_id: string;
  strategy_name: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  created_at: number;
  last_updated: number;
  status: string;
}

interface SessionRecoveryProps {
  onSessionSelect?: (sessionId: string) => void;
}

export default function SessionRecovery({ onSessionSelect }: SessionRecoveryProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<PastSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadSavedSessions();
  }, []);

  const loadSavedSessions = () => {
    try {
      const savedSessions = sessionStorageManager.getActiveSessions();
      setSessions(
        savedSessions.map((s) => ({
          session_id: s.session_id,
          strategy_name: s.strategy_id,
          symbol: s.symbol,
          timeframe: s.timeframe,
          initial_balance: s.initial_balance,
          created_at: s.created_at,
          last_updated: s.last_updated,
          status: "active",
        }))
      );
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  };

  const handleResumeSession = async (session_id: string) => {
    setLoading(true);
    try {
      // Verify session still exists on backend
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await axios.get(
        `${apiUrl}/api/paper-trading/${session_id}/status`
      );

      if (response.data.data) {
        if (onSessionSelect) {
          onSessionSelect(session_id);
        } else {
          router.push(`/paper-trading/${session_id}/dashboard`);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to resume session"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSession = (session_id: string) => {
    sessionStorageManager.removeSession(session_id);
    setSessions(sessions.filter((s) => s.session_id !== session_id));
  };

  if (!sessions.length) {
    return null;
  }

  const recentSessions = showAll ? sessions : sessions.slice(0, 3);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">📋</span>
        <h3 className="text-lg font-semibold text-white">Resume Previous Sessions</h3>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {recentSessions.map((session) => (
          <div
            key={session.session_id}
            className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded p-4 hover:bg-slate-800 transition"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-green-400">●</span>
                <p className="font-semibold text-white">{session.symbol}</p>
                <span className="text-slate-500">{session.timeframe}</span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                Initial: ${session.initial_balance.toLocaleString()} •{" "}
                {new Date(session.last_updated).toLocaleDateString()}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleResumeSession(session.session_id)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-4 py-2 rounded text-sm font-semibold transition"
              >
                {loading ? "Loading..." : "Resume"}
              </button>
              <button
                onClick={() => handleRemoveSession(session.session_id)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-2 rounded text-sm transition"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {sessions.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-4 w-full text-slate-400 hover:text-white text-sm py-2 transition"
        >
          Show {sessions.length - 3} more sessions
        </button>
      )}

      {showAll && sessions.length > 3 && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-4 w-full text-slate-400 hover:text-white text-sm py-2 transition"
        >
          Show less
        </button>
      )}
    </div>
  );
}
