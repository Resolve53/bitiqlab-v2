/**
 * Rankings View Component
 * Shows strategies ranked by different metrics
 */

interface StrategyMetrics {
  strategy_id: string;
  name: string;
  symbol: string;
  metrics: {
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_return: number;
  };
}

interface RankingsViewProps {
  strategies: StrategyMetrics[];
}

export default function RankingsView({ strategies }: RankingsViewProps) {
  if (strategies.length === 0) {
    return null;
  }

  const getRanking = (
    strategies: StrategyMetrics[],
    getValue: (s: StrategyMetrics) => number,
    ascending: boolean = false
  ) => {
    return [...strategies]
      .sort((a, b) => {
        const valA = getValue(a);
        const valB = getValue(b);
        return ascending ? valA - valB : valB - valA;
      })
      .map((s, index) => ({ ...s, rank: index + 1 }));
  };

  const rankingCard = (title: string, rankings: any[], metricKey: string) => (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h4 className="font-bold text-white text-sm mb-3">{title}</h4>
      <div className="space-y-2">
        {rankings.slice(0, 3).map((strategy, index) => (
          <div
            key={strategy.strategy_id}
            className={`flex items-center gap-3 p-2 rounded ${
              index === 0
                ? "bg-emerald-900/30 border border-emerald-600/50"
                : index === 1
                ? "bg-blue-900/20 border border-blue-600/30"
                : "bg-slate-700/30 border border-slate-600/30"
            }`}
          >
            <span
              className={`font-bold text-sm w-6 h-6 flex items-center justify-center rounded-full ${
                index === 0
                  ? "bg-emerald-500 text-white"
                  : index === 1
                  ? "bg-blue-500 text-white"
                  : "bg-slate-600 text-white"
              }`}
            >
              {index + 1}
            </span>
            <div className="flex-1">
              <p className="font-semibold text-white text-sm">{strategy.name}</p>
              <p className="text-xs text-slate-400">{strategy.symbol}</p>
            </div>
            <p className="font-bold text-emerald-400 text-sm">
              {(strategy.metrics as any)[metricKey].toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  const returnRankings = getRanking(strategies, (s) => s.metrics.total_return);
  const sharpeRankings = getRanking(strategies, (s) => s.metrics.sharpe_ratio);
  const winRateRankings = getRanking(strategies, (s) => s.metrics.win_rate);
  const drawdownRankings = getRanking(strategies, (s) => s.metrics.max_drawdown, true);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-white">🏆 Strategy Rankings</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rankingCard("📈 Best Returns", returnRankings, "total_return")}
        {rankingCard("📊 Best Sharpe Ratio", sharpeRankings, "sharpe_ratio")}
        {rankingCard("🎯 Best Win Rate", winRateRankings, "win_rate")}
        {rankingCard("🛡️ Lowest Drawdown", drawdownRankings, "max_drawdown")}
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 text-sm text-slate-300">
        <p className="mb-2">
          <strong>💡 How to read rankings:</strong>
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>
            <strong>Total Return:</strong> Overall profitability (higher is better)
          </li>
          <li>
            <strong>Sharpe Ratio:</strong> Risk-adjusted returns (higher is better)
          </li>
          <li>
            <strong>Win Rate:</strong> Percentage of winning trades (higher is better)
          </li>
          <li>
            <strong>Lowest Drawdown:</strong> Least peak-to-trough decline (lower is better)
          </li>
        </ul>
      </div>
    </div>
  );
}
