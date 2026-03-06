'use client';
import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Mic, X, UploadCloud, Trash2, Globe, Link, Loader2, Type, ChevronDown } from 'lucide-react';
import { FileTooLargeModal } from './modals/FileTooLargeModal';
import { useUsage } from '../../hooks/useUsage';
import { truncateText } from '../utils/textUtils';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

const ADJECTIVES = [
  'Soggy', 'Drunken', 'Giggly', 'Grumpy', 'Wobbly', 'Hyper', 'Spicy', 'Lazy', 'Sassy', 'Goofy',
  'Dizzy', 'Clumsy', 'Nifty', 'Snazzy', 'Funky', 'Zesty', 'Loony', 'Cheesy', 'Quirky', 'Beefy'
];

const NOUNS = [
  'Waffle', 'Burrito', 'Potato', 'Hammer', 'Chicken', 'Viking', 'Penguin', 'Unicorn', 'Meatball', 'Taco',
  'Ninja', 'Banana', 'Muffin', 'Pickle', 'Cactus', 'Narwhal', 'Walrus', 'Shrimp', 'Bagel', 'Donut'
];

const generateRandomName = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}-${noun}-${num}`;
};

export default function UploadModal({ isOpen, onClose, onUpload, initialText = '' }) {
  const [activeTab, setActiveTab] = useState('file');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [isUrlValid, setIsUrlValid] = useState(false);
  const [textContent, setTextContent] = useState(initialText);
  const [textTitle, setTextTitle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken, isSignedIn } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);

  const { usage, loading: usageLoading, refresh: refreshUsage } = useUsage(isSignedIn ? getToken : null);
  const [showFileTooLargeModal, setShowFileTooLargeModal] = useState(false);

  const currentPlan = usage.plan_name || 'explorer';
  const remainingTokens = usage.remaining || 0;
  const maxFileSize = (usage.max_file_size_mb || 50) * 1024 * 1024;

  const voices = [
    { id: 'af_bella', name: 'Bella (Female)' },
    { id: 'af_sarah', name: 'Sarah (Female)' },
    { id: 'am_michael', name: 'Michael (Male)' },
    { id: 'bm_fable', name: 'Fable (Male)' },
    { id: 'bf_emma', name: 'Emma (Female)' },
    { id: 'em_alex', name: 'Alex (Male)' },
  ];

  useEffect(() => {
    if (isOpen && isSignedIn) refreshUsage();
  }, [isOpen, isSignedIn, refreshUsage]);

  useEffect(() => {
    if (initialText && isOpen) { setTextContent(initialText); setActiveTab('text'); }
  }, [initialText, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setFile(null); setUrl(''); setTextContent(''); setTextTitle('');
      setIsUrlValid(false); setError(null); setIsUploading(false);
      setSelectedVoice('af_bella'); setShowFileTooLargeModal(false); setActiveTab('file');
    }
  }, [isOpen]);

  useEffect(() => {
    if (url.trim()) {
      try {
        const urlObj = new URL(url);
        setIsUrlValid(urlObj.protocol === 'http:' || urlObj.protocol === 'https:');
      } catch { setIsUrlValid(false); }
    } else { setIsUrlValid(false); }
  }, [url]);

  const MAX_FILE_SIZE_MB = Math.round(maxFileSize / (1024 * 1024));
  const MAX_FILE_SIZE = maxFileSize;
  const textCharCount = textContent.length;
  const textTokenCount = textCharCount;
  const tokensAfterText = remainingTokens - textTokenCount;
  const exceedsTokens = textTokenCount > remainingTokens;

  const validateAndSetFile = (selectedFile) => {
    const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
    const validExtensions = ['pdf', 'epub', 'txt', 'docx'];
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`); setFile(null);
    } else if (validExtensions.includes(fileExtension)) {
      setFile(selectedFile); setError(null);
    } else {
      setError('Invalid file type. Please upload .epub, .txt, .docx, or .pdf'); setFile(null);
    }
  };

  const handleFileChange = (e) => { const f = e.target.files[0]; if (f) validateAndSetFile(f); };
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) validateAndSetFile(f); };
  const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); };

  const handleFileUpload = async () => {
    if (!file) { setError("Please select a file to upload."); return; }
    setIsUploading(true); setError(null);
    const formData = new FormData(); formData.append('file', file);

    let attempts = 3;
    let response;

    try {
      while (attempts > 0) {
        const token = await getToken();
        response = await fetch(`${API_BASE_URL}/api/upload_file`, {
          method: 'POST',
          headers: { 'voice': selectedVoice, Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (response.status === 403) {
          attempts--;
          if (attempts > 0) {
            console.warn(`Upload attempt failed with 403. Retrying... (${attempts} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        break;
      }

      if (response.ok) {
        const result = await response.json();
        onUpload(file.name, result.voice, result.job_id); onClose();
      } else if (response.status === 402) {
        let errorData = {}; try { errorData = await response.json(); } catch (e) { }
        const errorMsg = errorData.detail || 'Upload limit exceeded';
        if (errorMsg.toLowerCase().includes('file too large') || errorMsg.toLowerCase().includes('size')) {
          setShowFileTooLargeModal(true);
        } else { setError(errorMsg); }
      } else {
        let errorMsg = 'Upload failed: Unknown server error.';
        try { const errorData = await response.json(); errorMsg = `Upload failed: ${errorData.detail || errorData.message || JSON.stringify(errorData)}`; }
        catch (jsonError) { const textError = await response.text(); errorMsg = `Upload failed: ${textError || 'Unknown server error.'}`; }
        setError(errorMsg);
      }
    } catch (error) { setError('Error uploading file. Please check your network connection and try again.'); }
    finally { setIsUploading(false); }
  };

  const handleUrlUpload = async () => {
    if (!isUrlValid) { setError("Please enter a valid URL (http:// or https://)."); return; }
    setIsUploading(true); setError(null);

    let attempts = 3;
    let response;

    try {
      while (attempts > 0) {
        const token = await getToken();
        response = await fetch(`${API_BASE_URL}/api/upload_webpage`, {
          method: 'POST',
          headers: { 'url': url, 'voice': selectedVoice, Authorization: `Bearer ${token}` },
        });

        if (response.status === 403) {
          attempts--;
          if (attempts > 0) {
            console.warn(`URL process attempt failed with 403. Retrying... (${attempts} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        break;
      }

      if (response.ok) { const result = await response.json(); onUpload(result.source_url || url, result.voice, result.job_id); onClose(); }
      else if (response.status === 402) { const errorData = await response.json().catch(() => ({})); setError(errorData.detail || 'Insufficient tokens.'); }
      else if (response.status === 408) { setError('Request timed out.'); }
      else if (response.status === 422) { const errorData = await response.json().catch(() => ({})); setError(errorData.detail || 'Could not extract content.'); }
      else { const errorData = await response.json().catch(() => ({})); setError(errorData.detail || 'Failed to process webpage.'); }
    } catch (error) { setError('Error processing webpage. Please check your network connection.'); }
    finally { setIsUploading(false); }
  };

  const handleTextUpload = async () => {
    if (!textContent.trim()) { setError("Please enter some text."); return; }
    if (exceedsTokens) { setError(`Text exceeds your token balance.`); return; }
    setIsUploading(true); setError(null);

    let attempts = 3;
    let response;

    try {
      while (attempts > 0) {
        const token = await getToken();
        const finalTitle = textTitle.trim() || generateRandomName();
        response = await fetch(`${API_BASE_URL}/api/upload_text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'voice': selectedVoice, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: textContent, title: finalTitle }),
        });

        if (response.status === 403) {
          attempts--;
          if (attempts > 0) {
            console.warn(`Text process attempt failed with 403. Retrying... (${attempts} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }
        break;
      }

      if (response.ok) { const result = await response.json(); onUpload(result.title, result.voice, result.job_id); onClose(); }
      else if (response.status === 402) { const errorData = await response.json().catch(() => ({})); setError(errorData.detail || 'Insufficient tokens.'); }
      else { const errorData = await response.json().catch(() => ({})); setError(errorData.detail || 'Failed to process text.'); }
    } catch (error) { setError('Error processing text. Please check your network connection.'); }
    finally { setIsUploading(false); }
  };

  const handleUpload = () => {
    if (activeTab === 'file') handleFileUpload();
    else if (activeTab === 'url') handleUrlUpload();
    else handleTextUpload();
  };

  const canUpload = activeTab === 'file' ? !!file : activeTab === 'url' ? isUrlValid : !!textContent.trim() && !exceedsTokens;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 50 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="rounded-none p-8 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto"
              style={{
                background: '#111111',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
              }}
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-all p-2 rounded-none hover:bg-white/[0.05] z-10"
              >
                <X size={24} />
              </button>

              <h2 className="text-3xl font-bold mb-6 text-white text-center">Upload Document</h2>

              <div className="flex mb-6 rounded-none p-1 border border-white/[0.08]" style={{ background: '#0a0a0a' }}>
                {[
                  { id: 'file', icon: UploadCloud, label: 'Upload File' },
                  { id: 'url', icon: Globe, label: 'Paste URL' },
                  { id: 'text', icon: Type, label: 'Type Text' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 relative flex items-center justify-center gap-2 py-2 px-4 rounded-none transition-all text-sm group ${activeTab === tab.id ? 'text-black' : 'text-neutral-500 hover:text-white'
                      }`}
                  >
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-white"
                        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2 font-semibold">
                      <tab.icon size={18} />
                      <span>{tab.label}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="min-h-[400px]">
                <AnimatePresence mode="wait">
                  {activeTab === 'file' ? (
                    <motion.div key="file-tab" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
                      <div
                        className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-none transition-all duration-200 h-full ${isDragging ? 'border-white/40 bg-white/[0.05]' : 'border-white/[0.12] hover:border-white/25 bg-white/[0.02]'}`}
                        style={{ minHeight: '400px' }}
                        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
                      >
                        {file ? (
                          <div className="flex flex-col items-center text-white">
                            <FileText className="h-16 w-16 text-neutral-400 mb-3" />
                            <p className="text-lg font-medium text-white text-center break-all">
                              {truncateText(file.name, 30, 4)}
                            </p>
                            <p className="text-sm text-neutral-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              onClick={(e) => { e.stopPropagation(); setFile(null); }}
                              className="mt-4 text-sm flex items-center gap-1 text-red-400 hover:text-red-300 transition-all"
                            >
                              <Trash2 size={16} /> Remove File
                            </motion.button>
                          </div>
                        ) : (
                          <>
                            <UploadCloud className="h-16 w-16 text-neutral-500 mb-3" />
                            <p className="text-white text-lg mb-2">Drag & drop your file here</p>
                            <p className="text-neutral-500 text-sm mb-3">or</p>
                            <label htmlFor="file-upload" className="bg-white text-black px-6 py-2 rounded-none font-semibold hover:opacity-90 transition-opacity cursor-pointer">
                              <span>Browse Files</span>
                              <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".epub,.txt,.docx,.pdf" onChange={handleFileChange} />
                            </label>
                            <p className="text-xs text-neutral-600 mt-3">Supported: EPUB, PDF, DOCX, TXT (Max {MAX_FILE_SIZE_MB}MB)</p>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ) : activeTab === 'url' ? (
                    <motion.div key="url-tab" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                      <div>
                        <label htmlFor="url-input" className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
                          <Link size={16} /> Webpage URL
                        </label>
                        <div className="relative">
                          <input
                            id="url-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/article"
                            className={`w-full px-4 py-3 bg-white/[0.04] border rounded-none focus:outline-none focus:border-white/30 text-white placeholder-neutral-600 transition-colors ${isUrlValid ? 'border-emerald-500/50' : url ? 'border-red-500/50' : 'border-white/[0.08]'}`}
                            disabled={isUploading}
                          />
                          {isUrlValid && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">✓</span>}
                        </div>
                        <p className="text-xs text-neutral-600 mt-1">Enter a full URL starting with http:// or https://</p>
                      </div>
                      <div className="p-3 bg-white/[0.03] rounded-none border border-white/[0.06]">
                        <p className="text-xs text-neutral-500">
                          <strong className="text-neutral-400">Works great with:</strong> Wikipedia, Medium, news sites, blogs, documentation, and most article-based websites.
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="text-tab" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-4">
                      <div>
                        <label htmlFor="text-title" className="block text-sm font-medium text-neutral-300 mb-2">
                          Title <span className="text-neutral-600">(optional)</span>
                        </label>
                        <input
                          id="text-title" type="text" value={textTitle} onChange={(e) => setTextTitle(e.target.value)}
                          placeholder="Funny name generated if empty"
                          className="w-full px-4 py-2 bg-white/[0.04] border border-white/[0.08] rounded-none focus:outline-none focus:border-white/20 text-white placeholder-neutral-600 transition-colors"
                          disabled={isUploading}
                        />
                      </div>
                      <div>
                        <label htmlFor="text-content" className="block text-sm font-medium text-neutral-300 mb-2">Text Content</label>
                        <textarea
                          id="text-content" value={textContent} onChange={(e) => setTextContent(e.target.value)}
                          placeholder="Type or paste your text here..."
                          className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-none focus:outline-none focus:border-white/20 text-white placeholder-neutral-600 transition-colors resize-none"
                          rows={8} disabled={isUploading}
                        />
                        <div className="flex justify-between items-center mt-2 text-xs">
                          <span className={exceedsTokens ? 'text-red-400' : 'text-neutral-500'}>{textCharCount.toLocaleString()} characters</span>
                          <span className={exceedsTokens ? 'text-red-400 font-medium' : tokensAfterText < remainingTokens * 0.1 ? 'text-amber-400' : 'text-neutral-500'}>
                            {textTokenCount.toLocaleString()} tokens used
                            {remainingTokens > 0 && <span className="text-neutral-600 ml-1">({tokensAfterText.toLocaleString()} remaining)</span>}
                          </span>
                        </div>
                        {exceedsTokens && <p className="text-xs text-red-400 mt-1">Text exceeds your available tokens. Please reduce the text or upgrade your plan.</p>}
                        {tokensAfterText >= 0 && tokensAfterText < remainingTokens * 0.1 && !exceedsTokens && (
                          <p className="text-xs text-amber-400 mt-1">Warning: You are approaching your token limit.</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {error && <p className="text-sm text-red-400 mt-4 text-center">{error}</p>}

              <div className="mt-6 mb-6">
                <label className="block text-sm font-medium text-neutral-300 mb-2 flex items-center gap-2">
                  <Mic size={18} /> Initial Voice
                </label>

                <div className="relative" id="voice-dropdown-container">
                  <button
                    onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
                    disabled={isUploading}
                    className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-none focus:outline-none focus:border-white/20 text-white transition-all flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-white/40 group-hover:bg-white/80 transition-colors" />
                      {voices.find(v => v.id === selectedVoice)?.name}
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-neutral-500 transition-transform duration-300 ${isVoiceDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <AnimatePresence>
                    {isVoiceDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="absolute bottom-full left-0 right-0 mb-2 bg-[#111111] border border-white/[0.08] rounded-none overflow-hidden shadow-2xl z-50 py-1"
                        style={{ backdropFilter: 'blur(12px)' }}
                      >
                        {voices.map((voice, index) => (
                          <button
                            key={voice.id}
                            onClick={() => {
                              setSelectedVoice(voice.id);
                              setIsVoiceDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between ${selectedVoice === voice.id
                              ? 'bg-white text-black font-semibold'
                              : 'text-neutral-400 hover:bg-white/[0.05] hover:text-white'
                              } ${index !== voices.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
                          >
                            <span>{voice.name}</span>
                            {selectedVoice === voice.id && <span className="text-[10px] uppercase tracking-wider opacity-60">Active</span>}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <p className="text-xs text-neutral-600 mt-2">Choose which voice to process first. Other voices can be generated later.</p>
              </div>

              <div className="flex justify-end space-x-4">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-none text-neutral-400 border border-white/[0.08] hover:text-white hover:border-white/20 transition-all"
                  disabled={isUploading}
                >
                  Cancel
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={handleUpload}
                  className={`px-6 py-2.5 rounded-none font-bold transition-all flex items-center justify-center gap-2 ${!canUpload || isUploading
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/[0.06]'
                    : 'bg-white text-black hover:opacity-90'
                    }`}
                  disabled={!canUpload || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      uploading
                    </>
                  ) : (
                    <>
                      {activeTab === 'file' ? <><UploadCloud size={20} /> Upload</> :
                        activeTab === 'url' ? <><Globe size={20} /> Process URL</> :
                          <><Type size={20} /> Convert to Audio</>}
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <FileTooLargeModal
        isOpen={showFileTooLargeModal}
        onClose={() => setShowFileTooLargeModal(false)}
        fileSize={file?.size || 0}
        currentPlan={currentPlan}
        onTryAnotherFile={() => { setFile(null); setShowFileTooLargeModal(false); }}
      />
    </>
  );
}
