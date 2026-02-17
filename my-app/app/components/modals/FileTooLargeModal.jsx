"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Upload, ArrowRight } from "lucide-react";
import Link from "next/link";

const planLimits = {
  explorer: { name: "Explorer", fileSize: "50MB", upgradeSize: "100MB" },
  creator: { name: "Creator", fileSize: "100MB", upgradeSize: "150MB" },
  professional: { name: "Professional", fileSize: "150MB", upgradeSize: null },
};

export function FileTooLargeModal({
  isOpen,
  onClose,
  fileSize,
  currentPlan = "explorer",
  onTryAnotherFile
}) {
  if (!isOpen) return null;

  const plan = planLimits[currentPlan] || planLimits.explorer;
  const canUpgrade = plan.upgradeSize !== null;
  const nextPlan = currentPlan === "explorer" ? "creator" : "professional";

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md glass-card rounded-2xl border border-white/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with warning icon */}
          <div className="bg-red-500/10 border-b border-red-500/20 p-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">File Too Large</h2>
                <p className="text-red-400 text-sm">Upload limit exceeded</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* File details */}
            <div className="bg-white/5 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Your file</span>
                <span className="text-white font-medium">{formatFileSize(fileSize)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">{plan.name} plan limit</span>
                <span className="text-red-400 font-medium">{plan.fileSize}</span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Exceeded by</span>
                <span className="text-red-400 font-medium">
                  {formatFileSize(fileSize - parseFileSize(plan.fileSize))}
                </span>
              </div>
            </div>

            {/* Solution */}
            {canUpgrade ? (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                <p className="text-amber-400 text-sm mb-2">
                  Upgrade to {nextPlan.charAt(0).toUpperCase() + nextPlan.slice(1)} for {plan.upgradeSize} uploads
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>Current: {plan.fileSize}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="text-amber-400">{plan.upgradeSize}</span>
                </div>
              </div>
            ) : (
              <div className="bg-gray-500/10 border border-gray-500/20 rounded-lg p-4">
                <p className="text-gray-400 text-sm">
                  You've reached the maximum file size limit. Please try compressing your file or splitting it into smaller parts.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              {canUpgrade && (
                <Link href="/pricing" onClick={onClose} className="block">
                  <button className="w-full py-3 rounded-lg font-medium text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 transition-all duration-200 flex items-center justify-center gap-2">
                    Compare Plans
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              )}

              <button
                onClick={() => {
                  onTryAnotherFile?.();
                  onClose();
                }}
                className="w-full py-3 rounded-lg font-medium text-gray-300 bg-white/5 hover:bg-white/10 transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Try Another File
              </button>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Helper function to parse file size strings like "50MB" to bytes
function parseFileSize(sizeStr) {
  const units = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * (units[unit] || 1);
}
