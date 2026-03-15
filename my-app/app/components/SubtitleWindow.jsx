'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target, X } from 'lucide-react';

export default function SubtitleWindow({ subtitles, currentTime, onClose, duration, onSeek }) {
  const scrollContainerRef = useRef(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  // Track the active index to only trigger scroll when it changes
  const activeIndex = useMemo(() => {
    return subtitles.findIndex(s => currentTime >= s.start && currentTime < s.end);
  }, [subtitles, currentTime]);

  useEffect(() => {
    if (!isAutoScrolling || activeIndex === -1) return;
    
    const activeElement = document.getElementById(`subtitle-${activeIndex}`);
    const container = scrollContainerRef.current;
    
    if (activeElement && container) {
      const elementRect = activeElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      // Target center of the visible area (excluding player height of ~150px)
      const targetCenter = (containerRect.height - 150) / 2;
      const currentRelativePosition = elementRect.top - containerRect.top;
      const offset = currentRelativePosition - targetCenter;

      if (Math.abs(offset) > 5) {
        container.scrollBy({ top: offset, behavior: 'smooth' });
      }
    }
  }, [activeIndex, isAutoScrolling]);

  const handleUserScroll = () => {
    if (isAutoScrolling) setIsAutoScrolling(false);
  };
  
  const handleFollowClick = () => setIsAutoScrolling(true);
  const isAudioEnd = duration > 0 && (currentTime >= duration - 0.05);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bg-black z-40 flex flex-col items-center overflow-hidden"
    >
      {/* Background Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(circle_at_center,transparent_0%,black_90%)]" />

      <div
        ref={scrollContainerRef}
        className="w-full max-w-4xl px-8 md:px-16 overflow-y-auto h-full no-scrollbar pt-[20vh] pb-[45vh]"
        onWheel={handleUserScroll}
        onTouchMove={handleUserScroll}
      >
        <div className="flex flex-col gap-8 md:gap-12">
          {subtitles.length > 0 ? (
            subtitles.map((line, idx) => {
              const isActive = idx === activeIndex;
              return (
                <div
                  key={idx}
                  id={`subtitle-${idx}`}
                  onClick={() => {
                    onSeek && onSeek(line.start);
                    setIsAutoScrolling(true);
                  }}
                  className={`cursor-pointer transition-[opacity,transform,filter] duration-300 ease-out select-none ${
                    isActive 
                      ? 'opacity-100 scale-100' 
                      : 'opacity-20 scale-[0.98] blur-[0.3px]'
                  }`}
                >
                  <p className={`text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight leading-relaxed transition-colors duration-300 ${
                    isActive ? 'text-white' : 'text-neutral-500'
                  }`}>
                    {line.text}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="text-neutral-700 text-xl font-medium text-center">
              Awaiting transcription...
            </div>
          )}
          
          <div
            id={isAudioEnd ? 'active-subtitle' : null}
            className={`text-xl transition-all duration-300 ${
              isAudioEnd ? 'text-white scale-110' : 'opacity-10 text-neutral-500'
            }`}
          >
            ● ● ●
          </div>
        </div>
      </div>

      {/* Top Controls - Positioned to clear navbar and align with player close */}
      <div className="absolute top-10 left-0 right-0 p-6 md:px-3 flex justify-between items-start pointer-events-none">
        <div className="pointer-events-auto">
          {!isAutoScrolling && (
            <motion.button
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              onClick={handleFollowClick}
              className="flex items-center gap-2 bg-white text-black px-5 py-2 text-[10px] font-bold tracking-widest uppercase hover:bg-neutral-200 transition-colors shadow-xl"
              style={{ borderRadius: '9999px' }}
            >
              <Target size={14} />
              <span>Sync</span>
            </motion.button>
          )}
        </div>
        
        <div className="pointer-events-auto">
          <button 
            onClick={onClose} 
            className="flex items-center justify-center bg-white/5 border border-white/10 text-neutral-400 w-10 h-10 hover:text-white hover:bg-white/10 transition-all"
            style={{ borderRadius: '9999px' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>


      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </motion.div>
  );
}
