'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreHorizontal, Play, FileText, Trash2, X } from 'lucide-react';

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
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/notes_count/${userId}/${jobId}`, 
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
      case 'completed': return 'from-green-500 to-emerald-600';
      case 'processing': return 'from-yellow-500 to-orange-600';
      case 'failed': return 'from-red-500 to-pink-600';
      default: return 'from-gray-500 to-slate-600';
    }
  };

  const getStatusIcon = () => {
    switch(status) {
      case 'completed': 
        return <FileText className="w-4 h-4" />;
      case 'processing': 
        return (
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Play className="w-4 h-4" />
          </motion.div>
        );
      case 'failed': 
        return <X className="w-4 h-4" />;
      default: 
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ y: -5 }}
        transition={{ duration: 0.3 }}
        className="glass rounded-2xl p-6 mb-6 relative cursor-pointer group"
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
        {/* Gradient accent on hover */}
        <div 
          className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 to-orange-500/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          aria-hidden="true"
        />
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <motion.h3 
                className="text-xl font-bold text-white mb-3"
                whileHover={{ color: "#FDE047" }}
              >
                {displayTitle}
              </motion.h3>
              
              <div className="flex items-center space-x-3 mb-3">
                <div className="flex items-center space-x-2 text-sm text-white/80">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  <span>Voice: {voice}</span>
                </div>
                
                <div 
                  className={`flex items-center space-x-2 text-sm px-3 py-1 rounded-full bg-gradient-to-r ${getStatusColor()}`}
                  role="status"
                  aria-label={`Status: ${status}`}
                >
                  {getStatusIcon()}
                  <span className="font-medium capitalize">{status}</span>
                  {status === 'processing' && (
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-2 h-2 bg-white rounded-full"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
              
              {/* Notes Badge */}
              <motion.div 
                className="inline-flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-green-500/20 to-emerald-600/20 border border-green-400/30 text-green-300 text-sm rounded-full"
                whileHover={{ scale: 1.05 }}
                aria-label={`${notesCount} notes`}
              >
                <FileText className="w-3 h-3" aria-hidden="true" />
                <span className="font-medium">
                  {isLoadingCount ? '...' : `${notesCount} note${notesCount !== 1 ? 's' : ''}`}
                </span>
              </motion.div>
            </div>
            
            {/* Menu */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleMenuToggle}
                className="text-white/60 hover:text-yellow-400 p-2 rounded-lg hover:bg-white/10 transition-all duration-200"
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
                    className="absolute right-0 top-12 w-52 glass rounded-xl shadow-2xl border border-white/20 overflow-hidden z-50"
                    role="menu"
                  >
                    <motion.button
                      whileHover={{ x: 5 }}
                      onClick={handleOpen}
                      className="w-full text-left px-4 py-3 text-white hover:bg-white/10 flex items-center space-x-3 transition-colors duration-200"
                      role="menuitem"
                    >
                      <Play className="w-4 h-4 text-green-400" aria-hidden="true" />
                      <span>Open Notebook</span>
                    </motion.button>
                    <div className="border-t border-white/10" aria-hidden="true" />
                    <motion.button
                      whileHover={{ x: 5 }}
                      onClick={handleDeleteClick}
                      className="w-full text-left px-4 py-3 text-red-400 hover:bg-red-500/20 flex items-center space-x-3 transition-colors duration-200"
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
          
          {/* Hover effect overlay */}
          <div 
            className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500"
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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            onClick={handleCancelDelete}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="glass rounded-2xl p-8 max-w-md w-full mx-4 relative"
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
                <p id="delete-dialog-description" className="text-gray-300 mb-6">
                  Are you sure you want to delete <span className="font-semibold text-yellow-400">&quot;{title}&quot;</span>? This action cannot be undone.
                </p>
                
                <div className="flex justify-center space-x-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleCancelDelete}
                    className="px-6 py-3 glass border-2 border-white/20 text-white hover:bg-white/10 rounded-xl font-medium transition-all duration-200"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmDelete}
                    className="px-6 py-3 bg-linear-to-r from-red-500 to-red-600 text-white rounded-xl font-medium hover:from-red-600 hover:to-red-700 shadow-lg transition-all duration-200"
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