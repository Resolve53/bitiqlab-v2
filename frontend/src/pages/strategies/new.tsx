import { useRouter } from "next/router";

export default function NewStrategy() {
  const router = useRouter();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement strategy creation
    alert("Strategy creation coming soon!");
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Create New Strategy</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleCreate} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Strategy Name
              </label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="e.g., RSI Mean Reversion"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Symbol
              </label>
              <input
                type="text"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="e.g., BTCUSDT"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Timeframe
              </label>
              <select className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
                <option>1h</option>
                <option>4h</option>
                <option>1d</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
            >
              Create Strategy
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
