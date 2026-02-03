'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth, useClerk, SignedIn } from '@clerk/nextjs';
import { toast } from 'react-hot-toast';
import { Plus, Sparkles, FilePlus } from 'lucide-react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000'; // Default for server-side


// Components
import NotebookCard from '../components/NotebookCard';
import AudioPlayer from '../components/AudioPlayer';
import UploadModal from '../components/UploadModal';
import SubtitleWindow from '../components/SubtitleWindow';
import UsageProgress from '../components/UsageProgress';

// Hooks
import { useUsage } from '../hooks/useUsage';
// import useDashboardData from './useDashboardData';

export default function DashboardPage() {
  const { isSignedIn, getToken, userId } = useAuth();
  const { openSignIn } = useClerk();
  const { refetch: refetchUsage } = useUsage();

  const [notebooks, setNotebooks] = useState([]);

  const fetchNotebooks = useCallback(async () => {
    if (!userId || !getToken) return;
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/notebooks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setNotebooks(data);
      } else {
        console.error('Failed to fetch notebooks:', response.status);
        toast.error('Failed to load notebooks.');
      }
    } catch (error) {
      console.error('Error fetching notebooks:', error);
      toast.error('Error loading notebooks.');
    }
  }, [userId, getToken]);

  const updateNotebookStatus = useCallback(async (nbOrJobId) => {
    if (!userId || !getToken) return [];

    let updatedNotebooks = [...notebooks];

    if (typeof nbOrJobId === 'function') { // Called from handleNotesUpdate for a specific notebook
      updatedNotebooks = updatedNotebooks.map(nbOrJobId);
    } else { // Polling scenario
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/notebooks`, { // Re-fetch all for simplicity
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (response.ok) {
          updatedNotebooks = await response.json();
        } else {
          console.error('Failed to update notebook status:', response.status);
        }
      } catch (error) {
        console.error('Error updating notebook status:', error);
      }
    }
    setNotebooks(updatedNotebooks);
    return updatedNotebooks; // Return updated list for the poll function
  }, [userId, getToken, notebooks]);


  const deleteNotebookOptimistic = useCallback(async (jobId) => {
    if (!userId || !getToken) return false;
    try {
      const token = await getToken();
      // Optimistically update UI
      setNotebooks(prev => prev.filter(nb => nb.job_id !== jobId));

      const response = await fetch(`${API_BASE_URL}/api/notebooks/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // If delete fails, re-fetch to revert optimistic update
        fetchNotebooks();
        throw new Error('Failed to delete notebook');
      }
      return true;
    } catch (error) {
      console.error('Error deleting notebook:', error);
      toast.error('Error deleting notebook.');
      fetchNotebooks(); // Revert on error
      return false;
    }
  }, [userId, getToken, fetchNotebooks]);


  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Player State
  const [currentNotebook, setCurrentNotebook] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [isSubtitleOpen, setIsSubtitleOpen] = useState(false);
  const [subtitleData, setSubtitleData] = useState([]);
  const [playerTime, setPlayerTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(null);

  const prevCompletedCount = useRef(0);

  /* ----------------------------------------------
     Fetch Notebooks on Mount
  ------------------------------------------------*/
  useEffect(() => {
    if (isSignedIn) fetchNotebooks();
  }, [isSignedIn, fetchNotebooks]);



  /* ----------------------------------------------
     Subtitle Overlay Body Scroll Handling
  ------------------------------------------------*/
  useEffect(() => {
    document.body.classList.toggle('body-no-scroll', isSubtitleOpen);
  }, [isSubtitleOpen]);

  /* ----------------------------------------------
     Handle Payment Redirect
  ------------------------------------------------*/
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('payment') === 'success';

    if (success) {
      toast.success('Payment successful! Subscription activated.');
      refetchUsage();
    }

    window.history.replaceState({}, '', window.location.pathname);
  }, [refetchUsage]);

  /* ----------------------------------------------
     Upload Notebook
  ------------------------------------------------*/
  const handleNewNotebookClick = () => {
    if (!isSignedIn) return openSignIn();
    setIsUploadModalOpen(true);
  };

  const handleUploadComplete = async () => {
    await fetchNotebooks();
  };

  /* ----------------------------------------------
     Play Notebook (fetch subtitles + open player)
  ------------------------------------------------*/
  const playNotebook = useCallback(
    async (notebook) => {
      if (notebook.status !== 'completed') return;

      try {
        const token = await getToken();
        const res = await fetch(
          `${API_BASE_URL}/api/stream/subtitles/${notebook.user_id}/${notebook.job_id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        let data = { segments: [] };
        if (res.ok) data = await res.json();

        setSubtitleData(data.segments || []);
        // Construct manifestUrl for the AudioPlayer
        const manifestUrl = `${API_BASE_URL}/api/stream/${notebook.user_id}/${notebook.job_id}/${notebook.voice}/manifest.m3u8`;
        setCurrentNotebook({ ...notebook, manifestUrl });

        // Open audio first, then subtitles to avoid UI glitch
        setShowPlayer(true);
        setTimeout(() => setIsSubtitleOpen(true), 80);
      } catch (err) {
        console.error('Error playing notebook:', err);
      }
    },
    [getToken]
  );

  /* ----------------------------------------------
     Delete Notebook Optimistically
  ------------------------------------------------*/
  const deleteNotebook = async (jobId) => {
    const success = await deleteNotebookOptimistic(jobId);

    if (success) {
      toast.success('Notebook deleted');
      if (currentNotebook?.job_id === jobId) {
        setShowPlayer(false);
        setCurrentNotebook(null);
        setIsSubtitleOpen(false);
      }
    } else {
      toast.error('Failed to delete');
    }
  };

  /* ----------------------------------------------
     Notes Update from Player
  ------------------------------------------------*/
  const handleNotesUpdate = (count) => {
    if (!currentNotebook) return;

    const jobId = currentNotebook.job_id;

    // Update only the notebook being viewed
    updateNotebookStatus(nb =>
      nb.job_id === jobId ? { ...nb, notesCount: count } : nb
    );
  };

  const getCurrentSubtitle = () => {
    if (!subtitleData.length) return '';
    const active = subtitleData.find(
      s => playerTime >= s.start && playerTime < s.end
    );
    return active?.text || '';
  };

  return (
    <div className="relative min-h-screen">
      {/* Fire fly ambient particles */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="firefly-particle" style={{ left: '10%', top: '20%', animationDelay: '0s' }} />
        <div className="firefly-particle" style={{ left: '25%', top: '60%', animationDelay: '1s' }} />
        <div className="firefly-particle" style={{ left: '45%', top: '30%', animationDelay: '2s' }} />
        <div className="firefly-particle" style={{ left: '65%', top: '70%', animationDelay: '3s' }} />
        <div className="firefly-particle" style={{ left: '80%', top: '40%', animationDelay: '4s' }} />
        <div className="firefly-particle" style={{ left: '90%', top: '80%', animationDelay: '5s' }} />
        <div className="firefly-particle" style={{ left: '15%', top: '85%', animationDelay: '6s' }} />
        <div className="firefly-particle" style={{ left: '55%', top: '15%', animationDelay: '7s' }} />
      </div>

      <main className="relative z-10 pt-24 pb-32">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
          className="fixed top-20 right-6 md:right-8 z-40 flex flex-row items-center gap-4 justify-end"
        >
          {/* Usage Progress */}
          <SignedIn>
            <motion.div>
              <UsageProgress />
            </motion.div>
          </SignedIn>

          {/* Floating Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
          >
            <motion.button
              whileHover={{ scale: 1.05, rotate: 3 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleNewNotebookClick}
              className="bg-gradient-to-r from-primary via-primary-glow to-accent text-white px-6 py-3.5 rounded-full font-bold shadow-2xl hover:shadow-primary/40 flex items-center gap-2 border border-white/10"
            >
              <Plus className="w-5 h-5" />
              <span>New Notebook</span>
            </motion.button>
          </motion.div>
        </motion.div>



        {/* Notebook Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="container mx-auto px-4 md:px-6 py-8"
        >
          <motion.h2 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl md:text-3xl font-bold text-white mb-6 flex items-center gap-3"
          >
            <Sparkles className="w-6 h-6 text-accent-glow" />
            Your Notebooks
          </motion.h2>
          
          {notebooks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card rounded-3xl p-12 text-center max-w-2xl mx-auto"
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 mb-6"
              >
                <FilePlus className="w-10 h-10 text-primary-glow" />
              </motion.div>
              <h3 className="text-2xl font-bold text-white mb-3">No notebooks yet</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Create your first notebook to start converting documents into audiobooks with AI-powered text-to-speech.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNewNotebookClick}
                className="bg-gradient-to-r from-primary to-accent text-white px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-primary/30 transition-all"
              >
                Create Your First Notebook
              </motion.button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {notebooks.map((nb, i) => (
                <motion.div
                  key={nb.job_id}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 * i }}
                >
                  <NotebookCard
                    title={nb.title}
                    voice={nb.voice}
                    status={nb.status}
                    notesCount={nb.notesCount}
                    userId={nb.user_id}
                    jobId={nb.job_id}
                    getToken={getToken}
                    onOpen={() => playNotebook(nb)}
                    onDelete={() => deleteNotebook(nb.job_id)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      {/* Subtitle Window */}
      {isSubtitleOpen && (
        <SubtitleWindow
          subtitles={subtitleData}
          currentTime={playerTime}
          duration={duration}
          onSeek={setSeekTime}
          onClose={() => setIsSubtitleOpen(false)}
        />
      )}

      {/* Audio Player */}
      {showPlayer && currentNotebook && (
        <AudioPlayer
          title={currentNotebook.title}
          manifestUrl={currentNotebook.manifestUrl}
          userId={userId}
          jobId={currentNotebook.job_id}
          getToken={getToken}
          onClose={() => setShowPlayer(false)}
          onToggleSubtitle={() => setIsSubtitleOpen(v => !v)}
          onTimeUpdate={setPlayerTime}
          onDurationChange={setDuration}
          seekTime={seekTime}
          currentSubtitle={getCurrentSubtitle()}
          onNotesUpdate={handleNotesUpdate}
          isSubtitleOpen={isSubtitleOpen}
          onCloseSubtitle={() => setIsSubtitleOpen(false)}
        />
      )}

      {/* Upload */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadComplete}
      />
    </div>
  );
}
