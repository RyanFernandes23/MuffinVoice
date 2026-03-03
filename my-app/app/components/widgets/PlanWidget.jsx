"use client";

import { Crown, Star, Circle } from "lucide-react";

const planConfig = {
  explorer: {
    icon: Circle,
    label: "Explorer",
    color: "text-gray-400",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/20",
    glowColor: "shadow-gray-500/20",
  },
  creator: {
    icon: Crown,
    label: "Creator",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    glowColor: "shadow-amber-500/20",
  },
  professional: {
    icon: Star,
    label: "Professional",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
    glowColor: "shadow-purple-500/20",
  },
};

export function PlanWidget({ planName, onClick }) {
  const normalizedPlan = (planName || "explorer").toLowerCase();
  const config = planConfig[normalizedPlan] || planConfig.explorer;
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg
        ${config.bgColor} ${config.borderColor}
        border hover:opacity-80 hover:shadow-lg ${config.glowColor}
        transition-all duration-200 cursor-pointer
      `}
      title={`Current plan: ${config.label}`}
    >
      <Icon className={`w-4 h-4 ${config.color}`} />
      <span className={`text-sm font-medium ${config.color}`}>
        {config.label}
      </span>
    </button>
  );
}
