'use client';
import { useEffect, useRef, useState } from 'react';
import { FaTimes, FaCrosshairs } from 'react-icons/fa';

export default function SubtitleWindow({ subtitles, currentTime, onClose, duration, onSeek }) {
  const scrollContainerRef = useRef(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  // Auto-scroll to active subtitle
  useEffect(() => {
    if (!isAutoScrolling) return;

    const activeElement = document.getElementById('active-subtitle');
    if (activeElement && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const elementRect = activeElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if the element is not centered
      const elementCenter = elementRect.top + elementRect.height / 2;
      const containerCenter = containerRect.top + containerRect.height / 2;
      
      const isCentered = Math.abs(elementCenter - containerCenter) < 1; // 1px tolerance

      if (!isCentered) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentTime, isAutoScrolling]); // Re-run whenever time changes enough to change active line

  const handleUserScroll = () => {
    setIsAutoScrolling(false);
  };

  const handleFollowClick = () => {
    setIsAutoScrolling(true);
  };

  const handleDoubleClick = (time) => {
    if(onSeek) {
      onSeek(time);
    }
  };

  const isAudioEnd = duration > 0 && Math.abs(currentTime - duration) < 0.1;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center">
      <div 
        ref={scrollContainerRef} 
        className="w-full p-8 overflow-auto h-full pb-40"
        onWheel={handleUserScroll}
      >
        <div 
          className="text-center space-y-4"
        >
          {subtitles.length > 0 ? (
            subtitles.map((line, idx) => {
              const isActive = currentTime >= line.start && currentTime < line.end;
              return (
                <p
                  key={idx}
                  id={isActive ? 'active-subtitle' : null}
                  className={`text-2xl leading-relaxed transition-colors duration-200 ${
                    isActive 
                      ? 'text-white font-extrabold' 
                      : 'text-gray-300 opacity-50'
                  }`}
                  onClick={() => handleDoubleClick(line.start)}
                >
                  {line.text}
                </p>
              );
            })
          ) : (
            <p className="text-gray-500 text-lg italic">No subtitles available.</p>
          )}
          <div
            id={isAudioEnd ? 'active-subtitle' : null}
            className={`text-2xl leading-relaxed transition-colors duration-200 ${
              isAudioEnd
                ? 'text-white font-extrabold'
                : 'text-gray-300 opacity-50'
            }`}
          >
            ...
          </div>
        </div>
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
        <FaTimes />
      </button>
      {!isAutoScrolling && (
        <button 
          onClick={handleFollowClick} 
          className="absolute top-4 left-4 bg-yellow-400 text-black px-4 py-2 rounded-lg font-semibold hover:bg-yellow-500 transition duration-300 flex items-center z-50"
        >
          <FaCrosshairs className="mr-2" />
          Get back to playhead position
        </button>
      )}
    </div>
  );
}
