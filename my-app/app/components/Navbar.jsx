'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Sparkles, Tag, LayoutDashboard, Menu, X } from 'lucide-react';
import { PlanWidget } from './widgets/PlanWidget';
import { UsageWidget } from './widgets/UsageWidget';
import { UpgradeModal } from './modals/UpgradeModal';


export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const { getToken } = useAuth();
  

  return (
    <nav className="glass fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-2 border-b border-white/10">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Logo with animation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ duration: 3, repeat: Infinity }}
            className="relative"
          >
            <Sparkles className="w-5 h-5 text-primary-glow" />
            <div className="absolute inset-0 w-5 h-5 text-primary-glow blur-sm animate-pulse" />
          </motion.div>
          <Link 
            href="/" 
            className="text-lg font-bold bg-gradient-to-r from-white via-primary-glow to-accent-glow bg-clip-text text-transparent hover:opacity-80 transition-all duration-300"
          >
            WikiVoice
          </Link>
        </motion.div>

        {/* Desktop Navigation */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="hidden md:flex items-center gap-2"
        >
          <Link
          href="/dashboard"
          className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-300 flex items-center gap-1.5"
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>
          
          <Link
            href="/pricing"
            className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-300 flex items-center gap-1.5"
          >
            <Tag className="w-4 h-4" />
            <span>Pricing</span>
          </Link>
          
          <SignedIn>
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-white/10">
              <PlanWidget onClick={() => setIsUpgradeModalOpen(true)} />
              <UsageWidget getToken={getToken} />
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative ml-1"
              >
                <UserButton 
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-9 h-9 ring-2 ring-primary/50 ring-offset-2 ring-offset-background rounded-full",
                      userButtonBox: "hover:scale-105 transition-transform duration-200",
                    },
                  }}
                />
              </motion.div>
            </div>
          </SignedIn>
          
          <SignedOut>
            <div className="flex items-center gap-2 ml-3 pl-3 border-l border-white/10">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  href="/sign-in" 
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-300"
                >
                  Sign In
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link 
                  href="/sign-up" 
                  className="bg-gradient-to-r from-primary to-accent text-white font-semibold px-4 py-2 rounded-lg text-sm hover:shadow-lg hover:shadow-primary/30 transition-all duration-300"
                >
                  Get Started
                </Link>
              </motion.div>
            </div>
          </SignedOut>
        </motion.div>

        {/* Mobile menu button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="md:hidden p-2 text-gray-300 hover:text-white"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </motion.button>
      </div>

      {/* Mobile Navigation */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden overflow-hidden glass-card mt-2 rounded-2xl mx-2"
          >
            <div className="p-4 space-y-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-300"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link 
                href="/pricing" 
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-300"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Tag className="w-5 h-5" />
                <span>Pricing</span>
              </Link>
              
              <SignedIn>
                <div className="pt-2 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between mt-3 px-4">
                    <span className="text-gray-400">Plan</span>
                    <PlanWidget onClick={() => {
                      setIsUpgradeModalOpen(true);
                      setIsMobileMenuOpen(false);
                    }} />
                  </div>
                  <div className="flex items-center justify-between px-4">
                    <span className="text-gray-400">Usage</span>
                    <UsageWidget getToken={getToken} />
                  </div>
                  <div className="flex items-center justify-between px-4 pt-2 border-t border-white/10">
                    <span className="text-gray-400">Account</span>
                    <UserButton 
                      afterSignOutUrl="/"
                      appearance={{
                        elements: {
                          avatarBox: "w-9 h-9 ring-2 ring-primary/50 ring-offset-2 ring-offset-background rounded-full",
                        },
                      }}
                    />
                  </div>
                </div>
              </SignedIn>
              
              <SignedOut>
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link 
                      href="/sign-in" 
                      className="block px-4 py-3 rounded-xl text-center text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-300"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      Sign In
                    </Link>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Link 
                      href="/sign-up" 
                      className="block bg-gradient-to-r from-primary to-accent text-white font-semibold px-4 py-3 rounded-xl text-center hover:shadow-lg hover:shadow-primary/30 transition-all duration-300"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      Get Started
                    </Link>
                  </motion.div>
                </div>
              </SignedOut>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <UpgradeModal 
        isOpen={isUpgradeModalOpen} 
        onClose={() => setIsUpgradeModalOpen(false)} 
      />
    </nav>
  );
}
