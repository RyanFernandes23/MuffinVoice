'use client';

import { useUsage } from '../hooks/useUsage';

export default function UsageProgress() {
  const { usageData, loading, error, percentage } = useUsage();

  if (loading) {
    return (
      <div className="flex items-center space-x-2 bg-gray-800 rounded-full px-3 py-1">
        <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-xs text-gray-400">Loading...</span>
      </div>
    );
  }

  if (error || !usageData) {
    return null;
  }

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'k';
    }
    return num.toString();
  };

  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getPlanColor = () => {
    switch (usageData.plan_name) {
      case 'Professional':
        return 'text-purple-400';
      case 'Creator':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="flex items-center space-x-3 bg-gray-900 rounded-lg px-3 py-2 min-w-[200px]">
      <div className="flex flex-col flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-xs font-semibold ${getPlanColor()}`}>
            {usageData.plan_name}
          </span>
          <span className="text-xs text-gray-400">
            {formatNumber(usageData.monthly_char_used)} / {formatNumber(usageData.monthly_char_limit)}
          </span>
        </div>
        
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-500">
            {percentage}% used
          </span>
        </div>
      </div>
    </div>
  );
}
