'use client';
import { useEffect, useRef, useState } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function SubtitleWindow({ subtitles, currentTime, onClose, duration, onSeek }) {
  const scrollContainerRef = useRef(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  useEffect(() => {
    if (!isAutoScrolling) return;
    const activeElement = document.getElementById('active-subtitle');
    if (activeElement && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const elementRect = activeElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const elementCenter = elementRect.top + elementRect.height / 2;
      const containerCenter = containerRect.top + containerRect.height / 2;
      const isCentered = Math.abs(elementCenter - containerCenter) < 1;
      if (!isCentered) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, isAutoScrolling]);

  const handleUserScroll = () => setIsAutoScrolling(false);
  const handleFollowClick = () => setIsAutoScrolling(true);
  const handleDoubleClick = (time) => { if (onSeek) onSeek(time); };
  const isAudioEnd = duration > 0 && Math.abs(currentTime - duration) < 0.1;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center">
      <div
        ref={scrollContainerRef}
        className="w-full p-8 overflow-auto h-full pb-40"
        onWheel={handleUserScroll}
      >
        <div className="text-center space-y-4">
          {subtitles.length > 0 ? (
            subtitles.map((line, idx) => {
              const isActive = currentTime >= line.start && currentTime < line.end;
              return (
                <p
                  key={idx}
                  id={isActive ? 'active-subtitle' : null}
                  className={`text-2xl leading-relaxed transition-all duration-300 cursor-pointer ${isActive
                    ? 'text-white font-extrabold'
                    : 'text-neutral-600 opacity-40'
                    }`}
                  onClick={() => handleDoubleClick(line.start)}
                >
                  {line.text}
                </p>
              );
            })
          ) : (
            <p className="text-neutral-600 text-lg italic">No subtitles available.</p>
          )}
          <div
            id={isAudioEnd ? 'active-subtitle' : null}
            className={`text-2xl leading-relaxed transition-all duration-300 ${isAudioEnd
              ? 'text-white font-extrabold'
              : 'text-neutral-600 opacity-40'
              }`}
          >
            ...
          </div>
        </div>
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white p-2 rounded-lg hover:bg-white/[0.05] transition-all">
        <FaTimes className="w-6 h-6" />
      </button>
      {!isAutoScrolling && (
        <button
          onClick={handleFollowClick}
          className="absolute top-4 left-4 bg-white text-black px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center z-50"
        >
          Get back to playhead position
        </button>
      )}
    </div>
  );
}
