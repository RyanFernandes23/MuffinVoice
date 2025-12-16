'use client';
import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react'; // Added useEffect

export default function UploadModal({ isOpen, onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

  // Available voices for initial processing
  const voices = [
    { id: 'af_bella', name: 'Bella (Female)' },
    { id: 'af_sarah', name: 'Sarah (Female)' },
    { id: 'am_michael', name: 'Michael (Male)' },
    { id: 'bm_fable', name: 'Fable (Male)' },
    { id: 'bf_emma', name: 'Emma (Female)' },
    { id: 'em_alex', name: 'Alex (Male)' },
  ];

  // FIX 2: Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setError(null);
      setIsUploading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateAndSetFile = (selectedFile) => {
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
    // FIX 3: Manual validation for Drag & Drop
    const validTypes = ['application/pdf', 'application/epub+zip', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    // Note: checking extensions is sometimes safer than MIME types for weird windows setups, but this is a good baseline
    const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
    const validExtensions = ['pdf', 'epub', 'txt', 'docx'];

    if (selectedFile.size > MAX_FILE_SIZE) {
      const maxSizeMB = MAX_FILE_SIZE / (1024 * 1024);
      const maxSizeKB = MAX_FILE_SIZE / 1024;
      let errorMessage;

      if (maxSizeMB >= 1) {
        errorMessage = `File is too large. Maximum size is ${maxSizeMB.toFixed(2)}MB.`;
      } else {
        errorMessage = `File is too large. Maximum size is ${maxSizeKB.toFixed(2)}KB.`;
      }
      setError(errorMessage);
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

  // ... handleDragEnter, handleDragLeave, handleDragOver remain the same ...
  const handleDragEnter = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); };

  const handleUpload = async () => {
    if (file) {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const token = await getToken();
        // Ensure your backend is running on port 8000 and has CORS enabled for localhost:3000
        const response = await fetch('http://localhost:8000/upload_file', {
          method: 'POST',
          headers: {
            'X-User-ID': '123',
            'voice': selectedVoice,
            Authorization: `Bearer ${token}`,
            // Do NOT set Content-Type header manually when using FormData
          },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          onUpload(file.name, result.voice, result.job_id);
          onClose();
        } else {
          setError('Upload failed. Please try again.');
        }
      } catch (error) {
        console.error('Error:', error);
        setError('Error uploading file. Is the backend running?');
      } finally {
        setIsUploading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center backdrop-blur-sm">
      <div className="bg-white rounded-lg p-8 shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Upload a File</h2>
        
        <div className="mb-6">
          <div 
            className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors ${
              isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="space-y-1 text-center">
              {/* FIX 1: Show file name if selected, otherwise show drop prompt */}
              {file ? (
                <div className="text-gray-700">
                  <svg className="mx-auto h-12 w-12 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                    className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-600 justify-center">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".epub,.txt,.docx,.pdf" onChange={handleFileChange} />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">EPUB, PDF, DOCX, TXT</p>
                  <p className="text-xs text-gray-500">Max size: { (MAX_FILE_SIZE / (1024 * 1024)) >= 1 ? `${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB` : `${(MAX_FILE_SIZE / 1024).toFixed(0)}KB` }</p>
                </>
              )}
            </div>
          </div>
          {error && <p className="text-sm text-red-500 mt-2 text-center">{error}</p>}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-900 mb-2">Initial Voice</label>
          <select
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
            disabled={isUploading}
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-700 mt-1">Choose which voice to process first. Other voices can be generated later.</p>
        </div>

        <div className="flex justify-end space-x-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300" disabled={isUploading}>Cancel</button>
          <button 
            onClick={handleUpload} 
            className={`px-4 py-2 rounded-md flex items-center justify-center min-w-[100px] ${
              !file || isUploading ? 'bg-yellow-400 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-500'
            }`}
            disabled={!file || isUploading}
          >
             {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
