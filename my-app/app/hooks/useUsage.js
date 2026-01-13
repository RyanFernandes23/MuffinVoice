import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';

export function useUsage() {
  const { isSignedIn, getToken } = useAuth();
  const [usageData, setUsageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Environment variable (same as pricing page)
  const API_BASE_URL = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
    : 'http://localhost:8000';

  const fetchUsage = useCallback(async () => {
    if (!isSignedIn) {
      setUsageData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken(); // Match pricing page
      
      // Use /status endpoint from your backend (returns plan + usage data)
      const response = await fetch(`${API_BASE_URL}/api/subscription/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to fetch usage data');
      }

      const data = await response.json();
      
      // Normalize data for consistent frontend usage
      const normalizedData = {
        plan_id: data.plan_id,
        plan_name: data.plan_name,
        status: data.status,
        monthly_char_limit: data.monthly_char_limit,
        monthly_char_used: data.monthly_char_used || 0,
        percentage: Math.round((data.monthly_char_used / data.monthly_char_limit) * 100),
        current_period_end: data.current_period_end,
        remaining_chars: Math.max(0, data.monthly_char_limit - (data.monthly_char_used || 0)),
        is_free: data.plan_id === 'explorer',
        is_active: data.status === 'active',
      };

      setUsageData(normalizedData);
      setError(null);
    } catch (err) {
      console.error('Error fetching usage:', err);
      setError(err.message);
      setUsageData(null);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken, API_BASE_URL]);

  // Auto-fetch on mount and when signed in status changes
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Refetch function for manual refresh (progress bars, etc.)
  const refetch = useCallback(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Computed values for easy consumption
  const percentage = usageData 
    ? Math.min(100, Math.round((usageData.monthly_char_used / usageData.monthly_char_limit) * 100))
    : 0;

  const progressColor = usageData 
    ? percentage > 90 ? 'bg-red-500' 
    : percentage > 75 ? 'bg-yellow-500' 
    : 'bg-emerald-500'
    : 'bg-slate-700';

  const isNearLimit = percentage >= 90;
  const daysRemaining = usageData?.current_period_end 
    ? Math.max(0, Math.floor((new Date(usageData.current_period_end) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    usageData,
    loading,
    error,
    refetch,
    percentage,
    progressColor,
    isNearLimit,
    daysRemaining,
    remainingChars: usageData?.remaining_chars || 0,
    isFreePlan: usageData?.is_free || true,
    isActive: usageData?.is_active || false,
  };
}
