'use client';

import { useUser, useAuth } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { User, Mail, Shield, Zap, Info, CheckCircle2, Clock } from "lucide-react";
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
        color: "from-gray-500/20 to-gray-500/5",
        accent: "text-gray-400",
        border: "border-gray-500/20"
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
        color: "from-amber-500/20 to-amber-500/5",
        accent: "text-amber-400",
        border: "border-amber-500/20"
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
        color: "from-purple-500/20 to-purple-500/5",
        accent: "text-purple-400",
        border: "border-purple-500/20"
    }
};

export default function ProfilePage() {
    const { user, isLoaded: userLoaded } = useUser();
    const { getToken, isSignedIn } = useAuth();
    const { usage, loading: usageLoading, getUsageColor, getUsageBgColor, formatNumber } = useUsage(isSignedIn ? getToken : null);

    // Wait for both user and usage data to load
    const isReady = userLoaded && !usageLoading && usage.plan_name !== null;

    if (!userLoaded || usageLoading) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar />
                <div className="pt-32 flex justify-center">
                    <div className="w-8 h-8 border-4 border-primary-glow/30 border-t-primary-glow rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    const currentPlanId = (usage.plan_name || 'explorer').toLowerCase();
    const planInfo = PLAN_DETAILS[currentPlanId] || PLAN_DETAILS.explorer;

    return (
        <div className="min-h-screen bg-background pb-20">
            <Navbar />

            <main className="max-w-5xl mx-auto px-4 pt-32 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                >
                    {/* User Profile Info */}
                    <section className="lg:col-span-1 space-y-6">
                        <div className="glass-card rounded-3xl p-8 border border-white/10 text-center">
                            <div className="relative inline-block mb-4">
                                <img
                                    src={user?.imageUrl}
                                    alt={user?.fullName || "User"}
                                    className="w-24 h-24 rounded-full ring-4 ring-primary/20"
                                />
                                <div className="absolute bottom-1 right-1 w-6 h-6 bg-emerald-500 border-4 border-background rounded-full" />
                            </div>
                            <h1 className="text-xl font-bold text-white">{user?.fullName || "WikiVoice User"}</h1>
                            <p className="text-gray-400 text-sm mb-6">{user?.primaryEmailAddress?.emailAddress}</p>

                            <div className="space-y-3 text-left">
                                <div className="flex items-center gap-3 text-sm text-gray-300 bg-white/5 p-3 rounded-xl border border-white/5">
                                    <User className="w-4 h-4 text-primary-glow" />
                                    <span>{user?.username || "No username"}</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300 bg-white/5 p-3 rounded-xl border border-white/5">
                                    <Shield className="w-4 h-4 text-primary-glow" />
                                    <span className="capitalize">{currentPlanId} Plan</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300 bg-white/5 p-3 rounded-xl border border-white/5">
                                    <Clock className="w-4 h-4 text-primary-glow" />
                                    <span>Joined {new Date(user?.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Plan & Usage Details */}
                    <section className="lg:col-span-2 space-y-6">
                        {/* Current Plan Card */}
                        <div className={`glass-card rounded-3xl p-8 border ${planInfo.border} bg-gradient-to-br ${planInfo.color} relative overflow-hidden`}>
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <span className={`text-xs font-bold uppercase tracking-widest ${planInfo.accent} mb-1 block`}>Current Plan</span>
                                        <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                                            {planInfo.name}
                                        </h2>
                                    </div>
                                    <div className={`p-3 rounded-2xl bg-white/5 border border-white/10`}>
                                        <Zap className={`w-6 h-6 ${planInfo.accent}`} />
                                    </div>
                                </div>

                                <p className="text-gray-300 mb-8 max-w-md">
                                    {planInfo.description}
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {planInfo.features.map((feature, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm text-gray-300 bg-black/20 p-3 rounded-xl border border-white/5">
                                            <CheckCircle2 className={`w-4 h-4 ${planInfo.accent}`} />
                                            {feature}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Decorative background element */}
                            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
                        </div>

                        {/* Token Usage Stats */}
                        <div className="glass-card rounded-3xl p-8 border border-white/10">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Info className="w-5 h-5 text-primary-glow" />
                                    Token Usage
                                </h3>
                                <span className="text-xs text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                                    Resets Monthly
                                </span>
                            </div>

                            <div className="space-y-6">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <p className="text-sm text-gray-400">Tokens Remaining</p>
                                        <p className={`text-4xl font-black ${getUsageColor()}`}>
                                            {formatNumber(usage.remaining)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-400">Total Allocated</p>
                                        <p className="text-xl font-bold text-white">
                                            {formatNumber(usage.allocated)}
                                        </p>
                                    </div>
                                </div>

                                <div className="relative pt-2">
                                    <div className="flex justify-between text-xs text-gray-500 mb-2 font-medium">
                                        <span>Usage Progress</span>
                                        <span>{usage.percent_used}% Used</span>
                                    </div>
                                    <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${usage.percent_used}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                            className={`h-full rounded-full ${getUsageBgColor()} shadow-lg shadow-primary/20`}
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-white/5">
                                    <p className="text-sm text-gray-400 leading-relaxed italic">
                                        "Tokens are consumed based on the length of text converted. Upgrade your plan to increase your monthly limit and unlock premium features."
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                </motion.div>
            </main>
        </div>
    );
}
