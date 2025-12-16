'use client';

import { useState, useEffect, useRef } from 'react';
import { FaTrash, FaEdit, FaSearch, FaTimes } from 'react-icons/fa';

export default function NotesList({ 
  notes, 
  onNoteClick, 
  onDeleteNote, 
  onEditNote, 
  isLoading = false,
  userId,
  jobId,
  getToken
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredNotes, setFilteredNotes] = useState(notes);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const searchTimeoutRef = useRef(null);

  // Filter notes by search term (debounced)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (!searchTerm.trim()) {
        setFilteredNotes(notes);
      } else {
        const term = searchTerm.toLowerCase();
        setFilteredNotes(
          notes.filter(note => 
            note.userNote.toLowerCase().includes(term) ||
            (note.subtitleText && note.subtitleText.toLowerCase().includes(term))
          )
        );
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, notes]);

  const formatTime = (time) => {
    if (!time && time !== 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown date';
    }
  };

  const handleDeleteClick = async (e, noteId) => {
    e.stopPropagation();
    setDeletingNoteId(noteId);
  };

  const confirmDelete = async (noteId) => {
    await onDeleteNote(noteId);
    setDeletingNoteId(null);
  };

  const handleEditClick = (e, note) => {
    e.stopPropagation();
    onEditNote(note);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-3">⏳</div>
          <p className="text-gray-600">Loading notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="relative mb-4">
        <FaSearch className="absolute left-3 top-3 text-gray-400" />
        <input
          type="text"
          placeholder="Search notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-100"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
          >
            <FaTimes className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Notes Count */}
      <div className="text-sm text-gray-600 mb-3">
        {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''} 
        {searchTerm && ` (filtered from ${notes.length})`}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {filteredNotes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">
              {notes.length === 0 
                ? '📝 No notes yet. Create one while listening!' 
                : '🔍 No notes match your search'}
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => onNoteClick(note.timestamp)}
              className="bg-white border border-gray-200 rounded-lg p-3 hover:border-yellow-400 hover:bg-yellow-50 transition cursor-pointer group"
            >
              {/* Header: Timestamp and Date */}
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-yellow-600 text-sm">
                  ⏱ {formatTime(note.timestamp)}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDate(note.createdAt)}
                </span>
              </div>

              {/* Note Text */}
              <p className="text-sm text-gray-800 mb-2 line-clamp-2">
                {note.userNote}
              </p>

              {/* Subtitle Preview */}
              {note.subtitleText && (
                <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded mb-3 line-clamp-2 italic border-l-2 border-yellow-200">
                  "{note.subtitleText.substring(0, 100)}{note.subtitleText.length > 100 ? '...' : ''}"
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={(e) => handleEditClick(e, note)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                >
                  <FaEdit className="h-3 w-3" />
                  Edit
                </button>
                <button
                  onClick={(e) => handleDeleteClick(e, note.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                >
                  <FaTrash className="h-3 w-3" />
                  Delete
                </button>
              </div>

              {/* Delete Confirmation */}
              {deletingNoteId === note.id && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-sm text-red-700 mb-2">Delete this note?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(note.id);
                      }}
                      className="flex-1 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition"
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingNoteId(null);
                      }}
                      className="flex-1 px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
