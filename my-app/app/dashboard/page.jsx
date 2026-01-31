'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth, useClerk } from '@clerk/nextjs';
import { toast } from 'react-hot-toast';

// Components
import NotebookCard from '../components/NotebookCard';
import AudioPlayer from '../components/AudioPlayer';
import UploadModal from '../components/UploadModal';
import SubtitleWindow from '../components/SubtitleWindow';
import SubscriptionInfo from '../components/SubscriptionInfo';

// Hooks
import { useUsage } from '../hooks/useUsage';
// import useDashboardData from './useDashboardData';

export default function DashboardPage() {
  const { isSignedIn, getToken, userId } = useAuth();
  const { openSignIn } = useClerk();
  const { refetch: refetchUsage } = useUsage();

  const {
    notebooks,
    fetchNotebooks,
    updateNotebookStatus,
    deleteNotebookOptimistic,
  } = useDashboardData({ getToken, userId });

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
     Poll Active Notebook Status
     Interval created ONCE (no runaway re-renders)
  ------------------------------------------------*/
  useEffect(() => {
    if (!userId) return;

    const poll = async () => {
      const updated = await updateNotebookStatus();

      const completed = updated.filter(n => n.status === 'completed').length;

      if (completed > prevCompletedCount.current) {
        refetchUsage(); // Sync usage on new completion
      }
      prevCompletedCount.current = completed;
    };

    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [userId, updateNotebookStatus, refetchUsage]);

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
          `http://localhost:8000/stream/subtitles/${notebook.user_id}/${notebook.job_id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        let data = { segments: [] };
        if (res.ok) data = await res.json();

        setSubtitleData(data.segments || []);
        setCurrentNotebook(notebook);

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
    <div className="min-h-screen relative">
      <main className="grow relative">
        {/* Floating Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed top-24 right-8 z-40"
        >
          <motion.button
            whileHover={{ scale: 1.05, rotate: 90 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleNewNotebookClick}
            className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-full font-bold shadow-2xl hover:shadow-yellow-400/50 flex items-center space-x-2"
          >
            <span className="text-2xl">+</span>
            <span>New Notebook</span>
          </motion.button>
        </motion.div>

        {/* Subscription */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto mb-12 px-8"
        >
          <SubscriptionInfo />
        </motion.div>

        {/* Notebook Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="container mx-auto px-8 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {notebooks.map((nb, i) => (
            <motion.div
              key={nb.job_id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
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
