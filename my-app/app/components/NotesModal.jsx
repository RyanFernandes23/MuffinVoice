'use client';

import { useState, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function NotesModal({ 
  isOpen, 
  onClose, 
  currentTime, 
  subtitle, 
  onSaveNote, 
  editingNote = null,
  isSaving = false 
}) {
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState('');

  // Reset form when modal opens or editingNote changes
  useEffect(() => {
    if (isOpen) {
      if (editingNote) {
        setNoteText(editingNote.userNote);
      } else {
        setNoteText('');
      }
      setError('');
    }
  }, [isOpen, editingNote]);

  const formatTime = (time) => {
    if (!time && time !== 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleSave = () => {
    if (!noteText.trim()) {
      setError('Note cannot be empty');
      return;
    }

    if (noteText.length > 1000) {
      setError('Note must be less than 1000 characters');
      return;
    }

    onSaveNote(noteText);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center backdrop-blur-sm">
      <div className="bg-white rounded-lg p-6 shadow-2xl w-full max-w-md max-h-96 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {editingNote ? 'Edit Note' : 'Add Note'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <FaTimes className="h-5 w-5" />
          </button>
        </div>

        {/* Timestamp Display */}
        <div className="mb-4 p-3 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-semibold">Timestamp:</span> {formatTime(currentTime)}
          </p>
        </div>

        {/* Subtitle Context */}
        {subtitle && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg max-h-20 overflow-y-auto">
            <p className="text-xs text-gray-600 font-semibold mb-1">Current Subtitle:</p>
            <p className="text-sm text-gray-700 line-clamp-3">{subtitle}</p>
          </div>
        )}

        {/* Note Input */}
        <div className="mb-4 flex-1 flex flex-col">
          <textarea
            value={noteText}
            onChange={(e) => {
              setNoteText(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your note here... (Ctrl+Enter to save)"
            className="w-full flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100 resize-none bg-white text-gray-900 placeholder-gray-400"
            maxLength={1000}
          />
          <p className="text-xs text-gray-500 mt-1">
            {noteText.length}/1000 characters
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-sm text-red-600 mb-3 font-semibold">{error}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-yellow-400 text-black font-semibold rounded-lg hover:bg-yellow-500 transition disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                Saving...
              </>
            ) : (
              editingNote ? 'Update Note' : 'Save Note'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
