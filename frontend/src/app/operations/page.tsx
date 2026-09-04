'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import CommandCenterHeader from '../../components/CommandCenterHeader';
import ProductionOperationsView from '../../components/ProductionOperationsView';
import { useAuth } from '../../lib/authContext';
import { ChevronRight } from 'lucide-react';

export default function OperationsPage() {
  const { user, isLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-gray-100 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab="operations"
        onSelectTab={(tab) => {
          if (tab === 'operations') return;
          if (tab === 'admin') {
            router.push('/admin');
          } else if (tab === 'developer') {
            router.push('/developer');
          } else {
            router.push(`/dashboard?tab=${tab}`);
          }
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Global Command Center Header */}
        <CommandCenterHeader
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          projectName="Production Operations"
          onSelectTab={(tab) => {
            if (tab === 'admin') router.push('/admin');
            else if (tab === 'developer') router.push('/developer');
            else if (tab === 'operations') router.push('/operations');
            else router.push(`/dashboard?tab=${tab}`);
          }}
        />

        {/* Breadcrumb & Main Scrollable Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <Link href="/dashboard" className="hover:text-indigo-400 transition-colors">Dashboard</Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <span className="text-white font-semibold">Production Operations Control Center</span>
          </div>

          {/* Core Operations View */}
          <ProductionOperationsView />
        </main>
      </div>
    </div>
  );
}
