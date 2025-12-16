'use client';

import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaVolumeUp, FaVolumeDown, FaVolumeOff, FaVolumeMute, FaTimes, FaStickyNote } from 'react-icons/fa';
import NotesModal from './NotesModal';
import NotesList from './NotesList';

// 1. Accepts 'getToken' function as a prop
export default function AudioPlayer({ title, manifestUrl, getToken, onClose, onToggleSubtitle, onTimeUpdate: onTimeUpdateProp, onDurationChange, seekTime, userId, jobId, currentSubtitle = '', onNotesUpdate, isSubtitleOpen = false, onCloseSubtitle }) {

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
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [processingVoice, setProcessingVoice] = useState(null);
  const [showModal, setShowModal] = useState(false);
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
  
  // 2. Ref to hold the current fresh token
  const tokenRef = useRef(null);

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready':
        return 'text-green-400';
      case 'processing':
        return 'text-yellow-400';
      case 'not started':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
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

  // Fetch voice status from backend - only when options pane is open
  useEffect(() => {
    if (!userId || !jobId || !getToken || !showVoiceOptions) return;

    const fetchVoiceStatus = async () => {
      setLoadingVoices(true);
      try {
        const token = await getToken();
        const response = await fetch(`http://localhost:8000/check_voice_status/${userId}/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          // Map voice names to display names
          const mappedVoices = data.voices.map(voice => ({
            id: voice.name,
            name: formatVoiceName(voice.name),
            status: voice.status,
          }));
          setVoices(mappedVoices);
          // Set selected voice if available
          if (mappedVoices.length > 0 && !selectedVoice) {
            setSelectedVoice(mappedVoices[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching voice status:', error);
      } finally {
        setLoadingVoices(false);
      }
    };

    fetchVoiceStatus();
    // Refresh every 5 seconds only while pane is open
    const interval = setInterval(fetchVoiceStatus, 5000);
    return () => clearInterval(interval);
  }, [userId, jobId, getToken, showVoiceOptions]);

  useEffect(() => {
    if (seekTime !== null && audioRef.current && !isSeeking) { // Only update if not actively seeking
      audioRef.current.currentTime = seekTime;
    }
  }, [seekTime, isSeeking]);

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

  // Update manifest URL when notebook changes
  useEffect(() => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    // Destroy existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Reset selected voice to default
    setSelectedVoice('af_bella');
    
    // Update the manifest URL
    setCurrentManifestUrl(manifestUrl);
    
    // Reset time and other states
    setCurrentTime(0);
    setDuration(0);
  }, [manifestUrl]);

  // Handle standard audio events (Time, Duration, Progress)
  useEffect(() => {

    const audio = audioRef.current;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      // Notify parent of time change ONLY if not currently seeking
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

    // Handle seeking events
    const onSeeking = () => {
      if (!isSeeking) { // Only set if not already set by handleSeek
        setIsSeeking(true);
      }
    };

    const onSeeked = () => {
      setIsSeeking(false); // End seeking
    };

    if (audio) {
      audio.addEventListener('timeupdate', onTimeUpdate);
      audio.addEventListener('loadedmetadata', onLoadedMetadata);
      audio.addEventListener('progress', onProgress);
      audio.addEventListener('seeking', onSeeking); // Add new listener
      audio.addEventListener('seeked', onSeeked);   // Add new listener

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('loadedmetadata', onLoadedMetadata);
        audio.removeEventListener('progress', onProgress);
        audio.removeEventListener('seeking', onSeeking); // Remove new listener
        audio.removeEventListener('seeked', onSeeked);   // Remove new listener
      };
    }
  }, [onDurationChange, onTimeUpdateProp]);

  // Fetch notes when sidebar opens
  useEffect(() => {
    if (!showNotesSidebar || !userId || !jobId || !getToken) return;

    const fetchNotes = async () => {
      setLoadingNotes(true);
      try {
        const token = await getToken();
        const response = await fetch(`http://localhost:8000/notes/${userId}/${jobId}`, {
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
        ? `http://localhost:8000/notes/${userId}/${jobId}/${editingNote.id}`
        : `http://localhost:8000/notes/${userId}/${jobId}?timestamp=${currentTime}&user_note=${encodeURIComponent(noteText)}&subtitle_text=${encodeURIComponent(currentSubtitle)}`;

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
          // Update existing note in list
          updatedNotes = notes.map(n => n.id === editingNote.id ? newNote : n);
          setNotes(updatedNotes);
        } else {
          // Add new note to list
          updatedNotes = [...notes, newNote];
          setNotes(updatedNotes);
        }

        // Notify parent about notes update
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
      const response = await fetch(`http://localhost:8000/notes/${userId}/${jobId}/${noteId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const updatedNotes = notes.filter(n => n.id !== noteId);
        setNotes(updatedNotes);
        
        // Notify parent about notes update
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

    // Only proceed if HLS is supported and we have the manifest
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
  }, [currentManifestUrl, isTokenReady]);

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
      setIsSeeking(true); // Start seeking
      const newTime = parseFloat(e.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      // Do NOT call onTimeUpdateProp here; it will be handled by onSeeked or onTimeUpdate
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
    // If voice is processing, show a wait message
    if (voiceStatus === 'processing') {
      setModalType('info');
      setModalMessage('⏳ Please wait while this voice is being processed. Check back in a few moments!');
      setShowModal(true);
      return;
    }
    
    // If voice is not started, request to process it
    if (voiceStatus === 'not started') {
      setProcessingVoice(voiceId);
      try {
        const token = await getToken();
        const response = await fetch(`http://localhost:8000/process_voice/${userId}/${jobId}/${voiceId}`, {
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
          // Update the voice status locally instead of reloading the page
          setVoices(prevVoices => 
            prevVoices.map(voice => 
              voice.id === voiceId ? { ...voice, status: 'processing' } : voice
            )
          );
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
      // For ready voices, select them and load the new manifest
      setSelectedVoice(voiceId);
      
      // Construct the new manifest URL for the selected voice
      const newManifestUrl = `http://localhost:8000/stream/${userId}/${jobId}/${voiceId}/manifest.m3u8`;
      
      // Stop current playback
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      
      // Destroy existing HLS instance if any
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      
      // Update manifest URL to trigger HLS re-initialization
      setCurrentManifestUrl(newManifestUrl);
      
      // Close voice options pane
      setShowVoiceOptions(false);
    }
  };

  const formatVoiceName = (voiceName) => {
    // Convert voice folder names like 'af_bella' to 'Bella (Female)'
    const parts = voiceName.split('_');
    if (parts.length === 2) {
      const code = parts[0];
      const name = parts[1];
      // Determine gender based on prefix: af/bf = Female, am/bm/em = Male
      const gender = (code.startsWith('af') || code.startsWith('bf')) ? 'Female' : (code.startsWith('am') || code.startsWith('bm') || code.startsWith('em')) ? 'Male' : 'Unknown';
      return `${name.charAt(0).toUpperCase() + name.slice(1)} (${gender})`;
    }
    return voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
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

  const handleClosePlayer = () => {
    // Close subtitle only if it's currently open (don't toggle)
    if (isSubtitleOpen && onCloseSubtitle) {
      onCloseSubtitle();
    }
    // Close notes modal and sidebar
    setShowNotesModal(false);
    setShowNotesSidebar(false);
    setEditingNote(null);
    // Close the player
    onClose();
  };

  return (
    <div className="fixed bottom-2 left-0 right-0 bg-black bg-opacity-90 text-white p-2 shadow-lg z-50 flex flex-col h-40">
        <button onClick={handleClosePlayer} className="absolute top-2 right-2 text-gray-400 hover:text-white">
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
              cursor: 'pointer', // Add this line
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
            className="text-lg px-4 py-2 rounded-full bg-yellow-400 text-black font-bold hover:bg-yellow-500 transition-colors duration-200"
          >
            Subtitles
          </button>

          {/* Notes Button */}
          <button
            onClick={() => setShowNotesModal(true)}
            className="text-lg px-4 py-2 rounded-full bg-green-400 text-black font-bold hover:bg-green-500 transition-colors duration-200 flex items-center gap-2"
          >
            <FaStickyNote className="h-4 w-4" />
            Notes
          </button>

          {/* Toggle Notes Sidebar */}
          <button
            onClick={() => setShowNotesSidebar(!showNotesSidebar)}
            className={`text-lg px-4 py-2 rounded-full font-bold transition-colors duration-200 flex items-center gap-2 ${
              showNotesSidebar 
                ? 'bg-green-500 text-black hover:bg-green-600' 
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            📋 {notes.length}
          </button>

          {/* Switch Voice Button */}
          <div className="relative" ref={voiceOptionsRef}>
            <button
              onClick={() => setShowVoiceOptions(!showVoiceOptions)}
              className="text-lg px-4 py-2 rounded-full bg-yellow-400 text-black font-bold hover:bg-yellow-500 transition-colors duration-200"
            >
              Switch Voice
            </button>

            {/* Voice Options Pane */}
            {showVoiceOptions && (
              <div className="absolute bottom-12 right-0 bg-gray-800 border border-yellow-400 rounded-lg shadow-xl p-4 w-56 max-h-64 overflow-y-auto z-50">
                <h3 className="text-white font-semibold mb-3 text-sm">Select Voice</h3>
                <div className="space-y-2">
                  {voices.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => handleVoiceSelect(voice.id, voice.status)}
                      disabled={processingVoice === voice.id}
                      className={`w-full px-3 py-2 rounded transition-colors duration-200 text-sm flex justify-between items-center ${
                        processingVoice === voice.id 
                          ? 'bg-gray-600 text-gray-400 cursor-wait opacity-50'
                          : voice.status === 'not started'
                          ? 'bg-gray-700 text-white hover:bg-blue-600 hover:text-white cursor-pointer'
                          : selectedVoice === voice.id
                          ? 'bg-yellow-400 text-black font-semibold'
                          : 'bg-gray-700 text-white hover:bg-gray-600'
                      }`}
                      title={voice.status === 'not started' ? 'Click to start processing this voice' : ''}
                    >
                      <span>{voice.name}</span>
                      <span className={`text-xs font-semibold ${selectedVoice === voice.id && voice.status !== 'not started' ? 'text-black' : getStatusColor(voice.status)}`}>
                        {processingVoice === voice.id ? 'Processing...' : voice.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

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
        <div className="fixed bottom-2 right-96 w-80 h-96 bg-gray-900 border border-green-400 rounded-lg shadow-xl p-4 z-40 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold">My Notes</h3>
            <button
              onClick={() => setShowNotesSidebar(false)}
              className="text-gray-400 hover:text-white"
            >
              <FaTimes className="h-5 w-5" />
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
        </div>
      )}

      {/* Voice Status Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center backdrop-blur-sm">
          <div className="bg-white rounded-lg p-8 shadow-2xl w-full max-w-md">
            <div className="flex flex-col items-center">
              {modalType === 'info' && (
                <div className="text-5xl mb-4">⏳</div>
              )}
              {modalType === 'success' && (
                <div className="text-5xl mb-4">✓</div>
              )}
              {modalType === 'error' && (
                <div className="text-5xl mb-4">❌</div>
              )}
              
              <p className={`text-center text-lg font-semibold mb-6 ${
                modalType === 'error' ? 'text-red-600' : 
                modalType === 'success' ? 'text-green-600' : 
                'text-gray-800'
              }`}>
                {modalMessage}
              </p>
              
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-2 bg-yellow-400 text-black rounded-md hover:bg-yellow-500 font-semibold transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

