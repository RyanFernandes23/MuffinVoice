import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';

export function usePlan() {
  const { isSignedIn, getToken } = useAuth();
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPlan = useCallback(async () => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch('http://localhost:8000/api/subscription/plan', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch plan data');
      }

      const data = await response.json();
      setPlanData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching plan:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  return {
    planData,
    loading,
    error,
    refetch: fetchPlan,
  };
}
