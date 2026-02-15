'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { motion } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  X, StickyNote, ChevronDown, Loader2,
  Rewind, FastForward, Headphones, Mic2, FileText, Settings2, History, MessageSquareText
} from 'lucide-react';
import NotesModal from './NotesModal';
import NotesList from './NotesList';
import { useVoiceStatus } from '../hooks/useVoiceStatus';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000'; // Default for server-side


export default function AudioPlayer({
  title,
  manifestUrl,
  getToken,
  onClose,
  onToggleSubtitle,
  onTimeUpdate: onTimeUpdateProp,
  onDurationChange,
  seekTime,
  userId,
  jobId,
  currentSubtitle = '',
  onNotesUpdate,
  isSubtitleOpen = false,
  onCloseSubtitle
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isTokenReady, setIsTokenReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [processingVoice, setProcessingVoice] = useState(null);

  const [showModal, setShowModal] = useState(false); // For general info/error messages
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState('info'); // 'info', 'success', 'error'

  const [currentManifestUrl, setCurrentManifestUrl] = useState(manifestUrl);
  
  // Notes state
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showNotesSidebar, setShowNotesSidebar] = useState(false);
  const [notes, setNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  
  const audioRef = useRef(null);
  const hlsRef = useRef(null);
  const voiceOptionsRef = useRef(null);
  const tokenRef = useRef(null); // Ref to hold the current fresh token

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return 'text-emerald-400';
      case 'processing':
        return 'text-amber-400';
      case 'not started':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'ready':
        return 'bg-emerald-500/20';
      case 'processing':
        return 'bg-amber-500/20';
      case 'not started':
        return 'bg-gray-500/20';
      default:
        return 'bg-gray-500/20';
    }
  };

  // Close voice options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (voiceOptionsRef.current && !voiceOptionsRef.current.contains(event.target)) {
        setShowVoiceOptions(false);
      }
    };

    if (showVoiceOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showVoiceOptions]);

  // Use SSE with polling fallback for voice status
  const { voices, loadingVoices, connectionStatus } = useVoiceStatus(
    userId,
    jobId,
    getToken,
    showVoiceOptions // Only connect when voice options pane is open
  );

  useEffect(() => {
    if (seekTime !== null && audioRef.current && !isSeeking) {
      audioRef.current.currentTime = seekTime;
    }
  }, [seekTime, isSeeking]);

  // Effect to keep token fresh in background
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

    fetchToken(); // Initial fetch
    const interval = setInterval(fetchToken, 50000); // Refresh token every 50 seconds (Clerk tokens expire in 60s)
    return () => clearInterval(interval);
  }, [getToken]);

  // Update manifest URL when notebook changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
    setIsPlaying(false);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setSelectedVoice('af_bella'); // Reset selected voice to default
    setCurrentManifestUrl(manifestUrl); // Update the manifest URL
    
    setCurrentTime(0);
    setDuration(0);
  }, [manifestUrl]);

  // Handle standard audio events (Time, Duration, Progress)
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (onTimeUpdateProp && !isSeeking) {
        onTimeUpdateProp(audio.currentTime);
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      if (onDurationChange) {
        onDurationChange(audio.duration);
      }
    };

    const onProgress = () => {
      if (audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const percentage = (bufferedEnd / audio.duration) * 100;
        setBuffered(percentage);
      }
    };

    const onSeeking = () => {
      if (!isSeeking) {
        setIsSeeking(true);
      }
    };

    const onSeeked = () => {
      setIsSeeking(false);
    };

    if (audio) {
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('progress', onProgress);
      audio.addEventListener('seeking', onSeeking);
      audio.addEventListener('seeked', onSeeked);

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('progress', onProgress);
        audio.removeEventListener('seeking', onSeeking);
        audio.removeEventListener('seeked', onSeeked);
      };
    }
  }, [onDurationChange, onTimeUpdateProp, isSeeking]);

  // Fetch notes when sidebar opens
  useEffect(() => {
    if (!showNotesSidebar || !userId || !jobId || !getToken) return;

    const fetchNotes = async () => {
      setLoadingNotes(true);
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/notes/${userId}/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setNotes(data.notes);
        }
      } catch (error) {
        console.error('Error fetching notes:', error);
      } finally {
        setLoadingNotes(false);
      }
    };

    fetchNotes();
  }, [userId, jobId, getToken, showNotesSidebar]);

  // Handle saving a note
  const handleSaveNote = async (noteText) => {
    if (!userId || !jobId || !getToken) return; 
    
    setIsSavingNote(true);
    try {
      const token = await getToken();
      const method = editingNote ? 'PUT' : 'POST';
      const url = editingNote 
        ? `${API_BASE_URL}/api/notes/${userId}/${jobId}/${editingNote.id}`
        : `${API_BASE_URL}/api/notes/${userId}/${jobId}?timestamp=${currentTime}&user_note=${encodeURIComponent(noteText)}&subtitle_text=${encodeURIComponent(currentSubtitle)}`;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: editingNote ? JSON.stringify({ user_note: noteText }) : undefined,
      });

      if (response.ok) {
        const newNote = await response.json();
        
        let updatedNotes;
        if (editingNote) {
          updatedNotes = notes.map(n => n.id === editingNote.id ? newNote : n);
          setNotes(updatedNotes);
        } else {
          updatedNotes = [...notes, newNote];
          setNotes(updatedNotes);
        }

        if (onNotesUpdate) {
          onNotesUpdate(updatedNotes.length);
        }

        setShowNotesModal(false);
        setEditingNote(null);
      }
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Handle deleting a note
  const handleDeleteNote = async (noteId) => {
    if (!userId || !jobId || !getToken) return;

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/notes/${userId}/${jobId}/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const updatedNotes = notes.filter(n => n.id !== noteId);
        setNotes(updatedNotes);
        
        if (onNotesUpdate) {
          onNotesUpdate(updatedNotes.length);
        }
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  // Handle editing a note
  const handleEditNote = (note) => {
    setEditingNote(note);
    setShowNotesModal(true);
  };

  // Handle note click - seek to that time
  const handleNoteClick = (timestamp) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timestamp;
    }
  };

  // Initialize HLS with Authentication
  useEffect(() => {
    if (!isTokenReady) return; 

    if (Hls.isSupported() && audioRef.current && currentManifestUrl) {
      
      const hlsConfig = {
        xhrSetup: (xhr, url) => {
          if (tokenRef.current) {
            xhr.setRequestHeader('Authorization', `Bearer ${tokenRef.current}`);
          }
        },
      };

      const hls = new Hls(hlsConfig);
      hls.loadSource(currentManifestUrl);
      hls.attachMedia(audioRef.current);
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("HLS Manifest Parsed. Ready for playback.");
        // We now explicitly set isPlaying to true here
        // to indicate that the media is ready to be played.
        // The separate useEffect will handle audioRef.current.play()
        setIsPlaying(true); 
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
           console.error("Fatal HLS error:", data);
        }
      });

      return () => {
        hls.destroy();
      };
    } else {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsPlaying(false);
    }
  }, [currentManifestUrl, isTokenReady]);

  // Effect to handle play/pause based on isPlaying state
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(e => {
          console.error("Error attempting to play audio:", e);
          if (e.name === "NotAllowedError" || e.name === "AbortError") {
            setIsPlaying(false);
          }
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);


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
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); // Rewind 10 seconds
    }
  };

  const handleFastForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 10); // Fast forward 10 seconds
    }
  };

  const handleSeek = (e) => {
    if (audioRef.current) {
      setIsSeeking(true);
      const newTime = parseFloat(e.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
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

  const handleVoiceSelect = async (voiceId, voiceStatus) => {
    if (voiceStatus === 'processing') {
      setModalType('info');
      setModalMessage('⏳ Please wait while this voice is being processed. Check back in a few moments!');
      setShowModal(true);
      return;
    }
    
    if (voiceStatus === 'not started') {
      setProcessingVoice(voiceId);
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/process_voice/${userId}/${jobId}/${voiceId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          console.log(`Started processing voice: ${voiceId}`);
          setModalType('success');
          setModalMessage('✓ Processing started for this voice. Please wait while it\'s being processed!');
          setShowModal(true);
          // Status will update automatically via SSE/polling hook
        } else {
          const error = await response.json();
          console.error(`Error processing voice: ${error.detail}`);
          setModalType('error');
          setModalMessage(`Error: ${error.detail}`);
          setShowModal(true);
        }
      } catch (error) {
        console.error('Error starting voice processing:', error);
        setModalType('error');
        setModalMessage('Error starting voice processing');
        setShowModal(true);
      } finally {
        setProcessingVoice(null);
      }
    } else {
      setSelectedVoice(voiceId);
      
      const newManifestUrl = `${API_BASE_URL}/api/stream/${userId}/${jobId}/${voiceId}/manifest.m3u8`;
      
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      
      setCurrentManifestUrl(newManifestUrl);
      setShowVoiceOptions(false);
    }
  };



  const handleMuteToggle = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const getVolumeIcon = () => {
    if (isMuted || volume === 0) {
      return <VolumeX className="h-5 w-5" />;
    } else if (volume < 0.5) {
      return <Volume1 className="h-5 w-5" />;
    } else {
      return <Volume2 className="h-5 w-5" />;
    }
  };

  const handleClosePlayer = () => {
    if (isSubtitleOpen && onCloseSubtitle) {
      onCloseSubtitle();
    }
    setShowNotesModal(false);
    setShowNotesSidebar(false);
    setEditingNote(null);
    onClose();
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 glass-card text-foreground p-4 pb-6 shadow-lg z-50 flex flex-col rounded-t-3xl border-t border-l border-r border-white/10"
    >
      <button onClick={handleClosePlayer} className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors p-1 rounded-full">
        <X size={20} />
      </button>

      <audio ref={audioRef} /> {/* Audio tag can be invisible, no need for display:none */}

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white max-w-[calc(100%-60px)] truncate">
          <Headphones className="inline-block mr-2 text-primary-glow" size={20} /> {title}
        </h3>
      </div>

      {/* Main Controls & Progress Bar */}
      <div className="flex items-center gap-4 w-full">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleRewind}
          className="text-white p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <Rewind size={24} />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={togglePlay}
          className="bg-primary text-white p-3 rounded-full shadow-lg hover:bg-primary-dark transition-colors"
        >
          {isPlaying ? (
            <Pause size={28} />
          ) : (
            <Play size={28} className="pl-0.5" />
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleFastForward}
          className="text-white p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <FastForward size={24} />
        </motion.button>

        {/* Progress Bar */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-gray-400 w-12 text-center">{formatTime(currentTime)}</span>
          <div className="relative flex-1 group">
            <input
              type="range"
              className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer thumb-primary-glow"
              value={currentTime}
              max={duration || 0}
              onChange={handleSeek}
              onMouseDown={() => setIsSeeking(true)}
              onMouseUp={() => setIsSeeking(false)}
              style={{
                backgroundSize: `${(currentTime / (duration || 1)) * 100}% 100%`,
                backgroundImage: `linear-gradient(to right, var(--primary) 0%, var(--primary) 100%)`,
                backgroundRepeat: 'no-repeat',
              }}
            />
            {/* Buffered progress */}
            <div
              className="absolute top-1/2 left-0 h-1 bg-white/30 rounded-full -translate-y-1/2 -z-10"
              style={{ width: `${buffered}%` }}
            />
          </div>
          <span className="text-sm text-gray-400 w-12 text-center">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Secondary Controls (Volume, Speed, Subtitle, Notes, Voice) */}
      <div className="flex items-center justify-end gap-6 mt-4">
        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleMuteToggle}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {getVolumeIcon()}
          </motion.button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-white/20 rounded-full appearance-none cursor-pointer thumb-primary-glow"
            style={{
              backgroundSize: `${volume * 100}% 100%`,
              backgroundImage: `linear-gradient(to right, var(--primary) 0%, var(--primary) 100%)`,
              backgroundRepeat: 'no-repeat',
            }}
          />
        </div>

        {/* Playback Speed */}
        <div className="flex items-center gap-2">
          <Settings2 size={18} className="text-gray-400" />
          {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <motion.button
              key={rate}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handlePlaybackRateChange(rate)}
              className={`text-xs px-3 py-1 rounded-full transition-colors duration-200 ${playbackRate === rate ? 'bg-primary text-white font-semibold shadow-md' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
            >
              {rate}x
            </motion.button>
          ))}
        </div>

        {/* Subtitle Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onToggleSubtitle}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ${isSubtitleOpen ? 'bg-primary text-white shadow-md' : 'glass-button text-foreground border border-gray-600 hover:border-white/40'}`}
        >
          <FileText size={18} /> Subtitles
        </motion.button>

        {/* Notes Button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowNotesModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full glass-button text-foreground border border-gray-600 hover:border-white/40 transition-all duration-200"
        >
          <StickyNote size={18} /> Add Note
        </motion.button>

        {/* Toggle Notes Sidebar */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowNotesSidebar(!showNotesSidebar)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ${showNotesSidebar ? 'bg-accent text-white shadow-md' : 'glass-button text-foreground border border-gray-600 hover:border-white/40'}`}
        >
          <MessageSquareText size={18} /> Notes {notes.length > 0 && `(${notes.length})`}
        </motion.button>

        {/* Switch Voice Button */}
        <div className="relative" ref={voiceOptionsRef}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowVoiceOptions(!showVoiceOptions)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all duration-200 ${showVoiceOptions ? 'bg-primary text-white shadow-md' : 'glass-button text-foreground border border-gray-600 hover:border-white/40'}`}
          >
            <Mic2 size={18} /> Switch Voice <ChevronDown size={16} />
          </motion.button>

          {/* Voice Options Pane */}
          {showVoiceOptions && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full right-0 mb-2 glass-card border border-white/10 rounded-lg shadow-xl p-3 w-64 max-h-80 overflow-y-auto z-50 origin-bottom-right"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <History size={16} /> Available Voices
                </h3>
                {/* Connection status indicator */}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  connectionStatus === 'sse'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : connectionStatus === 'polling'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`} title={connectionStatus === 'sse' ? 'Live updates' : connectionStatus === 'polling' ? 'Polling mode' : 'Disconnected'}>
                  {connectionStatus === 'sse' ? '● Live' : connectionStatus === 'polling' ? '○ Polling' : '○ Offline'}
                </span>
              </div>
              <div className="space-y-2">
                {loadingVoices ? (
                  <div className="flex items-center justify-center py-4 text-gray-400">
                    <Loader2 className="animate-spin mr-2" size={20} /> Loading Voices...
                  </div>
                ) : voices.length > 0 ? (
                  voices.map((voice) => (
                    <motion.button
                      key={voice.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleVoiceSelect(voice.id, voice.status)}
                      disabled={processingVoice === voice.id}
                      className={`w-full px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors duration-200 ${processingVoice === voice.id 
                          ? 'bg-gray-700 text-gray-400 cursor-wait opacity-60'
                          : voice.status === 'not started'
                          ? 'bg-white/5 text-gray-300 hover:bg-white/10 cursor-pointer'
                          : selectedVoice === voice.id
                          ? 'bg-primary text-white font-semibold shadow-sm'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                      title={voice.status === 'not started' ? 'Click to start processing this voice' : ''}
                    >
                      <span>{voice.name}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${selectedVoice === voice.id && voice.status !== 'not started' ? 'bg-white/20 text-white' : getStatusBg(voice.status) + ' ' + getStatusColor(voice.status)}`}>
                        {processingVoice === voice.id ? 'Processing...' : voice.status}
                      </span>
                    </motion.button>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm text-center py-4">No voices available.</p>
                )}
              </div>
            </motion.div>
          )}
        </div>

      </div>

      {/* Notes Modal */}
      <NotesModal
        isOpen={showNotesModal}
        onClose={() => {
          setShowNotesModal(false);
          setEditingNote(null);
        }}
        currentTime={currentTime}
        subtitle={currentSubtitle}
        onSaveNote={handleSaveNote}
        editingNote={editingNote}
        isSaving={isSavingNote}
      />

      {/* Notes Sidebar */}
      {showNotesSidebar && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed bottom-0 right-0 w-96 h-full bg-background/90 backdrop-blur-md border-l border-white/10 shadow-2xl p-4 z-40 flex flex-col pt-20"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <StickyNote size={24} /> My Notes
            </h3>
            <button
              onClick={() => setShowNotesSidebar(false)}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-full"
            >
              <X size={20} />
            </button>
          </div>
          <NotesList
            notes={notes}
            onNoteClick={handleNoteClick}
            onDeleteNote={handleDeleteNote}
            onEditNote={handleEditNote}
            isLoading={loadingNotes}
            userId={userId}
            jobId={jobId}
            getToken={getToken}
          />
        </motion.div>
      )}

      {/* General Info/Error Modal */}
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/60 z-50 flex justify-center items-center backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 50 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="glass-card rounded-2xl p-8 shadow-2xl w-full max-w-sm relative border border-white/10"
          >
            <div className="flex flex-col items-center">
              {modalType === 'info' && (
                <div className="text-5xl mb-4">⏳</div>
              )}
              {modalType === 'success' && (
                <div className="text-5xl mb-4">✅</div>
              )}
              {modalType === 'error' && (
                <div className="text-5xl mb-4">❌</div>
              )}
              
              <p className={`text-center text-lg font-semibold mb-6 ${modalType === 'error' ? 'text-red-400' : modalType === 'success' ? 'text-emerald-400' : 'text-white'}`}>
                {modalMessage}
              </p>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowModal(false)}
                className="px-6 py-2 bg-primary text-white rounded-full hover:bg-primary-dark font-semibold transition-colors shadow-md"
              >
                Got it
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}

    </motion.div>
  );
}