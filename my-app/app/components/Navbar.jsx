'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import { Sparkles, BookOpen, Zap } from 'lucide-react';
import UsageProgress from './UsageProgress';

export default function Navbar() {
  return (
    <nav className="glass fixed top-0 left-0 right-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Logo with animation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center space-x-2"
        >
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-yellow-400"
          >
            <Sparkles className="w-6 h-6" />
          </motion.div>
          <Link 
            href="/" 
            className="text-white font-bold text-xl bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent hover:from-yellow-300 hover:to-orange-400 transition-all duration-300"
          >
            WikiVoice
          </Link>
        </motion.div>

        {/* Navigation Links */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center space-x-6"
        >
          <Link 
            href="/pricing" 
            className="text-white/80 hover:text-yellow-400 transition-all duration-300 flex items-center space-x-1 hover:scale-105"
          >
            <BookOpen className="w-4 h-4" />
            <span>Pricing</span>
          </Link>
          <Link 
            href="/dashboard" 
            className="text-white/80 hover:text-yellow-400 transition-all duration-300 flex items-center space-x-1 hover:scale-105"
          >
            <Zap className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          
          <SignedIn>
            <div className="flex items-center space-x-4">
              <UsageProgress />
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative"
              >
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-10 h-10",
                      userButtonBox: "hover:scale-105 transition-transform duration-200",
                    },
                  }}
                />
              </motion.div>
            </div>
          </SignedIn>
          
          <SignedOut>
            <div className="flex items-center space-x-3">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link 
                  href="/sign-in" 
                  className="text-white/80 hover:text-yellow-400 transition-all duration-300 px-4 py-2 rounded-lg glass hover:bg-white/10"
                >
                  Sign In
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link 
                  href="/sign-up" 
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-semibold px-4 py-2 rounded-lg hover:from-yellow-300 hover:to-orange-400 transition-all duration-300 shadow-lg"
                >
                  Get Started
                </Link>
              </motion.div>
            </div>
          </SignedOut>
        </motion.div>
      </div>
    </nav>
  );
}
