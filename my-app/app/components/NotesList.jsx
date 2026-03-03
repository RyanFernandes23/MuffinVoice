'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FaTrash, FaEdit, FaSearch, FaTimes } from 'react-icons/fa';

export default function NotesList({
  notes = [], onNoteClick, onDeleteNote, onEditNote, isLoading = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const searchTimeoutRef = useRef(null);

  const filteredNotes = useMemo(() => {
    if (!searchTerm.trim()) return notes;
    const term = searchTerm.toLowerCase();
    return notes.filter(note =>
      note.userNote.toLowerCase().includes(term) ||
      (note.subtitleText && note.subtitleText.toLowerCase().includes(term))
    );
  }, [searchTerm, notes]);

  const debouncedSetSearchTerm = useCallback((value) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setSearchTerm(value), 300);
  }, []);

  useEffect(() => { return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); }; }, []);

  const formatTime = useCallback((time) => {
    if (!time && time !== 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, []);

  const formatDate = useCallback((dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Unknown date';
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return 'Unknown date'; }
  }, []);

  const handleDeleteClick = useCallback((e, noteId) => { e.stopPropagation(); setDeletingNoteId(noteId); }, []);
  const confirmDelete = useCallback(async (e, noteId) => {
    e.stopPropagation();
    try { await onDeleteNote(noteId); setDeletingNoteId(null); }
    catch (error) { console.error('Error deleting note:', error); }
  }, [onDeleteNote]);
  const cancelDelete = useCallback((e) => { e.stopPropagation(); setDeletingNoteId(null); }, []);
  const handleEditClick = useCallback((e, note) => { e.stopPropagation(); onEditNote(note); }, [onEditNote]);
  const handleNoteClick = useCallback((timestamp) => { onNoteClick(timestamp); }, [onNoteClick]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); document.getElementById('notes-search-input')?.focus(); }
      if (e.key === 'Escape') { if (deletingNoteId) setDeletingNoteId(null); else if (searchTerm) clearSearch(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deletingNoteId, searchTerm, clearSearch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" role="status" aria-live="polite">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-neutral-700 border-t-white rounded-lg animate-spin mx-auto mb-3" />
          <p className="text-neutral-400">Loading notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="relative mb-4">
        <label htmlFor="notes-search-input" className="sr-only">Search notes</label>
        <FaSearch className="absolute left-3 top-3 text-neutral-500 pointer-events-none" aria-hidden="true" />
        <input
          id="notes-search-input" type="text" placeholder="Search notes... (Ctrl+F)"
          defaultValue={searchTerm} onChange={(e) => debouncedSetSearchTerm(e.target.value)}
          className="w-full pl-10 pr-10 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl focus:outline-none focus:border-white/20 text-white placeholder-neutral-600 transition-all"
          aria-label="Search notes"
        />
        {searchTerm && (
          <button onClick={clearSearch} className="absolute right-3 top-3 text-neutral-500 hover:text-white transition-colors" aria-label="Clear search" type="button">
            <FaTimes className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Notes Count */}
      <div className="text-sm text-neutral-500 mb-3" role="status" aria-live="polite">
        {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
        {searchTerm && filteredNotes.length !== notes.length && ` (filtered from ${notes.length})`}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-2" role="list" aria-label="Notes list">
        {filteredNotes.length === 0 ? (
          <div className="text-center py-8 text-neutral-500" role="status">
            <p className="text-sm">
              {notes.length === 0 ? '📝 No notes yet. Create one while listening!' : '🔍 No notes match your search'}
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => handleNoteClick(note.timestamp)}
              className="rounded-xl p-3 border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer group focus-within:ring-1 focus-within:ring-white/20"
              role="listitem" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNoteClick(note.timestamp); } }}
              aria-label={`Note at ${formatTime(note.timestamp)}: ${note.userNote}`}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <span className="font-semibold text-white text-sm" aria-label={`Timestamp: ${formatTime(note.timestamp)}`}>
                  ⏱ {formatTime(note.timestamp)}
                </span>
                <time className="text-xs text-neutral-600" dateTime={note.createdAt}>
                  {formatDate(note.createdAt)}
                </time>
              </div>

              {/* Note Text */}
              <p className="text-sm text-neutral-300 mb-2 line-clamp-2 whitespace-pre-wrap break-words">{note.userNote}</p>

              {/* Subtitle Preview */}
              {note.subtitleText && (
                <div className="text-xs text-neutral-500 bg-white/[0.03] p-2 rounded-lg mb-3 line-clamp-2 italic border-l-2 border-white/10" aria-label="Transcript context">
                  <span className="sr-only">Transcript context: </span>
                  &quot;{note.subtitleText.length > 100 ? `${note.subtitleText.substring(0, 100)}...` : note.subtitleText}&quot;
                </div>
              )}

              {/* Action Buttons */}
              {deletingNoteId !== note.id && (
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" role="group" aria-label="Note actions">
                  <button
                    onClick={(e) => handleEditClick(e, note)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-white/[0.06] text-neutral-300 rounded-lg hover:bg-white/[0.1] transition-all"
                    aria-label={`Edit note at ${formatTime(note.timestamp)}`} type="button"
                  >
                    <FaEdit className="h-3 w-3" aria-hidden="true" /> Edit
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, note.id)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all"
                    aria-label={`Delete note at ${formatTime(note.timestamp)}`} type="button"
                  >
                    <FaTrash className="h-3 w-3" aria-hidden="true" /> Delete
                  </button>
                </div>
              )}

              {/* Delete Confirmation */}
              {deletingNoteId === note.id && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl" role="dialog" aria-labelledby={`delete-confirm-${note.id}`} aria-modal="true">
                  <p id={`delete-confirm-${note.id}`} className="text-sm text-red-400 mb-2 font-medium">Delete this note?</p>
                  <div className="flex gap-2">
                    <button onClick={(e) => confirmDelete(e, note.id)}
                      className="flex-1 px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all font-medium"
                      autoFocus type="button">
                      Delete
                    </button>
                    <button onClick={cancelDelete}
                      className="flex-1 px-3 py-1.5 text-xs bg-white/[0.05] text-neutral-300 rounded-lg hover:bg-white/[0.08] transition-all font-medium border border-white/[0.08]"
                      type="button">
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