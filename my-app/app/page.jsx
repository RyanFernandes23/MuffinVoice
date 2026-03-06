'use client';

import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import ExperienceSection from './components/home/ExperienceSection';
import SupportedFormats from './components/home/SupportedFormats';
import FreeAudiobooksSection from './components/FreeAudiobooksSection';
import AudioPlayer from './components/AudioPlayer';
import SubtitleWindow from './components/SubtitleWindow';
import { useState, useCallback, useEffect } from 'react';

const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
  : 'http://localhost:8000';

export default function HomePage() {
  const { scrollYProgress } = useScroll();
  const opacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.3], [1, 0.98]);

  // Player State
  const [currentNotebook, setCurrentNotebook] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [isSubtitleOpen, setIsSubtitleOpen] = useState(false);
  const [subtitleData, setSubtitleData] = useState([]);
  const [playerTime, setPlayerTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(null);

  useEffect(() => {
    document.body.classList.toggle('body-no-scroll', isSubtitleOpen);
  }, [isSubtitleOpen]);

  const playPublicNotebook = useCallback(
    async (notebook) => {
      try {
        const manifestUrl = `${API_BASE_URL}/api/stream/${notebook.user_id}/${notebook.job_id}/${notebook.voice}/manifest.m3u8`;

        // Fetch subtitles as guest
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

  const getCurrentSubtitle = () => {
    if (!subtitleData.length) return '';
    const active = subtitleData.find(
      s => playerTime >= s.start && playerTime < s.end
    );
    return active?.text || '';
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-foreground selection:bg-white/10">
      <main className="grow flex flex-col items-center p-0 relative w-full">
        {/* Hero Section with Fixed Background */}
        <div className="relative w-full h-[500px] flex items-center justify-center overflow-hidden">
          {/* Fixed Background Image - Fades on Scroll */}
          <motion.div
            style={{ opacity, scale }}
            className="fixed top-0 left-0 w-full h-[500px] z-0"
          >
            <img
              src="https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?q=80&w=2000&auto=format&fit=crop"
              alt="Serene desert under blue sky"
              className="w-full h-full object-cover opacity-60"
            />
            {/* Dark Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black" />
            <div className="absolute inset-0 bg-black/40" />
          </motion.div>

          {/* Hero Content - Scrolls Up */}
          <div className="relative z-10 text-center max-w-4xl px-4 mt-16">
            <motion.h1
              className="text-6xl md:text-8xl font-black text-center mb-6 tracking-tighter text-white drop-shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              Aven Reader
            </motion.h1>

            <motion.p
              className="text-lg md:text-xl text-neutral-300 mb-10 text-center max-w-2xl mx-auto leading-relaxed font-medium drop-shadow-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              Transform your articles into natural sounding audiobooks with{' '}
              <span className="text-white">AI-powered</span> text-to-speech technology.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <Link
                href="/dashboard"
                className="group relative inline-flex items-center gap-3 bg-white text-black px-10 py-4 rounded-none text-base font-bold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-2xl"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Following Sections Wrapper - Scrolls OVER/AFTER the hero */}
        <div className="relative z-20 w-full flex flex-col items-center bg-black pt-10 pb-24">
          {/* Experience Section Container */}
          <div id="images-container" className="w-full flex justify-center mb-10 px-4">
            <ExperienceSection />
          </div>

          {/* Supported Formats Container */}
          <div id="formats-container" className="w-full flex justify-center px-4 mb-20">
            <SupportedFormats />
          </div>

          {/* Free Audiobooks Section */}
          <div className="w-full max-w-7xl px-4 md:px-6">
            <FreeAudiobooksSection
              getToken={null}
              onPlay={playPublicNotebook}
              title="Start Listening for Free"
              description="No account needed. Try our curated collection of AI-powered audiobooks right now."
              defaultCollapsed={false}
            />
          </div>
        </div>
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
          userId={currentNotebook.user_id}
          jobId={currentNotebook.job_id}
          getToken={null}
          onClose={() => setShowPlayer(false)}
          onToggleSubtitle={() => setIsSubtitleOpen(v => !v)}
          onTimeUpdate={setPlayerTime}
          onDurationChange={setDuration}
          seekTime={seekTime}
          currentSubtitle={getCurrentSubtitle()}
          isSubtitleOpen={isSubtitleOpen}
          onCloseSubtitle={() => setIsSubtitleOpen(false)}
        />
      )}
    </div>
  );
}
