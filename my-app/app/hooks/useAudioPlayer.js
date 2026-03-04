'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';

/**
 * Custom hook for audio playback using hls.js directly with a native <audio> element.
 * Handles HLS streaming, auth token injection, play/pause, seek, volume, speed, and source switching.
 *
 * @param {Object} options
 * @param {string} options.src - HLS manifest URL
 * @param {function} options.getToken - Async function that returns a fresh auth token
 * @param {function} [options.onTimeUpdate] - Called with currentTime on each timeupdate
 * @param {function} [options.onDurationChange] - Called when duration becomes available
 * @param {number|null} [options.seekTime] - External seek request (from subtitle clicks, etc.)
 * @returns {Object} Playback state and control functions
 */
export function useAudioPlayer({ src, getToken, onTimeUpdate, onDurationChange, seekTime }) {
    const audioRef = useRef(null);
    const hlsRef = useRef(null);
    const tokenRef = useRef(null);
    const currentUrlRef = useRef(null);
    const onTimeUpdateRef = useRef(onTimeUpdate);
    const onDurationChangeRef = useRef(onDurationChange);

    // Playback state
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(1);
    const [muted, setMutedState] = useState(false);
    const [playbackRate, setPlaybackRateState] = useState(1);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [tokenReady, setTokenReady] = useState(false);

    // Keep callback refs fresh (avoids stale closures)
    useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);
    useEffect(() => { onDurationChangeRef.current = onDurationChange; }, [onDurationChange]);

    // --- Token refresh --- waits for first token before allowing HLS to attach
    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            try {
                const t = await getToken();
                if (!cancelled) {
                    tokenRef.current = t;
                    setTokenReady(true);
                }
            } catch (err) {
                console.error('[useAudioPlayer] Token refresh failed:', err);
            }
        };
        refresh();
        const interval = setInterval(refresh, 50000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [getToken]);

    // --- Create audio element once ---
    useEffect(() => {
        const audio = new Audio();
        audio.preload = 'auto';
        audioRef.current = audio;

        return () => {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            audioRef.current = null;
        };
    }, []);

    // --- Attach/detach HLS to audio element ---
    const retryCountRef = useRef(0);
    const retryTimeoutRef = useRef(null);
    const MAX_RETRIES = 3;

    const attachHls = useCallback((url) => {
        const audio = audioRef.current;
        if (!audio || !url) return;

        // Destroy previous HLS instance
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }

        setError(null);
        setIsReady(false);
        currentUrlRef.current = url;
        retryCountRef.current = 0;

        const createHls = async () => {
            // Always grab a fresh token before each attempt
            try {
                const freshToken = await getToken();
                tokenRef.current = freshToken;
            } catch (err) {
                console.warn('[useAudioPlayer] Token refresh before HLS attach failed:', err);
            }

            if (Hls.isSupported()) {
                const hls = new Hls({
                    xhrSetup: (xhr) => {
                        if (tokenRef.current) {
                            xhr.setRequestHeader('Authorization', `Bearer ${tokenRef.current}`);
                        }
                    },
                    maxBufferLength: 30,
                    maxMaxBufferLength: 60,
                });

                hls.loadSource(url);
                hls.attachMedia(audio);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setIsReady(true);
                    setError(null);
                    retryCountRef.current = 0;
                    audio.play().catch(() => setPlaying(false));
                    setPlaying(true);
                });

                hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                        console.warn('[useAudioPlayer] HLS error:', data.type, data.details);

                        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                            // Network/403 error — retry with fresh token
                            hls.destroy();
                            hlsRef.current = null;

                            if (retryCountRef.current < MAX_RETRIES) {
                                retryCountRef.current++;
                                const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 8000);
                                console.log(`[useAudioPlayer] Retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})...`);
                                retryTimeoutRef.current = setTimeout(() => createHls(), delay);
                            } else {
                                setError('Unable to load audio. Please try again.');
                            }
                        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            hls.recoverMediaError();
                        } else {
                            hls.destroy();
                            hlsRef.current = null;
                            setError('Unable to load audio. Please try again.');
                        }
                        return;
                    }
                });

                hlsRef.current = hls;
            } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
                audio.src = url;
                audio.addEventListener('loadedmetadata', () => {
                    setIsReady(true);
                    audio.play().catch(() => setPlaying(false));
                    setPlaying(true);
                }, { once: true });
            } else {
                setError('HLS is not supported in this browser.');
            }
        };

        createHls();
    }, [getToken]);

    // --- Audio event listeners ---
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onTimeUpdateEvt = () => {
            const t = audio.currentTime;
            setCurrentTime(t);
            onTimeUpdateRef.current?.(t);
        };

        const onDurationChangeEvt = () => {
            const d = audio.duration;
            if (isFinite(d)) {
                setDuration(d);
                onDurationChangeRef.current?.(d);
            }
        };

        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onEnded = () => {
            setPlaying(false);
            setCurrentTime(0);
        };
        const onError = (e) => {
            console.error('[useAudioPlayer] Audio element error:', e);
            setError('Audio playback error');
        };

        audio.addEventListener('timeupdate', onTimeUpdateEvt);
        audio.addEventListener('durationchange', onDurationChangeEvt);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);

        return () => {
            audio.removeEventListener('timeupdate', onTimeUpdateEvt);
            audio.removeEventListener('durationchange', onDurationChangeEvt);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
        };
    }, []);

    // --- Load source when src changes (only after token is available) ---
    useEffect(() => {
        if (src && tokenReady && src !== currentUrlRef.current) attachHls(src);
    }, [src, tokenReady, attachHls]);

    // --- External seek handling ---
    useEffect(() => {
        if (seekTime !== null && seekTime !== undefined && audioRef.current) {
            audioRef.current.currentTime = seekTime;
        }
    }, [seekTime]);

    // --- Control functions ---
    const play = useCallback(() => {
        audioRef.current?.play().catch(console.error);
    }, []);

    const pause = useCallback(() => {
        audioRef.current?.pause();
    }, []);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
            audio.play().catch(console.error);
        } else {
            audio.pause();
        }
    }, []);

    const seek = useCallback((time) => {
        if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, Math.min(time, audioRef.current.duration || 0));
        }
    }, []);

    const seekRelative = useCallback((delta) => {
        if (audioRef.current) {
            const newTime = audioRef.current.currentTime + delta;
            audioRef.current.currentTime = Math.max(0, Math.min(newTime, audioRef.current.duration || 0));
        }
    }, []);

    const setVolume = useCallback((v) => {
        if (audioRef.current) {
            audioRef.current.volume = v;
            setVolumeState(v);
        }
    }, []);

    const setMuted = useCallback((m) => {
        if (audioRef.current) {
            audioRef.current.muted = m;
            setMutedState(m);
        }
    }, []);

    const setPlaybackRate = useCallback((rate) => {
        if (audioRef.current) {
            audioRef.current.playbackRate = rate;
            setPlaybackRateState(rate);
        }
    }, []);

    const loadSource = useCallback((url) => {
        attachHls(url);
    }, [attachHls]);

    // --- Cleanup HLS on unmount ---
    useEffect(() => {
        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
    }, []);

    return {
        // State
        playing,
        currentTime,
        duration,
        volume: volume,
        muted,
        playbackRate,
        isReady,
        error,

        // Controls
        play,
        pause,
        togglePlay,
        seek,
        seekRelative,
        setVolume,
        setMuted,
        setPlaybackRate,
        loadSource,
    };
}
