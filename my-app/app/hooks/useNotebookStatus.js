'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

/**
 * Custom hook for notebook status with job-specific polling
 * Polls only active notebooks (queued/processing)
 * @param {string} userId - User ID
 * @param {function} getToken - Function to get auth token
 * @returns {Object} { notebooks, activeNotebooks, loading, connectionStatus, refresh }
 */
export function useNotebookStatus(userId, getToken) {
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebooks, setActiveNotebooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'polling' | 'disconnected'

  const pollingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const POLLING_INTERVAL = 3000; // 3 seconds (was 5s) for more responsive progress bars

  /**
   * Fetch all notebooks with retry logic for auth race conditions
   */
  const fetchAllNotebooks = useCallback(async (attempts = 3) => {
    if (!userId || !getToken) return [];

    for (let i = 0; i < attempts; i++) {
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/notebooks`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return data;
        }

        if ((response.status === 401 || response.status === 403) && i < attempts - 1) {
          console.log(`Fetch failed (${response.status}), retrying... attempt ${i + 1}/${attempts}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Incremental backoff
          continue;
        }

        return [];
      } catch (error) {
        console.error('Error fetching notebooks:', error);
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          continue;
        }
        return [];
      }
    }
  }, [userId, getToken]);

  /**
   * Start polling mode specifically for active jobs
   */
  const startPolling = useCallback(async () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setConnectionStatus('polling');
    setLoading(false);

    // Initial fetch
    const allNotebooks = await fetchAllNotebooks();
    setNotebooks(allNotebooks);

    let active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
    setActiveNotebooks(active);

    if (active.length === 0) {
      setConnectionStatus('disconnected');
      return;
    }

    // Start polling interval for specific jobs
    pollingIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) return;

      if (active.length === 0) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setConnectionStatus('disconnected');
        return;
      }

      try {
        const token = await getToken();
        const activeJobIds = active.map(nb => nb.job_id);
        const response = await fetch(`${API_BASE_URL}/api/check_job_statuses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ job_ids: activeJobIds })
        });

        if (response.ok) {
          const data = await response.json();
          const updatedNotebooks = data.notebooks || [];

          if (updatedNotebooks.length > 0) {
            setNotebooks(prev => {
              const prevMap = new Map(prev.map(nb => [nb.job_id, nb]));
              updatedNotebooks.forEach(nb => prevMap.set(nb.job_id, nb));
              // Ensure we sort them so UI does not jump around
              return Array.from(prevMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            });

            active = updatedNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
            setActiveNotebooks(active);
          }
        }
      } catch (err) {
        console.error('Error polling active jobs:', err);
      }
    }, POLLING_INTERVAL);
  }, [fetchAllNotebooks, getToken]);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    const allNotebooks = await fetchAllNotebooks(3);
    setNotebooks(allNotebooks);

    const active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
    setActiveNotebooks(active);
    setLoading(false);

    if (active.length > 0) {
      startPolling();
    }
  }, [fetchAllNotebooks, startPolling]);

  /**
   * Initial load
   */
  useEffect(() => {
    isMountedRef.current = true;

    if (!userId) {
      return;
    }

    const init = async () => {
      // Check and clean up any stale jobs before fetching lists
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/cleanup_stale_jobs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.cleaned > 0) {
            console.log(`Auto-cleaned ${data.cleaned} stale notebook(s).`);
          }
        }
      } catch (err) {
        console.error('Failed to auto-clean stale notebooks:', err);
      }

      // Initial fetch to get all notebooks - this now includes 3 retry attempts
      const allNotebooks = await fetchAllNotebooks(3);
      setNotebooks(allNotebooks);

      const active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
      setActiveNotebooks(active);

      // We should always clear loading state now that we've tried (and possibly retried)
      setLoading(false);

      if (active.length > 0) {
        startPolling();
      } else {
        // No active notebooks, do not poll
        setLoading(false);
        setConnectionStatus('disconnected');
      }
    };

    init();

    // Cleanup
    return () => {
      isMountedRef.current = false;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, getToken]);

  return {
    notebooks,
    activeNotebooks,
    loading,
    connectionStatus,
    refresh,
  };
}
