'use client';

import { useState } from 'react';

export default function UploadModal({ isOpen, onClose, onUpload }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

    const handleUpload = async () => {

      if (file) {

        setIsUploading(true);

        const formData = new FormData();

        formData.append('file', file);

  

        try {

          const response = await fetch('http://localhost:8000/upload_file', {

            method: 'POST',

            headers: {

              'X-User-ID': '123',

              'voice': 'af_bella',

            },

            body: formData,

          });

  

          if (response.ok) {

            const result = await response.json();

            console.log('Upload successful:', result);

            onUpload(file.name, result.voice, result.job_id);

            onClose(); // Close modal after upload

          } else {

            console.error('Upload failed:', await response.text());

            alert('Upload failed. Please try again.');

          }

        } catch (error) {

          console.error('Error uploading file:', error);

          alert('Error uploading file. Please try again.');

        } finally {

          setIsUploading(false);

        }

      } else {

        alert('Please select a file to upload.');

      }

    };

  return (
    <div className="fixed inset-0 bg-transparent z-50 flex justify-center items-center">
      <div className="bg-white rounded-lg p-8 shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Upload a File</h2>
        <div className="mb-6">
          <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">File Input</label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="flex text-sm text-gray-600">
                <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                  <span>Upload a file</span>
                  <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".epub,.txt,.docx,.pdf" onChange={handleFileChange} />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">EPUB, TXT, DOCX, PDF up to 10MB</p>
            </div>
          </div>
          {file && <p className="text-sm text-gray-500 mt-2">Selected file: {file.name}</p>}
        </div>
        <div className="flex justify-end space-x-4">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition duration-300" disabled={isUploading}>Cancel</button>
          <button onClick={handleUpload} className="px-4 py-2 bg-yellow-400 text-black rounded-md hover:bg-yellow-500 transition duration-300" disabled={isUploading}>
            {isUploading ? (
              <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
