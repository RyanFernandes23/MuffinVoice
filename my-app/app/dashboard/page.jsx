'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import NotebookCard from '../components/NotebookCard';
import AudioPlayer from '../components/AudioPlayer';
import UploadModal from '../components/UploadModal';
import SubtitleWindow from '../components/SubtitleWindow';
import { Toaster, toast } from 'react-hot-toast';
import { useAuth, useClerk } from '@clerk/nextjs';
import { useUsage } from '../hooks/useUsage';

export default function DashboardPage() {
  const { isSignedIn, getToken, userId } = useAuth();
  const { openSignIn } = useClerk();
  const { refetch: refetchUsage } = useUsage();
  const prevCompletedCount = useRef(0);

  const [notebooks, setNotebooks] = useState([]);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [currentPlayingNotebook, setCurrentPlayingNotebook] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [subtitleData, setSubtitleData] = useState([]); 
  const [isSubtitleOpen, setIsSubtitleOpen] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(null);


  const fetchNotebooks = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const response = await fetch('http://localhost:8000/notebooks', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch notebooks');
      }
      const data = await response.json();
      const formattedNotebooks = data.map(notebook => ({
        ...notebook,
        manifestUrl: `http://localhost:8000/stream/${notebook.user_id}/${notebook.job_id}/${notebook.voice}/manifest.m3u8`,
        notesCount: 0 // Initialize with 0, will be updated
      }));
      setNotebooks(formattedNotebooks);
    } catch (error) {
      console.error("Error fetching notebooks:", error);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  
  useEffect(() => {
    if (!userId || notebooks.length === 0) return;

    const fetchStatus = async () => {
      const token = await getToken();
      const statusUpdates = notebooks.map(async (notebook) => {
        if (notebook.status !== 'completed' && notebook.job_id) {
          try {
            const response = await fetch(`http://localhost:8000/job_status/${notebook.job_id}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) return notebook;

            const data = await response.json();
            const newStatus = data.status;

            if (newStatus !== notebook.status) {
              if (newStatus === 'failed' && data.error) {
                toast.error(data.error);
                return null;
              }
              return { ...notebook, status: newStatus };
            }
          } catch (error) {
            console.error('Error fetching job status:', error);
          }
        }
        return notebook;
      });

      const updatedNotebooks = (await Promise.all(statusUpdates)).filter(Boolean);

      if (JSON.stringify(updatedNotebooks) !== JSON.stringify(notebooks)) {
        setNotebooks(updatedNotebooks);
        const currentCompletedCount = updatedNotebooks.filter(nb => nb.status === 'completed').length;
        if (currentCompletedCount > prevCompletedCount.current) {
          refetchUsage();
        }
        prevCompletedCount.current = currentCompletedCount;
      }
    };

    const interval = setInterval(() => {
      const hasActiveJobs = notebooks.some(nb => nb.status !== 'completed');
      if (hasActiveJobs) {
        fetchStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [notebooks, getToken, userId]);

  useEffect(() => {
    if (isSubtitleOpen) {
      document.body.classList.add('body-no-scroll');
    } else {
      document.body.classList.remove('body-no-scroll');
    }
    // Cleanup function to ensure the class is removed when the component unmounts
    return () => {
      document.body.classList.remove('body-no-scroll');
    };
  }, [isSubtitleOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');

    if (paymentStatus === 'success') {
      toast.success('Payment successful! Your subscription has been activated.');
      refetchUsage();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refetchUsage]);


  const handleNewNotebookClick = () => {
    if (isSignedIn) {
      setIsUploadModalOpen(true);
    } else {
      openSignIn();
    }
  };

  const handleUploadComplete = () => {
    fetchNotebooks();
  };

  const deleteNotebook = async (jobId) => {
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:8000/notebooks/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setNotebooks(notebooks.filter(notebook => notebook.job_id !== jobId));
        if (currentPlayingNotebook && currentPlayingNotebook.job_id === jobId) {
          setShowAudioPlayer(false);
          setCurrentPlayingNotebook(null);
          setIsSubtitleOpen(false);
        }
      } else {
        console.error('Failed to delete notebook');
        // Optionally, show an error message to the user
      }
    } catch (error) {
      console.error('Error deleting notebook:', error);
    }
  };

  const playNotebook = async (notebook) => {
    if (notebook.status === 'completed') {
      try {
        const token = await getToken();
        // CHANGE: Fetch the JSON subtitles instead of raw chunks
        const response = await fetch(`http://localhost:8000/stream/subtitles/${notebook.user_id}/${notebook.job_id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
           // Fallback if subtitles aren't ready? 
           // Or just throw error
           console.warn("Subtitles not found, maybe old job?");
           setSubtitleData([]);
        } else {
           const data = await response.json();
           // Expecting: { segments: [{start, end, text}, ...] }
           setSubtitleData(data.segments || []);
        }

        setIsSubtitleOpen(true);
        setCurrentPlayingNotebook(notebook);
        setShowAudioPlayer(true);
      } catch (error) {
        console.error("Error setting notebook to play:", error);
      }
    }
  };

  // Get current subtitle based on player time
  const getCurrentSubtitle = () => {
    if (!subtitleData || subtitleData.length === 0) return '';
    
    const current = subtitleData.find(
      segment => playerTime >= segment.start && playerTime < segment.end
    );
    
    return current ? current.text : '';
  };

  const closeAudioPlayer = useCallback(() => {
    setShowAudioPlayer(false);
    setCurrentPlayingNotebook(null);
  }, []);

  const closeSubtitleWindow = () => {
    setIsSubtitleOpen(false);
  };

  const toggleSubtitleWindow = () => {
    setIsSubtitleOpen(!isSubtitleOpen);
  };

  // Callback to update notes count in notebook when notes are created/updated/deleted
  const handleNotesUpdate = useCallback((newNotesCount) => {
    setNotebooks(prevNotebooks =>
      prevNotebooks.map(nb =>
        nb.job_id === currentPlayingNotebook?.job_id
          ? { ...nb, notesCount: newNotesCount }
          : nb
      )
    );
  }, [currentPlayingNotebook]);

  return (
    <div className="min-h-screen flex flex-col bg-yellow-400">
      <main className="grow p-8 relative">
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
              onDelete={() => deleteNotebook(notebook.job_id)}
              onOpen={() => playNotebook(notebook)}
              userId={userId}
              jobId={notebook.job_id}
              getToken={getToken}
              notesCount={notebook.notesCount}
            />
          ))}
        </div>
      </main>

      {isSubtitleOpen && (
        <SubtitleWindow 
           subtitles={subtitleData} 
           currentTime={playerTime}
           onClose={closeSubtitleWindow}
           duration={duration}
           onSeek={setSeekTime}
        />
      )}

      {showAudioPlayer && currentPlayingNotebook && (
        <AudioPlayer 
          title={currentPlayingNotebook.title}
          manifestUrl={currentPlayingNotebook.manifestUrl}
          getToken={getToken}
          onClose={closeAudioPlayer}
          onToggleSubtitle={toggleSubtitleWindow}
          onTimeUpdate={(time) => setPlayerTime(time)}
          onDurationChange={setDuration}
          seekTime={seekTime}
          userId={userId}
          jobId={currentPlayingNotebook.job_id}
          currentSubtitle={getCurrentSubtitle()}
          onNotesUpdate={handleNotesUpdate}
          isSubtitleOpen={isSubtitleOpen}
          onCloseSubtitle={closeSubtitleWindow}
        />
      )}

      <UploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadComplete} 
      />
    </div>
  );
}
