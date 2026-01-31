'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { usePlan } from '../hooks/usePlan';
import PaymentModal from '../components/PaymentModal';
import { toast } from 'react-hot-toast';
import Link from 'next/link';

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
      className="w-5 h-5 text-green-500"
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
      className="w-5 h-5 text-gray-400"
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
      <div className="relative z-10 py-20">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <motion.h1 
            className="text-6xl font-bold text-white mb-6"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 bg-clip-text text-transparent">
              Simple, Transparent Pricing
            </span>
          </motion.h1>
          <motion.p 
            className="text-gray-300 text-xl max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            Choose the plan that fits your needs. Upgrade or downgrade at any time.
          </motion.p>
        </motion.div>

        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">

            {pricingTiers.map((tier, index) => (
              <motion.div
                key={tier.planId}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                onMouseEnter={() => setHoveredPlan(tier.planId)}
                onMouseLeave={() => setHoveredPlan(null)}
                className={`relative rounded-3xl p-8 transition-all duration-500 ${
                  tier.highlighted
                    ? 'glass border-2 border-yellow-400/50 shadow-2xl shadow-yellow-400/20 scale-105'
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
                    <span className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                      Most Popular
                    </span>
                  </motion.div>
                )}

                <div className="text-center mb-8">
                  <motion.h3 
                    className="text-3xl font-bold text-white mb-3"
                    animate={{ 
                      color: hoveredPlan === tier.planId ? "#FDE047" : "#FFFFFF"
                    }}
                  >
                    {tier.name}
                  </motion.h3>
                  <p className="text-gray-300 text-medium">{tier.description}</p>
                </div>

                <div className="text-center mb-8">
                  <div className="flex items-baseline justify-center">
                    <span className={`text-6xl font-bold transition-all duration-300 ${
                      hoveredPlan === tier.planId ? 'text-yellow-400' : 'text-white'
                    }`}>
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-gray-400 ml-2 text-xl">{tier.period}</span>
                    )}
                  </div>
                  <motion.p 
                    className="text-yellow-400 text-lg mt-3 font-medium"
                    animate={{ opacity: hoveredPlan === tier.planId ? 1 : 0.7 }}
                  >
                    {tier.monthlyLimit}
                  </motion.p>
                </div>

                <ul className="space-y-4 mb-10">
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
                        feature.available ? 'text-gray-200' : 'text-gray-500'
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
                          className={`block w-full py-4 px-6 rounded-xl font-bold text-center transition-all duration-300 ${
                            tier.highlighted
                              ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:from-yellow-300 hover:to-orange-400 shadow-lg'
                              : 'glass border-2 border-white/20 hover:border-white/40 text-white hover:text-yellow-400'
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
                        className={`w-full py-4 px-6 rounded-xl font-bold text-center transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                          tier.highlighted
                            ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black hover:from-yellow-300 hover:to-orange-400 shadow-lg'
                            : 'glass border-2 border-white/20 hover:border-white/40 text-white hover:text-yellow-400'
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

          </div>

          {/* Footer section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="text-center mt-20 mb-10"
          >
            <div className="glass inline-block px-8 py-6 rounded-2xl">
              <p className="text-gray-300 text-medium">
                All plans include a 14-day money-back guarantee.
              </p>
              <div className="flex justify-center space-x-4 mt-4">
                <div className="flex items-center space-x-2 text-green-400">
                  <CheckIcon />
                  <span className="text-white">No hidden fees</span>
                </div>
                <div className="flex items-center space-x-2 text-green-400">
                  <CheckIcon />
                  <span className="text-white">Cancel anytime</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
