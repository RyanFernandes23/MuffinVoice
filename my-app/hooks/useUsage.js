"use client";

import { useState, useEffect, useCallback } from "react";

export function useUsage(getToken) {
  const [usage, setUsage] = useState({
    remaining: 0,
    allocated: 0,
    percent_used: 0,
    plan_name: "explorer",
    max_file_size_mb: 50,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsage = useCallback(async () => {
    if (!getToken) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      const response = await fetch("/api/usage", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch usage");
      }

      const data = await response.json();
      if (data.success) {
        setUsage(data.data);
      }
    } catch (err) {
      console.error("Error fetching usage:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Helper to determine color based on percentage
  const getUsageColor = () => {
    if (usage.percent_used >= 80) return "text-red-500";
    if (usage.percent_used >= 50) return "text-yellow-500";
    return "text-green-500";
  };

  const getUsageBgColor = () => {
    if (usage.percent_used >= 80) return "bg-red-500";
    if (usage.percent_used >= 50) return "bg-yellow-500";
    return "bg-green-500";
  };

  // Format numbers for display (e.g., 400000 -> 400K)
  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  return {
    usage,
    loading,
    error,
    refresh: fetchUsage,
    getUsageColor,
    getUsageBgColor,
    formatNumber,
  };
}
