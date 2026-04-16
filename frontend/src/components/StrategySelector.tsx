/**
 * Strategy Selector Component
 * Allows users to select multiple strategies for comparison
 */

interface StrategySelectorProps {
  allStrategies: Array<{
    id: string;
    name: string;
    symbol: string;
    timeframe: string;
  }>;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  disabled?: boolean;
}

export default function StrategySelector({
  allStrategies,
  selectedIds,
  onSelectionChange,
  disabled = false,
}: StrategySelectorProps) {
  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      if (selectedIds.length < 5) {
        onSelectionChange([...selectedIds, id]);
      }
    }
  };

  const handleRemove = (id: string) => {
    onSelectionChange(selectedIds.filter((sid) => sid !== id));
  };

  const selected = allStrategies.filter((s) => selectedIds.includes(s.id));
  const unselected = allStrategies.filter((s) => !selectedIds.includes(s.id));

  return (
    <div className="space-y-4">
      {/* Selected Strategies Pills */}
      {selected.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-300">Selected Strategies ({selected.length})</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((strategy) => (
              <div
                key={strategy.id}
                className="bg-emerald-900/50 border border-emerald-600 text-emerald-300 px-4 py-2 rounded-full flex items-center gap-2 text-sm"
              >
                <span>
                  {strategy.name} <span className="text-xs text-emerald-400">({strategy.symbol})</span>
                </span>
                <button
                  onClick={() => handleRemove(strategy.id)}
                  className="text-emerald-400 hover:text-emerald-200 font-bold"
                  disabled={disabled}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Strategies Dropdown */}
      {unselected.length > 0 && selectedIds.length < 5 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-300">Add More Strategies</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {unselected.map((strategy) => (
              <button
                key={strategy.id}
                onClick={() => handleToggle(strategy.id)}
                disabled={disabled}
                className="bg-slate-700/50 border border-slate-600 hover:border-emerald-500/50 text-white px-4 py-2 rounded-lg transition text-sm text-left"
              >
                <span className="font-semibold">{strategy.name}</span>
                <span className="text-slate-400 text-xs ml-2">
                  {strategy.symbol} • {strategy.timeframe}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full List Message */}
      {selectedIds.length >= 5 && (
        <div className="bg-slate-800/50 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm">
          📋 Maximum 5 strategies selected (remove one to add another)
        </div>
      )}

      {/* Empty State */}
      {selected.length === 0 && (
        <div className="bg-slate-800/30 border border-slate-700/50 text-slate-400 px-4 py-3 rounded-lg text-sm text-center">
          💡 Select 2-5 strategies to compare
        </div>
      )}
    </div>
  );
}
