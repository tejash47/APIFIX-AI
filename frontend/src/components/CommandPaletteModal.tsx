'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  LayoutDashboard,
  Server,
  AlertCircle,
  PlayCircle,
  TestTube,
  FolderGit2,
  CreditCard,
  Settings,
  Sparkles,
  Zap,
  Shield,
  FileCode,
  ArrowRight,
  Command,
  Activity,
  Building,
  ShieldCheck,
  DollarSign,
  CheckCircle2,
  Code,
  Key,
  X
} from 'lucide-react';

interface CommandItem {
  id: string;
  category: 'Navigation' | 'Actions' | 'Tools';
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab?: (tab: string) => void;
  onOpenIntake?: () => void;
  onOpenBilling?: () => void;
  onOpenSettings?: () => void;
  onTriggerDemo?: () => void;
}

export default function CommandPaletteModal({
  isOpen,
  onClose,
  onSelectTab,
  onOpenIntake,
  onOpenBilling,
  onOpenSettings,
  onTriggerDemo
}: CommandPaletteModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const items: CommandItem[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-overview',
      category: 'Navigation',
      title: 'Overview Dashboard',
      subtitle: 'Real-time telemetry, active run pipeline & metrics',
      icon: LayoutDashboard,
      shortcut: 'G O',
      action: () => {
        if (onSelectTab) onSelectTab('overview');
        router.push('/dashboard');
      }
    },
    {
      id: 'nav-sre',
      category: 'Navigation',
      title: 'SRE & Observability',
      subtitle: 'Operational intelligence, AI metrics, MTTD/MTTR & SLOs',
      icon: Activity,
      shortcut: 'G S',
      action: () => {
        if (onSelectTab) onSelectTab('sre');
        router.push('/dashboard?tab=sre');
      }
    },
    {
      id: 'nav-operations',
      category: 'Navigation',
      title: 'Production Operations Center',
      subtitle: 'SRE control center, deployment safety, FinOps, DR verification',
      icon: Shield,
      shortcut: 'G P',
      action: () => {
        router.push('/operations');
      }
    },
    {
      id: 'nav-apis',
      category: 'Navigation',
      title: 'API Endpoints Registry',
      subtitle: 'Discovered routes, contracts & health probes',
      icon: Server,
      shortcut: 'G A',
      action: () => {
        if (onSelectTab) onSelectTab('apis');
        router.push('/dashboard?tab=apis');
      }
    },
    {
      id: 'nav-incidents',
      category: 'Navigation',
      title: 'Incident Explorer',
      subtitle: 'Detected runtime exceptions & causal chains',
      icon: AlertCircle,
      shortcut: 'G I',
      action: () => {
        if (onSelectTab) onSelectTab('incidents');
        router.push('/dashboard?tab=incidents');
      }
    },
    {
      id: 'nav-runs',
      category: 'Navigation',
      title: 'Agent Repair Runs',
      subtitle: 'Autonomous investigation and verification logs',
      icon: PlayCircle,
      shortcut: 'G R',
      action: () => {
        if (onSelectTab) onSelectTab('runs');
        router.push('/dashboard?tab=runs');
      }
    },
    {
      id: 'nav-tests',
      category: 'Navigation',
      title: 'Sandbox Test Suites',
      subtitle: 'Automated regression test executions & coverage',
      icon: TestTube,
      shortcut: 'G T',
      action: () => {
        if (onSelectTab) onSelectTab('tests');
        router.push('/dashboard?tab=tests');
      }
    },
    {
      id: 'nav-repo',
      category: 'Navigation',
      title: 'Repository File Explorer',
      subtitle: 'Inspect workspace files and GitHub branches',
      icon: FolderGit2,
      action: () => {
        if (onSelectTab) onSelectTab('repo');
        router.push('/dashboard?tab=repo');
      }
    },
    {
      id: 'nav-billing',
      category: 'Navigation',
      title: 'Billing & Subscriptions',
      subtitle: 'Workspace credits, plans & Stripe portal',
      icon: CreditCard,
      shortcut: 'G B',
      action: () => {
        if (onOpenBilling) onOpenBilling();
      }
    },
    {
      id: 'nav-settings',
      category: 'Navigation',
      title: 'Settings & AI API Keys',
      subtitle: 'LLM providers, workspace members & security',
      icon: Settings,
      shortcut: 'G S',
      action: () => {
        if (onOpenSettings) onOpenSettings();
      }
    },
    {
      id: 'nav-admin',
      category: 'Navigation',
      title: 'Enterprise Governance Cockpit',
      subtitle: 'Organization hierarchy, audit logs, compliance & AI policies',
      icon: Building,
      shortcut: 'G E',
      action: () => {
        router.push('/admin');
      }
    },
    {
      id: 'nav-compliance',
      category: 'Navigation',
      title: 'Compliance Controls Center',
      subtitle: '11 internal control frameworks & SHA-256 evidence vaults',
      icon: ShieldCheck,
      shortcut: 'G C',
      action: () => {
        router.push('/admin');
      }
    },
    {
      id: 'nav-costs',
      category: 'Navigation',
      title: 'Cost Intelligence & Budgets',
      subtitle: 'Multi-dimensional spend metrics, AI token ledger & alerts',
      icon: DollarSign,
      action: () => {
        router.push('/admin');
      }
    },
    {
      id: 'nav-approvals',
      category: 'Navigation',
      title: 'Approval Queue & Signoffs',
      subtitle: 'Review high-severity and production patch requests',
      icon: CheckCircle2,
      action: () => {
        router.push('/admin');
      }
    },
    {
      id: 'nav-developer',
      category: 'Navigation',
      title: 'Developer Portal & API Ecosystem',
      subtitle: 'API keys, OpenAPI 3.1 explorer, HMAC webhooks & CLI guide',
      icon: Code,
      shortcut: 'G D',
      action: () => {
        router.push('/developer');
      }
    },
    {
      id: 'nav-apikeys',
      category: 'Navigation',
      title: 'API Keys & Scopes',
      subtitle: 'Generate and manage enterprise scoped API tokens',
      icon: Key,
      action: () => {
        router.push('/developer');
      }
    },

    // Actions
    {
      id: 'act-intake',
      category: 'Actions',
      title: 'Import Repository / Upload Codebase',
      subtitle: 'Intake ZIP or GitHub repo with AST analysis',
      icon: Sparkles,
      action: () => {
        if (onOpenIntake) onOpenIntake();
      }
    },
    {
      id: 'act-scan',
      category: 'Actions',
      title: 'Launch Live API Scanner',
      subtitle: 'Probe any public or private HTTP endpoint',
      icon: Zap,
      action: () => {
        router.push('/scan');
      }
    },
    {
      id: 'act-demo',
      category: 'Actions',
      title: 'Trigger Demo Incident Simulation',
      subtitle: 'Run seeded POST /api/auth/login 500 repair cycle',
      icon: PlayCircle,
      action: () => {
        if (onTriggerDemo) onTriggerDemo();
      }
    },

    // Tools
    {
      id: 'tool-audit',
      category: 'Tools',
      title: 'Security Audit Logs',
      subtitle: 'Sanitized chronological action history',
      icon: Shield,
      action: () => {
        if (onSelectTab) onSelectTab('history');
        router.push('/dashboard?tab=history');
      }
    }
  ], [onSelectTab, onOpenIntake, onOpenBilling, onOpenSettings, onTriggerDemo, router]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      item =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Keyboard navigation inside command palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150 font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-panelBorder bg-panel/95 shadow-2xl overflow-hidden flex flex-col max-h-[80vh] rise"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div className="p-4 border-b border-panelBorder flex items-center gap-3 bg-bg/60">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            id="command-palette-title"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search (e.g., 'apis', 'runs', 'billing', 'repo')..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-gray-500 font-sans"
          />
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 bg-panel px-2 py-1 rounded border border-panelBorder">
            <span>ESC</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-all"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 divide-y divide-panelBorder/30">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono text-gray-500">
              No matching commands or destinations found for &quot;{query}&quot;.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const IconComponent = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center justify-between gap-3 transition-all ${
                    isSelected
                      ? 'bg-indigo-600/20 text-white border border-indigo-500/40 shadow-sm'
                      : 'text-gray-300 hover:bg-panel border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? 'bg-indigo-600/40 text-indigo-200 border-indigo-400/50'
                          : 'bg-bg text-gray-400 border-panelBorder'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white tracking-tight">{item.title}</span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-bg text-gray-500 border border-panelBorder">
                          {item.category}
                        </span>
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <span className="text-[10px] font-mono text-gray-400 bg-bg px-1.5 py-0.5 rounded border border-panelBorder">
                        {item.shortcut}
                      </span>
                    )}
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-indigo-400 animate-in fade-in" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div className="p-3 border-t border-panelBorder/70 bg-bg/80 flex items-center justify-between text-[11px] font-mono text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="bg-panel px-1.5 py-0.5 rounded border border-panelBorder">↑</kbd>
              <kbd className="bg-panel px-1.5 py-0.5 rounded border border-panelBorder">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-panel px-1.5 py-0.5 rounded border border-panelBorder">↵</kbd>
              <span>select</span>
            </span>
          </div>
          <span>APIFIX AI Quick Navigator</span>
        </div>
      </div>
    </div>
  );
}
