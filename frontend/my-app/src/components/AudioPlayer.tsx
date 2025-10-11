import React, { useRef, useEffect } from 'react';
import AudioPlayer from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';

const CustomAudioPlayer: React.FC = () => {
  const { 
    currentManifest, 
    currentChunkIndex, 
    setCurrentChunkIndex, 
    isPlaying, 
    setIsPlaying 
  } = useAudioPlayer();
  
  const playerRef = useRef<any>(null);

  const currentChunk = currentManifest?.chunks[currentChunkIndex];

  const handleNext = () => {
    if (currentManifest && currentChunkIndex < currentManifest.chunks.length - 1) {
      setCurrentChunkIndex(currentChunkIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex(currentChunkIndex - 1);
    }
  };

  const handleEnded = () => {
    if (currentManifest && currentChunkIndex < currentManifest.chunks.length - 1) {
      // Auto-advance to next chunk
      setCurrentChunkIndex(currentChunkIndex + 1);
    } else {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    // Reset player when chunk changes
    if (playerRef.current && playerRef.current.audio.current) {
      playerRef.current.audio.current.load();
    }
  }, [currentChunkIndex]);

  if (!currentManifest || !currentChunk) {
    return (
      <div className="p-6 bg-gray-100 rounded-lg text-center text-gray-500">
        Upload a file to generate audio
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4">Audio Player</h2>
      
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <h3 className="font-medium">Current Chunk {currentChunkIndex + 1} of {currentManifest.chunks.length}</h3>
        <p className="text-sm text-gray-600 mt-1">{currentChunk.text}</p>
      </div>

      <AudioPlayer
        ref={playerRef}
        src={currentChunk.url}
        showSkipControls={true}
        showJumpControls={false}
        onClickPrevious={handlePrevious}
        onClickNext={handleNext}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        header={`Chunk ${currentChunkIndex + 1}`}
      />

      <div className="mt-4">
        <h4 className="font-medium mb-2">All Chunks:</h4>
        <div className="max-h-40 overflow-y-auto">
          {currentManifest.chunks.map((chunk, index) => (
            <div
              key={index}
              className={`p-2 cursor-pointer hover:bg-gray-100 ${
                index === currentChunkIndex ? 'bg-blue-100 border-l-4 border-blue-500' : ''
              }`}
              onClick={() => setCurrentChunkIndex(index)}
            >
              <span className="text-sm">
                {index + 1}. {chunk.text.substring(0, 100)}...
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomAudioPlayer;