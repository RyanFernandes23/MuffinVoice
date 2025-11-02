'use client';

import { useState, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

export default function NotebookCard({ title, voice, status, onDelete, onOpen }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuRef]);

  const handleOpen = () => {
    onOpen();
    setIsOpen(false);
  };

  const handleDeleteClick = () => {
    setShowConfirmDialog(true);
    setIsOpen(false); // Close the 3-dot menu when opening the confirm dialog
  };

  const handleConfirmDelete = () => {
    onDelete();
    setShowConfirmDialog(false);
  };

  const handleCancelDelete = () => {
    setShowConfirmDialog(false);
  };

  const handleMenuToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const displayTitle = title.length > 30 ? title.substring(0, 27) + '...' : title;

  return (
    <div className="bg-black rounded-lg shadow-md p-6 mb-4 relative cursor-pointer" onClick={handleOpen}>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold text-yellow-400 mb-2">{displayTitle}</h2>
          <p className="text-yellow-400 mb-1">Voice: {voice}</p>
          <p className="text-yellow-400">Status: {status} {status === 'processing' && (
            <svg className="animate-spin h-4 w-4 text-yellow-400 inline-block ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}</p>
        </div>
        <div className="relative">
          <button onClick={handleMenuToggle} className="text-yellow-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
          {isOpen && (
            <div ref={menuRef} className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg z-10 py-1">
              <button onClick={handleOpen} className="block px-4 py-2 text-sm text-white hover:bg-gray-700 w-full text-left">Open</button>
              <div className="border-b border-gray-700 my-1"></div>
              <button onClick={handleDeleteClick} className="block w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-900 w-full text-left">Delete</button>
            </div>
          )}
        </div>
      </div>

      {showConfirmDialog && (
        <div className="fixed inset-0 bg-transparent flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl text-gray-800 relative">
            <button onClick={handleCancelDelete} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
              <FaTimes className="h-5 w-5" />
            </button>
            <p className="mb-4">Are you sure you want to delete this notebook?</p>
            <div className="flex justify-end space-x-4">
              <button onClick={handleCancelDelete} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">Cancel</button>
              <button onClick={handleConfirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
