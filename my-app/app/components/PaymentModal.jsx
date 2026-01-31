'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePayment } from '../hooks/usePayment';
import { Check, AlertCircle, Sparkles, Shield, Loader2 } from 'lucide-react';

/* ------------------------------------------------------
   Razorpay Script Loader (guaranteed to load correctly)
------------------------------------------------------ */
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  planName, 
  onSuccess, 
  onError 
}) {
  const [processingStep, setProcessingStep] = useState('initial');
  const [subscriptionData, setSubscriptionData] = useState(null);

  const { 
    createSubscription, 
    loading, 
    error 
  } = usePayment();

  /* ------------------------------------------------------
     Initialize Razorpay popup with correct subscription flow
  ------------------------------------------------------ */
  const startRazorpayPayment = async (subData) => {
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setProcessingStep("ready");
      return onError("Failed to load Razorpay.");
    }

    setProcessingStep("processing");

    const options = {
      key: subData.key_id,
      subscription_id: subData.subscription_id,
      name: "Your App",
      description: `${planName} Subscription`,
      theme: { color: "#F59E0B" },

      handler: async function (response) {
        try {
          // Verify signature in backend
          const verifyRes = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });

          if (!verifyRes.ok) throw new Error("Payment verification failed");

          setProcessingStep("completed");
          onSuccess();
          onClose();

        } catch (err) {
          setProcessingStep("ready");
          onError("Payment verification failed");
        }
      },

      modal: {
        ondismiss: () => {
          setProcessingStep("ready");
          onError("Payment cancelled.");
        },
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  };

  /* ------------------------------------------------------
     Creates Razorpay subscription via backend
  ------------------------------------------------------ */
  const handleCreateSubscription = async () => {
    setProcessingStep('creating');
    
    try {
      const data = await createSubscription(planName);

      if (!data) {
        setProcessingStep("initial");
        return onError("Failed to create subscription");
      }

      setSubscriptionData(data);
      setProcessingStep("ready");

      // Load script + open Razorpay automatically
      await loadRazorpayScript();
      startRazorpayPayment(data);

    } catch (err) {
      setProcessingStep("initial");
      onError(err);
    }
  };

  /* ------------------------------------------------------
     Reset when opening/closing modal
  ------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) {
      setProcessingStep("initial");
      setSubscriptionData(null);
    } else {
      handleCreateSubscription();
    }
  }, [isOpen, planName]);

  const getPlanDisplayName = (plan) => ({
    creator: "Creator",
    professional: "Professional",
  }[plan] || plan);

  const getPlanPrice = (plan) => ({
    creator: "$5",
    professional: "$12",
  }[plan] || "?");

  if (!isOpen) return null;

  /* ------------------------------------------------------
     UI — Your existing design (unchanged)
  ------------------------------------------------------ */
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex justify-center items-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3 }}
            className="glass rounded-3xl w-full max-w-lg mx-auto relative overflow-hidden"
          >
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-yellow-400/10 to-orange-500/10 rounded-full blur-2xl"></div>

            {/* Header */}
            <div className="flex justify-between items-center mb-8 relative z-10">
              <motion.div>
                <h2 className="text-3xl font-bold text-white">
                  Complete Your <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">Subscription</span>
                </h2>
                <p className="text-gray-300 text-sm mt-2">Secure payment powered by Razorpay</p>
              </motion.div>

              <button
                onClick={onClose}
                disabled={processingStep !== 'initial'}
                className="text-gray-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Plan Info */}
            <div className="mb-8 relative z-10">
              <div className="glass rounded-2xl p-6 border border-white/20">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      {getPlanDisplayName(planName)} Plan
                    </h3>
                    <p className="text-gray-300 text-sm">Monthly subscription with full features</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                      {getPlanPrice(planName)}
                    </div>
                    <p className="text-gray-400 text-sm">/month</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Processing UI */}
            <div className="text-center py-8 relative z-10">
              
              {processingStep === "creating" && (
                <div className="space-y-6">
                  <Loader2 className="w-10 h-10 animate-spin text-yellow-400 mx-auto" />
                  <p className="text-white text-lg">Setting up your subscription...</p>
                  <p className="text-gray-400 text-sm">Creating secure payment link</p>
                </div>
              )}

              {processingStep === "ready" && (
                <div className="space-y-6">
                  <Check className="w-10 h-10 text-green-400 mx-auto" />
                  <p className="text-white text-lg">Ready to complete payment</p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => startRazorpayPayment(subscriptionData)}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black py-4 px-8 rounded-2xl font-bold shadow-lg"
                  >
                    Proceed to Payment
                  </motion.button>
                </div>
              )}

              {processingStep === "processing" && (
                <div className="space-y-6">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-400 mx-auto" />
                  <p className="text-white text-lg">Opening payment gateway...</p>
                </div>
              )}

            </div>

            {/* Error Box */}
            {error && (
              <motion.div className="mt-6 p-4 glass rounded-xl border border-red-500/20 relative z-10">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </motion.div>
            )}

            {/* Security Notice */}
            <div className="mt-8 text-center relative z-10">
              <div className="flex items-center justify-center space-x-2 text-gray-400 text-sm">
                <Shield className="w-4 h-4" />
                <span>Your payment is secure and encrypted</span>
              </div>
              <p className="text-gray-500 text-xs mt-1">
                Powered by Razorpay • PCI DSS Compliant
              </p>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
