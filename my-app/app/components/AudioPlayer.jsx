'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  X, StickyNote,
  Rewind, FastForward, Headphones, FileText, MessageSquareText,
  Loader2
} from 'lucide-react';

import { truncateText } from '../utils/textUtils';
import NotesModal from './NotesModal';
import VoiceSwitcher from './AudioPlayer/VoiceSwitcher';
import NotesSidebar from './AudioPlayer/NotesSidebar';
import { useAudioNotes } from '../hooks/useAudioNotes';
import { useAudioPlayer } from '../hooks/useAudioPlayer';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

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
  onCloseSubtitle,
  voice: initialVoice = 'af_bella'
}) {
  const truncatedTitle = truncateText(title, 80, 10);

  const voiceOptionsRef = useRef(null);

  const [selectedVoice, setSelectedVoice] = useState(initialVoice);
  const [currentManifestUrl, setCurrentManifestUrl] = useState(manifestUrl);
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showNotesSidebar, setShowNotesSidebar] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [processingVoice, setProcessingVoice] = useState(null);

  // Sync state with props when switching notebooks
  useEffect(() => {
    setSelectedVoice(initialVoice);
  }, [initialVoice]);

  useEffect(() => {
    setCurrentManifestUrl(manifestUrl);
  }, [manifestUrl]);

  // Core playback — powered by hls.js directly
  const {
    playing,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    isReady,
    isBuffering,
    error,
    togglePlay,
    seek,
    seekRelative,
    setVolume,
    setMuted,
    setPlaybackRate,
    loadSource,
  } = useAudioPlayer({
    src: currentManifestUrl,
    getToken,
    onTimeUpdate: onTimeUpdateProp,
    onDurationChange,
    seekTime,
  });

  const { notes, loading, isSaving, fetchNotes, saveNote, deleteNote } = useAudioNotes(
    userId, jobId, getToken, onNotesUpdate
  );

  useEffect(() => {
    if (showNotesSidebar) fetchNotes();
  }, [showNotesSidebar, fetchNotes]);

  const handleVoiceSelect = async (voiceId, voiceStatus) => {
    if (voiceStatus === 'ready') {
      // Voice is ready — switch to it
      setSelectedVoice(voiceId);
      const newUrl = `${API_BASE_URL}/api/stream/${userId}/${jobId}/${voiceId}/manifest.m3u8`;
      setCurrentManifestUrl(newUrl);
      loadSource(newUrl);
      setShowVoiceOptions(false);
    } else if (voiceStatus === 'not started') {
      // Voice not generated yet — trigger processing (if logged in)
      if (!getToken) return;
      setProcessingVoice(voiceId);
      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE_URL}/api/process_voice/${userId}/${jobId}/${voiceId}`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error('[VoiceSwitch] Failed to start processing:', data.detail || res.status);
          setProcessingVoice(null); // Reset on error
        }
        // On success, we purposefully DO NOT reset setProcessingVoice(null).
        // It stays processing until the SSE event updates the voice status to 'processing'
        // or 'ready', bridging the gap without a visual flash.
      } catch (err) {
        console.error('[VoiceSwitch] Error triggering voice processing:', err);
        setProcessingVoice(null); // Reset on error
      }
    }
    // 'processing' status — do nothing, SSE will update when ready
  };

  const handleClose = () => {
    if (isSubtitleOpen && onCloseSubtitle) onCloseSubtitle();
    onClose();
  };

  const formatTime = (time) => {
    if (!isFinite(time) || time < 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 text-white p-3 pb-4 z-50 flex flex-col rounded-t-2xl shadow-2xl"
      style={{
        background: '#0a0a0a',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <button onClick={handleClose} className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors p-1 rounded-lg">
        <X size={20} />
      </button>

      <div className="flex items-center justify-center mb-2">
        <h3 className="text-lg font-bold text-white truncate flex items-center gap-2">
          <Headphones className="text-neutral-400 shrink-0" size={18} /> 
          <span>{truncatedTitle}</span>
        </h3>
      </div>

      {/* Error or Loading State */}
      {error ? (
        <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      ) : null}

      {/* Primary UI Row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button onClick={() => seekRelative(-10)} className="text-neutral-400 p-2 hover:text-white transition-all disabled:opacity-50" disabled={!isReady}>
            <Rewind size={24} />
          </button>
          <button
            onClick={togglePlay}
            disabled={!isReady || (isBuffering && !playing)}
            className="bg-white text-black p-2.5 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[48px] min-h-[48px]"
            style={{ borderRadius: '9999px' }}
          >
            {(!isReady || isBuffering) ? (
              <Loader2 size={24} className="animate-spin" />
            ) : playing ? (
              <Pause size={24} />
            ) : (
              <Play size={24} className="pl-0.5" />
            )}
          </button>
          <button onClick={() => seekRelative(10)} className="text-neutral-400 p-2 hover:text-white transition-all disabled:opacity-50" disabled={!isReady}>
            <FastForward size={24} />
          </button>
        </div>

        <div className="flex-1 flex items-center gap-3">
          <span className="text-sm text-neutral-500 w-10 tabular-nums">{formatTime(currentTime)}</span>
          <div className="relative flex-1 flex items-center">
            <input
              type="range" min={0} max={duration || 100} step={0.1} value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              style={{
                backgroundSize: `${(currentTime / (duration || 1)) * 100}% 100%`,
                backgroundImage: `linear-gradient(to right, #ffffff 0%, #ffffff 100%)`,
                backgroundRepeat: 'no-repeat',
              }}
            />
          </div>
          <span className="text-sm text-neutral-500 w-10 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Secondary Controls UI */}
      <div className="flex items-center justify-between gap-4 mt-4 w-full flex-wrap xl:flex-nowrap">
        {/* Left: Playback Speed */}
        <div className="flex-1 flex justify-start items-center overflow-x-auto no-scrollbar min-w-[200px] pl-24">
          <div className="flex items-center gap-1.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.05]">
            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <button key={rate} onClick={() => setPlaybackRate(rate)}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg transition-all whitespace-nowrap ${playbackRate === rate ? 'bg-white text-black font-bold' : 'text-neutral-500 hover:text-white'}`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>


        {/* Right: Page Actions & Volume */}
        <div className="flex-[2] flex items-center justify-end gap-3 min-w-[500px] pr-4">
          <button onClick={onToggleSubtitle} className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${isSubtitleOpen ? 'bg-white text-black' : 'text-neutral-400 border border-white/[0.08]'}`}>
            <FileText size={14} /> Subtitles
          </button>

          {getToken && (
            <>
              <button onClick={() => setShowNotesModal(true)} className="shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-neutral-400 border border-white/[0.08] hover:text-white transition-all">
                <StickyNote size={14} /> Add Note
              </button>
              <button onClick={() => setShowNotesSidebar(!showNotesSidebar)} className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${showNotesSidebar ? 'bg-white text-black' : 'text-neutral-400 border border-white/[0.08]'}`}>
                <MessageSquareText size={14} /> Notes {notes.length > 0 && `(${notes.length})`}
              </button>
            </>
          )}
          
          <div className="shrink-0">
            <VoiceSwitcher
              userId={userId} jobId={jobId} getToken={getToken}
              selectedVoice={selectedVoice} onVoiceSelect={handleVoiceSelect}
              processingVoice={processingVoice}
              isOpen={showVoiceOptions} setIsOpen={setShowVoiceOptions} innerRef={voiceOptionsRef}
            />
          </div>

          <div className="flex items-center gap-3 px-3 py-1.5 bg-white/[0.03] rounded-full border border-white/[0.05] ml-2">
            <button onClick={() => setMuted(!muted)} className="text-neutral-500 hover:text-white transition-colors">
              {muted || volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range" min="0" max="1" step="0.01" value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              style={{
                backgroundSize: `${volume * 100}% 100%`,
                backgroundImage: `linear-gradient(to right, #ffffff 0%, #ffffff 100%)`,
                backgroundRepeat: 'no-repeat',
              }}
            />
          </div>
        </div>
      </div>

      <NotesModal
        isOpen={showNotesModal}
        onClose={() => { setShowNotesModal(false); setEditingNote(null); }}
        currentTime={currentTime}
        subtitle={currentSubtitle}
        onSaveNote={(text) => saveNote(text, currentTime, currentSubtitle, editingNote?.id)}
        editingNote={editingNote}
        isSaving={isSaving}
      />

      <NotesSidebar
        isOpen={showNotesSidebar}
        onClose={() => setShowNotesSidebar(false)}
        notes={notes}
        onNoteClick={(t) => seek(t)}
        onDeleteNote={deleteNote}
        onEditNote={(n) => { setEditingNote(n); setShowNotesModal(true); }}
        loading={loading}
        userId={userId} jobId={jobId} getToken={getToken}
      />
    </motion.div>
  );
}