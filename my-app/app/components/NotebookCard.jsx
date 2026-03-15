'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useMemo } from 'react';
import { Play, Headphones, Trash2, StickyNote, ExternalLink, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

import { truncateText } from '../utils/textUtils';

const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const voiceNames = {
  af_bella: 'Bella',
  af_sarah: 'Sarah',
  am_michael: 'Michael',
  bm_fable: 'Fable',
  bf_emma: 'Emma',
  em_alex: 'Alex',
};

export default function NotebookCard({
  title,
  voice,
  status,
  createdAt,
  notesCount = 0,
  userId,
  jobId,
  getToken,
  sourceUrl,
  progress_percent = 0,
  onOpen,
  onDelete,
  isDeleting = false,
  isDemo = false,
}) {
  // Truncate the title
  const truncatedTitle = truncateText(title, 60, 10);

  // Detect stale notebooks stuck in processing/queued for >10 minutes
  const isStale = useMemo(() => {
    if (status !== 'processing' && status !== 'queued') return false;
    if (!createdAt) return false;

    // Ensure the date string is treated as UTC if it doesn't already specify a timezone.
    const dateString = (createdAt.endsWith('Z') || createdAt.includes('+') || createdAt.includes('-') && createdAt.indexOf('T') > 0 && createdAt.split('T')[1].includes('-'))
      ? createdAt
      : `${createdAt}Z`;

    const createdTime = new Date(dateString).getTime();
    return Date.now() - createdTime > STALE_TIMEOUT_MS;
  }, [status, createdAt]);

  // Override status for stale notebooks
  const effectiveStatus = isStale ? 'timed_out' : status;

  const isCompleted = effectiveStatus === 'completed';
  const isProcessing = effectiveStatus === 'processing' || effectiveStatus === 'queued';
  const isTimedOut = effectiveStatus === 'timed_out';
  const isFailed = effectiveStatus === 'failed' || isTimedOut;

  const statusConfig = {
    completed: {
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      label: 'Ready',
      style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
    processing: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      label: progress_percent > 0 ? `Processing ${progress_percent}%` : 'Processing',
      style: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    },
    queued: {
      icon: <Clock className="w-3.5 h-3.5" />,
      label: 'Queued',
      style: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20'
    },
    failed: {
      icon: <span className="text-xs">✕</span>,
      label: 'Failed',
      style: 'bg-red-500/10 text-red-400 border-red-500/20'
    },
    timed_out: {
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      label: 'Timed Out',
      style: 'bg-red-500/10 text-red-400 border-red-500/20'
    }
  };

  const currentStatus = statusConfig[effectiveStatus] || statusConfig.queued;

  return (
    <div
      onClick={isCompleted ? onOpen : undefined}
      className={`
        relative rounded-xl p-5 border border-white/[0.08] transition-all duration-300
        ${isCompleted ? 'cursor-pointer hover:border-white/[0.15]' : 'cursor-default'}
      `}
      style={{ background: '#111111' }}
    >
      {/* Progress Bar (at the very top of the card) */}
      {isProcessing && progress_percent > 0 && (
        <div className="absolute top-0 left-0 right-0 h-1 overflow-hidden rounded-t-xl bg-white/5">
          <motion.div
            className="h-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${progress_percent}%` }}
            transition={{ type: "spring", damping: 20, stiffness: 50 }}
          />
        </div>
      )}

      {/* Status Badge */}
      <div className="flex items-center justify-between mb-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border ${currentStatus.style}`}>
          {currentStatus.icon}
          {currentStatus.label}
        </span>

        {isDemo && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg bg-white text-black border border-white/20">
            Free
          </span>
        )}

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-neutral-500 hover:text-white transition-colors p-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-white mb-3 line-clamp-2 h-12">
        {truncatedTitle}
      </h3>

      {/* Meta Info */}
      <div className="flex items-center gap-3 text-xs text-neutral-500 mb-4">
        <span className="flex items-center gap-1">
          <Headphones className="w-3 h-3" />
          {voiceNames[voice] || voice}
        </span>
        {notesCount > 0 && (
          <span className="flex items-center gap-1">
            <StickyNote className="w-3 h-3" />
            {notesCount}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isCompleted ? (
          <button
            onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-black hover:opacity-90 transition-opacity"
          >
            <Play className="w-3.5 h-3.5" />
            Play
          </button>
        ) : isFailed ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            disabled={isDeleting}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              isDeleting 
                ? 'bg-red-500/5 text-red-400/50 border-red-500/10 cursor-not-allowed' 
                : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'
            }`}
          >
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        ) : (
          <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/[0.06]">
            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isProcessing ? (progress_percent > 0 ? `Processing ${progress_percent}%` : 'Processing...') : 'Unavailable'}
          </div>
        )}

        {!isDemo && !isFailed && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            disabled={isDeleting}
            className={`p-2 rounded-lg transition-all border border-white/[0.06] ${
              isDeleting 
                ? 'text-red-400/50 cursor-not-allowed' 
                : 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}