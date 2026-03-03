"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Upload, ArrowRight } from "lucide-react";
import Link from "next/link";

const planLimits = {
  explorer: { name: "Explorer", fileSize: "50MB", upgradeSize: "100MB" },
  creator: { name: "Creator", fileSize: "100MB", upgradeSize: "150MB" },
  professional: { name: "Professional", fileSize: "150MB", upgradeSize: null },
};

export function FileTooLargeModal({ isOpen, onClose, fileSize, currentPlan = "explorer", onTryAnotherFile }) {
  if (!isOpen) return null;

  const plan = planLimits[currentPlan] || planLimits.explorer;
  const canUpgrade = plan.upgradeSize !== null;
  const nextPlan = currentPlan === "explorer" ? "creator" : "professional";

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
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md rounded-xl overflow-hidden"
          style={{ background: '#111111', border: '1px solid rgba(239, 68, 68, 0.2)', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-red-500/20 p-6" style={{ background: 'rgba(239, 68, 68, 0.05)' }}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-500/10 rounded-lg">
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
            <div className="bg-white/[0.04] rounded-xl p-4 space-y-3 border border-white/[0.06]">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Your file</span>
                <span className="text-white font-medium">{formatFileSize(fileSize)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">{plan.name} plan limit</span>
                <span className="text-red-400 font-medium">{plan.fileSize}</span>
              </div>
              <div className="h-px bg-white/[0.06]" />
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Exceeded by</span>
                <span className="text-red-400 font-medium">
                  {formatFileSize(fileSize - parseFileSize(plan.fileSize))}
                </span>
              </div>
            </div>

            {canUpgrade ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <p className="text-amber-300 text-sm mb-2 font-medium">
                  Upgrade to {nextPlan.charAt(0).toUpperCase() + nextPlan.slice(1)} for {plan.upgradeSize} uploads
                </p>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>Current: {plan.fileSize}</span>
                  <ArrowRight className="w-3 h-3" />
                  <span className="text-amber-300">{plan.upgradeSize}</span>
                </div>
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                <p className="text-neutral-400 text-sm">
                  You've reached the maximum file size limit. Please try compressing your file or splitting it into smaller parts.
                </p>
              </div>
            )}

            <div className="space-y-3 pt-2">
              {canUpgrade && (
                <Link href="/pricing" onClick={onClose} className="block">
                  <button className="w-full py-3 rounded-lg font-medium text-black bg-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                    Compare Plans <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              )}
              <button
                onClick={() => { onTryAnotherFile?.(); onClose(); }}
                className="w-full py-3 rounded-lg font-medium text-neutral-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-all flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" /> Try Another File
              </button>
            </div>
          </div>

          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/[0.05] transition-colors">
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function parseFileSize(sizeStr) {
  const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) return 0;
  return parseFloat(match[1]) * (units[match[2].toUpperCase()] || 1);
}
