import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';

export function useUsage() {
  const { isSignedIn, getToken } = useAuth();
  const [usageData, setUsageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsage = useCallback(async () => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch('http://localhost:8000/api/subscription/usage', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch usage data');
      }

      const data = await response.json();
      setUsageData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching usage:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const percentage = usageData 
    ? Math.round((usageData.monthly_char_used / usageData.monthly_char_limit) * 100)
    : 0;

  return {
    usageData,
    loading,
    error,
    refetch: fetchUsage,
    percentage,
  };
}
