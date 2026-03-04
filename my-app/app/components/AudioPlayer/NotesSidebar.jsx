'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, StickyNote } from 'lucide-react';
import NotesList from '../NotesList';

export default function NotesSidebar({
    isOpen,
    onClose,
    notes,
    onNoteClick,
    onDeleteNote,
    onEditNote,
    loading,
    userId,
    jobId,
    getToken
}) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="fixed bottom-0 right-0 w-96 h-full p-4 z-40 flex flex-col pt-20"
                    style={{
                        background: 'rgba(10, 10, 10, 0.95)',
                        backdropFilter: 'blur(12px)',
                        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                            <StickyNote size={24} /> My Notes
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-neutral-500 hover:text-white transition-colors p-1 rounded-lg"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <NotesList
                        notes={notes}
                        onNoteClick={onNoteClick}
                        onDeleteNote={onDeleteNote}
                        onEditNote={onEditNote}
                        isLoading={loading}
                        userId={userId}
                        jobId={jobId}
                        getToken={getToken}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
