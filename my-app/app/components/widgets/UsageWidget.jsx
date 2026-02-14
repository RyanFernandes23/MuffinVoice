"use client";

import { useUsage } from "@/hooks/useUsage";

export function UsageWidget({ getToken }) {
  const { usage, loading, getUsageColor, getUsageBgColor, formatNumber } =
    useUsage(getToken);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="w-24 h-2 bg-gray-700 rounded animate-pulse"></div>
      </div>
    );
  }

  const isLow = usage.percent_used >= 80;
  const isMedium = usage.percent_used >= 50 && usage.percent_used < 80;

  return (
    <div
      className={`
        flex items-center gap-3 px-3 py-1.5 rounded-lg
        bg-gray-800/50 border border-gray-700/50
        ${isLow ? "border-red-500/30" : ""}
        ${isMedium ? "border-yellow-500/30" : ""}
      `}
      title={`${usage.remaining.toLocaleString()} / ${usage.allocated.toLocaleString()} tokens remaining`}
    >
      <div className="flex flex-col min-w-[100px]">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Tokens</span>
          <span className={getUsageColor()}>{usage.percent_used}% used</span>
        </div>

        <div className="flex items-baseline gap-1">
          <span className={`text-sm font-bold ${getUsageColor()}`}>
            {formatNumber(usage.remaining)}
          </span>
          <span className="text-xs text-gray-500">
            / {formatNumber(usage.allocated)}
          </span>
        </div>
      </div>

      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${getUsageBgColor()}`}
          style={{ width: `${Math.min(usage.percent_used, 100)}%` }}
        />
      </div>
    </div>
  );
}
