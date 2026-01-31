import { useState, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { toast } from 'react-hot-toast';

export function usePayment() {
  const { isSignedIn, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Environment variable - SSR safe (same pattern as other hooks)
  const API_BASE_URL = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000')
    : 'http://localhost:8000';

  // Create subscription
  const createSubscription = useCallback(async (planName) => {
    if (!isSignedIn) {
      toast.error('Please sign in to subscribe');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      
      const response = await fetch(`${API_BASE_URL}/payments/subscribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_name: planName.toLowerCase() // "creator" or "professional"
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create subscription');
      }

      const data = await response.json();
      return data;

    } catch (err) {
      console.error('Error creating subscription:', err);
      setError(err.message);
      toast.error(err.message || 'Failed to create subscription');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken, API_BASE_URL]);

  // Verify payment signature
  const verifyPayment = useCallback(async (paymentDetails) => {
    try {
      const response = await fetch(`${API_BASE_URL}/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          razorpay_payment_id: paymentDetails.razorpay_payment_id,
          razorpay_subscription_id: paymentDetails.razorpay_subscription_id,
          razorpay_signature: paymentDetails.razorpay_signature,
        }),
      });

      if (!response.ok) {
        throw new Error('Payment verification failed');
      }

      const data = await response.json();
      return data;

    } catch (err) {
      console.error('Error verifying payment:', err);
      throw err;
    }
  }, [API_BASE_URL]);

  // Cancel subscription
  const cancelSubscription = useCallback(async () => {
    if (!isSignedIn) {
      toast.error('Please sign in to cancel subscription');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      
      const response = await fetch(`${API_BASE_URL}/payments/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to cancel subscription');
      }

      const data = await response.json();
      toast.success('Subscription cancelled successfully');
      return data;

    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setError(err.message);
      toast.error(err.message || 'Failed to cancel subscription');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken, API_BASE_URL]);

  // Initialize Razorpay payment
  const initializeRazorpayPayment = useCallback((subscriptionData, onSuccess, onError) => {
    if (!window.Razorpay) {
      toast.error('Razorpay SDK not loaded');
      return;
    }

    const options = {
      key: subscriptionData.key_id,
      subscription_id: subscriptionData.subscription_id,
      name: 'WikiVoice',
      description: `${subscriptionData.plan_name || 'Subscription'} Plan`,
      image: 'https://via.placeholder.com/150', // You can add your logo here
      handler: async function (response) {
        try {
          // Verify payment with backend
          await verifyPayment(response);
          toast.success('Payment successful! Your subscription is now active.');
          onSuccess(response);
        } catch (err) {
          console.error('Payment verification failed:', err);
          toast.error('Payment verification failed. Please contact support.');
          onError(err);
        }
      },
      modal: {
        ondismiss: function() {
          toast.error('Payment cancelled');
          onError(new Error('Payment cancelled'));
        },
        confirm_close: true,
        escape: true,
        handleback: true,
      },
      theme: {
        color: '#FDE047', // Yellow theme to match your app
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();

    // Handle payment failure
    razorpay.on('payment.failed', function (response) {
      console.error('Payment failed:', response.error);
      toast.error(response.error.description || 'Payment failed');
      onError(new Error(response.error.description || 'Payment failed'));
    });
  }, [verifyPayment]);

  return {
    createSubscription,
    verifyPayment,
    cancelSubscription,
    initializeRazorpayPayment,
    loading,
    error,
  };
}