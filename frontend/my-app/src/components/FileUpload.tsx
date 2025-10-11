import React, { useState } from 'react';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

const FileUpload: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [voice, setVoice] = useState<string>('af_bella');
  const { setCurrentManifest } = useAudioPlayer();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploadStatus('uploading');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:8000/upload_file', {
        method: 'POST',
        headers: {
          'X-User-ID': 'user123', // Replace with actual user ID
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      setJobId(data.job_id);
      setUploadStatus('success');
      
      // Start polling for job completion
      pollJobStatus(data.job_id, voice);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
    }
  };

  const pollJobStatus = async (jobId: string, voice: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`http://localhost:8000/job/${jobId}/status/${voice}`, {
          headers: {
            'X-User-ID': 'user123',
          },
        });
        
        const statusData = await statusResponse.json();
        
        if (statusData.status === 'complete') {
          clearInterval(pollInterval);
          // Fetch the complete manifest
          const manifestResponse = await fetch(`http://localhost:8000/manifest/${jobId}/${voice}`, {
            headers: {
              'X-User-ID': 'user123',
            },
          });
          const manifest = await manifestResponse.json();
          setCurrentManifest(manifest);
        }
      } catch (error) {
        console.error('Status polling error:', error);
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Upload Document</h2>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Voice:
        </label>
        <select 
          value={voice} 
          onChange={(e) => setVoice(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md"
        >
          <option value="af_bella">Bella</option>
          {/* Add more voice options as needed */}
        </select>
      </div>

      <div className="mb-4">
        <input
          type="file"
          onChange={handleFileChange}
          className="w-full p-2 border border-gray-300 rounded-md"
          accept=".txt,.pdf,.doc,.docx"
        />
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || uploadStatus === 'uploading'}
        className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload File'}
      </button>

      {uploadStatus === 'success' && jobId && (
        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">
          File uploaded successfully! Processing audio...
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md">
          Upload failed. Please try again.
        </div>
      )}
    </div>
  );
};

export default FileUpload;