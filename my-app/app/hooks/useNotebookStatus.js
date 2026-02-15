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
   * Fetch all notebooks via polling (fallback)
   */
  const fetchAllNotebooks = useCallback(async () => {
    if (!userId || !getToken) return [];

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
      return [];
    } catch (error) {
      console.error('Error fetching notebooks:', error);
      return [];
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

    // Start polling interval
    pollingIntervalRef.current = setInterval(async () => {
      if (!isMountedRef.current) return;

      const allNotebooks = await fetchAllNotebooks();
      setNotebooks(allNotebooks);
      
      const active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
      setActiveNotebooks(active);

      // If active notebooks detected, try to switch to SSE
      if (hasActiveNotebooks(allNotebooks) && connectionStatus === 'polling') {
        connectSSE();
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
                  // All notebooks complete, close SSE and return to polling
                  setActiveNotebooks([]);
                  // Fetch full list to get completed notebooks
                  const allNotebooks = await fetchAllNotebooks();
                  setNotebooks(allNotebooks);
                  // Close connection and return to polling
                  reader.cancel();
                  setConnectionStatus('polling');
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
    setLoading(true);
    const allNotebooks = await fetchAllNotebooks();
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

    if (!userId || !getToken) {
      setConnectionStatus('disconnected');
      setLoading(false);
      return;
    }

    const init = async () => {
      // Initial fetch to get all notebooks
      const allNotebooks = await fetchAllNotebooks();
      setNotebooks(allNotebooks);
      
      const active = allNotebooks.filter(nb => nb.status === 'queued' || nb.status === 'processing');
      setActiveNotebooks(active);

      // If there are active notebooks, use SSE
      if (hasActiveNotebooks(allNotebooks)) {
        connectSSE();
      } else {
        // No active notebooks, use polling
        startPolling();
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
  }, [userId, getToken, connectSSE, startPolling, fetchAllNotebooks, hasActiveNotebooks]);

  return {
    notebooks,
    activeNotebooks,
    loading,
    connectionStatus,
    refresh,
  };
}
