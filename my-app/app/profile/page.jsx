'use client';

import { useUser, useAuth } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { User, Mail, Shield, Zap, Info, CheckCircle2, Clock, Crown, Sparkles } from "lucide-react";
import { useUsage } from "../../hooks/useUsage";
import Navbar from "../components/Navbar";

const PLAN_DETAILS = {
    explorer: {
        name: "Explorer",
        description: "Perfect for getting started and exploring WikiVoice features.",
        features: [
            "50MB max file upload",
            "40K tokens per month",
            "Basic voice options",
            "Email support"
        ],
        accent: "text-neutral-400",
        border: "border-neutral-700",
        icon: null
    },
    creator: {
        name: "Creator",
        description: "For content creators who need more power and options.",
        features: [
            "100MB max file upload",
            "400K tokens per month",
            "All voice options",
            "Audio download enabled",
            "Priority support"
        ],
        accent: "text-neutral-300",
        border: "border-neutral-600",
        icon: Zap
    },
    professional: {
        name: "Professional",
        description: "For professional users and teams requiring maximum limits.",
        features: [
            "150MB max file upload",
            "1.6M tokens per month",
            "All voices including AI",
            "Audio download enabled",
            "24/7 dedicated support"
        ],
        accent: "text-neutral-200",
        border: "border-neutral-600",
        icon: Crown
    }
};

function Skeleton({ className = "" }) {
    return (
        <div className={`relative overflow-hidden bg-neutral-800 rounded-lg ${className}`}>
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>
    );
}

function ProfileSkeleton() {
    return (
        <div className="rounded-xl p-8 border border-white/[0.08] text-center" style={{ background: '#111111' }}>
            <div className="relative inline-block mb-4">
                <Skeleton className="w-24 h-24 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-40 mx-auto mb-2" />
            <Skeleton className="h-4 w-52 mx-auto mb-6" />
            <div className="space-y-3 text-left">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
            </div>
        </div>
    );
}

function PlanSkeleton() {
    return (
        <div className="rounded-xl p-8 border border-white/[0.08] relative overflow-hidden" style={{ background: '#111111' }}>
            <div className="flex justify-between items-start mb-6">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-9 w-36" />
                </div>
                <Skeleton className="w-12 h-12 rounded-xl" />
            </div>
            <Skeleton className="h-4 w-full mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
                <Skeleton className="h-11 w-full rounded-xl" />
            </div>
        </div>
    );
}

function UsageSkeleton() {
    return (
        <div className="rounded-xl p-8 border border-white/[0.08]" style={{ background: '#111111' }}>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                    <Skeleton className="w-5 h-5 rounded" />
                    <Skeleton className="h-6 w-32" />
                </div>
                <Skeleton className="h-6 w-28 rounded-lg" />
            </div>
            <div className="space-y-6">
                <div className="flex justify-between items-end">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-12 w-24" />
                    </div>
                    <div className="text-right space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-7 w-20" />
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full rounded-lg" />
                </div>
                <Skeleton className="h-16 w-full mt-4" />
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const { user, isLoaded: userLoaded } = useUser();
    const { getToken, isSignedIn } = useAuth();
    const { usage, loading: usageLoading, getUsageColor, getUsageBgColor, formatNumber } = useUsage(isSignedIn ? getToken : null);

    const usageLoaded = !usageLoading && usage.plan_name !== null;
    const isReady = userLoaded && usageLoaded;

    const currentPlanId = usageLoaded ? (usage.plan_name || 'explorer').toLowerCase() : 'explorer';
    const planInfo = PLAN_DETAILS[currentPlanId] || PLAN_DETAILS.explorer;
    const PlanIcon = planInfo.icon;

    return (
        <div className="min-h-screen bg-background pb-48">
            <Navbar />

            <main className="max-w-5xl mx-auto px-4 pt-16 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                >
                    {/* User Profile Info */}
                    <section className="lg:col-span-1 space-y-6">
                        {!userLoaded ? (
                            <ProfileSkeleton />
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.1 }}
                                className="rounded-xl p-8 border border-white/[0.08] text-center"
                                style={{ background: '#111111' }}
                            >
                                <div className="relative inline-block mb-4">
                                    <img
                                        src={user?.imageUrl}
                                        alt={user?.fullName || "User"}
                                        className="w-24 h-24 rounded-lg ring-2 ring-white/20"
                                    />
                                    <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 border-4 border-black rounded-lg" />
                                </div>
                                <h1 className="text-xl font-bold text-white">{user?.fullName || "WikiVoice User"}</h1>
                                <p className="text-neutral-500 text-sm mb-6">{user?.primaryEmailAddress?.emailAddress}</p>

                                <div className="space-y-3 text-left">
                                    <div className="flex items-center gap-3 text-sm text-neutral-300 bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]">
                                        <User className="w-4 h-4 text-neutral-400" />
                                        <span>{user?.username || "No username"}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-neutral-300 bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]">
                                        <Shield className="w-4 h-4 text-neutral-400" />
                                        <span className="capitalize flex items-center gap-2">
                                            {PlanIcon && <PlanIcon className={`w-4 h-4 ${planInfo.accent}`} />}
                                            {currentPlanId} Plan
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-sm text-neutral-300 bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]">
                                        <Clock className="w-4 h-4 text-neutral-400" />
                                        <span>Joined {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'}</span>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </section>

                    {/* Plan & Usage Details */}
                    <section className="lg:col-span-2 space-y-6">
                        {!usageLoaded ? (
                            <PlanSkeleton />
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.2 }}
                                className={`rounded-xl p-8 border ${planInfo.border} relative overflow-hidden`}
                                style={{ background: '#111111' }}
                            >
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <span className={`text-xs font-bold uppercase tracking-widest ${planInfo.accent} mb-1 block`}>Current Plan</span>
                                            <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                                                {planInfo.name}
                                                {PlanIcon && <PlanIcon className={`w-7 h-7 ${planInfo.accent}`} />}
                                            </h2>
                                        </div>
                                        <div className="p-3 rounded-xl bg-white/[0.05] border border-white/[0.08]">
                                            <Sparkles className={`w-6 h-6 ${planInfo.accent}`} />
                                        </div>
                                    </div>

                                    <p className="text-neutral-400 mb-8 max-w-md">
                                        {planInfo.description}
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {planInfo.features.map((feature, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.3 + i * 0.1 }}
                                                className="flex items-center gap-2 text-sm text-neutral-300 bg-white/[0.04] p-3 rounded-xl border border-white/[0.06]"
                                            >
                                                <CheckCircle2 className={`w-4 h-4 ${planInfo.accent}`} />
                                                {feature}
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Token Usage Stats */}
                        {!usageLoaded ? (
                            <UsageSkeleton />
                        ) : (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3 }}
                                className="rounded-xl p-8 border border-white/[0.08]"
                                style={{ background: '#111111' }}
                            >
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <Info className="w-5 h-5 text-neutral-400" />
                                        Token Usage
                                    </h3>
                                    <span className="text-xs text-neutral-500 bg-white/[0.04] px-3 py-1 rounded-lg border border-white/[0.08]">
                                        Resets Monthly
                                    </span>
                                </div>

                                <div className="space-y-6">
                                    <div className="flex justify-between items-end">
                                        <div className="space-y-1">
                                            <p className="text-sm text-neutral-500">Tokens Remaining</p>
                                            <p className={`text-4xl font-black ${getUsageColor()}`}>
                                                {formatNumber(usage.remaining)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-neutral-500">Total Allocated</p>
                                            <p className="text-xl font-bold text-white">
                                                {formatNumber(usage.allocated)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="relative pt-2">
                                        <div className="flex justify-between text-xs text-neutral-600 mb-2 font-medium">
                                            <span>Usage Progress</span>
                                            <span>{usage.percent_used.toFixed(1)}% Used</span>
                                        </div>
                                        <div className="w-full h-3 bg-neutral-800 rounded-lg overflow-hidden border border-white/[0.06] p-0.5">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(usage.percent_used, 100)}%` }}
                                                transition={{ duration: 1, ease: "easeOut" }}
                                                className={`h-full rounded-lg ${getUsageBgColor()}`}
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-white/[0.06]">
                                        <p className="text-sm text-neutral-500 leading-relaxed">
                                            Tokens are consumed based on the length of text converted. Upgrade your plan to increase your monthly limit and unlock premium features.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </section>
                </motion.div>
            </main>
        </div>
    );
}
