'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Play, Trash2, X, FileText, CheckCircle, XCircle, Clock, Loader2, StickyNote, Mic } from 'lucide-react';

const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000'; // Default for server-side


export default function NotebookCard({ 
  title, 
  voice, 
  status, 
  onDelete, 
  onOpen, 
  userId, 
  jobId, 
  getToken, 
  notesCount: initialNotesCount = 0 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [notesCount, setNotesCount] = useState(initialNotesCount);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const menuRef = useRef(null);

  // Memoize the fetch function to avoid recreating it on every render
  const fetchNotesCount = useCallback(async () => {
    if (!userId || !jobId || !getToken) return;
    
    setIsLoadingCount(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/notes/count/${userId}/${jobId}`, 
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setNotesCount(data.count);
      } else {
        console.error('Failed to fetch notes count:', response.status);
      }
    } catch (error) {
      console.error('Error fetching notes count:', error);
    } finally {
      setIsLoadingCount(false);
    }
  }, [userId, jobId, getToken]);

  // Update notes count when prop changes
  useEffect(() => {
    setNotesCount(initialNotesCount);
  }, [initialNotesCount]);

  // Fetch notes count on initial mount if not provided
  useEffect(() => {
    if (initialNotesCount === 0) {
      fetchNotesCount();
    }
  }, [initialNotesCount, fetchNotesCount]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setShowConfirmDialog(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleOpen = useCallback(() => {
    onOpen();
    setIsOpen(false);
  }, [onOpen]);

  const handleDeleteClick = useCallback(() => {
    setShowConfirmDialog(true);
    setIsOpen(false);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    onDelete();
    setShowConfirmDialog(false);
  }, [onDelete]);

  const handleCancelDelete = useCallback(() => {
    setShowConfirmDialog(false);
  }, []);

  const handleMenuToggle = useCallback((e) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  // Memoize computed values
  const displayTitle = title.length > 35 ? `${title.substring(0, 32)}...` : title;
  
  const getStatusColor = () => {
    switch(status) {
      case 'completed': return 'from-emerald-500 to-green-600';
      case 'processing': return 'from-amber-500 to-orange-600';
      case 'failed': return 'from-red-500 to-rose-600';
      default: return 'from-gray-500 to-slate-600';
    }
  };

  const getStatusGlow = () => {
    switch(status) {
      case 'completed': return 'shadow-emerald-500/30';
      case 'processing': return 'shadow-amber-500/30';
      case 'failed': return 'shadow-red-500/30';
      default: return 'shadow-gray-500/30';
    }
  };

  const getStatusIcon = () => {
    switch(status) {
      case 'completed': 
        return <CheckCircle className="w-4 h-4" />;
      case 'processing': 
        return (
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="w-4 h-4" />
          </motion.div>
        );
      case 'failed': 
        return <XCircle className="w-4 h-4" />;
      default: 
        return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ duration: 0.3 }}
        className="glass-card rounded-2xl p-5 relative cursor-pointer group overflow-hidden"
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
          }
        }}
        aria-label={`Open notebook: ${title}`}
      >
        {/* Fire fly glow effect */}
        <div 
          className={`absolute inset-0 bg-gradient-to-br from-${status === 'completed' ? 'emerald' : status === 'processing' ? 'amber' : status === 'failed' ? 'red' : 'gray'}-400/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-all duration-500`}
          aria-hidden="true"
        />
        
        {/* Animated border gradient */}
        <div 
          className={`absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-r from-${status === 'completed' ? 'emerald' : status === 'processing' ? 'amber' : status === 'failed' ? 'red' : 'gray'}-500/50 via-transparent to-${status === 'completed' ? 'emerald' : status === 'processing' ? 'amber' : status === 'failed' ? 'red' : 'gray'}-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
          style={{ mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)', maskComposite: 'exclude' }}
          aria-hidden="true"
        />
         
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1 pr-3">
              <motion.h3 
                className="text-lg font-bold text-white mb-2 line-clamp-2"
                whileHover={{ color: "#60a5fa" }}
              >
                {displayTitle}
              </motion.h3>
               
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-lg">
                  <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{voice}</span>
                </div>
                 
                <div 
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-gradient-to-r ${getStatusColor()} shadow-lg ${getStatusGlow()}`}
                  role="status"
                  aria-label={`Status: ${status}`}
                >
                  {getStatusIcon()}
                  <span className="font-medium capitalize">{status}</span>
                  {status === 'processing' && (
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-1.5 h-1.5 bg-white rounded-full ml-1"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
               
              {/* Notes Badge */}
              <motion.div 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary-glow text-xs rounded-full"
                whileHover={{ scale: 1.05 }}
                aria-label={`${notesCount} notes`}
              >
                <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="font-medium">
                  {isLoadingCount ? '...' : `${notesCount} note${notesCount !== 1 ? 's' : ''}`}
                </span>
              </motion.div>
            </div>
             
            {/* Menu */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleMenuToggle}
                className="text-gray-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-all duration-200"
                aria-label="Open menu"
                aria-expanded={isOpen}
                aria-haspopup="true"
              >
                <MoreHorizontal className="w-5 h-5" />
              </motion.button>
               
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    ref={menuRef}
                    className="absolute right-0 top-12 w-52 glass-card rounded-xl shadow-2xl border border-white/10 overflow-hidden z-50"
                    role="menu"
                  >
                    <motion.button
                      whileHover={{ x: 5, backgroundColor: "rgba(59, 130, 246, 0.1)" }}
                      onClick={handleOpen}
                      className="w-full text-left px-4 py-3 text-gray-200 hover:text-white flex items-center gap-3 transition-colors duration-200"
                      role="menuitem"
                    >
                      <Play className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                      <span>Play</span>
                    </motion.button>
                    <div className="border-t border-white/10" aria-hidden="true" />
                    <motion.button
                      whileHover={{ x: 5, backgroundColor: "rgba(239, 68, 68, 0.1)" }}
                      onClick={handleDeleteClick}
                      className="w-full text-left px-4 py-3 text-red-400 hover:text-red-300 flex items-center gap-3 transition-colors duration-200"
                      role="menuitem"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      <span>Delete</span>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
           
          {/* Hover effect shine */}
          <div 
            className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-700"
            style={{ transform: 'translateX(-100%)' }}
            onMouseMove={(e) => {
              e.currentTarget.style.transform = 'translateX(100%)';
            }}
            aria-hidden="true"
          />
        </div>
      </motion.div>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onClick={handleCancelDelete}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.2 }}
              className="glass-card rounded-2xl p-6 max-w-md w-full relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={handleCancelDelete} 
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
               
              <div className="text-center">
                <div 
                  className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
                  aria-hidden="true"
                >
                  <Trash2 className="w-8 h-8 text-red-400" />
                </div>
                <h3 id="delete-dialog-title" className="text-xl font-bold text-white mb-2">
                  Delete Notebook?
                </h3>
                <p id="delete-dialog-description" className="text-gray-400 mb-6">
                  Are you sure you want to delete <span className="font-semibold text-primary-glow">&quot;{title}&quot;</span>? This action cannot be undone.
                </p>
                 
                <div className="flex justify-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCancelDelete}
                    className="px-5 py-2.5 glass border border-white/20 text-white hover:bg-white/10 rounded-xl font-medium transition-all duration-200"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmDelete}
                    className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-xl font-medium hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/20 transition-all duration-200"
                  >
                    Delete
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}