import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Manifest, AudioChunk } from '../types';

interface AudioPlayerContextType {
  currentManifest: Manifest | null;
  setCurrentManifest: (manifest: Manifest | null) => void;
  currentChunkIndex: number;
  setCurrentChunkIndex: (index: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const AudioPlayerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentManifest, setCurrentManifest] = useState<Manifest | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  return (
    <AudioPlayerContext.Provider value={{
      currentManifest,
      setCurrentManifest,
      currentChunkIndex,
      setCurrentChunkIndex,
      isPlaying,
      setIsPlaying
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};