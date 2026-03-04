'use client';

import { useState, useCallback } from 'react';

const API_BASE_URL = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
    : 'http://localhost:8000';

export function useAudioNotes(userId, jobId, getToken, onNotesUpdate) {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Helper to map backend snake_case to frontend camelCase expected by NotesList.jsx
    const mapNote = useCallback((n) => ({
        ...n,
        userNote: n.user_note || n.userNote,
        subtitleText: n.subtitle_text || n.subtitleText,
        createdAt: n.created_at || n.createdAt
    }), []);

    const fetchNotes = useCallback(async () => {
        if (!userId || !jobId || !getToken) return;
        setLoading(true);
        try {
            const token = await getToken();
            const response = await fetch(`${API_BASE_URL}/api/notes/${userId}/${jobId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                const mappedNotes = (data.notes || []).map(mapNote);
                setNotes(mappedNotes);
            }
        } catch (error) {
            console.error('Error fetching notes:', error);
        } finally {
            setLoading(false);
        }
    }, [userId, jobId, getToken, mapNote]);

    const saveNote = useCallback(async (noteText, currentTime, subtitle, editingNoteId = null) => {
        if (!userId || !jobId || !getToken) return;
        setIsSaving(true);
        try {
            const token = await getToken();
            const method = editingNoteId ? 'PUT' : 'POST';
            const url = editingNoteId
                ? `${API_BASE_URL}/api/notes/${userId}/${jobId}/${editingNoteId}`
                : `${API_BASE_URL}/api/notes/${userId}/${jobId}?timestamp=${currentTime}&user_note=${encodeURIComponent(noteText)}&subtitle_text=${encodeURIComponent(subtitle)}`;

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: editingNoteId ? JSON.stringify({ user_note: noteText }) : undefined,
            });

            if (response.ok) {
                const rawNote = await response.json();
                const newNote = mapNote(rawNote);
                setNotes(prev => {
                    let updated;
                    if (editingNoteId) {
                        updated = prev.map(n => n.id === editingNoteId ? newNote : n);
                    } else {
                        updated = [...prev, newNote];
                    }
                    if (onNotesUpdate) onNotesUpdate(updated.length);
                    return updated;
                });
                return newNote;
            }
        } catch (error) {
            console.error('Error saving note:', error);
        } finally {
            setIsSaving(false);
        }
    }, [userId, jobId, getToken, onNotesUpdate, mapNote]);

    const deleteNote = useCallback(async (noteId) => {
        if (!userId || !jobId || !getToken) return;
        try {
            const token = await getToken();
            const response = await fetch(`${API_BASE_URL}/api/notes/${userId}/${jobId}/${noteId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                setNotes(prev => {
                    const updated = prev.filter(n => n.id !== noteId);
                    if (onNotesUpdate) onNotesUpdate(updated.length);
                    return updated;
                });
                return true;
            }
        } catch (error) {
            console.error('Error deleting note:', error);
        }
        return false;
    }, [userId, jobId, getToken, onNotesUpdate]);

    return {
        notes,
        loading,
        isSaving,
        fetchNotes,
        saveNote,
        deleteNote
    };
}
