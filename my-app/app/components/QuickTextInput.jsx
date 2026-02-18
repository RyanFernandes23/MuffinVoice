'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, Mic, Loader2, X, Check, FileText, ChevronDown, ChevronUp, Zap, Crown, Maximize2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useUsage } from '../../hooks/useUsage';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

const STORAGE_KEY = 'wikivoice_text_draft';
const TITLE_STORAGE_KEY = 'wikivoice_text_draft_title';

const voices = [
  { id: 'af_bella', name: 'Bella', tag: 'Female' },
  { id: 'af_sarah', name: 'Sarah', tag: 'Female' },
  { id: 'am_michael', name: 'Michael', tag: 'Male' },
  { id: 'bm_fable', name: 'Fable', tag: 'Male' },
  { id: 'bf_emma', name: 'Emma', tag: 'Female' },
  { id: 'em_alex', name: 'Alex', tag: 'Male' },
];

export default function QuickTextInput({ onTextSubmit }) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [draftStatus, setDraftStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const { getToken } = useAuth();

  // Use shared usage hook with retry mechanism
  const { usage: usageData, loading: usageLoading, refresh: refreshUsage } = useUsage(getToken);

  // Error state
  const [error, setError] = useState(null);

  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // --- Derived values ---
  const stats = useMemo(() => {
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lineCount = text ? text.split('\n').length : 1;
    const tokenCount = charCount; // 1 char = 1 token (matching backend)
    return { charCount, wordCount, lineCount, tokenCount };
  }, [text]);

  const tokensAfterText = usageData.remaining - stats.tokenCount;
  const exceedsTokens = stats.tokenCount > usageData.remaining;
  const canSubmit = text.trim().length > 0 && !exceedsTokens && !isLoading && !usageLoading && usageData.plan_name !== null;

  // --- Line numbers ---
  const lineNumbers = useMemo(() => {
    const count = text ? text.split('\n').length : 1;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [text]);

  // --- Load draft from localStorage ---
  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    const savedTitle = localStorage.getItem(TITLE_STORAGE_KEY);
    if (savedDraft) setText(savedDraft);
    if (savedTitle) setTitle(savedTitle);
  }, []);

  // --- Auto-save draft ---
  useEffect(() => {
    if (!text.trim() && !title.trim()) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TITLE_STORAGE_KEY);
      setDraftStatus('idle');
      return;
    }

    setDraftStatus('saving');
    const timeoutId = setTimeout(() => {
      if (text.trim()) localStorage.setItem(STORAGE_KEY, text);
      if (title.trim()) localStorage.setItem(TITLE_STORAGE_KEY, title);
      setDraftStatus('saved');
      // Reset to idle after 2s
      setTimeout(() => setDraftStatus('idle'), 2000);
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [text, title]);

  // --- Sync textarea scroll with line numbers ---
  const handleTextareaScroll = useCallback(() => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // --- Submit handler ---
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/upload_text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'voice': selectedVoice,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: text,
          title: title.trim() || undefined,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Clear drafts
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TITLE_STORAGE_KEY);
        setText('');
        setTitle('');
        setDraftStatus('idle');

        toast.success('Text conversion started! Your notebook will appear shortly.');

        // Refresh usage using the shared hook
        refreshUsage();

        // Notify parent
        if (onTextSubmit) {
          onTextSubmit(result);
        }
      } else if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.detail || 'Insufficient tokens. Please upgrade your plan.';
        setError(msg);
        toast.error(msg);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData.detail || 'Failed to process text. Please try again.';
        setError(msg);
        toast.error(msg);
      }
    } catch (err) {
      console.error('Error submitting text:', err);
      const msg = 'Network error. Please check your connection and try again.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }, [canSubmit, text, title, selectedVoice, getToken, onTextSubmit, refreshUsage]);

  // --- Clear handler ---
  const handleClear = () => {
    setText('');
    setTitle('');
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TITLE_STORAGE_KEY);
    setDraftStatus('idle');
    if (textareaRef.current) textareaRef.current.focus();
  };

  // --- Expand to upload modal ---
  const handleExpandToModal = () => {
    if (onTextSubmit) {
      onTextSubmit({ openModal: true, initialText: text });
    }
  };

  // --- Keyboard shortcut (Ctrl/Cmd+Enter to submit) ---
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  }, [canSubmit, handleSubmit]);

  // --- Token usage bar color ---
  const getUsageColor = () => {
    if (usageData.percent_used >= 90) return { bar: 'bg-red-500', text: 'text-red-400', glow: 'shadow-red-500/30' };
    if (usageData.percent_used >= 70) return { bar: 'bg-amber-500', text: 'text-amber-400', glow: 'shadow-amber-500/30' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-400', glow: 'shadow-emerald-500/30' };
  };

  const usageColors = getUsageColor();

  // --- Plan badge styling ---
  const getPlanBadge = () => {
    const plan = usageData.plan_name?.toLowerCase() || 'explorer';
    if (plan.includes('professional') || plan.includes('pro')) {
      return { bg: 'bg-violet-500/20', border: 'border-violet-500/40', text: 'text-violet-300', icon: Crown };
    }
    if (plan.includes('creator')) {
      return { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-300', icon: Zap };
    }
    return { bg: 'bg-gray-500/20', border: 'border-gray-500/40', text: 'text-gray-300', icon: null };
  };

  const planBadge = getPlanBadge();
  const PlanIcon = planBadge.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
      className="rounded-2xl overflow-hidden border border-white/10"
      style={{
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 50%, rgba(15, 23, 42, 0.95) 100%)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 60px rgba(59,130,246,0.08)',
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex justify-between items-center px-6 py-3 pr-44 cursor-pointer select-none border-b border-white/5"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center shadow-lg shadow-primary/10">
            <Type className="w-5 h-5 text-primary-glow" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Quick Editor
              {draftStatus === 'saved' && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs font-normal text-emerald-400 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Draft saved
                </motion.span>
              )}
              {draftStatus === 'saving' && (
                <span className="text-xs font-normal text-gray-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500">
              Type or paste text · Ctrl+Enter to submit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Plan Badge */}
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${planBadge.bg} ${planBadge.border} ${planBadge.text} flex items-center gap-1`}>
            {PlanIcon && <PlanIcon className="w-3 h-3" />}
            {(usageData.plan_name || 'Explorer').charAt(0).toUpperCase() + (usageData.plan_name || 'Explorer').slice(1)}
          </span>

          {/* Collapse toggle */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </motion.button>
        </div>
      </div>

      {/* ── Body (collapsible) ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-6 pt-4 pb-5 space-y-4">

              {/* ── Token Usage Bar ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">
                    Token Usage
                  </span>
                  <span className={`font-medium ${usageColors.text}`}>
                    {usageData.used_this_month.toLocaleString()} used
                    <span className="text-gray-500 mx-1.5">·</span>
                    <span className="text-white font-semibold">{usageData.remaining.toLocaleString()}</span>
                    <span className="text-gray-500 ml-1">remaining</span>
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                  {!usageLoading && usageData.plan_name !== null ? (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(usageData.percent_used, 100)}%` }}
                      transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                      className={`h-full rounded-full ${usageColors.bar} relative`}
                      style={{ boxShadow: `0 0 12px ${usageColors.bar === 'bg-emerald-500' ? 'rgba(16,185,129,0.4)' : usageColors.bar === 'bg-amber-500' ? 'rgba(245,158,11,0.4)' : 'rgba(239,68,68,0.4)'}` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 bg-gray-700 rounded-full animate-pulse" />
                  )}
                </div>
                {usageData.allocated > 0 && (
                  <p className="text-[11px] text-gray-600 text-right">
                    {usageData.allocated.toLocaleString()} total allocated
                  </p>
                )}
              </div>

              {/* ── Title Input ── */}
              <div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (optional — auto-generated from first line)"
                  className="w-full px-4 py-2.5 bg-gray-900/60 border border-gray-700/50 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-glow/50 focus:border-primary-glow/30 transition-all"
                  disabled={isLoading}
                />
              </div>

              {/* ── Editor Area with Line Numbers ── */}
              <div
                className="editor-container rounded-xl border border-gray-700/50 overflow-hidden relative group transition-all focus-within:border-primary-glow/40 focus-within:shadow-lg focus-within:shadow-primary/5"
                style={{ background: '#0d1117' }}
              >
                <div className="flex">
                  {/* Line Numbers Gutter */}
                  <div
                    ref={lineNumbersRef}
                    className="line-numbers-gutter select-none overflow-hidden flex-shrink-0 py-3 pr-2 text-right border-r border-gray-800"
                    style={{
                      width: '48px',
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                      fontSize: '13px',
                      lineHeight: '1.65',
                      color: 'rgba(148, 163, 184, 0.35)',
                      background: 'rgba(13, 17, 23, 0.6)',
                    }}
                    aria-hidden="true"
                  >
                    {lineNumbers.map(num => (
                      <div key={num} className="px-2">{num}</div>
                    ))}
                  </div>

                  {/* Textarea */}
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => { setText(e.target.value); setError(null); }}
                    onScroll={handleTextareaScroll}
                    onKeyDown={handleKeyDown}
                    placeholder="Start typing or paste your content here...
                    
Your text will be converted into an audiobook with AI-powered text-to-speech."
                    className="flex-1 resize-none bg-transparent text-gray-200 placeholder-gray-600/80 focus:outline-none py-3 px-4 min-h-[120px]"
                    style={{
                      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
                      fontSize: '14px',
                      lineHeight: '1.65',
                      caretColor: '#60a5fa',
                    }}
                    rows={6}
                    disabled={isLoading}
                    spellCheck={true}
                  />
                </div>

                {/* ── Status Bar ── */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800/80 text-[11px] text-gray-500"
                  style={{ background: 'rgba(13, 17, 23, 0.8)' }}
                >
                  <div className="flex items-center gap-4">
                    <span>{stats.lineCount} {stats.lineCount === 1 ? 'line' : 'lines'}</span>
                    <span>{stats.wordCount} {stats.wordCount === 1 ? 'word' : 'words'}</span>
                    <span>{stats.charCount.toLocaleString()} chars</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {stats.tokenCount > 0 && (
                      <span className={exceedsTokens ? 'text-red-400 font-medium' : tokensAfterText < usageData.remaining * 0.1 && tokensAfterText >= 0 ? 'text-amber-400' : 'text-gray-500'}>
                        {stats.tokenCount.toLocaleString()} tokens
                        {tokensAfterText >= 0 && (
                          <span className="text-gray-600 ml-1">
                            ({tokensAfterText.toLocaleString()} left)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Error / Warning messages ── */}
              <AnimatePresence>
                {exceedsTokens && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-xs text-red-400 flex items-center gap-1.5 px-1"
                  >
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0" />
                    Text exceeds your available tokens. Please reduce or upgrade your plan.
                  </motion.p>
                )}
                {error && !exceedsTokens && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="text-xs text-red-400 flex items-center gap-1.5 px-1"
                  >
                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full flex-shrink-0" />
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* ── Controls Row ── */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* Voice Selector */}
                <div className="flex items-center gap-2 bg-gray-800/50 rounded-xl px-3 py-2 border border-gray-700/40">
                  <Mic className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="bg-transparent text-sm text-white focus:outline-none cursor-pointer appearance-none pr-4"
                    disabled={isLoading}
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0 center',
                    }}
                  >
                    {voices.map((voice) => (
                      <option key={voice.id} value={voice.id} className="bg-gray-800">
                        {voice.name} ({voice.tag})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Clear Button */}
                {text && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleClear}
                    className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5 flex items-center gap-1.5"
                    disabled={isLoading}
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </motion.button>
                )}

                {/* Expand to Full Modal */}
                {text.length > 200 && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleExpandToModal}
                    className="text-sm text-primary-glow hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-primary/5 flex items-center gap-1.5"
                    disabled={isLoading}
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> Full Editor
                  </motion.button>
                )}

                {/* Submit Button */}
                <motion.button
                  whileHover={{ scale: canSubmit ? 1.03 : 1 }}
                  whileTap={{ scale: canSubmit ? 0.97 : 1 }}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={`px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all flex items-center gap-2 text-sm ${!canSubmit
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700/40'
                    : 'bg-gradient-to-r from-primary to-accent text-white hover:shadow-primary/30 border border-white/10'
                    }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      Generate Notebook
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
