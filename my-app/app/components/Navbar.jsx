'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, UserButton, useAuth } from '@clerk/nextjs';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Tag, LayoutDashboard, Menu, X, User, Zap, Crown, Home, Circle } from 'lucide-react';
import { UpgradeModal } from './modals/UpgradeModal';
import { useUsage } from '../../hooks/useUsage';

function getPlanBadgeStyle(planName) {
  const plan = (planName || 'explorer').toLowerCase();
  if (plan.includes('professional') || plan.includes('pro')) {
    return { text: 'text-neutral-300', icon: Crown };
  }
  if (plan.includes('creator')) {
    return { text: 'text-neutral-300', icon: Zap };
  }
  return { text: 'text-neutral-400', icon: Circle };
}

function PlanBadgeSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-lg h-6 w-24"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-shimmer"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent)'
        }}
      />
    </div>
  );
}

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const { getToken, isSignedIn } = useAuth();
  const { usage, loading } = useUsage(isSignedIn ? getToken : null);

  const showUsage = !loading && usage.plan_name !== null;
  const planBadge = getPlanBadgeStyle(usage.plan_name);
  const PlanIcon = planBadge.icon;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-2"
      style={{
        background: '#000000',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2"
        >
          <Link
            href="/"
            className="text-lg font-bold text-white hover:opacity-80 transition-opacity duration-300"
          >
            Aven Reader
          </Link>
        </motion.div>

        {/* Desktop Navigation */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="hidden md:flex items-center gap-1"
        >
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors duration-200 flex items-center gap-1.5"
          >
            <Home className="w-4 h-4" />
            <span>Home</span>
          </Link>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors duration-200 flex items-center gap-1.5"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>

          <Link
            href="/pricing"
            className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors duration-200 flex items-center gap-1.5"
          >
            <Tag className="w-4 h-4" />
            <span>Pricing</span>
          </Link>

          <SignedIn>
            <div
              className="flex items-center gap-3 ml-2 pl-3"
              style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              {!showUsage ? (
                <PlanBadgeSkeleton />
              ) : (
                <Link href="/pricing" className="group">
                  <motion.span
                    whileHover={{ scale: 1.05 }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-200 cursor-pointer text-neutral-400 hover:text-white"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {PlanIcon && <PlanIcon className="w-3.5 h-3.5" />}
                    <span className="capitalize">{usage.plan_name || 'Explorer'}</span>
                  </motion.span>
                </Link>
              )}

              <Link
                href="/profile"
                className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors duration-200 flex items-center gap-1.5"
              >
                <User className="w-4 h-4" />
                <span>Profile</span>
              </Link>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative ml-1"
              >
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "w-9 h-9 ring-2 ring-white/20 ring-offset-2 ring-offset-black rounded-lg",
                      userButtonBox: "hover:scale-105 transition-transform duration-200",
                    },
                  }}
                />
              </motion.div>
            </div>
          </SignedIn>

          <SignedOut>
            <div
              className="flex items-center gap-2 ml-3 pl-3"
              style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.08)' }}
            >
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/sign-in"
                  className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors duration-200"
                >
                  Sign In
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/sign-up"
                  className="font-semibold px-5 py-2 rounded-lg text-sm bg-white text-black hover:opacity-90 transition-opacity duration-200"
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
          className="md:hidden p-2 rounded-lg text-neutral-400 hover:text-white transition-colors"
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
            className="md:hidden overflow-hidden mt-2 rounded-2xl mx-2"
            style={{
              background: '#0a0a0a',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="p-4 space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Home className="w-5 h-5" />
                <span>Home</span>
              </Link>
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <LayoutDashboard className="w-5 h-5" />
                <span>Dashboard</span>
              </Link>
              <Link
                href="/pricing"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <Tag className="w-5 h-5" />
                <span>Pricing</span>
              </Link>

              <SignedIn>
                <div
                  className="pt-3 space-y-1"
                  style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
                >
                  {!showUsage ? (
                    <div className="px-4 py-2">
                      <PlanBadgeSkeleton />
                    </div>
                  ) : (
                    <Link
                      href="/pricing"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {PlanIcon && <PlanIcon className="w-5 h-5" />}
                      <span className="capitalize">{usage.plan_name || 'Explorer'} Plan</span>
                    </Link>
                  )}
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <User className="w-5 h-5" />
                    <span>My Profile</span>
                  </Link>
                  <div
                    className="flex items-center justify-between px-4 pt-3"
                    style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
                  >
                    <span className="text-neutral-500">Account</span>
                    <UserButton
                      afterSignOutUrl="/"
                      appearance={{
                        elements: {
                          avatarBox: "w-9 h-9 ring-2 ring-white/20 ring-offset-2 ring-offset-black rounded-lg",
                        },
                      }}
                    />
                  </div>
                </div>
              </SignedIn>

              <SignedOut>
                <div
                  className="pt-3 space-y-2"
                  style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
                >
                  <Link
                    href="/sign-in"
                    className="block px-4 py-3 rounded-xl text-center text-neutral-400 hover:text-white hover:bg-white/5 transition-all duration-200"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/sign-up"
                    className="block font-semibold px-4 py-3 rounded-lg text-center bg-white text-black hover:opacity-90 transition-opacity duration-200"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
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
