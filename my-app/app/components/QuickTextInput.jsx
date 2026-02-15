'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Type, Mic, Loader2, X } from 'lucide-react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

const STORAGE_KEY = 'wikivoice_text_draft';

export default function QuickTextInput({ onTextSubmit }) {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [remainingTokens, setRemainingTokens] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { getToken } = useAuth();

  const voices = [
    { id: 'af_bella', name: 'Bella (Female)' },
    { id: 'af_sarah', name: 'Sarah (Female)' },
    { id: 'am_michael', name: 'Michael (Male)' },
    { id: 'bm_fable', name: 'Fable (Male)' },
    { id: 'bf_emma', name: 'Emma (Female)' },
    { id: 'em_alex', name: 'Alex (Male)' },
  ];

  const textCharCount = text.length;
  const textTokenCount = textCharCount;
  const tokensAfterText = remainingTokens - textTokenCount;
  const exceedsTokens = textTokenCount > remainingTokens;
  const canSubmit = text.trim().length > 0 && !exceedsTokens && !isLoading;

  // Load draft from localStorage on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      setText(savedDraft);
    }
    fetchUserTokens();
  }, []);

  // Save draft to localStorage when text changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (text.trim()) {
        localStorage.setItem(STORAGE_KEY, text);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [text]);

  const fetchUserTokens = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/usage`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRemainingTokens(data.data.remaining || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsLoading(true);
    
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
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Clear draft
        localStorage.removeItem(STORAGE_KEY);
        setText('');
        // Notify parent
        if (onTextSubmit) {
          onTextSubmit(result);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Upload failed:', errorData.detail || 'Unknown error');
      }
    } catch (error) {
      console.error('Error submitting text:', error);
    } finally {
      setIsLoading(false);
    }
  }, [canSubmit, text, selectedVoice, getToken, onTextSubmit]);

  const handleClear = () => {
    setText('');
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleExpand = () => {
    // Open full upload modal with pre-filled text
    if (onTextSubmit) {
      onTextSubmit({ openModal: true, initialText: text });
    }
  };

  // Don't render if no tokens
  if (remainingTokens === 0 && !isLoading) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-2xl p-6 mb-8 border border-white/10"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Type className="w-5 h-5 text-primary-glow" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Write Something</h3>
            <p className="text-xs text-gray-400">
              {remainingTokens.toLocaleString()} tokens remaining
            </p>
          </div>
        </div>
        
        {text && (
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10"
            title="Clear text"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Text Area */}
      <div className="mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type or paste your text here to convert to audio..."
          className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-glow focus:border-transparent text-white placeholder-gray-500 transition-all resize-none"
          rows={5}
          disabled={isLoading}
        />
        
        {/* Token Info */}
        <div className="flex justify-between items-center mt-2 text-xs">
          <span className={exceedsTokens ? 'text-red-400' : 'text-gray-400'}>
            {textCharCount.toLocaleString()} chars
          </span>
          <span className={exceedsTokens ? 'text-red-400 font-medium' : tokensAfterText < remainingTokens * 0.1 ? 'text-amber-400' : 'text-gray-400'}>
            {textTokenCount.toLocaleString()} tokens
            {textTokenCount > 0 && remainingTokens > 0 && (
              <span className="text-gray-500 ml-1">
                ({tokensAfterText.toLocaleString()} left)
              </span>
            )}
          </span>
        </div>
        
        {exceedsTokens && (
          <p className="text-xs text-red-400 mt-1">
            Text exceeds available tokens. Please reduce or upgrade.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Voice Selector */}
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-gray-400" />
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-glow"
            disabled={isLoading}
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand Button (if text is long) */}
        {text.length > 200 && (
          <button
            onClick={handleExpand}
            className="text-sm text-primary-glow hover:text-primary transition-colors px-3 py-2"
            disabled={isLoading}
          >
            Open in Full Editor
          </button>
        )}

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: canSubmit ? 1.02 : 1 }}
          whileTap={{ scale: canSubmit ? 0.98 : 1 }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all flex items-center gap-2 ${
            !canSubmit
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-primary to-accent text-white hover:shadow-primary/30'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Type className="w-4 h-4" />
              Convert to Audio
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
