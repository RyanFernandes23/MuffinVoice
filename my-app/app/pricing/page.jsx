"use client";

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Circle, Crown, Star, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useUser, useAuth } from "@clerk/nextjs";
import { useRegion } from "../hooks/useRegion";
import Navbar from "../components/Navbar";

const PRICING_CONFIG = {
  INR: {
    symbol: "₹",
    explorer: "Free",
    creator: "499",
    professional: "1079"
  },
  USD: {
    symbol: "$",
    explorer: "Free",
    creator: "5",
    professional: "12"
  }
};

const colorClasses = {
  gray: {
    border: "border-gray-500/20",
    bg: "bg-gray-500/10",
    text: "text-gray-400",
    badgeBg: "bg-gray-500/20",
    badgeBorder: "border-gray-500/30",
    button: "bg-gray-600 hover:bg-gray-500",
    ring: "ring-gray-500/30",
  },
  amber: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    badgeBg: "bg-amber-500/20",
    badgeBorder: "border-amber-500/30",
    button: "bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400",
    ring: "ring-amber-500/50",
  },
  purple: {
    border: "border-purple-500/20",
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    badgeBg: "bg-purple-500/20",
    badgeBorder: "border-purple-500/30",
    button: "bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400",
    ring: "ring-purple-500/30",
  },
};

function PricingCard({ plan, onSubscribe, isCurrentPlan }) {
  const Icon = plan.icon;
  const colors = colorClasses[plan.color];

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -5 }}
      className={`
        relative min-w-[300px] md:min-w-0 glass-card rounded-xl p-6 
        border-2 transition-all duration-300 flex flex-col h-full
        ${colors.border} ${colors.bg}
        ${plan.popular ? `ring-2 ${colors.ring}` : ''}
        ${isCurrentPlan ? 'ring-2 ring-white/30' : ''}
      `}
    >
      {/* Badges */}
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="px-3 py-1 text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-400 text-black rounded-full">
            Most Popular
          </span>
        </div>
      )}

      {isCurrentPlan && (
        <div className="absolute -top-3 right-4">
          <span className="px-2 py-1 text-xs font-medium bg-white/20 text-white rounded border border-white/30">
            Current Plan
          </span>
        </div>
      )}

      {/* Header: Icon + Name */}
      <div className="flex items-center gap-2 mb-4 pt-2">
        <Icon className={`w-5 h-5 ${colors.text}`} />
        <h3 className={`text-lg font-bold ${colors.text}`}>
          {plan.name}
        </h3>
      </div>

      {/* Price */}
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white">{plan.price}</span>
          {plan.period && <span className="text-gray-400 text-sm">{plan.period}</span>}
        </div>
        <p className="text-gray-400 text-sm mt-1">{plan.description}</p>
      </div>

      {/* File Size & Tokens Badges */}
      <div className="flex gap-2 mb-5">
        <div className={`
          flex-1 px-3 py-2 rounded-lg border text-center
          ${colors.badgeBg} ${colors.badgeBorder} border
        `}>
          <div className={`text-lg font-bold ${colors.text}`}>{plan.fileSize}</div>
          <div className="text-xs text-gray-400">max</div>
        </div>
        <div className={`
          flex-1 px-3 py-2 rounded-lg border text-center
          ${colors.badgeBg} ${colors.badgeBorder} border
        `}>
          <div className={`text-lg font-bold ${colors.text}`}>{plan.tokens}</div>
          <div className="text-xs text-gray-400">tokens</div>
        </div>
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-6 flex-1">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <Check className={`w-4 h-4 ${colors.text} flex-shrink-0 mt-0.5`} />
            <span className="text-gray-300 text-sm">{feature}</span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <button
        onClick={() => {
          if (plan.id !== "explorer" && onSubscribe) {
            onSubscribe(plan.name);
          } else if (plan.id === "explorer") {
            // Redirect to signup or dashboard for free plan
            window.location.href = '/sign-up';
          }
        }}
        disabled={isCurrentPlan}
        className={`
          w-full py-2.5 rounded-lg font-medium text-white
          transition-all duration-200
          ${isCurrentPlan
            ? 'bg-white/10 text-gray-400 cursor-not-allowed'
            : colors.button
          }
        `}
      >
        {isCurrentPlan ? 'Current Plan' : plan.cta}
      </button>
    </motion.div>
  );
}

export default function PricingPage() {
  const { user, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const [currentPlan, setCurrentPlan] = useState(null);
  const { currency, symbol, loading: regionLoading } = useRegion();

  const pricingPlans = [
    {
      id: "explorer",
      name: "Explorer",
      icon: Circle,
      price: PRICING_CONFIG[currency]?.explorer || "Free",
      period: "",
      fileSize: "50MB",
      tokens: "40K",
      color: "gray",
      description: "Perfect for getting started",
      features: [
        "50MB max file upload",
        "40K tokens per month",
        "Basic voice options",
        "Email support",
        "No audio download"
      ],
      cta: "Get Started Free",
      popular: false
    },
    {
      id: "creator",
      name: "Creator",
      icon: Crown,
      price: `${symbol}${PRICING_CONFIG[currency]?.creator || "5"}`,
      period: "/month",
      fileSize: "100MB",
      tokens: "400K",
      color: "amber",
      description: "For content creators who need more power",
      features: [
        "100MB max file upload",
        "400K tokens per month",
        "All voice options",
        "Audio download enabled",
        "Priority support"
      ],
      cta: "Choose Plan",
      popular: true
    },
    {
      id: "professional",
      name: "Professional",
      icon: Star,
      price: `${symbol}${PRICING_CONFIG[currency]?.professional || "12"}`,
      period: "/month",
      fileSize: "150MB",
      tokens: "1.6M",
      color: "purple",
      description: "For teams and power users",
      features: [
        "150MB max file upload",
        "1.6M tokens per month",
        "All voices including AI",
        "Audio download enabled",
        "24/7 dedicated support"
      ],
      cta: "Choose Plan",
      popular: false
    }
  ];

  // Fetch user's current plan
  useEffect(() => {
    if (isSignedIn) {
      fetchCurrentPlan();
    }
  }, [isSignedIn]);

  const fetchCurrentPlan = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/usage', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCurrentPlan(data.data.plan_name);
        }
      }
    } catch (error) {
      console.error('Error fetching current plan:', error);
    }
  };

  const handleSubscribe = async (planName) => {
    if (!isSignedIn || !user || !user.id) {
      toast.error("Please sign in to subscribe.");
      return;
    }

    const loadingToastId = toast.loading(`Initiating ${planName} subscription...`);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Failed to get authentication token");
      }

      const response = await fetch('/api/payment/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan_name: planName.toLowerCase(),
          currency: currency,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create subscription on backend.');
      }

      const data = await response.json();
      const { razorpay_subscription_id, key_id, amount, currency: serverCurrency } = data;
      const amountInPaise = Math.round(parseFloat(amount) * 100);

      const options = {
        key: key_id,
        subscription_id: razorpay_subscription_id,
        name: 'WikiVoice',
        description: `${planName} Plan Subscription`,
        amount: amountInPaise,
        currency: serverCurrency,
        handler: function (response) {
          toast.success('Payment successful! Your subscription is being activated.', { id: loadingToastId });
        },
        modal: {
          ondismiss: function () {
            toast.dismiss(loadingToastId);
            toast.error('Payment process cancelled.');
          }
        },
        prefill: {
          name: user.fullName || "",
          email: user.primaryEmailAddress?.emailAddress || "",
        },
        theme: {
          "color": "#6366F1"
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (error) {
      console.error('Subscription error:', error);
      toast.error(`Subscription failed: ${error.message}`, { id: loadingToastId });
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <Navbar />
      <div className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-6 md:mb-8">
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl sm:text-4xl font-bold text-foreground mb-2"
            >
              Simple, <span className="text-gradient">Transparent</span> Pricing
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-400 max-w-2xl mx-auto"
            >
              Choose the perfect plan for your needs
            </motion.p>
          </div>

          {/* Pricing Cards - Horizontal scroll on mobile, grid on desktop */}
          <div className="flex md:grid md:grid-cols-3 gap-6 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-24 md:pb-8 -mx-4 px-4 md:mx-0 md:px-0 h-auto items-stretch">
            {pricingPlans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="snap-center"
              >
                <PricingCard
                  plan={plan}
                  onSubscribe={handleSubscribe}
                  isCurrentPlan={currentPlan === plan.id}
                />
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 md:mt-12 text-center"
          >
            <p className="text-gray-400">
              Have questions?{' '}
              <a href="mailto:support@wikivoice.com" className="text-primary hover:text-accent transition-colors">
                Contact our team
              </a>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
