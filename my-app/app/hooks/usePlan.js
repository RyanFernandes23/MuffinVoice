import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';

export function usePlan() {
  const { isSignedIn, getToken } = useAuth();
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Environment variable - SSR safe
  const API_BASE_URL = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
    : 'http://localhost:8000';

  const fetchPlan = useCallback(async () => {
    if (!isSignedIn) {
      // Set default explorer plan for unsigned-in users
      setPlanData({
        plan_id: 'explorer',
        plan_name: 'Explorer',
        status: 'free',
        monthly_char_limit: 500,
        monthly_char_used: 0,
        percentage: 0,
      });
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken(); // Production Clerk template
      
      const response = await fetch(`${API_BASE_URL}/api/subscription/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to fetch plan data');
      }

      const data = await response.json();
      
      // Enhanced data with computed values (same structure as useUsage)
      const enhancedData = {
        ...data,
        // Computed values for convenience
        percentage: Math.min(100, Math.round((data.monthly_char_used / data.monthly_char_limit) * 100)),
        remaining_chars: Math.max(0, data.monthly_char_limit - (data.monthly_char_used || 0)),
        is_free: data.plan_id === 'explorer',
        is_active: data.status === 'active',
        is_near_limit: Math.round((data.monthly_char_used / data.monthly_char_limit) * 100) >= 90,
        days_remaining: data.current_period_end 
          ? Math.max(0, Math.floor((new Date(data.current_period_end) - new Date()) / (1000 * 60 * 60 * 24)))
          : null,
      };

      setPlanData(enhancedData);
      setError(null);
    } catch (err) {
      console.error('Error fetching plan:', err);
      
      // Graceful fallback to explorer plan on error
      setPlanData({
        plan_id: 'explorer',
        plan_name: 'Explorer',
        status: 'free',
        monthly_char_limit: 500,
        monthly_char_used: 0,
        percentage: 0,
        error: true,
      });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken, API_BASE_URL]);

  // Auto-fetch when dependencies change
  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  // Manual refetch with optimistic loading
  const refetch = useCallback(() => {
    console.log('Manually refetching plan data...');
    fetchPlan();
  }, [fetchPlan]);

  return {
    planData,
    loading,
    error,
    refetch,
    // Quick accessors for common checks
    isFreePlan: planData?.is_free || true,
    isActivePlan: planData?.is_active || false,
    usagePercentage: planData?.percentage || 0,
    remainingChars: planData?.remaining_chars || 500,
    isNearLimit: planData?.is_near_limit || false,
  };
}
