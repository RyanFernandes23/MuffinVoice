'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';

const COVERS = [
    'https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=2000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2000&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?q=80&w=2000&auto=format&fit=crop'
];

export default function DashboardBanner() {
    const [coverIndex, setCoverIndex] = useState(0);

    const nextCover = () => {
        setCoverIndex((prev) => (prev + 1) % COVERS.length);
    };

    return (
        <div className="relative w-full h-32 md:h-44 group mb-12">
            {/* Background Image */}
            <img
                src={COVERS[coverIndex]}
                alt="Dashboard Cover"
                className="w-full h-full object-cover transition-all duration-700"
            />

            {/* Overlay for subtle dark gradient at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

            {/* Change Cover Button - Notion Style */}
            <motion.button
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                animate={{ opacity: 0 }} // Hidden by default, shown on group hover via CSS or Framer
                className="absolute bottom-4 right-8 bg-white/10 backdrop-blur-md text-white px-3 py-1.5 rounded text-xs font-medium flex items-center gap-2 border border-white/20 transition-all group-hover:opacity-100"
                onClick={nextCover}
            >
                <ImageIcon className="w-3.5 h-3.5" />
                Change Cover
            </motion.button>
        </div>
    );
}
