'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  Shield,
  FileCode,
  Check,
  X,
  Sparkles
} from 'lucide-react';

export interface ApprovalRequestItem {
  id: string;
  workflowType: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  environment: 'production' | 'staging' | 'development';
  requesterEmail: string;
  requiredApprovals: number;
  currentApprovals: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  createdAt: string;
}

interface ApprovalQueueViewProps {
  requests?: ApprovalRequestItem[];
  onApprove?: (requestId: string, comment?: string) => Promise<void>;
  onReject?: (requestId: string, reason?: string) => Promise<void>;
}

const DEFAULT_REQUESTS: ApprovalRequestItem[] = [
  {
    id: 'appr_sample_01',
    workflowType: 'PRODUCTION_REPAIR',
    title: 'Deploy Hotfix to checkout-service main branch',
    description: 'Fix for critical race condition in session checkout lock.',
    severity: 'CRITICAL',
    environment: 'production',
    requesterEmail: 'dev@apifix.ai',
    requiredApprovals: 2,
    currentApprovals: 1,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString()
  },
  {
    id: 'appr_sample_02',
    workflowType: 'SECURITY_SENSITIVE_OPERATION',
    title: 'Rotate Stripe Webhook HMAC Signing Secret',
    description: 'Scheduled enterprise secret rotation.',
    severity: 'HIGH',
    environment: 'production',
    requesterEmail: 'security@apifix.ai',
    requiredApprovals: 1,
    currentApprovals: 0,
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
    createdAt: new Date(Date.now() - 4 * 3600000).toISOString()
  }
];

export const ApprovalQueueView: React.FC<ApprovalQueueViewProps> = ({
  requests = DEFAULT_REQUESTS,
  onApprove,
  onReject
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [confirmModal, setConfirmModal] = useState<{ type: 'APPROVE' | 'REJECT'; item: ApprovalRequestItem } | null>(null);
  const [commentInput, setCommentInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const filteredRequests = requests.filter(r => {
    if (activeTab === 'ALL') return true;
    return r.status === activeTab;
  });

  const getSeverityBadge = (sev: ApprovalRequestItem['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">CRITICAL</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">MEDIUM</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">LOW</span>;
    }
  };

  const getEnvBadge = (env: ApprovalRequestItem['environment']) => {
    switch (env) {
      case 'production':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">PROD</span>;
      case 'staging':
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">STAGING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">DEV</span>;
    }
  };

  const handleAction = async () => {
    if (!confirmModal) return;
    try {
      setIsSubmitting(true);
      if (confirmModal.type === 'APPROVE' && onApprove) {
        await onApprove(confirmModal.item.id, commentInput);
      } else if (confirmModal.type === 'REJECT' && onReject) {
        await onReject(confirmModal.item.id, commentInput);
      }
      setConfirmModal(null);
      setCommentInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Enterprise Approval Queue</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Human-in-the-loop review for production repairs, policy overrides, and security operations.
          </p>
        </div>

        <div className="flex p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === tab
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400 text-sm">
            No approval requests found in <span className="font-semibold text-slate-300">{activeTab}</span> queue.
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div
              key={req.id}
              className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getSeverityBadge(req.severity)}
                    {getEnvBadge(req.environment)}
                    <span className="font-mono text-xs text-indigo-400">{req.id}</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{req.title}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{req.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {req.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => setConfirmModal({ type: 'APPROVE', item: req })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => setConfirmModal({ type: 'REJECT', item: req })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 text-xs font-semibold border border-slate-700 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                  {req.status === 'APPROVED' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      APPROVED
                    </span>
                  )}
                  {req.status === 'REJECTED' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <XCircle className="w-3.5 h-3.5" />
                      REJECTED
                    </span>
                  )}
                </div>
              </div>

              {/* Progress & Meta Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    Requester: <span className="text-slate-300 font-medium">{req.requesterEmail}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    Expires: <span className="text-slate-300">{new Date(req.expiresAt).toLocaleDateString()}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Reviewers Required:</span>
                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-white text-xs font-bold">
                    {req.currentApprovals} / {req.requiredApprovals}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmation Dialog Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-2">
              {confirmModal.type === 'APPROVE' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              )}
              <h3 className="text-lg font-bold text-white">
                {confirmModal.type === 'APPROVE' ? 'Confirm Approval' : 'Reject Request'}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {confirmModal.type === 'APPROVE'
                ? `You are signing off on "${confirmModal.item.title}". Anti-self-approval and RBAC policies will be strictly enforced.`
                : `Are you sure you want to reject "${confirmModal.item.title}"?`}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">
                {confirmModal.type === 'APPROVE' ? 'Review Comments (Optional)' : 'Rejection Reason'}
              </label>
              <textarea
                rows={3}
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder={confirmModal.type === 'APPROVE' ? 'e.g. Sandbox tests pass cleanly' : 'e.g. Needs additional security review'}
                className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={isSubmitting}
                className={`px-4 py-2 rounded-lg text-white text-xs font-bold shadow ${
                  confirmModal.type === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {isSubmitting ? 'Submitting...' : confirmModal.type === 'APPROVE' ? 'Confirm & Sign Off' : 'Reject Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
