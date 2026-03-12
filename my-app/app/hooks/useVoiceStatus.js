'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

/**
 * Custom hook for voice status with interval polling
 * @param {string} userId - User ID
 * @param {string} jobId - Job ID
 * @param {function} getToken - Function to get auth token
 * @param {boolean} enabled - Whether to enable the hook
 * @returns {Object} { voices, loadingVoices, connectionStatus }
 */
export function useVoiceStatus(userId, jobId, getToken, enabled) {
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'polling' | 'disconnected'

  const pollingIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  const POLLING_INTERVAL = 3000; // 3 seconds (was 5s) for smoother progress updates

  const formatVoiceName = useCallback((voiceName) => {
    const parts = voiceName.split('_');
    if (parts.length === 2) {
      const code = parts[0];
      const name = parts[1];
      const gender = (code.startsWith('af') || code.startsWith('bf')) ? 'Female' : (code.startsWith('am') || code.startsWith('bm') || code.startsWith('em')) ? 'Male' : 'Unknown';
      return `${name.charAt(0).toUpperCase() + name.slice(1)} (${gender})`;
    }
    return voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
  }, []);

  const [progress, setProgress] = useState(0);

  const handleVoiceData = useCallback((data) => {
    if (!data || !data.voices) return;

    if (data.progress_percent !== undefined) {
      setProgress(data.progress_percent);
    }

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
    setLoadingVoices(true);

    // Initial fetch
    fetchViaPolling().finally(() => {
      if (isMountedRef.current) {
        setLoadingVoices(false);
      }
    });

    // Start interval
    pollingIntervalRef.current = setInterval(fetchViaPolling, POLLING_INTERVAL);
  }, [fetchViaPolling]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !userId || !jobId || !getToken) {
      setConnectionStatus('disconnected');
      return;
    }

    // Use polling by default
    startPolling();

    // Cleanup
    return () => {
      isMountedRef.current = false;

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [enabled, userId, jobId, getToken, startPolling]);

  return {
    voices,
    progress,
    loadingVoices: connectionStatus === 'disconnected' ? true : loadingVoices,
    connectionStatus,
  };
}
