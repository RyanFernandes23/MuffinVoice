'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

/**
 * Custom hook for voice status with SSE and polling fallback
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {function} getToken - Function to get auth token
 * @param {boolean} enabled - Whether to enable the hook
 * @returns {Object} { voices, loadingVoices, connectionStatus }
 */
export function useVoiceStatus(userId, jobId, getToken, enabled) {
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'sse' | 'polling' | 'disconnected'

  const eventSourceRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  const MAX_RECONNECT_ATTEMPTS = 3;
  const POLLING_INTERVAL = 5000; // 5 seconds

  const formatVoiceName = useCallback((voiceName) => {
    const parts = voiceName.split('_');
    if (parts.length === 2) {
      const code = parts[0];
      const name = parts[1];
      const gender = (code.startsWith('af') || code.startsWith('bf')) ? 'Female' : (code.startsWith('am') || code.startsWith('bm') || code.startsWith('em')) ? 'Male' : 'Unknown';
      return `${name.charAt(0).toUpperCase() + name.slice(1)} (${gender})`;
    }
    return voiceName.charAt(0).toUpperCase() + name.slice(1);
  }, []);

  const handleVoiceData = useCallback((data) => {
    if (!data || !data.voices) return;

    const mappedVoices = data.voices.map(voice => ({
      id: voice.name,
      name: formatVoiceName(voice.name),
      status: voice.status,
    }));

    setVoices(mappedVoices);
  }, [formatVoiceName]);

  const fetchViaPolling = useCallback(async () => {
    if (!userId || !jobId || !getToken) return;

    try {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/check_voice_status/${userId}/${jobId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        handleVoiceData(data);
      }
    } catch (error) {
      console.error('Error polling voice status:', error);
    }
  }, [userId, jobId, getToken, handleVoiceData]);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setConnectionStatus('polling');

    // Initial fetch
    fetchViaPolling();

    // Start interval
    pollingIntervalRef.current = setInterval(fetchViaPolling, POLLING_INTERVAL);
  }, [fetchViaPolling]);

  const connectSSE = useCallback(async () => {
    if (!userId || !jobId || !getToken) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const token = await getToken();

      // Check if EventSource is supported
      if (typeof EventSource === 'undefined') {
        console.log('EventSource not supported, falling back to polling');
        startPolling();
        return;
      }

      setLoadingVoices(true);

      // Create EventSource with auth header using polyfill approach
      // Since EventSource doesn't support headers natively, we use fetch-based SSE
      const response = await fetch(
        `${API_BASE_URL}/api/voice_status_stream/${userId}/${jobId}`,
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

      // Get reader from response body
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      setConnectionStatus('sse');
      setLoadingVoices(false);
      reconnectAttemptsRef.current = 0;

      // Read stream
      const readStream = async () => {
        try {
          while (isMountedRef.current) {
            const { done, value } = await reader.read();

            if (done) {
              console.log('SSE stream ended');
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);

                // Skip heartbeat
                if (dataStr === ':heartbeat') continue;

                try {
                  const data = JSON.parse(dataStr);

                  // Check for errors
                  if (data.error) {
                    console.error('SSE error:', data.message);
                    continue;
                  }

                  handleVoiceData(data);
                } catch (e) {
                  // Ignore parse errors (might be partial data)
                }
              }
            }
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            console.log('SSE connection aborted');
          } else {
            console.error('SSE read error:', error);
          }
        } finally {
          reader.releaseLock();

          // Attempt reconnection if still mounted
          if (isMountedRef.current && enabled) {
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              reconnectAttemptsRef.current++;
              const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
              console.log(`SSE reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

              reconnectTimeoutRef.current = setTimeout(() => {
                connectSSE();
              }, delay);
            } else {
              console.log('Max SSE reconnection attempts reached, falling back to polling');
              startPolling();
            }
          }
        }
      };

      readStream();

    } catch (error) {
      console.error('Failed to connect SSE:', error);
      setLoadingVoices(false);

      // Fall back to polling
      startPolling();
    }
  }, [userId, jobId, getToken, enabled, handleVoiceData, startPolling]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !userId || !jobId || !getToken) {
      setConnectionStatus('disconnected');
      return;
    }

    // Try SSE first
    connectSSE();

    // Cleanup
    return () => {
      isMountedRef.current = false;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
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
  }, [enabled, userId, jobId, getToken, connectSSE]);

  return {
    voices,
    loadingVoices: connectionStatus === 'disconnected' ? true : loadingVoices,
    connectionStatus,
  };
}
