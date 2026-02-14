'use client';
import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // Import motion and AnimatePresence
import { FileText, Mic, X, UploadCloud, Trash2 } from 'lucide-react'; // Import icons
import { FileTooLargeModal } from './modals/FileTooLargeModal';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000'; // Default for server-side


export default function UploadModal({ isOpen, onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  
  // File too large modal state
  const [showFileTooLargeModal, setShowFileTooLargeModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState('explorer');
  const [maxFileSize, setMaxFileSize] = useState(50 * 1024 * 1024); // 50MB default

  // Available voices for initial processing
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
          // Convert MB to bytes
          const maxMB = data.data.max_file_size_mb || 50;
          setMaxFileSize(maxMB * 1024 * 1024);
        }
      }
    } catch (error) {
      console.error('Error fetching user limits:', error);
      // Keep defaults
    }
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setError(null);
      setIsUploading(false);
      setSelectedVoice('af_bella');
      setShowFileTooLargeModal(false);
    }
  }, [isOpen]);

  // Get max file size in MB for display
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

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }
    if (!selectedVoice) {
      setError("Please select a voice.");
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
        // Payment Required - File too large or insufficient tokens
        let errorData = {};
        try {
          errorData = await response.json();
        } catch (e) {
          // If JSON parsing fails, use default message
        }
        
        const errorMsg = errorData.detail || 'Upload limit exceeded';
        
        // Check if it's a file size error
        if (errorMsg.toLowerCase().includes('file too large') || 
            errorMsg.toLowerCase().includes('size')) {
          setShowFileTooLargeModal(true);
        } else {
          // Insufficient tokens error
          setError(errorMsg);
        }
      } else {
        let errorMsg = 'Upload failed: Unknown server error.';
        try {
          const errorData = await response.json();
          console.error('Backend error response:', errorData); // Log for debugging
          errorMsg = `Upload failed: ${errorData.detail || errorData.message || JSON.stringify(errorData)}`;
        } catch (jsonError) {
          // If JSON parsing fails, try to get raw text
          const textError = await response.text();
          console.error('Backend error (non-JSON):', textError); // Log for debugging
          errorMsg = `Upload failed: ${textError || 'Unknown server error.'}`;
        }
        setError(errorMsg);
      }
    } catch (error) {
      console.error('Network error during upload:', error); // More specific logging
      setError('Error uploading file. Please check your network connection and try again.');
    } finally {
      setIsUploading(false);
    }
  };

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
            className="glass-card rounded-2xl p-8 shadow-2xl w-full max-w-md relative border border-white/10"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <h2 className="text-3xl font-bold mb-6 text-foreground text-center">Upload Document</h2>
            
            <div className="mb-6">
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
              {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}
            </div>

            <div className="mb-8">
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
                  !file || isUploading
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary to-accent text-white hover:shadow-primary/30'
                }`}
                disabled={!file || isUploading}
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadCloud size={20} /> Upload
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