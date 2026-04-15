import { useRouter } from "next/router";

export default function PaperTrading() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-500 hover:text-blue-700 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Paper Trading</h1>
          <p className="mt-2 text-gray-600">Test strategies on Binance testnet</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Active Trading</h2>
            <p className="text-gray-600 mb-4">No active paper trading sessions</p>
            <button className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600">
              Start New Session
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Sessions</h2>
            <p className="text-gray-600">No past sessions yet</p>
          </div>
        </div>
      </main>
    </div>
  );
}
