/**
 * Equity Curve Chart Component
 * Displays portfolio value over time using recharts
 */

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface EquityCurveData {
  timestamp: string;
  value: number;
}

interface EquityCurveChartProps {
  data: EquityCurveData[];
  loading?: boolean;
}

export default function EquityCurveChart({ data, loading }: EquityCurveChartProps) {
  if (loading) {
    return (
      <div className="w-full h-80 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center">
        <p className="text-slate-400">Loading chart...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-80 bg-slate-800/50 border border-slate-700 rounded-lg flex items-center justify-center">
        <p className="text-slate-400">No data available</p>
      </div>
    );
  }

  const minValue = Math.min(...data.map((d) => d.value));
  const maxValue = Math.max(...data.map((d) => d.value));
  const returnPercent = ((maxValue - minValue) / minValue) * 100;

  return (
    <div className="w-full">
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-bold text-white mb-2">📊 Portfolio Value Over Time</h3>
          <p className="text-sm text-slate-400">
            Starting Capital: ${minValue.toFixed(2)} → Current: ${maxValue.toFixed(2)} ({returnPercent > 0 ? "+" : ""}{returnPercent.toFixed(2)}%)
          </p>
        </div>

        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="timestamp"
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                tick={{ fill: "#94a3b8" }}
              />
              <YAxis
                stroke="#94a3b8"
                style={{ fontSize: "12px" }}
                tick={{ fill: "#94a3b8" }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #475569",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={(value: any) => [`$${value.toFixed(2)}`, "Portfolio"]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
