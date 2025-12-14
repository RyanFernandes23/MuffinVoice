'use client';

import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaVolumeUp, FaVolumeDown, FaVolumeOff, FaVolumeMute, FaTimes } from 'react-icons/fa';

// 1. Accepts 'getToken' function as a prop
export default function AudioPlayer({ title, manifestUrl, getToken, onClose, onToggleSubtitle }) {

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isTokenReady, setIsTokenReady] = useState(false);
  
  const audioRef = useRef(null);
  const hlsRef = useRef(null);
  
  // 2. Ref to hold the current fresh token
  const tokenRef = useRef(null);

  // 3. Effect to keep token fresh in background
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const t = await getToken();
        tokenRef.current = t;
        setIsTokenReady(true);
      } catch (error) {
        console.error("Failed to refresh token:", error);
      }
    };
    
    // Initial fetch
    fetchToken();
    
    // Refresh token every 50 seconds (Clerk tokens expire in 60s)
    const interval = setInterval(fetchToken, 50000); 
    
    return () => clearInterval(interval);
  }, [getToken]);

  // Handle standard audio events (Time, Duration, Progress)
  useEffect(() => {

    const audio = audioRef.current;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const onProgress = () => {
      if (audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const percentage = (bufferedEnd / audio.duration) * 100;
        setBuffered(percentage);
      }
    };

    if (audio) {
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('progress', onProgress);

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('progress', onProgress);
      };
    }
  }, []);


  // Initialize HLS with Authentication
  useEffect(() => {
    if (!isTokenReady) return; 

    // Only proceed if HLS is supported and we have the manifest
    if (Hls.isSupported() && audioRef.current && manifestUrl) {
      
      const hlsConfig = {
        xhrSetup: (xhr, url) => {
          if (tokenRef.current) {
            xhr.setRequestHeader('Authorization', `Bearer ${tokenRef.current}`);
          }
        },
      };

      const hls = new Hls(hlsConfig);
      hls.loadSource(manifestUrl);
      hls.attachMedia(audioRef.current);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audioRef.current.play().catch(e => console.error("Autoplay was prevented: ", e));
        setIsPlaying(true);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
           console.error("Fatal HLS error:", data);
           // Optional: You could trigger a token refresh here if it was a 401 error
        }
      });

      return () => {
        hls.destroy();
      };
    }
  }, [manifestUrl,isTokenReady]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleRewind = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
    }
  };

  const handleFastForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 5);
    }
  };

  const handleSeek = (e) => {
    if (audioRef.current) {
      audioRef.current.currentTime = e.target.value;
      setCurrentTime(e.target.value);
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    setVolume(newVolume);
  };

  const handlePlaybackRateChange = (rate) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
    setPlaybackRate(rate);
  };

  const handleMuteToggle = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return <FaVolumeMute className="h-5 w-5" />;
    } else if (volume < 0.5) {
      return <FaVolumeOff className="h-5 w-5" />;
    } else if (volume < 1) {
      return <FaVolumeDown className="h-5 w-5" />;
    } else {
      return <FaVolumeUp className="h-5 w-5" />;
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black bg-opacity-90 text-white p-2 shadow-lg z-50 mb-4 flex flex-col h-32">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 hover:text-white">
        <FaTimes className="h-5 w-5" />
      </button>

      <audio ref={audioRef} style={{ display: 'none' }} />

      <div className="flex flex-col items-center justify-center w-11/12 mx-auto">
        <div className="text-base font-bold text-yellow-400 truncate mb-2">{title}</div>

        <div className="flex items-center space-x-4">
          <button onClick={handleRewind} className="text-white bg-black rounded-full p-1 hover:bg-gray-600">
            <FaStepBackward className="h-5 w-5" />
          </button>

          <button onClick={togglePlay} className="text-black bg-yellow-400 rounded-full p-1">
            {isPlaying ? (
              <FaPause className="h-6 w-6" />
            ) : (
              <FaPlay className="h-6 w-6 pl-1" />
            )}
          </button>

          <button onClick={handleFastForward} className="text-white bg-black rounded-full p-1 hover:bg-gray-600">
            <FaStepForward className="h-5 w-5" />
          </button>
        </div>
        
        <div className="w-full flex items-center space-x-2 mt-1">
          <p className="text-xs text-gray-400">{formatTime(currentTime)}</p>
          <input
            type="range"
            className="w-full seekbar"
            value={currentTime}
            max={duration || 0}
            onChange={handleSeek}
            style={{
              background: `linear-gradient(to right, #FACC15 0%, #FACC15 ${((currentTime / (duration || 1)) * 100)}%, #4B5563 ${buffered}%, #6B7280 ${buffered}%, #6B7280 100%)`,
            }}
          />
          <p className="text-xs text-gray-400">{formatTime(duration)}</p>
        </div>
        
        <div className="flex items-center space-x-4 mt-2">
          <button onClick={handleMuteToggle} className="text-gray-400 hover:text-white w-6 flex justify-center">
            {getVolumeIcon()}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-24 seekbar"
            style={{
              background: `linear-gradient(to right, #FACC15 0%, #FACC15 ${volume * 100}%, #4B5563 ${volume * 100}%, #4B5563 100%)`,
            }}
          />
          <span className="text-xs text-gray-400 w-8 text-right">{Math.round(volume * 100)}%</span>
          
          <label className="text-xs text-gray-400">Speed:</label>
          {[0.5, 1, 1.5, 2].map((rate) => (
            <button
              key={rate}
              onClick={() => handlePlaybackRateChange(rate)}
              className={`text-xs px-3 py-1 rounded-full transition-colors duration-200 ${playbackRate === rate ? 'bg-yellow-400 text-black font-semibold' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
            >
              {rate}x
            </button>
          ))}
          {/* Subtitle Button */}
          <button
            onClick={onToggleSubtitle}
            className="text-xs px-3 py-1 rounded-full bg-yellow-400 text-black font-semibold hover:bg-yellow-500 transition-colors duration-200"
          >
            Subtitle
          </button>

        </div>
      </div>

    </div>
  );
}
