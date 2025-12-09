'use client';

import { useState, useEffect, useCallback } from 'react';
import NotebookCard from '../components/NotebookCard';
import AudioPlayer from '../components/AudioPlayer';
import UploadModal from '../components/UploadModal';
import { useAuth, useClerk } from '@clerk/nextjs'; // Import Clerk hooks

export default function DashboardPage() {
  const { isSignedIn } = useAuth(); // Check if user is logged in
  const { openSignIn } = useClerk(); // Helper to open the sign-in modal
  const [notebooks, setNotebooks] = useState([]);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [currentPlayingNotebook, setCurrentPlayingNotebook] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      notebooks.forEach(notebook => {
        if (notebook.jobId && notebook.status !== 'completed') {
          fetch(`http://localhost:8000/job_status/${notebook.jobId}`)
            .then(response => response.json())
            .then(data => {
              setNotebooks(prevNotebooks =>
                prevNotebooks.map(nb => {
                  if (nb.jobId === notebook.jobId) {
                    const newStatus = data.status;
                    if (newStatus === 'completed') {
                      return { ...nb, status: newStatus, manifestUrl: `http://localhost:8000/stream/123/${notebook.jobId}/${notebook.voice}/manifest.m3u8` };
                    } else {
                      return { ...nb, status: newStatus };
                    }
                  }
                  return nb;
                })
              );
            })
            .catch(error => console.error('Error fetching job status:', error));
        }
      });
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [notebooks]);

  const handleNewNotebookClick = () => {
    if (isSignedIn) {
      setIsUploadModalOpen(true);
    } else {
      // If not signed in, open the Clerk sign-in modal
      openSignIn();
    }
  };

  const addNotebook = (title, voice, jobId) => {
    const newNotebook = {
      id: Date.now(),
      title: title,
      voice: voice,
      status: 'Not Started',
      jobId: jobId,
    };
    setNotebooks([...notebooks, newNotebook]);
  };

  const deleteNotebook = (id) => {
    setNotebooks(notebooks.filter(notebook => notebook.id !== id));
    if (currentPlayingNotebook && currentPlayingNotebook.id === id) {
      setShowAudioPlayer(false);
      setCurrentPlayingNotebook(null);
    }
  };

  const playNotebook = (notebook) => {
    setCurrentPlayingNotebook(notebook);
    setShowAudioPlayer(true);
  };

  const closeAudioPlayer = useCallback(() => {
    setShowAudioPlayer(false);
    setCurrentPlayingNotebook(null);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-yellow-400">
      <main className="flex-grow p-8 relative">
        <button 
          onClick={handleNewNotebookClick}
          className="absolute top-8 right-8 bg-black text-yellow-400 px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 transition duration-300"
        >
          + New Notebook
        </button>
        <div className="mt-16 flex flex-wrap gap-4 justify-start">
          {notebooks.map((notebook) => (
            <NotebookCard 
              key={notebook.id}
              title={notebook.title}
              voice={notebook.voice}
              status={notebook.status}
              onDelete={() => deleteNotebook(notebook.id)}
              onOpen={() => {
                if (notebook.status !== 'processing' && notebook.status !== 'Not Started') {
                  playNotebook(notebook);
                }
              }}
            />
          ))}
        </div>
      </main>
      {showAudioPlayer && currentPlayingNotebook && (
        <AudioPlayer 
          title={currentPlayingNotebook.title}
          manifestUrl={currentPlayingNotebook.manifestUrl}
          onClose={closeAudioPlayer}
        />
      )}
      <UploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={addNotebook} // For now, we'll just add a new notebook on upload
      />
    </div>
  );
}
