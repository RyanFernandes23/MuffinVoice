'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'react-hot-toast';
import { Plus, FilePlus } from 'lucide-react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';


// Components
import NotebookCard from '../components/NotebookCard';
import AudioPlayer from '../components/AudioPlayer';
import UploadModal from '../components/UploadModal';
import SubtitleWindow from '../components/SubtitleWindow';
import FreeAudiobooksSection from '../components/FreeAudiobooksSection';

import { useNotebookStatus } from '../hooks/useNotebookStatus';
import { useUsage } from '../../hooks/useUsage';


export default function DashboardPage() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();

  const {
    notebooks,
    activeNotebooks,
    loading,
    connectionStatus,
    refresh
  } = useNotebookStatus(userId, getToken, isLoaded);

  const { refresh: refetchUsage } = useUsage(isSignedIn ? getToken : null);


  const deleteNotebookOptimistic = useCallback(async (jobId) => {
    if (!userId || !getToken) return false;
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/notebooks/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete notebook');
      }

      refresh();
      return true;
    } catch (error) {
      console.error('Error deleting notebook:', error);
      toast.error('Error deleting notebook.');
      refresh();
      return false;
    }
  }, [userId, getToken, refresh]);


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

  useEffect(() => {
    document.body.classList.toggle('body-no-scroll', isSubtitleOpen);
  }, [isSubtitleOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('payment') === 'success';

    if (success) {
      toast.success('Payment successful! Subscription activated.');
      refetchUsage();
    }

    window.history.replaceState({}, '', window.location.pathname);
  }, [refetchUsage]);

  const handleNewNotebookClick = () => {
    if (!isSignedIn) {
      toast.error('Please sign in to create notebooks');
      return;
    }
    setIsUploadModalOpen(true);
  };

  const handleUploadComplete = async () => {
    await refresh();
    await refetchUsage();
  };



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
        const manifestUrl = `${API_BASE_URL}/api/stream/${notebook.user_id}/${notebook.job_id}/${notebook.voice}/manifest.m3u8`;
        setCurrentNotebook({ ...notebook, manifestUrl });

        setShowPlayer(true);
        setTimeout(() => setIsSubtitleOpen(true), 80);
      } catch (err) {
        console.error('Error playing notebook:', err);
      }
    },
    [getToken]
  );
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

  const playPublicNotebook = useCallback(
    async (notebook) => {
      try {
        const manifestUrl = `${API_BASE_URL}/api/stream/${notebook.user_id}/${notebook.job_id}/${notebook.voice}/manifest.m3u8`;

        // Fetch subtitles as guest if needed
        const res = await fetch(
          `${API_BASE_URL}/api/stream/subtitles/${notebook.user_id}/${notebook.job_id}`
        );

        let data = { segments: [] };
        if (res.ok) data = await res.json();

        setSubtitleData(data.segments || []);
        setCurrentNotebook({ ...notebook, manifestUrl });
        setShowPlayer(true);
        setTimeout(() => setIsSubtitleOpen(true), 80);
      } catch (err) {
        console.error('Error playing public notebook:', err);
      }
    },
    []
  );

  const handleNotesUpdate = (count) => {
    console.log(`Notes updated for ${currentNotebook?.job_id}: ${count} notes`);
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
      <main className="relative z-10 pt-24 pb-32">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
          className="fixed top-20 right-6 md:right-8 z-40 flex flex-row items-center gap-4 justify-end"
        >
          {/* Floating Action Button - Kindwise pill */}
          <motion.div
            initial={{ opacity: 0, scale: 0, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleNewNotebookClick}
              className="relative group bg-white text-black px-6 py-3.5 rounded-lg font-bold flex items-center gap-2 hover:opacity-90 transition-opacity duration-200"
            >
              <Plus className="w-5 h-5" />
              <span>New Notebook</span>
            </motion.button>
          </motion.div>
        </motion.div>



        {/* Notebook Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="container mx-auto px-4 md:px-6 py-8"
        >
          <div className="flex flex-col gap-12">
            {/* Personal Notebooks Section */}
            <div className="flex flex-col gap-6">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex justify-between items-center"
              >
                <h2 className="text-2xl md:text-3xl font-bold text-white">
                  Your Notebooks
                </h2>
              </motion.div>

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-64 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.05]" />
                  ))}
                </div>
              ) : notebooks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {notebooks.map((nb, i) => (
                    <motion.div
                      key={nb.job_id}
                      initial={{ opacity: 0, y: 50, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.5,
                        delay: Math.min(0.1 * i, 0.5),
                        ease: [0.16, 1, 0.3, 1]
                      }}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    >
                      <NotebookCard
                        title={nb.title}
                        voice={nb.voice}
                        status={nb.status}
                        progress_percent={nb.progress_percent}
                        createdAt={nb.created_at}
                        notesCount={nb.notesCount}
                        userId={nb.user_id}
                        jobId={nb.job_id}
                        getToken={getToken}
                        sourceUrl={nb.source_url}
                        onOpen={() => playNotebook(nb)}
                        onDelete={() => deleteNotebook(nb.job_id)}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-neutral-500 py-12 text-center border border-dashed border-white/10 rounded-xl">
                  No notebooks found. Upload your first one to get started.
                </div>
              )}
            </div>

            {/* Free Audiobooks Section */}
            <div className="flex flex-col gap-6">
              <FreeAudiobooksSection
                getToken={getToken}
                onPlay={playPublicNotebook}
                title={notebooks.length === 0 ? "Start with Free Audiobooks" : "Free Audiobooks"}
                description={notebooks.length === 0
                  ? "Welcome! Try one of these free audiobooks while you wait for your first upload."
                  : "Explore our collection of public audiobooks."
                }
                defaultCollapsed={notebooks.length > 0}
              />
            </div>
          </div>
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
          voice={currentNotebook.voice}
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
