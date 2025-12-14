'use client';

import { FaTimes } from 'react-icons/fa';

export default function SubtitleWindow({ content, onClose }) {
  const formatSubtitleText = (text, wordsPerLine = 10) => {
    if (!text) return "";
    const words = text.split(/\s+/); // Split by one or more whitespace characters
    let formattedText = [];
    for (let i = 0; i < words.length; i += wordsPerLine) {
      formattedText.push(words.slice(i, i + wordsPerLine).join(' '));
    }
    return formattedText.join('\n');
  };

  const formattedContent = formatSubtitleText(content);

  return (
    <div className="fixed bottom-[144px] left-0 w-full bg-black bg-opacity-75 z-50">
      <div className="bg-gray-800 shadow-lg p-8 w-full max-h-[calc(80vh-144px)] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-200">Subtitles</h2>
          <button onClick={onClose} className="text-gray-200 hover:text-gray-50">
            <FaTimes size={24} />
          </button>
        </div>
        <div className="text-white whitespace-pre-wrap text-center">
          {formattedContent}
        </div>
      </div>
    </div>
  );
}
