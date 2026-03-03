"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Circle, Crown, Star } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    id: "explorer", name: "Explorer", icon: Circle,
    price: "Free", period: "", fileSize: "50MB", tokens: "40K", color: "gray",
    features: ["50MB max upload", "40K tokens/month", "Basic voices", "Email support"],
  },
  {
    id: "creator", name: "Creator", icon: Crown,
    price: "$5", period: "/month", fileSize: "100MB", tokens: "400K", color: "amber", popular: true,
    features: ["100MB max upload", "400K tokens/month", "All voices", "Audio download", "Priority support"],
  },
  {
    id: "professional", name: "Professional", icon: Star,
    price: "$12", period: "/month", fileSize: "150MB", tokens: "1.6M", color: "purple",
    features: ["150MB max upload", "1.6M tokens/month", "All voices", "Audio download", "24/7 support"],
  },
];

export function UpgradeModal({ isOpen, onClose, currentPlan = "explorer" }) {
  if (!isOpen) return null;

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
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl"
          style={{ background: '#111111', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-white/[0.08]" style={{ background: '#111111' }}>
            <div>
              <h2 className="text-2xl font-bold text-white">Upgrade Your Plan</h2>
              <p className="text-neutral-500 mt-1">
                Current plan: <span className="capitalize font-medium text-white">{currentPlan}</span>
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors">
              <X className="w-5 h-5 text-neutral-500" />
            </button>
          </div>

          {/* Plans */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => {
                const Icon = plan.icon;
                const isCurrent = plan.id === currentPlan;
                return (
                  <motion.div
                    key={plan.id} whileHover={{ scale: 1.02 }}
                    className={`relative rounded-xl p-5 border-2 transition-all ${isCurrent ? 'border-white/20' : 'border-white/[0.06]'} ${plan.popular ? 'ring-1 ring-white/10' : ''}`}
                    style={{ background: isCurrent ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 text-xs font-semibold bg-white text-black rounded-lg">Most Popular</span>
                      </div>
                    )}
                    {isCurrent && (
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-1 text-xs font-medium bg-white/[0.08] text-neutral-300 rounded-lg">Current</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-4">
                      <Icon className="w-5 h-5 text-neutral-400" />
                      <h3 className="text-lg font-bold text-neutral-300">{plan.name}</h3>
                    </div>
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-white">{plan.price}</span>
                      <span className="text-neutral-500">{plan.period}</span>
                    </div>
                    <div className="space-y-2 mb-5">
                      <div className="flex items-center gap-2 text-sm"><span className="text-neutral-500">Max upload:</span><span className="text-white font-medium">{plan.fileSize}</span></div>
                      <div className="flex items-center gap-2 text-sm"><span className="text-neutral-500">Tokens:</span><span className="text-white font-medium">{plan.tokens}/month</span></div>
                    </div>
                    <ul className="space-y-2 mb-5">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-neutral-400">
                          <Check className="w-4 h-4 text-neutral-500" /> {feature}
                        </li>
                      ))}
                    </ul>
                    {isCurrent ? (
                      <button disabled className="w-full py-2.5 rounded-lg font-medium bg-neutral-800 text-neutral-500 cursor-not-allowed">Current Plan</button>
                    ) : (
                      <Link href="/pricing" onClick={onClose}>
                        <button className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all duration-200 ${plan.popular ? 'bg-white text-black hover:opacity-90' : 'bg-neutral-800 text-white hover:bg-neutral-700 border border-white/[0.08]'}`}>
                          Upgrade to {plan.name}
                        </button>
                      </Link>
                    )}
                  </motion.div>
                );
              })}
            </div>
            <div className="mt-6 text-center">
              <p className="text-sm text-neutral-500">
                Need help choosing?{" "}
                <Link href="/contact" className="text-white hover:opacity-80 transition-opacity" onClick={onClose}>Contact our team</Link>
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
