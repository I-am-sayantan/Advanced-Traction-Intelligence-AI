import React from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { motion } from "framer-motion";
import type { Metrics } from "../types";

const CHART_COLORS = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color: string }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p
          key={i}
          className="text-sm font-mono font-medium"
          style={{ color: p.color }}
        >
          {p.name}:{" "}
          {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

interface TrendChartProps {
  metrics: Metrics | null | undefined;
}

export default function TrendChart({ metrics }: TrendChartProps) {
  if (!metrics?.trends || Object.keys(metrics.trends).length === 0) {
    return (
      <div
        className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
        data-testid="trend-chart-empty"
      >
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-4">
          Metric Trends
        </h3>
        <div className="h-60 flex items-center justify-center">
          <p className="text-sm text-slate-400">No trend data available</p>
        </div>
      </div>
    );
  }

  const trendKeys = Object.keys(metrics.trends).slice(0, 5);
  const maxLen = Math.max(...trendKeys.map((k) => metrics.trends[k].length));
  const chartData: Record<string, unknown>[] = [];
  for (let i = 0; i < maxLen; i++) {
    const row: Record<string, unknown> = { period: `P${i + 1}` };
    trendKeys.forEach((k) => {
      row[k] = metrics.trends[k][i] ?? null;
    });
    chartData.push(row);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
      data-testid="trend-chart"
    >
      <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-4">
        Metric Trends
      </h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <defs>
              {trendKeys.map((key, i) => (
                <linearGradient
                  key={key}
                  id={`gradient-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                    stopOpacity={0.15}
                  />
                  <stop
                    offset="100%"
                    stopColor={CHART_COLORS[i % CHART_COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E5E7EB"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            {trendKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                fill={`url(#gradient-${i})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-4 mt-4">
        {trendKeys.map((key, i) => (
          <div
            key={key}
            className="flex items-center gap-2"
            data-testid={`trend-legend-${key}`}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-xs text-slate-500 font-mono">{key}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
