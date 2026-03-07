'use client';

import { motion } from 'framer-motion';
import {
    FileText,
    Globe,
    Type,
    BookOpen,
    Mic2,
    FileJson
} from 'lucide-react';

export default function SupportedFormats() {
    const features = [
        {
            icon: <FileText className="w-5 h-5 md:w-6 h-6" />,
            title: 'PDF Documents',
            desc: 'Seamlessly convert complex PDF reports and articles into clear audio.',
            image: 'https://images.unsplash.com/photo-1586769852044-692d6e3703f0?q=80&w=800&auto=format&fit=crop'
        },
        {
            icon: <BookOpen className="w-5 h-5 md:w-6 h-6" />,
            title: 'EPUB E-books',
            desc: 'Listen to your favorite digital books while you commute or relax.',
            image: 'https://images.unsplash.com/photo-1592492159418-39f319320569?q=80&w=800&auto=format&fit=crop'
        },
        {
            icon: <Globe className="w-5 h-5 md:w-6 h-6" />,
            title: 'Web Articles',
            desc: 'Paste any URL to transform blog posts and news into personal podcasts.',
            image: 'https://images.unsplash.com/photo-1481487196290-c152efe083f5?q=80&w=800&auto=format&fit=crop'
        },
        {
            icon: <Type className="w-5 h-5 md:w-6 h-6" />,
            title: 'Direct Text',
            desc: 'Type or paste content directly for instant high-quality voice conversion.',
            image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?q=80&w=800&auto=format&fit=crop'
        },
        {
            icon: <FileJson className="w-5 h-5 md:w-6 h-6" />,
            title: 'TXT Files',
            desc: 'Quickly process simple text documents with lightning-fast AI power.',
            image: 'https://images.unsplash.com/photo-1517842645767-c639042777db?q=80&w=800&auto=format&fit=crop'
        }
    ];

    return (
        <div className="relative mt-12 w-full max-w-6xl px-4 pb-16">
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="text-center mb-10"
            >
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Supported Formats</h2>
                <p className="text-neutral-500 text-sm md:text-base">Everything you need to turn text into immersive audio.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {features.map((feature, index) => (
                    <motion.div
                        key={index}
                        className="relative rounded-none border border-white/[0.08] hover:border-white/[0.15] transition-all duration-300 group overflow-hidden flex flex-col"
                        style={{ background: '#0a0a0a' }}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                        whileHover={{ y: -4 }}
                    >
                        {/* Image Thumbnail */}
                        <div className="w-full h-32 overflow-hidden transition-all duration-500">
                            <img
                                src={feature.image}
                                alt={feature.title}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100"
                            />
                        </div>

                        <div className="p-5 flex-1 relative">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="inline-flex items-center justify-center w-8 h-8 rounded-none bg-white/[0.05] text-white mb-4 group-hover:scale-110 group-hover:bg-white/10 transition-all duration-300">
                                {feature.icon}
                            </div>

                            <h3 className="text-base font-bold text-white mb-2 tracking-tight">
                                {feature.title}
                            </h3>

                            <p className="text-neutral-500 text-[11px] leading-relaxed">
                                {feature.desc}
                            </p>

                            <div className="absolute bottom-0 left-0 h-[2px] bg-white/20 w-0 group-hover:w-full transition-all duration-500" />
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
