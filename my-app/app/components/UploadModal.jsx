'use client';
import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Mic, X, UploadCloud, Trash2, Globe, Link, Loader2 } from 'lucide-react';
import { FileTooLargeModal } from './modals/FileTooLargeModal';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';


export default function UploadModal({ isOpen, onClose, onUpload }) {
  const [activeTab, setActiveTab] = useState('file'); // 'file' or 'url'
  
  // File upload state
  const [file, setFile] = useState(null);
  
  // URL upload state
  const [url, setUrl] = useState('');
  const [isUrlValid, setIsUrlValid] = useState(false);
  
  // Common state
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  
  // File too large modal state
  const [showFileTooLargeModal, setShowFileTooLargeModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState('explorer');
  const [maxFileSize, setMaxFileSize] = useState(50 * 1024 * 1024);

  // Available voices
  const voices = [
    { id: 'af_bella', name: 'Bella (Female)' },
    { id: 'af_sarah', name: 'Sarah (Female)' },
    { id: 'am_michael', name: 'Michael (Male)' },
    { id: 'bm_fable', name: 'Fable (Male)' },
    { id: 'bf_emma', name: 'Emma (Female)' },
    { id: 'em_alex', name: 'Alex (Male)' },
  ];

  // Fetch user's plan and limits when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchUserLimits();
    }
  }, [isOpen]);

  const fetchUserLimits = async () => {
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
          setCurrentPlan(data.data.plan_name || 'explorer');
          const maxMB = data.data.max_file_size_mb || 50;
          setMaxFileSize(maxMB * 1024 * 1024);
        }
      }
    } catch (error) {
      console.error('Error fetching user limits:', error);
    }
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setUrl('');
      setIsUrlValid(false);
      setError(null);
      setIsUploading(false);
      setSelectedVoice('af_bella');
      setShowFileTooLargeModal(false);
      setActiveTab('file');
    }
  }, [isOpen]);

  // Validate URL
  useEffect(() => {
    if (url.trim()) {
      try {
        const urlObj = new URL(url);
        setIsUrlValid(urlObj.protocol === 'http:' || urlObj.protocol === 'https:');
      } catch {
        setIsUrlValid(false);
      }
    } else {
      setIsUrlValid(false);
    }
  }, [url]);

  const MAX_FILE_SIZE_MB = Math.round(maxFileSize / (1024 * 1024));
  const MAX_FILE_SIZE = maxFileSize;

  const validateAndSetFile = (selectedFile) => {
    const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
    const validExtensions = ['pdf', 'epub', 'txt', 'docx'];

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      setFile(null);
    } else if (validExtensions.includes(fileExtension)) {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Invalid file type. Please upload .epub, .txt, .docx, or .pdf');
      setFile(null);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) validateAndSetFile(selectedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) validateAndSetFile(droppedFile);
  };

  const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); };

  const handleFileUpload = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/upload_file`, {
        method: 'POST',
        headers: {
          'voice': selectedVoice,
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        onUpload(file.name, result.voice, result.job_id);
        onClose();
      } else if (response.status === 402) {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch (e) {}
        
        const errorMsg = errorData.detail || 'Upload limit exceeded';
        
        if (errorMsg.toLowerCase().includes('file too large') || 
            errorMsg.toLowerCase().includes('size')) {
          setShowFileTooLargeModal(true);
        } else {
          setError(errorMsg);
        }
      } else {
        let errorMsg = 'Upload failed: Unknown server error.';
        try {
          const errorData = await response.json();
          console.error('Backend error response:', errorData);
          errorMsg = `Upload failed: ${errorData.detail || errorData.message || JSON.stringify(errorData)}`;
        } catch (jsonError) {
          const textError = await response.text();
          console.error('Backend error (non-JSON):', textError);
          errorMsg = `Upload failed: ${textError || 'Unknown server error.'}`;
        }
        setError(errorMsg);
      }
    } catch (error) {
      console.error('Network error during upload:', error);
      setError('Error uploading file. Please check your network connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlUpload = async () => {
    if (!isUrlValid) {
      setError("Please enter a valid URL (http:// or https://).");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/upload_webpage`, {
        method: 'POST',
        headers: {
          'url': url,
          'voice': selectedVoice,
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        onUpload(result.source_url || url, result.voice, result.job_id);
        onClose();
      } else if (response.status === 402) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || 'Insufficient tokens. Please upgrade your plan.');
      } else if (response.status === 408) {
        setError('Request timed out. The webpage took too long to respond.');
      } else if (response.status === 422) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || 'Could not extract content from the webpage. Please check the URL and try again.');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || 'Failed to process webpage. Please try again.');
      }
    } catch (error) {
      console.error('Network error during URL upload:', error);
      setError('Error processing webpage. Please check your network connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = () => {
    if (activeTab === 'file') {
      handleFileUpload();
    } else {
      handleUrlUpload();
    }
  };

  const canUpload = activeTab === 'file' ? !!file : isUrlValid;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 z-50 flex justify-center items-center backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 50 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="glass-card rounded-2xl p-8 shadow-2xl w-full max-w-lg relative border border-white/10"
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <h2 className="text-3xl font-bold mb-6 text-foreground text-center">Upload Document</h2>
              
              {/* Tab Navigation */}
              <div className="flex mb-6 bg-gray-800/50 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('file')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                    activeTab === 'file'
                      ? 'bg-primary-glow text-white shadow-lg'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <UploadCloud size={18} />
                  <span>Upload File</span>
                </button>
                <button
                  onClick={() => setActiveTab('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-all ${
                    activeTab === 'url'
                      ? 'bg-primary-glow text-white shadow-lg'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Globe size={18} />
                  <span>Paste URL</span>
                </button>
              </div>

              {/* Content Area */}
              <AnimatePresence mode="wait">
                {activeTab === 'file' ? (
                  <motion.div
                    key="file-tab"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div 
                      className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-colors duration-200 ${
                        isDragging ? 'border-primary-glow bg-primary-glow/10' : 'border-gray-600 hover:border-gray-400 bg-gray-800'
                      }`}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      {file ? (
                        <div className="flex flex-col items-center text-foreground">
                          <FileText className="h-16 w-16 text-primary-glow mb-3" />
                          <p className="text-lg font-medium text-white">{file.name}</p>
                          <p className="text-sm text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => { e.stopPropagation(); setFile(null); }}
                            className="mt-4 text-sm flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 size={16} /> Remove File
                          </motion.button>
                        </div>
                      ) : (
                        <>
                          <UploadCloud className="h-16 w-16 text-primary-glow mb-3" />
                          <p className="text-white text-lg mb-2">Drag & drop your file here</p>
                          <p className="text-gray-400 text-sm mb-3">or</p>
                          <label htmlFor="file-upload" className="bg-gradient-to-r from-primary to-accent text-white px-6 py-2 rounded-full font-semibold shadow-lg hover:shadow-primary/30 transition-all cursor-pointer">
                            <span>Browse Files</span>
                            <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".epub,.txt,.docx,.pdf" onChange={handleFileChange} />
                          </label>
                          <p className="text-xs text-gray-500 mt-3">Supported: EPUB, PDF, DOCX, TXT (Max {MAX_FILE_SIZE_MB}MB)</p>
                        </>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="url-tab"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    {/* URL Input */}
                    <div>
                      <label htmlFor="url-input" className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                        <Link size={16} /> Webpage URL
                      </label>
                      <div className="relative">
                        <input
                          id="url-input"
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://example.com/article"
                          className={`w-full px-4 py-3 bg-gray-800 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-glow text-white placeholder-gray-500 transition-colors ${
                            isUrlValid ? 'border-green-500/50' : url ? 'border-red-500/50' : 'border-gray-600'
                          }`}
                          disabled={isUploading}
                        />
                        {isUrlValid && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Enter a full URL starting with http:// or https://
                      </p>
                    </div>

                    {/* Info Box */}
                    <div className="p-3 bg-gray-800/30 rounded-lg">
                      <p className="text-xs text-gray-400">
                        <strong className="text-gray-300">Works great with:</strong> Wikipedia, Medium, news sites, blogs, documentation, and most article-based websites.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && <p className="text-sm text-red-400 mt-4 text-center">{error}</p>}

              {/* Voice Selection */}
              <div className="mt-6 mb-6">
                <label htmlFor="voice-select" className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                  <Mic size={18} /> Initial Voice
                </label>
                <select
                  id="voice-select"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-glow focus:border-transparent text-white placeholder-gray-400 transition-colors"
                  disabled={isUploading}
                >
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">Choose which voice to process first. Other voices can be generated later.</p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-full glass-button text-foreground border border-gray-600 hover:border-white/40 transition-colors"
                  disabled={isUploading}
                >
                  Cancel
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleUpload} 
                  className={`px-6 py-2.5 rounded-full font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                    !canUpload || isUploading
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-primary to-accent text-white hover:shadow-primary/30'
                  }`}
                  disabled={!canUpload || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      {activeTab === 'file' ? 'Uploading...' : 'Extracting...'}
                    </>
                  ) : (
                    <>
                      {activeTab === 'file' ? (
                        <><UploadCloud size={20} /> Upload</>
                      ) : (
                        <><Globe size={20} /> Process URL</>
                      )}
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
        onTryAnotherFile={() => {
          setFile(null);
          setShowFileTooLargeModal(false);
        }}
      />
    </>
  );
}
