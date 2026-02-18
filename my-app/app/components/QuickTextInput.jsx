'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, Mic, Loader2, X, Check, Zap, Crown, Send } from 'lucide-react';
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
  const [draftStatus, setDraftStatus] = useState('idle');
  const { getToken } = useAuth();

  const { usage: usageData, loading: usageLoading, refresh: refreshUsage } = useUsage(getToken);
  const [error, setError] = useState(null);

  const stats = useMemo(() => {
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const tokenCount = charCount;
    return { charCount, wordCount, tokenCount };
  }, [text]);

  const tokensAfterText = usageData.remaining - stats.tokenCount;
  const exceedsTokens = stats.tokenCount > usageData.remaining;
  const canSubmit = text.trim().length > 0 && !exceedsTokens && !isLoading && !usageLoading && usageData.plan_name !== null;

  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    const savedTitle = localStorage.getItem(TITLE_STORAGE_KEY);
    if (savedDraft) setText(savedDraft);
    if (savedTitle) setTitle(savedTitle);
  }, []);

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
      setTimeout(() => setDraftStatus('idle'), 2000);
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [text, title]);

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
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TITLE_STORAGE_KEY);
        setText('');
        setTitle('');
        setDraftStatus('idle');
        toast.success('Text conversion started! Your notebook will appear shortly.');
        refreshUsage();
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

  const handleClear = () => {
    setText('');
    setTitle('');
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TITLE_STORAGE_KEY);
    setDraftStatus('idle');
  };

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  }, [canSubmit, handleSubmit]);

  const getUsageColor = () => {
    if (usageData.percent_used >= 90) return { bar: 'bg-red-500', text: 'text-red-400' };
    if (usageData.percent_used >= 70) return { bar: 'bg-amber-500', text: 'text-amber-400' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
  };

  const usageColors = getUsageColor();

  const getPlanBadge = () => {
    const plan = usageData.plan_name?.toLowerCase() || 'explorer';
    if (plan.includes('professional') || plan.includes('pro')) {
      return { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-300', icon: Crown };
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
      transition={{ duration: 0.5 }}
      className="glass-card rounded-2xl border border-white/10 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-accent/20 flex items-center justify-center">
            <Type className="w-5 h-5 text-primary-glow" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              Quick Text to Speech
              {draftStatus === 'saved' && (
                <span className="text-xs font-normal text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500">Paste your text and convert to audio</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-3 py-1 rounded-full border ${planBadge.bg} ${planBadge.border} ${planBadge.text} flex items-center gap-1`}>
            {PlanIcon && <PlanIcon className="w-3 h-3" />}
            <span className="capitalize">{usageData.plan_name || 'Explorer'}</span>
          </span>
        </div>
      </div>

      {/* Token Usage Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-400">Token Usage</span>
          <span className="text-gray-300">
            <span className={usageColors.text}>{usageData.remaining.toLocaleString()}</span>
            <span className="text-gray-500"> / {usageData.allocated.toLocaleString()} remaining</span>
          </span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          {!usageLoading && usageData.plan_name !== null ? (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(usageData.percent_used, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${usageColors.bar}`}
            />
          ) : (
            <div className="h-full w-1/4 bg-gray-700 rounded-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Title Input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full px-4 py-2.5 mb-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all"
        disabled={isLoading}
      />

      {/* Text Area */}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setError(null); }}
        onKeyDown={handleKeyDown}
        placeholder="Paste or type your text here... Press Ctrl+Enter to submit"
        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all resize-none min-h-[140px]"
        disabled={isLoading}
      />

      {/* Stats Row */}
      <div className="flex items-center justify-between mt-2 mb-4 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>{stats.wordCount} words</span>
          <span>{stats.charCount.toLocaleString()} chars</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.tokenCount > 0 && (
            <>
              <span className={exceedsTokens ? 'text-red-400 font-medium' : 'text-gray-400'}>
                {stats.tokenCount.toLocaleString()} tokens
              </span>
              <span className="text-gray-600">→</span>
              <span className={`font-medium ${exceedsTokens ? 'text-red-400' : tokensAfterText < usageData.remaining * 0.1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {tokensAfterText.toLocaleString()} left
              </span>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {(exceedsTokens || error) && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="text-xs text-red-400 mb-3"
          >
            {exceedsTokens ? 'Text exceeds available tokens. Please reduce or upgrade.' : error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Voice Selector */}
        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
          <Mic className="w-4 h-4 text-gray-400" />
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

        <div className="flex-1" />

        {text && (
          <button
            onClick={handleClear}
            className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5 flex items-center gap-1.5"
            disabled={isLoading}
          >
            <X className="w-4 h-4" /> Clear
          </button>
        )}

        <motion.button
          whileHover={{ scale: canSubmit ? 1.02 : 1 }}
          whileTap={{ scale: canSubmit ? 0.98 : 1 }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 text-sm ${!canSubmit
            ? 'bg-gray-800/50 text-gray-500 cursor-not-allowed border border-white/5'
            : 'bg-gradient-to-r from-primary to-accent text-white hover:shadow-lg hover:shadow-primary/20'
            }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Converting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Convert to Audio
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
