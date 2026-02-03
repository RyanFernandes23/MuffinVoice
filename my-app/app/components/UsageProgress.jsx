'use client';

import { useUsage } from '../hooks/useUsage';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, AlertTriangle } from 'lucide-react'; // Import AlertTriangle

export default function UsageProgress() {
  const { usageData, loading, error, percentage, isNearLimit } = useUsage(); // Destructure isNearLimit

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

  return (
    <div className="flex flex-col gap-2 w-52 p-4 glass-card rounded-xl border border-white/10">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-300">
            Used: {formatNumber(usageData.monthly_char_used)} / {formatNumber(usageData.monthly_char_limit)}
          </span>
          <span className="text-sm font-bold text-white flex items-center gap-1">
            {isNearLimit && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
            {percentage}%
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percentage, 100)}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`h-2 rounded-full ${getProgressColor()}`}
          />
        </div>
        {isNearLimit && (
          <p className="text-xs text-yellow-400 mt-1">
            You are near your usage limit!
          </p>
        )}
    </div>
  );
}

