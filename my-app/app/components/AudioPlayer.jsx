'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX, Volume1,
  X, StickyNote,
  Rewind, FastForward, Headphones, FileText, MessageSquareText
} from 'lucide-react';

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
      // Voice not generated yet — trigger processing
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
      className="fixed bottom-0 left-0 right-0 text-white p-4 pb-6 z-50 flex flex-col rounded-t-2xl shadow-2xl"
      style={{
        background: '#0a0a0a',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <button onClick={handleClose} className="absolute top-3 right-3 text-neutral-500 hover:text-white transition-colors p-1 rounded-lg">
        <X size={20} />
      </button>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold text-white max-w-[calc(100%-60px)] truncate flex items-center gap-2">
          <Headphones className="text-neutral-400" size={20} /> {title}
        </h3>
      </div>

      {/* Error or Loading State */}
      {error ? (
        <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      ) : !isReady && currentManifestUrl ? (
        <div className="mb-2 px-3 py-2 bg-amber-500/5 items-center border border-amber-500/10 rounded-xl text-sm text-amber-300 flex gap-3">
          <div className="w-3 h-3 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
          <span>Buffering audio stream...</span>
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
            disabled={!isReady}
            className="bg-white text-black p-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[52px] min-h-[52px]"
          >
            {!isReady ? (
              <div className="w-5 h-5 rounded-full border-2 border-black/20 border-t-black animate-spin" />
            ) : playing ? (
              <Pause size={28} />
            ) : (
              <Play size={28} className="pl-0.5" />
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
      <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 group">
            <button onClick={() => setMuted(!muted)} className="text-neutral-500 hover:text-white transition-colors">
              {muted || volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
            </button>
            <input
              type="range" min="0" max="1" step="0.01" value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-white"
              style={{
                backgroundSize: `${volume * 100}% 100%`,
                backgroundImage: `linear-gradient(to right, #ffffff 0%, #ffffff 100%)`,
                backgroundRepeat: 'no-repeat',
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.05]">
            {[1, 1.25, 1.5, 2].map((rate) => (
              <button key={rate} onClick={() => setPlaybackRate(rate)}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-lg transition-all ${playbackRate === rate ? 'bg-white text-black font-bold' : 'text-neutral-500 hover:text-white'}`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onToggleSubtitle} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${isSubtitleOpen ? 'bg-white text-black' : 'text-neutral-400 border border-white/[0.08]'}`}>
            <FileText size={14} /> Subtitles
          </button>
          <button onClick={() => setShowNotesModal(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-neutral-400 border border-white/[0.08] hover:text-white transition-all">
            <StickyNote size={14} /> Add Note
          </button>
          <button onClick={() => setShowNotesSidebar(!showNotesSidebar)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-medium text-xs transition-all ${showNotesSidebar ? 'bg-white text-black' : 'text-neutral-400 border border-white/[0.08]'}`}>
            <MessageSquareText size={14} /> Notes {notes.length > 0 && `(${notes.length})`}
          </button>
          <VoiceSwitcher
            userId={userId} jobId={jobId} getToken={getToken}
            selectedVoice={selectedVoice} onVoiceSelect={handleVoiceSelect}
            processingVoice={processingVoice}
            isOpen={showVoiceOptions} setIsOpen={setShowVoiceOptions} innerRef={voiceOptionsRef}
          />
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