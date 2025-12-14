'use client';
import { useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function SubtitleWindow({ subtitles, currentTime, onClose }) {
  const containerRef = useRef(null);

  // Auto-scroll to active subtitle
  useEffect(() => {
    const activeElement = document.getElementById('active-subtitle');
    if (activeElement && containerRef.current) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentTime]); // Re-run whenever time changes enough to change active line

  return (
    <div className="fixed bottom-24 right-4 w-80 max-h-96 bg-gray-900 text-white p-4 rounded-lg shadow-lg border border-gray-700 flex flex-col z-50">
      <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
        <h3 className="font-semibold text-sm">Subtitles</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <FaTimes />
        </button>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2"
        style={{ scrollBehavior: 'smooth' }}
      >
        {subtitles.length > 0 ? (
          subtitles.map((line, idx) => {
            const isActive = currentTime >= line.start && currentTime < line.end;
            return (
              <p
                key={idx}
                id={isActive ? 'active-subtitle' : null}
                className={`text-sm leading-relaxed transition-colors duration-200 ${
                  isActive 
                    ? 'text-green-400 font-bold bg-gray-800 p-2 rounded' 
                    : 'text-gray-300'
                }`}
              >
                {line.text}
              </p>
            );
          })
        ) : (
          <p className="text-gray-500 text-xs italic">No subtitles available.</p>
        )}
      </div>
    </div>
  );
}
