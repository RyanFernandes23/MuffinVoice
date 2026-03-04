'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  FileText,
  Globe,
  Type,
  BookOpen,
  Mic2,
  FileJson,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export default function HomePage() {
  const features = [
    {
      icon: <Mic2 className="w-6 h-6" />,
      title: 'Natural AI Voices',
      desc: 'Premium, human-like narration that captures every nuance of your text.',
      color: 'blue'
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: 'PDF Documents',
      desc: 'Seamlessly convert complex PDF reports and articles into clear audio.',
      color: 'emerald'
    },
    {
      icon: <BookOpen className="w-6 h-6" />,
      title: 'EPUB E-books',
      desc: 'Listen to your favorite digital books while you commute or relax.',
      color: 'purple'
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: 'Web Articles',
      desc: 'Paste any URL to transform blog posts and news into personal podcasts.',
      color: 'amber'
    },
    {
      icon: <Type className="w-6 h-6" />,
      title: 'Direct Text',
      desc: 'Type or paste content directly for instant high-quality voice conversion.',
      color: 'rose'
    },
    {
      icon: <FileJson className="w-6 h-6" />,
      title: 'TXT Files',
      desc: 'Quickly process simple text documents with lightning-fast AI power.',
      color: 'slate'
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-black text-foreground selection:bg-white/10">
      <main className="grow flex flex-col items-center justify-center p-6 relative z-10">
        {/* Hero Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-4xl mt-12 md:mt-24"
        >
          <motion.h1
            className="text-7xl md:text-9xl font-black text-center mb-8 tracking-tighter text-white"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            Aven Reader
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl text-neutral-500 mb-12 text-center max-w-2xl mx-auto leading-relaxed font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Transform your articles into natural sounding audiobooks with{' '}
            <span className="text-white">AI-powered</span> text-to-speech technology.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <Link
              href="/dashboard"
              className="group relative inline-flex items-center gap-3 bg-white text-black px-12 py-5 rounded-xl text-lg font-bold hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </motion.div>

        {/* Experience Section */}
        <div className="mt-48 w-full max-w-6xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Designed for Every Moment</h2>
            <p className="text-neutral-500 text-lg max-w-2xl mx-auto">Whether you're finding peace in nature or multitasking at home, Aven Reader turns any text into an immersive companion.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 h-auto md:h-[650px]">
            {/* Main Feature Image - Garden */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="md:col-span-8 relative group rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl shadow-white/5"
            >
              <img
                src="/images/reading_in_garden.png"
                alt="Reading in a garden"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-10">
                <div className="max-w-md">
                  <h3 className="text-3xl font-bold text-white mb-3 tracking-tight">Moments of Peace</h3>
                  <p className="text-neutral-400 text-lg leading-relaxed">Lose yourself in stories while enjoying the beauty of nature. Transform any digital book into a serene outdoor experience.</p>
                </div>
              </div>
              {/* Lens Flare Effect */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[100px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            </motion.div>

            {/* Side Images Stack */}
            <div className="md:col-span-4 flex flex-col gap-8">
              {/* Mother and Child */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex-1 relative group rounded-[2rem] overflow-hidden border border-white/10"
              >
                <img
                  src="/images/mother_reading_child.png"
                  alt="Mother reading to child"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-8">
                  <h4 className="text-xl font-bold text-white mb-1">Family Connections</h4>
                  <p className="text-sm text-neutral-400">Share the joy of reading together at home.</p>
                </div>
              </motion.div>

              {/* Headphones */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="flex-1 relative group rounded-[2rem] overflow-hidden border border-white/10"
              >
                <img
                  src="/images/listening_headphones.png"
                  alt="Listening with headphones"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-8">
                  <h4 className="text-xl font-bold text-white mb-1">Immersive Audio</h4>
                  <p className="text-sm text-neutral-400">Crystal clear AI-powered narration.</p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Features Preview */}
        <div className="mt-32 w-full max-w-6xl px-4 pb-24">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-white mb-4">Supported Formats</h2>
            <p className="text-neutral-500">Everything you need to turn text into immersive audio.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="relative p-8 rounded-2xl border border-white/[0.08] hover:border-white/[0.15] transition-all duration-300 group overflow-hidden"
                style={{ background: '#0a0a0a' }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                whileHover={{ y: -5 }}
              >
                {/* Subtle Hover Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/[0.05] text-white mb-6 group-hover:scale-110 group-hover:bg-white/10 transition-all duration-300`}>
                  {feature.icon}
                </div>

                <h3 className="text-xl font-bold text-white mb-3 tracking-tight">
                  {feature.title}
                </h3>

                <p className="text-neutral-500 text-sm leading-relaxed">
                  {feature.desc}
                </p>

                {/* Bottom Accent Line */}
                <div className="absolute bottom-0 left-0 h-[2px] bg-white/20 w-0 group-hover:w-full transition-all duration-500" />
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
