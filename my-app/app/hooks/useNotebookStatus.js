'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

/**
 * Custom hook for notebook status with SSE and polling fallback
 * Streams only active notebooks (queued/processing)
 * Auto-reconnects when new active notebooks detected
 * @param {string} userId - User ID
 * @param {function} getToken - Function to get auth token
 * @returns {Object} { notebooks, activeNotebooks, loading, connectionStatus, refresh }
 */
export function useNotebookStatus(userId, getToken) {
  const [notebooks, setNotebooks] = useState([]);
  const [activeNotebooks, setActiveNotebooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'sse' | 'polling' | 'disconnected'

  const readerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const POLLING_INTERVAL = 5000; // 5 seconds

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
   * Check if there are active notebooks (queued/processing)
   */
  const hasActiveNotebooks = useCallback((notebookList) => {
    return notebookList.some(nb => nb.status === 'queued' || nb.status === 'processing');
  }, []);

  /**
   * Start polling mode
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

    const active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
    setActiveNotebooks(active);

    if (active.length === 0) {
      setConnectionStatus('disconnected');
      return;
    }

    // Start polling interval
    pollingIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) return;

      const currentNotebooks = await fetchAllNotebooks();
      setNotebooks(currentNotebooks);

      const currentActive = currentNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
      setActiveNotebooks(currentActive);

      if (currentActive.length === 0) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setConnectionStatus('disconnected');
        return;
      }

      // If active notebooks detected, try to switch to SSE
      if (hasActiveNotebooks(currentNotebooks)) {
        // Just let it continue polling as fallback or wait it out. 
        // Previously it called connectSSE() but that causes dependency cycles and stale closures.
        // It's safer to just poll until complete since startPolling is the fallback anyway.
      }
    }, POLLING_INTERVAL);
  }, [fetchAllNotebooks, hasActiveNotebooks]);

  /**
   * Connect to SSE endpoint
   */
  const connectSSE = useCallback(async () => {
    if (!userId || !getToken) return;

    // Clean up any existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }

    try {
      const token = await getToken();

      setConnectionStatus('sse');

      const response = await fetch(
        `${API_BASE_URL}/api/notebook_status_stream/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();

      setLoading(false);

      // Read stream
      let buffer = '';

      while (isMountedRef.current) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('Notebook SSE stream closed by server');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);

            // Skip heartbeat
            if (dataStr === ':heartbeat') continue;

            try {
              const data = JSON.parse(dataStr);

              if (data.error) {
                console.error('Notebook SSE error:', data.message);
                continue;
              }

              // Handle different event types
              switch (data.type) {
                case 'active_notebooks':
                case 'status_update':
                  // Merge active notebooks with existing list
                  setActiveNotebooks(data.notebooks || []);
                  setNotebooks(prev => {
                    const activeMap = new Map((data.notebooks || []).map(nb => [nb.job_id, nb]));
                    return prev.map(nb => activeMap.get(nb.job_id) || nb);
                  });
                  break;

                case 'all_complete':
                  // All notebooks complete, close SSE and stop polling
                  setActiveNotebooks([]);
                  // Fetch full list to get completed notebooks
                  const allNotebooks = await fetchAllNotebooks();
                  setNotebooks(allNotebooks);
                  // Close connection and set status to disconnected
                  reader.cancel();
                  setConnectionStatus('disconnected');
                  return;

                default:
                  console.log('Unknown SSE event type:', data.type);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Notebook SSE connection aborted');
      } else {
        console.error('Failed to connect notebook SSE:', error);
        // Fall back to polling
        startPolling();
      }
    }
  }, [userId, getToken, fetchAllNotebooks, startPolling]);

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    const allNotebooks = await fetchAllNotebooks(3);
    setNotebooks(allNotebooks);

    const active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
    setActiveNotebooks(active);
    setLoading(false);

    // If active notebooks exist, try to open SSE
    if (hasActiveNotebooks(allNotebooks)) {
      connectSSE();
    }
  }, [fetchAllNotebooks, hasActiveNotebooks, connectSSE]);

  /**
   * Initial load and SSE connection
   */
  useEffect(() => {
    isMountedRef.current = true;

    if (!userId) {
      // Don't set disconnected yet, auth might just be loading
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

      // If there are active notebooks, use Polling
      if (hasActiveNotebooks(allNotebooks)) {
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

      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
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
