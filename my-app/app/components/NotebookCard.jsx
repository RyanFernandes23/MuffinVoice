'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback } from 'react';
import { Play, Headphones, Trash2, StickyNote, ExternalLink, Loader2, CheckCircle2, Clock } from 'lucide-react';

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
  notesCount = 0,
  userId,
  jobId,
  getToken,
  sourceUrl,
  onOpen,
  onDelete,
}) {
  const isCompleted = status === 'completed';
  const isProcessing = status === 'processing' || status === 'queued';

  const statusConfig = {
    completed: {
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      label: 'Ready',
      style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    },
    processing: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
      label: 'Processing',
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
    }
  };

  const currentStatus = statusConfig[status] || statusConfig.queued;

  return (
    <div
      onClick={isCompleted ? onOpen : undefined}
      className={`
        relative rounded-xl p-5 border border-white/[0.08] transition-all duration-300
        ${isCompleted ? 'cursor-pointer hover:border-white/[0.15]' : 'cursor-default'}
      `}
      style={{ background: '#111111' }}
    >
      {/* Status Badge */}
      <div className="flex items-center justify-between mb-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border ${currentStatus.style}`}>
          {currentStatus.icon}
          {currentStatus.label}
        </span>

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
      <h3 className="text-base font-semibold text-white mb-3 line-clamp-2">
        {title}
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
        ) : (
          <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/[0.06]">
            {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isProcessing ? 'Processing...' : 'Unavailable'}
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          className="p-2 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-all border border-white/[0.06]"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}