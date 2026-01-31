'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlan } from '../hooks/usePlan';
import { usePayment } from '../hooks/usePayment';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import PaymentModal from './PaymentModal';

export default function SubscriptionInfo() {
  const { planData, loading: planLoading, refetch: refetchPlan } = usePlan();
  const { cancelSubscription, loading: cancelLoading } = usePayment();
  const router = useRouter();

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');

  const handleUpgrade = (planName) => {
    setSelectedPlan(planName);
    setPaymentModalOpen(true);
  };

  const handleCancel = async () => {
    if (
      !window.confirm(
        'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.'
      )
    ) {
      return;
    }

    try {
      await cancelSubscription();
      toast.success('Subscription cancelled.');
      refetchPlan();
    } catch (err) {
      toast.error('Failed to cancel subscription');
    }
  };

  const handlePaymentSuccess = () => {
    toast.success('Plan upgraded successfully!');
    refetchPlan();
    setPaymentModalOpen(false);
  };

  const handlePaymentError = (error) => {
    console.error('Payment error:', error);
    toast.error('Payment failed or cancelled.');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (dateString) => {
    if (!dateString) return null;
    const endDate = new Date(dateString);
    const now = new Date();
    const diff = endDate - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  if (planLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  if (!planData) return null;

  const isFreePlan = planData.plan_id === 'explorer';
  const isActive = planData.status === 'active';
  const daysRemaining = getDaysRemaining(planData.current_period_end);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass rounded-3xl p-8 mb-8 relative overflow-hidden"
      >
        {/* Decor */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-full blur-2xl"></div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <motion.h2 className="text-3xl font-bold text-white mb-3">
                <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                  {planData.plan_name} Plan
                </span>
              </motion.h2>

              <div className="flex items-center space-x-3">
                <motion.div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-bold ${
                      isActive
                        ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {isActive ? '✓ Active' : planData.status}
                  </span>
                </motion.div>

                {!isActive && (
                  <motion.span className="text-sm text-red-400 font-medium">
                    Inactive - No access to features
                  </motion.span>
                )}
              </div>
            </div>

            {!isFreePlan && (
              <motion.div className="text-right">
                <div className="text-3xl font-bold text-yellow-400">
                  {planData.plan_id === 'creator' ? '$5' : '$12'}
                  <span className="text-sm text-gray-400 ml-1">/month</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Usage */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <span className="text-white font-medium">Monthly Usage</span>
              <span className="text-white font-bold text-lg">
                {planData.monthly_char_used?.toLocaleString() || 0} /{' '}
                {planData.monthly_char_limit?.toLocaleString() || 500}
                <span className="text-sm text-gray-400 ml-1">characters</span>
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-700/50 rounded-full h-4 overflow-hidden">
              <motion.div
                className="h-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-600"
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, planData.percentage || 0)}%`
                }}
                transition={{ duration: 1 }}
              />
            </div>
          </div>

          {/* Billing */}
          {!isFreePlan && planData.current_period_end && (
            <motion.div
              className="mb-8 glass rounded-xl p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-white/80 text-sm">Next billing date</p>
                  <p className="text-white font-bold text-lg">
                    {formatDate(planData.current_period_end)}
                  </p>
                </div>

                {daysRemaining !== null && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-yellow-400">
                      {daysRemaining}
                    </div>
                    <p className="text-white/60 text-sm">
                      {daysRemaining === 1 ? 'day' : 'days'} remaining
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Buttons */}
          <div className="flex flex-wrap gap-4">
            {isFreePlan ? (
              <>
                <button
                  onClick={() => handleUpgrade('creator')}
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-xl font-bold"
                >
                  Upgrade to Creator ($5/mo)
                </button>

                <button
                  onClick={() => handleUpgrade('professional')}
                  className="glass border border-white/20 px-6 py-3 rounded-xl font-bold text-white"
                >
                  Upgrade to Professional ($12/mo)
                </button>
              </>
            ) : (
              <>
                {planData.plan_id === 'creator' && (
                  <button
                    onClick={() => handleUpgrade('professional')}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-3 rounded-xl font-bold"
                  >
                    Upgrade to Professional ($12/mo)
                  </button>
                )}

                <button
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                >
                  {cancelLoading ? 'Cancelling...' : 'Cancel Subscription'}
                </button>
              </>
            )}

            <button
              onClick={() => router.push('/pricing')}
              className="glass border border-white/20 px-6 py-3 rounded-xl font-bold text-white"
            >
              View All Plans
            </button>
          </div>
        </div>
      </motion.div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        planName={selectedPlan}
        onSuccess={handlePaymentSuccess}
        onError={handlePaymentError}
      />
    </>
  );
}
