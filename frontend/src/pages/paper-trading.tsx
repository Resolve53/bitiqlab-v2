import { useRouter } from "next/router";

export default function PaperTrading() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.back()}
            className="text-emerald-400 hover:text-emerald-300 mb-4 font-semibold transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-4xl font-bold text-white">Paper Trading</h1>
          <p className="mt-2 text-slate-400">Test strategies on Binance testnet</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Active Trading</h2>
            <p className="text-slate-400 mb-4">No active paper trading sessions</p>
            <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors">
              Start New Session
            </button>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Recent Sessions</h2>
            <p className="text-slate-400">No past sessions yet</p>
          </div>
        </div>
      </main>
    </div>
  );
}
