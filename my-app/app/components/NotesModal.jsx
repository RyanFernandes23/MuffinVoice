'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function NotesModal({
  isOpen, onClose, currentTime = 0, subtitle = '', onSaveNote, editingNote = null, isSaving = false,
}) {
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const modalRef = useRef(null);
  const MAX_NOTE_LENGTH = 1000;

  useEffect(() => {
    if (!isOpen) return;
    setNoteText(editingNote ? editingNote.userNote : '');
    setError('');
    setTimeout(() => textareaRef.current?.focus(), 80);
  }, [isOpen, editingNote]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => (document.body.style.overflow = 'unset');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) { if (!isSaving) onClose(); }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose, isSaving]);

  useEffect(() => {
    if (!isOpen) return;
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = modalRef.current?.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  const formatTime = useCallback((t) => {
    if (t == null) return '0:00';
    const m = Math.floor(t / 60);
    const s = String(Math.floor(t % 60)).padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = noteText.trim();
    if (!trimmed) { setError('Note cannot be empty'); textareaRef.current?.focus(); return; }
    if (trimmed.length > MAX_NOTE_LENGTH) { setError(`Note must be less than ${MAX_NOTE_LENGTH} characters.`); return; }
    setError(''); onSaveNote(trimmed);
  }, [noteText, onSaveNote]);

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { e.preventDefault(); if (!isSaving) onClose(); }
  }, [handleSave, onClose, isSaving]);

  const handleChange = (e) => { setNoteText(e.target.value); if (error) setError(''); };
  const closeModal = () => { if (!isSaving) onClose(); };

  if (!isOpen) return null;

  const remaining = MAX_NOTE_LENGTH - noteText.length;
  const nearLimit = remaining < 100;
  const overLimit = remaining < 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4" role="dialog" aria-modal="true">
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl p-6 w-full max-w-md max-h-[90vh] flex flex-col"
        style={{
          background: '#111111',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">{editingNote ? 'Edit Note' : 'Add Note'}</h2>
          <button onClick={closeModal} disabled={isSaving}
            className="text-neutral-500 hover:text-white p-1 rounded-lg hover:bg-white/[0.05] transition-all disabled:opacity-50">
            <FaTimes className="h-5 w-5" />
          </button>
        </div>

        {/* Timestamp */}
        <div className="mb-4 p-3 bg-white/[0.04] border border-white/[0.06] rounded-xl">
          <p className="text-sm text-neutral-400">
            <span className="font-semibold text-white">Timestamp:</span>{' '}
            <time className="font-mono text-white">{formatTime(currentTime)}</time>
          </p>
        </div>

        {/* Subtitle preview */}
        {subtitle && (
          <div className="mb-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl max-h-20 overflow-y-auto">
            <p className="text-xs font-semibold text-neutral-500 mb-1">Current Subtitle:</p>
            <p className="text-sm text-neutral-300 whitespace-pre-wrap">{subtitle}</p>
          </div>
        )}

        {/* Textarea */}
        <div className="flex-1 flex flex-col mb-4">
          <textarea
            ref={textareaRef} value={noteText} onChange={handleChange} onKeyDown={handleKeyDown}
            placeholder="Type your note here... (Ctrl+Enter to save)"
            className={`w-full flex-1 p-3 border rounded-xl resize-none focus:outline-none transition-all ${overLimit
              ? 'border-red-500/50 bg-red-500/5 text-white'
              : 'border-white/[0.08] focus:border-white/20 bg-white/[0.04] text-white placeholder-neutral-600'
              }`}
            maxLength={MAX_NOTE_LENGTH + 50} disabled={isSaving}
          />
          <div className={`text-xs mt-2 ${overLimit ? 'text-red-400 font-semibold' : nearLimit ? 'text-amber-400' : 'text-neutral-600'}`}>
            {noteText.length}/{MAX_NOTE_LENGTH} {overLimit && ' - Too long'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button onClick={closeModal}
            className="px-4 py-2 text-neutral-400 rounded-lg border border-white/[0.08] hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
            disabled={isSaving}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={isSaving || overLimit}
            className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center transition-all">
            {isSaving ? (<><span className="animate-spin">⏳</span> Saving...</>) : editingNote ? 'Update Note' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
