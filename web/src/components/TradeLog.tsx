import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time: string;
  pnl_percent: number;
  pnl_absolute: number;
  quantity: number;
  duration_minutes?: number;
}

interface TradeLogProps {
  sessionId: string;
}

export const TradeLog: React.FC<TradeLogProps> = ({ sessionId }) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    symbol: '',
    side: '' as '' | 'BUY' | 'SELL',
    profitableOnly: false,
  });
  const [sortBy, setSortBy] = useState<'entry_time' | 'pnl' | 'duration'>('entry_time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchTrades();
  }, [sessionId, filters, sortBy, sortOrder]);

  const fetchTrades = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        sort_by: sortBy,
        sort_order: sortOrder,
        limit: '100',
      });

      if (filters.symbol) params.append('symbol', filters.symbol);
      if (filters.side) params.append('side', filters.side);
      if (filters.profitableOnly) params.append('profitable_only', 'true');

      const response = await fetch(
        `/api/paper-trading/${sessionId}/trades?${params.toString()}`
      );

      if (!response.ok) throw new Error('Failed to fetch trades');

      const data = await response.json();
      setTrades(data.trades || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;
  const formatPercent = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
  const formatTime = (time: string) => new Date(time).toLocaleString();

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Trade Log</h2>

      {/* Filters */}
      <div className="flex gap-4 p-4 bg-gray-50 rounded-lg">
        <input
          type="text"
          placeholder="Filter by symbol..."
          value={filters.symbol}
          onChange={(e) => setFilters({ ...filters, symbol: e.target.value })}
          className="px-3 py-2 border rounded"
        />
        <select
          value={filters.side}
          onChange={(e) => setFilters({ ...filters, side: e.target.value as '' | 'BUY' | 'SELL' })}
          className="px-3 py-2 border rounded"
        >
          <option value="">All Sides</option>
          <option value="BUY">Buys</option>
          <option value="SELL">Sells</option>
        </select>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.profitableOnly}
            onChange={(e) => setFilters({ ...filters, profitableOnly: e.target.checked })}
            className="w-4 h-4"
          />
          Profitable Only
        </label>
      </div>

      {/* Sort Controls */}
      <div className="flex gap-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border rounded"
        >
          <option value="entry_time">Sort by Entry Time</option>
          <option value="pnl">Sort by P&L</option>
          <option value="duration">Sort by Duration</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="px-3 py-2 border rounded hover:bg-gray-100"
        >
          {sortOrder === 'asc' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* Trade Table */}
      {loading ? (
        <div className="text-center py-8">Loading trades...</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded p-4 text-red-700">{error}</div>
      ) : trades.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No trades found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">Symbol</th>
                <th className="border p-2 text-left">Side</th>
                <th className="border p-2 text-right">Entry</th>
                <th className="border p-2 text-right">Exit</th>
                <th className="border p-2 text-right">P&L</th>
                <th className="border p-2 text-right">P&L %</th>
                <th className="border p-2 text-right">Duration</th>
                <th className="border p-2 text-left">Entry Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className={trade.pnl_percent > 0 ? 'bg-green-50' : trade.pnl_percent < 0 ? 'bg-red-50' : 'bg-white'}
                >
                  <td className="border p-2 font-mono">{trade.symbol}</td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded text-white text-sm font-semibold ${
                        trade.side === 'BUY' ? 'bg-blue-600' : 'bg-red-600'
                      }`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="border p-2 text-right font-mono">{formatPrice(trade.entry_price)}</td>
                  <td className="border p-2 text-right font-mono">{formatPrice(trade.exit_price)}</td>
                  <td className="border p-2 text-right font-mono">
                    <span className={trade.pnl_absolute > 0 ? 'text-green-600' : 'text-red-600'}>
                      ${trade.pnl_absolute.toFixed(2)}
                    </span>
                  </td>
                  <td className="border p-2 text-right">
                    <span className={`flex items-center justify-end gap-1 font-semibold ${
                      trade.pnl_percent > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {trade.pnl_percent > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {formatPercent(trade.pnl_percent)}
                    </span>
                  </td>
                  <td className="border p-2 text-right text-sm">{Math.round(trade.duration_minutes || 0)}m</td>
                  <td className="border p-2 text-sm">{formatTime(trade.entry_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-sm text-gray-600">
        Showing {trades.length} trades
      </div>
    </div>
  );
};
