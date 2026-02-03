'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { usePlan } from '../hooks/usePlan';
import PaymentModal from '../components/PaymentModal';
import { toast } from 'react-hot-toast';
import Link from 'next/link';
import { motion } from 'framer-motion';

const pricingTiers = [
  {
    name: 'Explorer',
    price: 'Free',
    description: 'Try before you upgrade',
    monthlyLimit: '500 characters/Month',
    features: [
      { text: 'Convert articles to audio', available: true },
      { text: '1 Voice per Notebook', available: true },
      { text: 'Max file size: 50MB', available: true },
      { text: 'Can download audio', available: false },
    ],
    highlighted: false,
    cta: 'Get Started',
    planId: 'explorer',
  },
  {
    name: 'Creator',
    price: '$5',
    period: '/month',
    description: 'For podcasters & authors',
    monthlyLimit: '250k characters/Month',
    features: [
      { text: 'All voices per notebook', available: true },
      { text: 'Max file size: 100MB', available: true },
      { text: 'Can download audio', available: true },
    ],
    highlighted: true,
    cta: 'Subscribe',
    planId: 'creator',
  },
  {
    name: 'Professional',
    price: '$12',
    period: '/month',
    description: 'For serious content creators',
    monthlyLimit: '1M characters/Month',
    features: [
      { text: 'All voices per notebook', available: true },
      { text: 'Max file size: 100MB', available: true },
      { text: 'Can download audio', available: true },
    ],
    highlighted: false,
    cta: 'Subscribe',
    planId: 'professional',
  },
];

function CheckIcon() {
  return (
    <svg
      className="w-5 h-5 text-success"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="w-5 h-5 text-foreground"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export default function PricingPage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { planData, loading: planLoading } = usePlan();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [hoveredPlan, setHoveredPlan] = useState(null);

  const handleSubscribeClick = (planId) => {
    if (!isSignedIn) {
      toast.error('Please sign in to subscribe');
      router.push('/sign-in');
      return;
    }

    // Check if user already has this plan or a higher plan
    if (planData) {
      const planHierarchy = { explorer: 0, creator: 1, professional: 2 };
      const currentPlanLevel = planHierarchy[planData.plan_id] || 0;
      const selectedPlanLevel = planHierarchy[planId];

      if (selectedPlanLevel <= currentPlanLevel) {
        toast.error(`You already have ${planData.plan_name} plan or higher`);
        return;
      }
    }

    setSelectedPlan(planId);
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = () => {
    toast.success('Payment successful! Redirecting to dashboard...');
    setTimeout(() => {
      router.push('/dashboard?payment=success');
    }, 1500);
  };

  const handlePaymentError = (error) => {
    console.error('Payment error:', error);
    // Error toast is handled by PaymentModal
  };

  const getButtonConfig = (tier) => {
    if (!isSignedIn) {
      return {
        text: tier.planId === 'explorer' ? 'Get Started' : 'Subscribe',
        action: () => tier.planId === 'explorer' ? router.push('/sign-up') : handleSubscribeClick(tier.planId),
        isLink: tier.planId === 'explorer',
      };
    }

    // Check current subscription
    if (planData && planLoading === false) {
      const planHierarchy = { explorer: 0, creator: 1, professional: 2 };
      const currentPlanLevel = planHierarchy[planData.plan_id] || 0;
      const selectedPlanLevel = planHierarchy[tier.planId];

      if (tier.planId === 'explorer') {
        return {
          text: 'Current Plan',
          action: () => router.push('/dashboard'),
          isLink: true,
        };
      }

      if (selectedPlanLevel === currentPlanLevel) {
        return {
          text: 'Current Plan',
          action: () => router.push('/dashboard'),
          isLink: true,
        };
      }

      if (selectedPlanLevel < currentPlanLevel) {
        return {
          text: 'Downgrade',
          action: () => toast.error('Downgrading is not supported'),
          isLink: false,
        };
      }

      return {
        text: selectedPlanLevel > currentPlanLevel ? 'Upgrade' : 'Subscribe',
        action: () => handleSubscribeClick(tier.planId),
        isLink: false,
      };
    }

    return {
      text: tier.cta,
      action: () => handleSubscribeClick(tier.planId),
      isLink: false,
    };
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated header section */}
      <div className="relative z-10 py-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <motion.h1 
            className="text-5xl font-bold text-white mb-6"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="bg-gradient-to-r from-primary via-accent to-error bg-clip-text text-transparent">
              Simple, Transparent Pricing
            </span>
          </motion.h1>
          <motion.p 
            className="text-foreground text-lg max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            Choose the plan that fits your needs. Upgrade or downgrade at any time.
          </motion.p>
        </motion.div>

        <div className="container mx-auto px-4 h-full mt-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-6xl mx-auto h-full items-stretch">

            {pricingTiers.map((tier, index) => (
              <motion.div
                key={tier.planId}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                onMouseEnter={() => setHoveredPlan(tier.planId)}
                onMouseLeave={() => setHoveredPlan(null)}
                className={`relative rounded-3xl p-6 transition-all duration-500 flex flex-col flex-grow ${
                  tier.highlighted
                    ? 'glass border-2 border-primary/50 shadow-2xl shadow-primary/20 scale-105'
                    : hoveredPlan === tier.planId
                    ? 'glass border-2 border-white/20 shadow-xl transform -translate-y-2'
                    : 'glass border-2 border-white/10 hover:border-white/20'
                }`}
              >
                {tier.highlighted && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
                    className="absolute -top-4 left-1/2 transform -translate-x-1/2"
                  >
                    <span className="bg-gradient-to-r from-primary to-accent text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                      Most Popular
                    </span>
                  </motion.div>
                )}

                <div className="text-center mb-8">
                  <motion.h3 
                    className="text-3xl font-bold text-foreground mb-3"
                    animate={{ 
                      color: hoveredPlan === tier.planId ? "var(--primary)" : "var(--foreground)"
                    }}
                  >
                    {tier.name}
                  </motion.h3>
                  <p className="text-foreground text-medium">{tier.description}</p>
                </div>

                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center">
                    <span className={`text-5xl font-bold transition-all duration-300 ${
                      hoveredPlan === tier.planId ? 'text-primary' : 'text-foreground'
                    }`}>
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-foreground ml-2 text-lg">{tier.period}</span>
                    )}
                  </div>
                  <motion.p 
                    className="text-primary text-lg mt-3 font-medium"
                    animate={{ opacity: hoveredPlan === tier.planId ? 1 : 0.7 }}
                  >
                    {tier.monthlyLimit}
                  </motion.p>
                </div>

                <ul className="space-y-4 mb-6">
                  {tier.features.map((feature, index) => (
                    <motion.li 
                      key={index} 
                      className="flex items-center space-x-3"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.6 + index * 0.05 }}
                    >
                      {feature.available ? 
                        <motion.div
                          whileHover={{ scale: 1.2, rotate: 360 }}
                          transition={{ duration: 0.3 }}
                        >
                          <CheckIcon />
                        </motion.div> : 
                        <XIcon />
                      }
                      <span className={`${
                        feature.available ? 'text-foreground' : 'text-foreground/50'
                      }`}>
                        {feature.text}
                      </span>
                    </motion.li>
                  ))}
                </ul>

                {(() => {
                  const buttonConfig = getButtonConfig(tier);
                  
                  if (buttonConfig.isLink) {
                    return (
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Link
                          href={tier.planId === 'explorer' ? '/sign-up' : '/dashboard'}
                          className={`block w-full py-3 px-5 rounded-xl font-semibold text-center transition-all duration-300 ${
                            tier.highlighted
                              ? 'bg-gradient-to-r from-primary to-accent text-white hover:from-primary-dark hover:to-accent shadow-lg'
                              : 'glass border-2 border-secondary/20 hover:border-secondary/40 text-foreground hover:text-primary'
                          }`}
                        >
                          {buttonConfig.text}
                        </Link>
                      </motion.div>
                    );
                  } else {
                    return (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={buttonConfig.action}
                        disabled={planLoading}
                        className={`w-full py-3 px-5 rounded-xl font-semibold text-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                          tier.highlighted
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:from-yellow-300 hover:to-orange-400 shadow-lg'
                            : 'glass border-2 border-secondary/20 hover:border-secondary/40 text-foreground hover:text-primary'
                        }`}
                      >
                        {planLoading ? 'Loading...' : buttonConfig.text}
                      </motion.button>
                    );
                  }
                })()}
              </motion.div>
            ))}
          </div>

          {/* Footer section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="text-center mt-20 mb-10"
          >
            <div className="glass inline-block px-8 py-6 rounded-2xl">
              <p className="text-foreground text-medium">
                All plans include a 14-day money-back guarantee.
              </p>
              <div className="flex justify-center space-x-4 mt-4">
                <div className="flex items-center space-x-2 text-success">
                  <CheckIcon />
                  <span className="text-white">No hidden fees</span>
                </div>
                <div className="flex items-center space-x-2 text-success">
                  <CheckIcon />
                  <span className="text-foreground">Cancel anytime</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
