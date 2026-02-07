"use client";

import Navbar from "../components/Navbar";

const pricingPlans = [
  {
    name: "Explorer",
    price: "Free",
    description: "Perfect for getting started with WikiVoice",
    features: [
      "5 articles per month",
      "Basic text-to-speech",
      "Standard voice options",
      "Email support",
      "Export to MP3"
    ],
    cta: "Get Started",
    popular: false
  },
  {
    name: "Creator",
    price: "$5",
    period: "/month",
    description: "For content creators who need more power",
    features: [
      "50 articles per month",
      "Premium voice options",
      "Custom pronunciation",
      "Priority support",
      "Export to MP3 & WAV",
      "Batch processing"
    ],
    cta: "Subscribe",
    popular: true
  },
  {
    name: "Professional",
    price: "$12",
    period: "/month",
    description: "For teams and power users",
    features: [
      "Unlimited articles",
      "All voice options including AI voices",
      "API access",
      "24/7 dedicated support",
      "All export formats",
      "Team collaboration",
      "Custom integrations"
    ],
    cta: "Subscribe",
    popular: false
  }
];

function PricingCard({ plan, onSubscribe }) { // Add onSubscribe prop
  return (
    <div className={`relative glass-card rounded-xl p-5 transition-all duration-300 hover:transform hover:-translate-y-1 flex flex-col ${plan.popular ? 'ring-2 ring-primary glow-primary' : ''}`}>
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <span className="bg-gradient-to-r from-primary to-accent text-white text-xs font-semibold px-3 py-0.5 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <div className="text-center pt-2 mb-4">
        <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
        <div className="flex items-baseline justify-center gap-1 mb-2">
          <span className="text-2xl font-bold text-gradient">{plan.price}</span>
          {plan.period && <span className="text-gray-400 text-xs">{plan.period}</span>}
        </div>
        <p className="text-gray-400 text-xs">{plan.description}</p>
      </div>
      <ul className="space-y-2 mb-4 flex-1">
        {plan.features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2">
            <svg className="w-4 h-4 text-success flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-gray-300 text-xs">{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => { // Add onClick handler
          if (plan.name !== "Explorer" && onSubscribe) { // Only call for Creator/Professional
            onSubscribe(plan.name);
          }
        }}
        className={`w-full py-2 rounded-lg font-medium transition-all duration-300 btn-hover-lift ${
          plan.popular
            ? 'bg-gradient-to-r from-primary to-accent text-white glow-primary'
            : 'glass border border-glass-border text-foreground hover:bg-white/5'
        }`}>
        {plan.cta}
      </button>
    </div>
  );
}

import toast from 'react-hot-toast'; // Add this import
import { useUser, useAuth } from "@clerk/nextjs"; // Import useUser and useAuth

export default function PricingPage() {
  const { user, isSignedIn } = useUser(); // Use the useUser hook
  const { getToken } = useAuth(); // Get the getToken function to retrieve JWT

  const handleSubscribe = async (planName, price) => { // Added price parameter
    if (!isSignedIn || !user || !user.id) {
      toast.error("Please sign in to subscribe.");
      return;
    }

    // Show loading toast
    const loadingToastId = toast.loading(`Initiating ${planName} subscription...`);

    try {
      // Get the JWT token from Clerk
      const token = await getToken();
      if (!token) {
        throw new Error("Failed to get authentication token");
      }

      // 1. Call your backend to create the subscription
      const response = await fetch('/api/payment/create-subscription', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Send JWT token in Authorization header
        },
        body: JSON.stringify({ 
            plan_name: planName.toLowerCase(),
            // user_id is no longer sent - it comes from the JWT token
        }) 
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create subscription on backend.');
      }

      const data = await response.json();
      const { razorpay_subscription_id, key_id, amount, currency } = data; // Destructure amount and currency

      // Razorpay expects amount in paise (e.g., 500 for Rs 5)
      const amountInPaise = Math.round(parseFloat(amount) * 100);

      // 2. Open Razorpay Checkout
      const options = {
        key: key_id, // Your Razorpay Key ID from backend
        subscription_id: razorpay_subscription_id,
        name: 'WikiVoice', // Your App Name
        description: `${planName} Plan Subscription`,
        amount: amountInPaise, // Amount in paise
        currency: currency, // Currency from backend
        handler: function (response) {
          toast.success('Payment successful! Your subscription is being activated.', { id: loadingToastId });
          // In a real application, you might want to redirect the user or update their subscription status in the UI
          // based on a backend confirmation (e.g., via a webhook processed event).
        },
        modal: {
          ondismiss: function() {
            toast.dismiss(loadingToastId);
            toast.error('Payment process cancelled.'); // No need for id here
          }
        },
        prefill: {
          name: user.fullName || "", // Prefill user name
          email: user.primaryEmailAddress?.emailAddress || "", // Prefill user email
          // contact: '9999999999' // If you have contact info
        },
        theme: {
          "color": "#6366F1" // Tailwind purple-500, or your theme color
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
<div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4">
              Simple, <span className="text-gradient">Transparent</span> Pricing
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Choose the perfect plan for your needs. All plans include our core features with no hidden fees.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8">
            {pricingPlans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} onSubscribe={handleSubscribe} />
            ))}
          </div>
          <div className="mt-16 text-center pb-8">
            <p className="text-gray-400">
              Have questions? <a href="#" className="text-primary hover:text-accent transition-colors">Contact our sales team</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


