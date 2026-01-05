'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '@clerk/nextjs';
import { usePlan } from '../hooks/usePlan';

console.log("NEXT_PUBLIC_LEMON_SQUEEZY_CREATOR_VARIANT_ID:", process.env.NEXT_PUBLIC_LEMON_SQUEEZY_CREATOR_VARIANT_ID);
console.log("NEXT_PUBLIC_LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID:", process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID);

export default function PricingPage() {
  const { isSignedIn, getToken } = useAuth();
  const { planData, loading: planLoading } = usePlan();
  const [checkoutLoading, setCheckoutLoading] = useState(null);

  const pricingTiers = [
    {
      name: 'Explorer',
      price: 'Free',
      description: 'Try before you upgrade',
      monthlyLimit: '15k characters/Month',
      features: [
        { text: 'Convert articles to audio', available: true },
        { text: '1 Voice per Notebook', available: true },
        { text: 'Max file size: 50MB', available: true },
        { text: 'Can download audio', available: false },
      ],
      highlighted: false,
      cta: 'Get Started',
      variantId: null,
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
      variantId: process.env.NEXT_PUBLIC_LEMON_SQUEEZY_CREATOR_VARIANT_ID,
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
      variantId: process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PROFESSIONAL_VARIANT_ID,
    },
  ];

  const handleSubscribe = async (variantId) => {
    console.log("Subscribe clicked, variantId:", variantId);
    
    if (!isSignedIn) {
      window.location.href = '/sign-in';
      return;
    }

    setCheckoutLoading(variantId);
    try {
      const token = await getToken();
      console.log("Sending checkout request for variant:", variantId);
      const response = await fetch('http://localhost:8000/api/subscription/checkout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variant_id: variantId }),
      });

      const data = await response.json();
      console.log("Checkout response:", response.status, data);

      if (!response.ok) {
        const errorMessage = typeof data.detail === 'string' 
          ? data.detail 
          : JSON.stringify(data.detail) || 'Failed to create checkout session';
        alert(errorMessage);
        return;
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data.redirect_to) {
        window.location.href = data.redirect_to;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const getCurrentPlanIndex = () => {
    if (!planData) return 0;
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
    if (!isSignedIn || planLoading) return false;
    return index === currentPlanIndex;
  };

return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Header Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-4 bg-gradient-to-r from-white to-blue-200 bg-clip-text text-transparent">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Choose the perfect plan for your audio needs.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {pricingTiers.map((tier, index) => (
            <div
              key={index}
              className={`relative rounded-2xl transition-all duration-300 hover:scale-105 ${
                tier.highlighted
                  ? 'md:scale-105 bg-gradient-to-br from-blue-600 to-blue-700 ring-2 ring-blue-400 shadow-2xl'
                  : 'bg-slate-800 hover:bg-slate-750 shadow-xl'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-orange-400 text-slate-900 px-4 py-1 rounded-full text-sm font-semibold shadow-lg">
                  Most Popular
                </div>
              )}

              <div className="p-8">
                {/* Price */}
                <h3 className={`text-2xl font-bold mb-2 ${tier.highlighted ? 'text-white' : 'text-white'}`}>
                  {tier.name}
                </h3>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${tier.highlighted ? 'text-white' : 'text-white'}`}>
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className={`text-lg ${tier.highlighted ? 'text-blue-100' : 'text-slate-400'}`}>
                      {tier.period}
                    </span>
                  )}
                  <p className={`mt-2 text-sm ${tier.highlighted ? 'text-white' : 'text-slate-400'}`}>
                    {tier.description}
                  </p>
                </div>

                {/* Limits */}
                <div className={`mb-6 p-4 rounded-lg ${tier.highlighted ? 'bg-blue-800 bg-opacity-50' : 'bg-slate-700 bg-opacity-50'}`}>
                  <p className={`text-sm font-semibold ${tier.highlighted ? 'text-blue-100' : 'text-slate-300'}`}>
                    Monthly Limit
                  </p>
                  <p className={`text-lg font-bold ${tier.highlighted ? 'text-white' : 'text-white'}`}>
                    {tier.monthlyLimit}
                  </p>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSubscribe(tier.variantId)}
                  disabled={isButtonDisabled(index) || checkoutLoading === tier.variantId}
                  className={`w-full py-3 px-4 rounded-lg font-semibold mb-6 transition-all duration-200 ${
                    tier.highlighted
                      ? 'bg-white text-blue-600 hover:bg-blue-50 hover:shadow-lg'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800'
                  } ${isButtonDisabled(index) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {checkoutLoading === tier.variantId && tier.variantId ? 'Loading...' : getButtonText(tier, index)}
                </button>

                {/* Features */}
                <div className="space-y-3 mb-6">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      {feature.available ? (
                        <div className={`p-1 rounded-full bg-green-100`}>
                          <Check
                            className={`w-4 h-4 shrink-0 text-green-600`}
                          />
                        </div>
                      ) : (
                        <div className={`p-1 rounded-full bg-red-100`}>
                          <X
                            className={`w-4 h-4 shrink-0 text-red-600`}
                          />
                        </div>
                      )}
                      <span className={`text-sm ${feature.available ? (tier.highlighted ? 'text-white' : 'text-slate-300') : (tier.highlighted ? 'text-white' : 'text-slate-400')}`}>
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
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-12 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {[].map((faq, idx) => (
              <div key={idx} className="bg-slate-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 text-center">
          <p className="text-slate-400 mb-6">
            Choose the plan that fits your needs.
          </p>
          <button className="bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl">
            Get Started Today
          </button>
        </div>
      </div>
    </div>
  );
}
