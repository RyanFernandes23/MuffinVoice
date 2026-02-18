"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Default usage state - represents unknown/loading state
const DEFAULT_USAGE = {
  remaining: 0,
  allocated: 0,
  used_this_month: 0,
  percent_used: 0,
  plan_name: null, // null indicates not loaded yet
  max_file_size_mb: 50,
};

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

export function useUsage(getToken) {
  const [usage, setUsage] = useState(DEFAULT_USAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const retryCountRef = useRef(0);
  const isFetchingRef = useRef(false);

  const fetchUsage = useCallback(async (isRetry = false) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }

    if (!getToken) {
      setLoading(false);
      return;
    }

    try {
      isFetchingRef.current = true;

      // Only set loading true on initial fetch, not retries
      if (!isRetry) {
        setLoading(true);
      }
      setError(null);

      // Wait for token to be available with a small delay if needed
      let token = await getToken();

      // If token is not available immediately, wait briefly and retry
      if (!token) {
        await new Promise(resolve => setTimeout(resolve, 500));
        token = await getToken();
      }

      if (!token) {
        throw new Error("Authentication token not available");
      }

      const response = await fetch("/api/usage", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Check if we should retry (403 might be a timing issue with auth)
        if (response.status === 403 && retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          const delay = RETRY_DELAYS[retryCountRef.current - 1];
          console.log(`Retrying usage fetch (attempt ${retryCountRef.current}/${MAX_RETRIES}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          isFetchingRef.current = false;
          return fetchUsage(true);
        }

        throw new Error(errorData.detail || `Failed to fetch usage: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        setUsage(data.data);
        retryCountRef.current = 0; // Reset retry count on success
      }
    } catch (err) {
      console.error("Error fetching usage:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
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
