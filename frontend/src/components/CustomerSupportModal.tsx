'use client';

import React, { useState } from 'react';
import {
  LifeBuoy,
  X,
  Search,
  BookOpen,
  Send,
  Check,
  Copy,
  AlertCircle,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  Terminal,
  Activity,
  FileText
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useToast } from '../lib/ToastContext';

interface CustomerSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultIncidentId?: string;
  defaultRepairId?: string;
}

const FAQ_TOPICS = [
  {
    title: 'How does APIFIX safely test patches before deployment?',
    body: 'APIFIX boots an ephemeral sandbox on an unassigned dynamic TCP port, applies the AST-validated patch in an isolated temporary directory, and runs probe requests plus regression test suites before prompting for human approval.'
  },
  {
    title: 'Why was an incident marked "BLOCKED — AUTH REQUIRED"?',
    body: 'The endpoint returned a 401/403 status code without an authentication token configured. In Settings or Project Intake, provide an environment variable or test bearer token to allow deep execution probing.'
  },
  {
    title: 'How do I configure Outbound Webhooks with HMAC signing?',
    body: 'Navigate to Developer Portal -> Webhooks. Add your endpoint URL and copy the HMAC secret. All inbound webhook deliveries include an X-Apifix-Signature-256 header for payload verification.'
  },
  {
    title: 'What should I do if a repair times out during verification?',
    body: 'Ensure your test script does not enter an infinite loop and exits with a standard code (0 for pass, non-zero for fail). Default probe timeouts are set to 15 seconds.'
  }
];

export default function CustomerSupportModal({
  isOpen,
  onClose,
  defaultIncidentId,
  defaultRepairId
}: CustomerSupportModalProps) {
  const { user, activeWorkspace } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'troubleshooting' | 'diagnostic' | 'contact'>('troubleshooting');
  const [searchQuery, setSearchQuery] = useState('');
  const [incidentIdInput, setIncidentIdInput] = useState(defaultIncidentId || '');
  const [repairIdInput, setRepairIdInput] = useState(defaultRepairId || '');
  const [issueDescription, setIssueDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const filteredFaqs = FAQ_TOPICS.filter(
    f => f.title.toLowerCase().includes(searchQuery.toLowerCase()) || f.body.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleGenerateDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
      const res = await fetch(`${BACKEND_URL}/api/product/support/diagnostics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: activeWorkspace?.id || 'default_workspace',
          incidentId: incidentIdInput.trim() || undefined,
          repairId: repairIdInput.trim() || undefined,
          userDescription: issueDescription.trim()
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to generate diagnostic bundle');
      }

      const data = await res.json();
      setDiagnosticResult(data.data);
      toast.success('Diagnostic Bundle Generated', `Reference Token: ${data.data.ticketToken}`);
    } catch (err: any) {
      toast.error('Diagnostic Error', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyBundle = () => {
    if (!diagnosticResult) return;
    navigator.clipboard.writeText(JSON.stringify(diagnosticResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.info('Copied to Clipboard', 'Sanitized diagnostic bundle copied successfully.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl rounded-2xl border border-panelBorder bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-panelBorder flex items-center justify-between bg-bg/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                APIFIX Support &amp; Help Center
              </h2>
              <p className="text-xs text-gray-400">
                Search documentation, review troubleshooting playbooks, or export sanitized diagnostic bundles.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 py-2.5 bg-bg/80 border-b border-panelBorder flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setActiveTab('troubleshooting')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'troubleshooting'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white bg-panel/50'
            }`}
          >
            Troubleshooting Playbooks
          </button>
          <button
            onClick={() => setActiveTab('diagnostic')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'diagnostic'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white bg-panel/50'
            }`}
          >
            Diagnostic Bundle Generator
          </button>
          <button
            onClick={() => setActiveTab('contact')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === 'contact'
                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white bg-panel/50'
            }`}
          >
            Support Channels
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          
          {/* TAB 1: Troubleshooting */}
          {activeTab === 'troubleshooting' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search error messages, topics, or playbooks..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-bg border border-panelBorder text-xs text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-3">
                {filteredFaqs.map((faq, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-1.5">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{faq.title}</span>
                    </h4>
                    <p className="text-xs text-gray-300 leading-relaxed pl-5">
                      {faq.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Diagnostic Bundle */}
          {activeTab === 'diagnostic' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-start gap-2.5 text-xs text-indigo-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
                <span>
                  All diagnostic packages automatically sanitize and redact passwords, bearer tokens, API keys, and private customer source code.
                </span>
              </div>

              <form onSubmit={handleGenerateDiagnostic} className="space-y-3 font-sans text-xs">
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div>
                    <label className="text-gray-400 block mb-1 text-[11px]">Incident ID (Optional)</label>
                    <input
                      type="text"
                      value={incidentIdInput}
                      onChange={(e) => setIncidentIdInput(e.target.value)}
                      placeholder="inc_17885..."
                      className="w-full px-3 py-2 rounded-xl bg-bg border border-panelBorder text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 block mb-1 text-[11px]">Repair / Run ID (Optional)</label>
                    <input
                      type="text"
                      value={repairIdInput}
                      onChange={(e) => setRepairIdInput(e.target.value)}
                      placeholder="run_17885..."
                      className="w-full px-3 py-2 rounded-xl bg-bg border border-panelBorder text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-gray-400 block mb-1 text-[11px]">Issue Summary / Observation</label>
                  <textarea
                    rows={3}
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="Describe what occurred or what behavior was expected..."
                    className="w-full px-3 py-2 rounded-xl bg-bg border border-panelBorder text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isGenerating}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-mono font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all"
                >
                  {isGenerating ? (
                    <span>Generating Redacted Bundle...</span>
                  ) : (
                    <>
                      <Terminal className="w-4 h-4" />
                      <span>Generate Diagnostic Bundle</span>
                    </>
                  )}
                </button>
              </form>

              {diagnosticResult && (
                <div className="p-4 rounded-xl border border-panelBorder bg-bg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>Ticket Reference: {diagnosticResult.ticketToken}</span>
                    </span>
                    <button
                      onClick={handleCopyBundle}
                      className="px-2.5 py-1 rounded-lg bg-panel hover:bg-panelBorder/40 border border-panelBorder text-[11px] font-mono text-gray-300 flex items-center gap-1.5 transition-all"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-black/60 border border-panelBorder text-[11px] font-mono text-gray-300 max-h-44 overflow-y-auto">
                    {JSON.stringify(diagnosticResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Contact */}
          {activeTab === 'contact' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl border border-panelBorder bg-panel/60 space-y-3">
                <h4 className="font-bold text-white text-sm">Enterprise Support Level</h4>
                <p className="text-gray-300">
                  Customers on Enterprise and Team tiers have access to dedicated 24/7 SRE escalation and Slack integration.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 font-mono text-[11px]">
                  <div className="p-3 rounded-lg bg-bg/80 border border-panelBorder">
                    <span className="text-gray-500 block">SLA Response Window</span>
                    <span className="text-emerald-400 font-bold">&lt; 15 Minutes (P1 Incidents)</span>
                  </div>
                  <div className="p-3 rounded-lg bg-bg/80 border border-panelBorder">
                    <span className="text-gray-500 block">Support Desk</span>
                    <span className="text-white font-bold">support@apifix.ai</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-panelBorder bg-bg/50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-panel hover:bg-panelBorder/40 border border-panelBorder text-xs font-mono text-white transition-all"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
