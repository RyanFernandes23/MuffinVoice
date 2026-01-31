'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function NotesModal({
  isOpen,
  onClose,
  currentTime = 0,
  subtitle = '',
  onSaveNote,
  editingNote = null,
  isSaving = false,
}) {
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState('');

  const textareaRef = useRef(null);
  const modalRef = useRef(null);

  const MAX_NOTE_LENGTH = 1000;

  /* ----------------------------------------------------
     Reset state when modal opens or we switch edit mode
  ---------------------------------------------------- */
  useEffect(() => {
    if (!isOpen) return;

    setNoteText(editingNote ? editingNote.userNote : '');
    setError('');

    // auto-focus textarea
    setTimeout(() => textareaRef.current?.focus(), 80);
  }, [isOpen, editingNote]);

  /* ----------------------------------------------------
     Disable body scroll when open
  ---------------------------------------------------- */
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';
    return () => (document.body.style.overflow = 'unset');
  }, [isOpen]);

  /* ----------------------------------------------------
     Close on outside click
  ---------------------------------------------------- */
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        if (!isSaving) onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose, isSaving]);

  /* ----------------------------------------------------
     Trap focus inside modal for accessibility
  ---------------------------------------------------- */
  useEffect(() => {
    if (!isOpen) return;

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = modalRef.current?.querySelectorAll(
        'button, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  /* ----------------------------------------------------
     Format time (mm:ss)
  ---------------------------------------------------- */
  const formatTime = useCallback((t) => {
    if (t == null) return '0:00';
    const m = Math.floor(t / 60);
    const s = String(Math.floor(t % 60)).padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  /* ----------------------------------------------------
     Save handler
  ---------------------------------------------------- */
  const handleSave = useCallback(() => {
    const trimmed = noteText.trim();

    if (!trimmed) {
      setError('Note cannot be empty');
      textareaRef.current?.focus();
      return;
    }

    if (trimmed.length > MAX_NOTE_LENGTH) {
      setError(`Note must be less than ${MAX_NOTE_LENGTH} characters.`);
      return;
    }

    setError('');
    onSaveNote(trimmed);
  }, [noteText, onSaveNote]);

  /* ----------------------------------------------------
     Keyboard shortcuts
     - Ctrl+Enter → save
     - Escape → close
  ---------------------------------------------------- */
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!isSaving) onClose();
      }
    },
    [handleSave, onClose, isSaving]
  );

  /* ----------------------------------------------------
     Text change
  ---------------------------------------------------- */
  const handleChange = (e) => {
    setNoteText(e.target.value);
    if (error) setError('');
  };

  /* ----------------------------------------------------
     Close modal
  ---------------------------------------------------- */
  const closeModal = () => {
    if (!isSaving) onClose();
  };

  if (!isOpen) return null;

  const remaining = MAX_NOTE_LENGTH - noteText.length;
  const nearLimit = remaining < 100;
  const overLimit = remaining < 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex justify-center items-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg p-6 shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {editingNote ? 'Edit Note' : 'Add Note'}
          </h2>

          <button
            onClick={closeModal}
            disabled={isSaving}
            className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            <FaTimes className="h-5 w-5" />
          </button>
        </div>

        {/* Timestamp */}
        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Timestamp:</span>{' '}
            <time className="font-mono">{formatTime(currentTime)}</time>
          </p>
        </div>

        {/* Subtitle preview */}
        {subtitle && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg max-h-20 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-600 mb-1">
              Current Subtitle:
            </p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {subtitle}
            </p>
          </div>
        )}

        {/* Textarea */}
        <div className="flex-1 flex flex-col mb-4">
          <textarea
            ref={textareaRef}
            value={noteText}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your note here... (Ctrl+Enter to save)"
            className={`w-full flex-1 p-3 border rounded-lg resize-none focus:outline-none ${
              overLimit
                ? 'border-red-400 focus:ring-red-200'
                : 'border-gray-300 focus:border-yellow-400 focus:ring-yellow-200'
            }`}
            maxLength={MAX_NOTE_LENGTH + 50}
            disabled={isSaving}
          />

          <div
            className={`text-xs mt-1 ${
              overLimit
                ? 'text-red-600 font-semibold'
                : nearLimit
                  ? 'text-orange-600'
                  : 'text-gray-500'
            }`}
          >
            {noteText.length}/{MAX_NOTE_LENGTH}{' '}
            {overLimit && ' - Too long'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            ⚠️ {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={closeModal}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
            disabled={isSaving}
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving || overLimit}
            className="px-4 py-2 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 disabled:opacity-50 flex items-center gap-2 min-w-[120px] justify-center"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span> Saving...
              </>
            ) : editingNote ? (
              'Update Note'
            ) : (
              'Save Note'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
