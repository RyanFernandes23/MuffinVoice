'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { History, Mic2, ChevronDown, Loader2 } from 'lucide-react';
import { useVoiceStatus } from '../../hooks/useVoiceStatus';

export default function VoiceSwitcher({
    userId,
    jobId,
    getToken,
    selectedVoice,
    onVoiceSelect,
    processingVoice,
    isOpen,
    setIsOpen,
    innerRef
}) {
    const { voices, progress, loadingVoices, connectionStatus } = useVoiceStatus(
        userId, jobId, getToken, isOpen
    );

    const getStatusColor = (status) => {
        switch (status) {
            case 'ready': return 'text-emerald-400';
            case 'processing': return 'text-amber-400';
            case 'not started': return 'text-neutral-400';
            default: return 'text-neutral-400';
        }
    };

    const getStatusBg = (status) => {
        switch (status) {
            case 'ready': return 'bg-emerald-500/10';
            case 'processing': return 'bg-amber-500/10';
            case 'not started': return 'bg-neutral-500/10';
            default: return 'bg-neutral-500/10';
        }
    };

    // Find the name of the selected voice for the button label
    const selectedVoiceName = voices.find(v => v.id === selectedVoice)?.name || 'Select Voice';

    return (
        <div className="relative" ref={innerRef}>
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${isOpen
                    ? 'bg-white text-black'
                    : 'text-neutral-400 border border-white/[0.08] hover:text-white hover:border-white/20'
                    }`}
            >
                <Mic2 size={18} />
                {selectedVoiceName} <ChevronDown size={16} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full right-0 mb-2 rounded-xl p-3 w-64 max-h-80 overflow-y-auto z-50 origin-bottom-right"
                        style={{
                            background: '#111111',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                        }}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                                <History size={16} /> Available Voices
                            </h3>

                        </div>

                        <div className="space-y-2">
                            {loadingVoices ? (
                                <div className="flex items-center justify-center py-8 text-neutral-400">
                                    <Loader2 className="animate-spin mr-2" size={20} /> Loading...
                                </div>
                            ) : voices.length > 0 ? (
                                <div className="space-y-2">
                                    {voices.map((voice, index) => {
                                        const isTriggering = processingVoice === voice.id;
                                        // Only override with 'processing' if the backend hasn't caught up yet
                                        const effectiveStatus = (isTriggering && voice.status === 'not started') ? 'processing' : voice.status;
                                        return (
                                            <motion.button
                                                key={voice.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                whileHover={{ scale: 1.02, backgroundColor: selectedVoice === voice.id ? 'white' : 'rgba(255, 255, 255, 0.08)' }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => onVoiceSelect(voice.id, voice.status)}
                                                disabled={effectiveStatus === 'processing'}
                                                className={`w-full px-3 py-2.5 rounded-lg text-sm flex justify-between items-center transition-all duration-200 relative overflow-hidden ${effectiveStatus === 'processing'
                                                    ? 'bg-amber-500/5 text-amber-200 cursor-wait border border-amber-500/10'
                                                    : effectiveStatus === 'not started'
                                                        ? 'bg-white/[0.04] text-neutral-300 hover:text-white cursor-pointer border border-white/[0.05]'
                                                        : selectedVoice === voice.id
                                                            ? 'bg-white text-black font-bold shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                                                            : 'bg-white/[0.04] text-neutral-300 hover:text-white border border-white/[0.05]'
                                                    }`}
                                            >
                                                {/* Background Progress Bar (only for processing) */}
                                                {effectiveStatus === 'processing' && voice.progress_percent > 0 && (
                                                    <motion.div
                                                        className="absolute inset-0 bg-amber-500/10 z-0"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${voice.progress_percent}%` }}
                                                        transition={{ type: "spring", damping: 20, stiffness: 50 }}
                                                    />
                                                )}

                                                <span className="flex items-center gap-2 z-10">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${selectedVoice === voice.id ? 'bg-black' : 'bg-white/20'}`} />
                                                    {voice.name}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-tighter z-10 ${selectedVoice === voice.id && effectiveStatus !== 'not started' && effectiveStatus !== 'processing'
                                                    ? 'bg-black/10 text-black'
                                                    : getStatusBg(effectiveStatus) + ' ' + getStatusColor(effectiveStatus)
                                                    }`}>
                                                    {effectiveStatus === 'processing' && voice.progress_percent > 0 ? `${voice.progress_percent}%` : effectiveStatus}
                                                </span>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-neutral-500 text-sm text-center py-4">No voices available.</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
