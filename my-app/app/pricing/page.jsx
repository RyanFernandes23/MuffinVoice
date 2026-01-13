'use client';

import { useState, useCallback } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { usePlan } from '../hooks/usePlan';

export default function PricingPage() {
  const { isSignedIn, getToken } = useAuth();
  const { planData, loading: planLoading } = usePlan();
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Environment variables
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

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

  const loadRazorpayScript = useCallback(() => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const verifyPayment = async (token, paymentData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/subscription/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          razorpay_payment_id: paymentData.razorpay_payment_id,
          razorpay_subscription_id: paymentData.razorpay_subscription_id,
          razorpay_signature: paymentData.razorpay_signature,
        }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.warning || 'Payment verification failed');
      }

      return true;
    } catch (error) {
      console.error('Payment verification failed:', error);
      throw error;
    }
  };

  const handleSubscribe = useCallback(async (planId) => {
    // Reset previous errors
    setErrorMessage('');

    if (!isSignedIn) {
      window.location.href = '/sign-in';
      return;
    }

    if (planId === 'explorer') {
      window.location.href = '/dashboard';
      return;
    }

    setCheckoutLoading(planId);
    
    try {
      const token = await getToken();
      
      // 1. Create checkout session
      const checkoutResponse = await fetch(`${API_BASE_URL}/api/subscription/checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      const checkoutData = await checkoutResponse.json();

      if (!checkoutResponse.ok) {
        throw new Error(checkoutData.detail || 'Failed to create checkout session');
      }

      if (!checkoutData.subscription_id) {
        throw new Error('Failed to initiate subscription');
      }

      // 2. Load Razorpay
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        throw new Error('Failed to load Razorpay SDK');
      }

      // 3. Configure Razorpay options
      const options = {
        key: checkoutData.razorpay_key_id,
        subscription_id: checkoutData.subscription_id,
        name: 'Aven Reader',
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        prefill: {
          email: planData?.email || '',
        },
        theme: { 
          color: '#2563eb' 
        },
        modal: {
          ondismiss: () => {
            console.log('Payment modal dismissed');
            setCheckoutLoading(null);
          }
        },
        handler: async function (response) {
          try {
            // 4. Verify payment immediately (before redirect)
            await verifyPayment(token, response);
            
            // 5. Success - redirect to dashboard
            window.location.href = '/dashboard?payment=success';
          } catch (error) {
            console.error('Payment verification error:', error);
            alert(`Payment failed to verify: ${error.message}`);
            setCheckoutLoading(null);
          }
        },
      };

      // 5. Open Razorpay checkout
      const rzp = new window.Razorpay(options);
      
      rzp.on('payment.failed', async function (response) {
        console.error('Payment failed:', response.error);
        setErrorMessage(`Payment failed: ${response.error.description}`);
        setCheckoutLoading(null);
      });

      rzp.open();
      
    } catch (error) {
      console.error('Subscription error:', error);
      setErrorMessage(error.message || 'An error occurred. Please try again.');
      setCheckoutLoading(null);
    }
  }, [isSignedIn, planData?.email, loadRazorpayScript, API_BASE_URL]);

  const getCurrentPlanIndex = () => {
    if (!planData?.plan_name) return 0;
    if (planData.plan_name === 'Professional') return 2;
    if (planData.plan_name === 'Creator') return 1;
    return 0;
  };

  const currentPlanIndex = getCurrentPlanIndex();

  const getButtonText = (tier, index) => {
    if (!isSignedIn || planLoading) return tier.cta;
    if (index === currentPlanIndex) return 'Current Plan';
    if (index > currentPlanIndex) return 'Upgrade';
    return 'Downgrade';
  };

  const isButtonDisabled = (index) => {
    if (planLoading) return true;
    if (!isSignedIn) return false;
    if (index === currentPlanIndex) return true;
    if (index < currentPlanIndex) return true; // Disable downgrades
    return false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Choose the perfect plan for your audio needs.
          </p>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-xl max-w-2xl mx-auto">
            <p className="text-red-100 text-center">{errorMessage}</p>
            <button 
              onClick={() => setErrorMessage('')}
              className="mt-2 text-red-300 hover:text-red-100 text-sm ml-auto block"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {pricingTiers.map((tier, index) => (
            <div
              key={tier.planId}
              className={`relative rounded-2xl transition-all duration-300 hover:scale-105 p-1 ${
                tier.highlighted
                  ? 'md:scale-105 bg-gradient-to-br from-blue-600 to-blue-700 ring-2 ring-blue-400 shadow-2xl'
                  : 'bg-slate-800/50 hover:bg-slate-700/50 shadow-xl border border-slate-700/50'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-400 text-slate-900 px-4 py-1.5 rounded-full text-sm font-semibold shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="p-8 bg-slate-900/50 backdrop-blur-sm rounded-xl h-full">
                {/* Plan Name */}
                <h3 className="text-2xl font-bold mb-2 text-white">
                  {tier.name}
                </h3>

                {/* Price */}
                <div className="mb-8">
                  <span className="text-5xl font-bold text-white tracking-tight">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-xl text-blue-200 ml-2">{tier.period}</span>
                  )}
                  <p className="mt-3 text-slate-400 text-sm">{tier.description}</p>
                </div>

                {/* Usage Limit */}
                <div className="mb-8 p-4 rounded-xl bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30">
                  <p className="text-xs font-semibold text-blue-200 uppercase tracking-wider mb-1">
                    Monthly Limit
                  </p>
                  <p className="text-2xl font-bold text-white">
                    {tier.monthlyLimit}
                  </p>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSubscribe(tier.planId)}
                  disabled={isButtonDisabled(index) || checkoutLoading === tier.planId}
                  className={`w-full py-4 px-6 rounded-xl font-bold text-lg mb-8 transition-all duration-300 shadow-xl transform hover:-translate-y-0.5 ${
                    tier.highlighted
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/25 hover:from-blue-600 hover:to-blue-700 active:scale-95'
                      : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-indigo-500/25 hover:from-indigo-600 hover:to-purple-700 active:scale-95'
                  } ${isButtonDisabled(index) || checkoutLoading === tier.planId ? 'opacity-50 cursor-not-allowed shadow-none transform-none' : ''}`}
                >
                  {checkoutLoading === tier.planId ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : (
                    getButtonText(tier, index)
                  )}
                </button>

                {/* Features */}
                <div className="space-y-4">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3 group">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all group-hover:scale-110 ${
                        feature.available 
                          ? 'bg-emerald-500/20 border-2 border-emerald-500/50' 
                          : 'bg-slate-700/50 border-2 border-slate-500/50'
                      }`}>
                        {feature.available ? (
                          <Check className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <X className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <span className={`text-sm leading-relaxed transition-colors ${
                        feature.available 
                          ? 'text-slate-200 font-medium' 
                          : 'text-slate-500 font-normal'
                      }`}>
                        {feature.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="mt-24 max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-white mb-16 text-center bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            Frequently Asked Questions
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl border border-slate-700/50 hover:border-slate-600/50 transition-all">
              <h3 className="text-xl font-bold text-white mb-4">Can I upgrade or downgrade?</h3>
              <p className="text-slate-300 leading-relaxed">
                You can upgrade anytime. Your new plan starts immediately after payment. 
                Downgrades take effect at the end of your current billing cycle.
              </p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl border border-slate-700/50 hover:border-slate-600/50 transition-all">
              <h3 className="text-xl font-bold text-white mb-4">What happens if I close the payment window?</h3>
              <p className="text-slate-300 leading-relaxed">
                No worries! Your current plan stays active. Just restart the upgrade process 
                when you&apos;re ready. We never cancel your existing subscription automatically.
              </p>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm p-8 rounded-2xl border border-slate-700/50 hover:border-slate-600/50 transition-all md:col-span-2">
              <h3 className="text-xl font-bold text-white mb-4">How do I cancel?</h3>
              <p className="text-slate-300 leading-relaxed">
                Go to your dashboard → Settings → Billing. Cancel anytime. You&apos;ll keep access 
                until the end of your current billing period. No questions asked.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-24 text-center">
          <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
            Choose the plan that fits your content creation needs. 
            Cancel anytime, upgrade instantly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button 
              onClick={() => handleSubscribe('creator')}
              disabled={checkoutLoading || planLoading}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-12 py-4 rounded-2xl font-bold text-lg shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-1 active:scale-95 max-w-md w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {checkoutLoading ? 'Processing...' : 'Start Creator Plan'}
            </button>
            <span className="text-slate-500">or</span>
            <button className="px-12 py-4 rounded-2xl font-bold text-lg border-2 border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white hover:bg-slate-800/50 backdrop-blur-sm transition-all duration-300">
              Contact Sales
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
