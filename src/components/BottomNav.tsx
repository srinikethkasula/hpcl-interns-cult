"use client";

import { MessageSquare, Users, Settings as SettingsIcon } from "lucide-react";
import { motion } from "framer-motion";

type Tab = "chats" | "directory" | "settings";

const tabs = [
  { id: "chats" as Tab, label: "Chats", icon: MessageSquare },
  { id: "directory" as Tab, label: "Directory", icon: Users },
  { id: "settings" as Tab, label: "Settings", icon: SettingsIcon },
];

export default function BottomNav({
  currentTab,
  onTabChange,
}: {
  currentTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <nav className="md:hidden flex items-center justify-around glass-panel border-t border-zinc-800/60 safe-bottom z-30 shrink-0">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 relative transition-colors ${
              isActive ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="bottomNavActive"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-500 rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
