'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/authContext';
import SettingsModal from './SettingsModal';
import BillingModal from './BillingModal';
import CommandPaletteModal from './CommandPaletteModal';
import CustomerSupportModal from './CustomerSupportModal';
import CustomerOnboardingModal from './CustomerOnboardingModal';
import {
  Search,
  LogOut,
  User,
  Settings,
  History,
  Coins,
  CreditCard,
  Bell,
  Command,
  Plus,
  Shield,
  Layers,
  ChevronDown,
  LifeBuoy,
  Sparkles
} from 'lucide-react';

interface CommandCenterHeaderProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  activeRunsCount?: number;
  lastVerifiedTime?: string | null;
  projectName?: string;
  onSelectTab?: (tab: string) => void;
  onOpenIntakeModal?: () => void;
}

export default function CommandCenterHeader({
  searchQuery = '',
  setSearchQuery = () => {},
  activeRunsCount = 0,
  lastVerifiedTime = null,
  projectName = 'Target Workspace',
  onSelectTab,
  onOpenIntakeModal
}: CommandCenterHeaderProps) {
  const { user, logout, workspaces, activeWorkspace, setActiveWorkspaceId, refreshWorkspaces, token } = useAuth();
  const router = useRouter();
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [credits, setCredits] = useState<number>(activeWorkspace?.credits ?? 10);
  const [newWsName, setNewWsName] = useState('');
  const [isCreatingWs, setIsCreatingWs] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const wsDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Sync credits when activeWorkspace updates
  useEffect(() => {
    if (activeWorkspace?.credits !== undefined) {
      setCredits(activeWorkspace.credits);
    }
  }, [activeWorkspace?.credits]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim() || isCreatingWs) return;
    setIsCreatingWs(true);
    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${BACKEND_URL}/api/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newWsName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setNewWsName('');
        setShowWorkspaceDropdown(false);
        await refreshWorkspaces();
        if (data.workspace?.id) {
          setActiveWorkspaceId(data.workspace.id);
        }
      }
    } catch (e) {
      console.error('Failed to create workspace:', e);
    } finally {
      setIsCreatingWs(false);
    }
  };

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowWorkspaceDropdown(false);
        setShowUserDropdown(false);
        setShowNotifications(false);
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener for open dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setShowWorkspaceDropdown(false);
      }
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentRole = activeWorkspace?.role || 'OWNER';

  return (
    <>
      <header className="h-14 border-b border-panelBorder bg-panel/75 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 font-sans text-xs">
        {/* Left Workspace Switcher & Target Status */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Workspace Switcher */}
          <div className="relative" ref={wsDropdownRef}>
            <button
              onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
              aria-haspopup="listbox"
              aria-expanded={showWorkspaceDropdown}
              className="flex items-center gap-2 font-mono text-gray-200 hover:text-white transition-all py-1.5 px-2.5 rounded-lg bg-bg/90 border border-panelBorder hover:border-indigo-500/50 shadow-sm"
              title="Switch active workspace"
            >
              <div className="w-4 h-4 rounded bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                <Layers className="w-2.5 h-2.5" />
              </div>
              <span className="font-semibold text-gray-100 max-w-[120px] sm:max-w-[160px] truncate">
                {activeWorkspace?.name || 'Personal Workspace'}
              </span>
              <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-panel border border-panelBorder text-gray-400">
                {currentRole}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-500" />
            </button>

            {showWorkspaceDropdown && (
              <div className="absolute top-full mt-2 left-0 w-72 rounded-2xl border border-panelBorder bg-panel shadow-2xl p-2 z-50 font-mono text-xs text-gray-300 animate-in fade-in duration-150 rise">
                <div className="px-3 py-2 border-b border-panelBorder text-gray-400 flex items-center justify-between text-[10px]">
                  <span className="uppercase tracking-wider font-semibold">SWITCH WORKSPACE</span>
                  <span className="text-indigo-400 font-bold">{workspaces.length} ACTIVE</span>
                </div>

                <div className="max-h-52 overflow-y-auto py-1 space-y-1">
                  {workspaces.map(w => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setActiveWorkspaceId(w.id);
                        setShowWorkspaceDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition-all ${
                        activeWorkspace?.id === w.id
                          ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 shadow-sm font-semibold'
                          : 'hover:bg-bg text-gray-300 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{w.name}</span>
                      <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-bg text-gray-400 border border-panelBorder shrink-0 ml-2">
                        {w.role || 'MEMBER'}
                      </span>
                    </button>
                  ))}
                </div>

                <form onSubmit={handleCreateWorkspace} className="border-t border-panelBorder pt-2 mt-1 space-y-2">
                  <input
                    type="text"
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                    placeholder="+ New workspace name..."
                    className="w-full px-2.5 py-1.5 bg-bg border border-panelBorder focus:border-indigo-500 rounded-lg text-xs text-white placeholder:text-gray-500 outline-none font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!newWsName.trim() || isCreatingWs}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[10px] uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 font-mono"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{isCreatingWs ? 'Creating...' : 'Create Workspace'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>

          <span className="text-gray-500 hidden md:inline">·</span>

          {/* Project Target Badge */}
          <Link
            href="/"
            className="hidden sm:flex items-center gap-1.5 font-mono text-gray-300 hover:text-white transition-colors"
          >
            <span className="text-gray-500">project:</span>
            <span className="font-semibold text-white px-2 py-0.5 rounded-md bg-bg border border-panelBorder hover:border-indigo-500/40 transition-all cursor-pointer truncate max-w-[140px]">
              {projectName}
            </span>
          </Link>

          {/* Real-time Verification Status */}
          <div className="font-mono text-emerald-400 select-none text-[10px] tracking-wider font-extrabold border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 rounded-md hidden lg:flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>ONLINE</span>
          </div>
        </div>

        {/* Center Global Command Palette Trigger Button */}
        <button
          onClick={() => setShowCommandPalette(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-panelBorder bg-bg/80 hover:bg-panel hover:border-indigo-500/50 text-gray-400 hover:text-gray-200 transition-all font-sans text-xs w-48 sm:w-64 md:w-80 shadow-inner group"
          title="Open Global Command Palette (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-400 transition-colors shrink-0" />
          <span className="flex-1 text-left truncate text-gray-400 text-[11px]">
            Quick search or jump...
          </span>
          <div className="flex items-center gap-1 font-mono text-[10px] text-gray-400 bg-panel px-1.5 py-0.5 rounded border border-panelBorder shrink-0">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </div>
        </button>

        {/* Right User Auth, Credits, Notifications & Quick Settings Controls */}
        <div className="flex items-center gap-2" ref={dropdownRef}>
          {/* Credit / Billing Pill */}
          <button
            onClick={() => setShowBillingModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition-all font-mono text-xs font-semibold shadow-sm hover:shadow-[0_0_12px_rgba(245,158,11,0.2)]"
            title="Workspace Credits & Billing"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>{credits}</span>
            <span className="text-[9px] text-amber-400/80 font-normal">CR</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative" ref={notifDropdownRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              aria-label="View system notifications"
              className="p-2 rounded-xl border border-panelBorder bg-bg/80 text-gray-400 hover:text-white hover:border-gray-500 transition-all relative"
              title="System Alerts & Notifications"
            >
              <Bell className="w-3.5 h-3.5" />
              {activeRunsCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-panelBorder bg-panel shadow-2xl p-3 z-50 font-sans text-xs animate-in fade-in duration-150 rise">
                <div className="flex items-center justify-between border-b border-panelBorder pb-2 text-[11px] font-mono text-gray-400">
                  <span className="font-semibold text-white">SYSTEM NOTIFICATIONS</span>
                  <span>{activeRunsCount > 0 ? '1 Active Run' : 'All Clear'}</span>
                </div>
                <div className="py-3 space-y-2">
                  {activeRunsCount > 0 ? (
                    <div className="p-2.5 rounded-xl bg-bg border border-indigo-500/30 text-indigo-200 text-xs">
                      <p className="font-semibold">Autonomous Repair Active</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Agent is investigating and verifying runtime evidence in Docker sandbox.</p>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-xs text-center py-4">No unread alerts. Platform is operating normally.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Support / Help Center Trigger */}
          <button
            onClick={() => setShowSupportModal(true)}
            aria-label="Support and Documentation"
            className="p-2 rounded-xl border border-panelBorder bg-bg/80 text-gray-400 hover:text-white hover:border-gray-500 transition-all"
            title="Help & Support Diagnostics"
          >
            <LifeBuoy className="w-3.5 h-3.5 text-indigo-400" />
          </button>

          {/* Settings Trigger */}
          <button
            onClick={() => setShowSettingsModal(true)}
            aria-label="Platform Settings"
            className="p-2 rounded-xl border border-panelBorder bg-bg/80 text-gray-400 hover:text-white hover:border-gray-500 transition-all"
            title="Platform Settings & AI Keys"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                aria-expanded={showUserDropdown}
                className="flex items-center gap-2 font-mono text-gray-200 hover:text-white transition-all bg-panel/50 border border-panelBorder hover:border-gray-500 px-2.5 py-1.5 rounded-xl select-none"
              >
                <div className="w-5 h-5 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold text-[10px]">
                  {user.name ? user.name[0].toUpperCase() : <User className="w-3 h-3" />}
                </div>
                <span className="hidden sm:inline max-w-[100px] truncate">{user.name}</span>
              </button>

              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-panelBorder bg-panel shadow-2xl py-1.5 z-50 font-mono text-xs text-gray-300 animate-in fade-in duration-150 rise">
                  <div className="px-3.5 py-2.5 border-b border-panelBorder text-gray-400">
                    <span className="block text-[9px] text-gray-500 uppercase tracking-wider font-semibold">LOGGED IN AS</span>
                    <span className="text-white font-semibold truncate block mt-0.5">{user.email}</span>
                  </div>

                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowBillingModal(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-bg hover:text-white transition-all flex items-center gap-2.5 text-amber-300"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                    <span>Billing & Subscriptions</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowSettingsModal(true);
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-bg hover:text-white transition-all flex items-center gap-2.5 text-gray-300 border-t border-panelBorder/50"
                  >
                    <Settings className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Settings & API Keys</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      router.push('/dashboard?tab=history');
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-bg hover:text-white transition-all flex items-center gap-2.5 text-gray-300 border-t border-panelBorder/50"
                  >
                    <History className="w-3.5 h-3.5 text-amber-400" />
                    <span>Usage History</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      logout();
                      router.push('/login');
                    }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-bg text-red-400 hover:text-red-300 transition-all border-t border-panelBorder flex items-center gap-2.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg border border-panelBorder bg-bg text-gray-300 hover:bg-panel font-medium transition-all"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20 transition-all"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Embedded Settings Modal */}
      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

      {/* Embedded Billing Modal (Phase 13) */}
      {activeWorkspace && (
        <BillingModal
          isOpen={showBillingModal}
          onClose={() => setShowBillingModal(false)}
          workspaceId={activeWorkspace.id}
          onCreditsUpdated={(newCredits) => setCredits(newCredits)}
        />
      )}

      {/* Embedded Customer Support Modal */}
      <CustomerSupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
      />

      {/* Embedded Customer Onboarding Wizard */}
      <CustomerOnboardingModal
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        onOpenProjectIntake={onOpenIntakeModal}
      />

      {/* Global Command Palette (Phase 14) */}
      <CommandPaletteModal
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onSelectTab={onSelectTab}
        onOpenIntake={onOpenIntakeModal}
        onOpenBilling={() => setShowBillingModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />
    </>
  );
}
