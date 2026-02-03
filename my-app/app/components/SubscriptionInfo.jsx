'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePlan } from '../hooks/usePlan';
import { usePayment } from '../hooks/usePayment';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import PaymentModal from './PaymentModal';
import { Sparkles, Calendar } from 'lucide-react';

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
      <div className="glass-card rounded-3xl p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-white/10 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-white/10 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-white/10 rounded w-1/4"></div>
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
        className="glass-card rounded-3xl p-6 md:p-8 relative overflow-hidden"
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-accent/10 to-primary/10 rounded-full blur-2xl"></div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-8">
            <div>
              <motion.h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                <span className="text-gradient-firefly">
                  {planData.plan_name} Plan
                </span>
              </motion.h2>

              <div className="flex flex-wrap items-center gap-3">
                <motion.div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-bold ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-white/10 text-gray-400 border border-white/10'
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
              <motion.div className="text-left md:text-right">
                <div className="text-3xl md:text-4xl font-bold text-gradient-firefly">
                  {planData.plan_id === 'creator' ? '$5' : '$12'}
                  <span className="text-base text-gray-400 ml-2">/month</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Usage */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <span className="text-white font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-glow" />
                Monthly Usage
              </span>
              <span className="text-white font-bold text-lg">
                {planData.monthly_char_used?.toLocaleString() || 0} /{' '}
                {planData.monthly_char_limit?.toLocaleString() || 500}
                <span className="text-sm text-gray-400 ml-1">characters</span>
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary via-primary-glow to-accent shadow-lg"
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, planData.percentage || 0)}%`
                }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-400">
              <span>0</span>
              <span>{Math.min(100, planData.percentage || 0)}% used</span>
              <span>{(planData.monthly_char_limit || 500).toLocaleString()}</span>
            </div>
          </div>

          {/* Billing */}
          {!isFreePlan && planData.current_period_end && (
            <motion.div
              className="mb-8 glass rounded-xl p-4 border border-white/10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary-glow" />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm">Next billing date</p>
                    <p className="text-white font-bold">
                      {formatDate(planData.current_period_end)}
                    </p>
                  </div>
                </div>

                {daysRemaining !== null && (
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gradient-firefly">
                        {daysRemaining}
                      </div>
                      <p className="text-white/60 text-sm">
                        {daysRemaining === 1 ? 'day' : 'days'} remaining
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Buttons */}
          <div className="flex flex-wrap gap-3">
            {isFreePlan ? (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleUpgrade('creator')}
                  className="bg-gradient-to-r from-primary to-accent text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                >
                  Upgrade to Creator ($5/mo)
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleUpgrade('professional')}
                  className="glass border border-white/20 px-6 py-3 rounded-xl font-bold text-white hover:bg-white/10 transition-all"
                >
                  Upgrade to Professional ($12/mo)
                </motion.button>
              </>
            ) : (
              <>
                {planData.plan_id === 'creator' && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleUpgrade('professional')}
                    className="bg-gradient-to-r from-primary to-accent text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                  >
                    Upgrade to Professional ($12/mo)
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {cancelLoading ? 'Cancelling...' : 'Cancel'}
                </motion.button>
              </>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/pricing')}
              className="glass border border-white/20 px-6 py-3 rounded-xl font-bold text-white hover:bg-white/10 transition-all"
            >
              View All Plans
            </motion.button>
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
