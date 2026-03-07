'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Headphones, Sparkles } from 'lucide-react';
import NotebookCard from './NotebookCard';

const API_BASE_URL = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
    : 'http://localhost:8000';

export default function FreeAudiobooksSection({
    getToken,
    onPlay,
    title = "Free Audiobooks",
    description = "Listen to our curated collection of free audiobooks.",
    defaultCollapsed = false
}) {
    const [notebooks, setNotebooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

    useEffect(() => {
        async function fetchPublicNotebooks() {
            try {
                const response = await fetch(`${API_BASE_URL}/api/public_notebooks`);
                if (response.ok) {
                    const data = await response.json();
                    setNotebooks(data);
                }
            } catch (error) {
                console.error('Error fetching public notebooks:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchPublicNotebooks();
    }, []);

    if (!loading && notebooks.length === 0) return null;

    return (
        <div className="w-full">
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex items-center justify-between mb-6 cursor-pointer group"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 group-hover:border-white/20 transition-colors">
                        <Headphones className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
                            {title}
                            <Sparkles className="w-5 h-5 text-amber-400" />
                        </h2>
                        <p className="text-neutral-500 text-sm">{description}</p>
                    </div>
                </div>
                <motion.div
                    animate={{ rotate: isCollapsed ? -90 : 0 }}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors"
                >
                    <ChevronDown className="w-6 h-6 text-neutral-400" />
                </motion.div>
            </div>

            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                    >
                        {loading ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="h-64 rounded-xl bg-white/[0.03] animate-pulse border border-white/[0.05]" />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
                                {notebooks.map((nb, i) => (
                                    <motion.div
                                        key={nb.job_id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                    >
                                        <NotebookCard
                                            title={nb.title}
                                            voice={nb.voice}
                                            status={nb.status}
                                            createdAt={nb.created_at}
                                            userId={nb.user_id}
                                            jobId={nb.job_id}
                                            getToken={getToken}
                                            sourceUrl={nb.source_url}
                                            onOpen={() => onPlay?.(nb)}
                                            isDemo={true}
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
