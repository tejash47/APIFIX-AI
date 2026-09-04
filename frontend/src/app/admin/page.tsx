'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import CommandCenterHeader from '../../components/CommandCenterHeader';
import { EnterpriseGovernanceView } from '../../components/EnterpriseGovernanceView';
import { useAuth } from '../../lib/authContext';
import { Shield, ChevronRight, Lock } from 'lucide-react';

export default function AdminPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-gray-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab="admin"
        onSelectTab={(tab) => {
          if (tab === 'admin') return;
          router.push(`/dashboard?tab=${tab}`);
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Global Command Center Header */}
        <CommandCenterHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          projectName="Enterprise Governance"
          onSelectTab={(tab) => router.push(`/dashboard?tab=${tab}`)}
        />

        {/* Breadcrumb & Main Scrollable Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <Link href="/dashboard" className="hover:text-indigo-400 transition-colors">Dashboard</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-white font-semibold">Enterprise Admin & Governance</span>
          </div>

          {/* Core Enterprise Governance View */}
          <EnterpriseGovernanceView />
        </main>
      </div>
    </div>
  );
}
