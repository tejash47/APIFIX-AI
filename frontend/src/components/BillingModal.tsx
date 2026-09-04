'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/authContext';
import {
  fetchWorkspaceBilling,
  fetchBillingPlans,
  fetchCreditLedger,
  createCheckoutSession,
  createBillingPortalSession
} from '../lib/api';
import {
  X,
  CreditCard,
  Zap,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Coins,
  ArrowUpRight,
  RefreshCw,
  History,
  Layers,
  Sparkles,
  Lock
} from 'lucide-react';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onCreditsUpdated?: (newCredits: number) => void;
}

export default function BillingModal({
  isOpen,
  onClose,
  workspaceId,
  onCreditsUpdated
}: BillingModalProps) {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'plans' | 'credits' | 'ledger'>('plans');
  const [billing, setBilling] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [creditPacks, setCreditPacks] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadBillingData();
    }
  }, [isOpen, workspaceId]);

  async function loadBillingData() {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [billingRes, plansRes, ledgerRes] = await Promise.all([
        fetchWorkspaceBilling(workspaceId, token).catch(() => null),
        fetchBillingPlans(workspaceId, token).catch(() => null),
        fetchCreditLedger(workspaceId, { limit: 20 }, token).catch(() => null)
      ]);

      if (billingRes?.billing) {
        setBilling(billingRes.billing);
        if (onCreditsUpdated && typeof billingRes.billing.credits === 'number') {
          onCreditsUpdated(billingRes.billing.credits);
        }
      }
      if (plansRes?.plans) setPlans(plansRes.plans);
      if (plansRes?.creditPacks) setCreditPacks(plansRes.creditPacks);
      if (ledgerRes?.items) setLedger(ledgerRes.items);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load billing details.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePlanCheckout(planId: string) {
    if (billing?.plan === planId) return;
    setIsProcessing(`plan_${planId}`);
    setErrorMsg(null);
    try {
      const res = await createCheckoutSession(
        workspaceId,
        {
          planId,
          successUrl: `${window.location.origin}/dashboard?billing=success`,
          cancelUrl: `${window.location.origin}/dashboard?billing=cancel`
        },
        token
      );
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to start Stripe checkout.');
      setIsProcessing(null);
    }
  }

  async function handleCreditPackCheckout(packId: string) {
    setIsProcessing(`pack_${packId}`);
    setErrorMsg(null);
    try {
      const res = await createCheckoutSession(
        workspaceId,
        {
          creditPackId: packId,
          successUrl: `${window.location.origin}/dashboard?billing=credits_success`,
          cancelUrl: `${window.location.origin}/dashboard?billing=cancel`
        },
        token
      );
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to purchase credit pack.');
      setIsProcessing(null);
    }
  }

  async function handleOpenPortal() {
    setIsProcessing('portal');
    setErrorMsg(null);
    try {
      const res = await createBillingPortalSession(
        workspaceId,
        { returnUrl: `${window.location.origin}/dashboard` },
        token
      );
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to open Stripe billing portal.');
      setIsProcessing(null);
    }
  }

  if (!isOpen) return null;

  const currentPlanId = billing?.plan || 'free';
  const currentCredits = billing?.credits ?? 10;
  const subscriptionStatus = billing?.subscriptionStatus || 'active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
                Workspace Billing & Credits
                <span className="text-xs px-2 py-0.5 rounded-full uppercase font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {billing?.planName || currentPlanId}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage your subscription, repair credits, and payment invoices
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status / Overview Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-950/40 border-b border-slate-800/80">
          {/* Credit Balance */}
          <div className="p-4 rounded-xl bg-slate-850 border border-slate-700/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                Available Credits
              </span>
              <button
                onClick={loadBillingData}
                disabled={isLoading}
                title="Refresh Balance"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-amber-300">
                {currentCredits}
              </span>
              <span className="text-xs text-slate-400">repair credits</span>
            </div>
            <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (currentCredits / 100) * 100)}%` }}
              />
            </div>
          </div>

          {/* Current Tier */}
          <div className="p-4 rounded-xl bg-slate-850 border border-slate-700/50 flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              Active Plan
            </span>
            <div className="mt-2">
              <div className="text-xl font-bold text-white capitalize">
                {billing?.planName || currentPlanId} Plan
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${subscriptionStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                Status: <span className="uppercase font-mono text-emerald-400">{subscriptionStatus}</span>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Max {billing?.maxConcurrentRepairs || 1} concurrent AI sandboxes
            </div>
          </div>

          {/* Customer Portal Action */}
          <div className="p-4 rounded-xl bg-slate-850 border border-slate-700/50 flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Stripe Customer Portal
            </span>
            <p className="text-xs text-slate-400 mt-1">
              Manage payment methods, invoices, and billing contact details.
            </p>
            <button
              onClick={handleOpenPortal}
              disabled={isProcessing === 'portal' || !billing?.stripeCustomerId}
              className="mt-3 w-full py-1.5 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600/50 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isProcessing === 'portal' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  Manage Billing
                  <ExternalLink className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900/80">
          <button
            onClick={() => setActiveTab('plans')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'plans'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Subscription Tiers
          </button>
          <button
            onClick={() => setActiveTab('credits')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'credits'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            Credit Top-Up Packs
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'ledger'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Credit Audit History
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'plans' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plans.map((p) => {
                const isCurrent = currentPlanId === p.id;
                const isPro = p.id === 'pro';
                const isEnterprise = p.id === 'enterprise';

                return (
                  <div
                    key={p.id}
                    className={`relative p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                      isCurrent
                        ? 'bg-indigo-950/20 border-indigo-500/50 ring-1 ring-indigo-500/30'
                        : isPro
                        ? 'bg-slate-850/80 border-slate-700 hover:border-slate-600'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    {isPro && !isCurrent && (
                      <div className="absolute -top-2.5 right-4 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 text-white uppercase tracking-wider shadow">
                        Recommended
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-base text-white">{p.name}</h3>
                        {isCurrent && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Current Plan
                          </span>
                        )}
                      </div>

                      <div className="my-3 flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono text-white">
                          ${p.priceMonthly}
                        </span>
                        <span className="text-xs text-slate-400">/ month</span>
                      </div>

                      <p className="text-xs text-slate-400 mb-4">
                        Includes {p.monthlyCredits} repair credits per month and up to {p.maxConcurrentRepairs} concurrent sandboxes.
                      </p>

                      <ul className="space-y-2 mb-6 text-xs text-slate-300">
                        {p.features?.map((f: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <button
                      onClick={() => handlePlanCheckout(p.id)}
                      disabled={isCurrent || isProcessing !== null}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        isCurrent
                          ? 'bg-slate-800 text-slate-400 cursor-default border border-slate-700/50'
                          : isPro
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/20'
                          : isEnterprise
                          ? 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {isProcessing === `plan_${p.id}` ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : isCurrent ? (
                        'Active Plan'
                      ) : p.priceMonthly === 0 ? (
                        'Downgrade to Free'
                      ) : (
                        <>
                          Upgrade to {p.name}
                          <ArrowUpRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'credits' && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-white">Pay-As-You-Go Credit Packs</h3>
                <p className="text-xs text-slate-400">
                  Instant credit replenishment without changing your monthly subscription tier.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {creditPacks.map((pack) => (
                  <div
                    key={pack.id}
                    className="p-5 rounded-2xl bg-slate-850 border border-slate-700 flex flex-col justify-between hover:border-amber-500/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-400 uppercase font-mono">
                          {pack.credits} Credits
                        </span>
                        <Coins className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="my-2 flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono text-white">
                          ${pack.price}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          (${(pack.price / pack.credits).toFixed(2)}/run)
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-4">
                        {pack.description}
                      </p>
                    </div>

                    <button
                      onClick={() => handleCreditPackCheckout(pack.id)}
                      disabled={isProcessing !== null}
                      className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center gap-2 transition-all"
                    >
                      {isProcessing === `pack_${pack.id}` ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          Purchase {pack.credits} Credits
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Credit Transaction Ledger</h3>
                  <p className="text-xs text-slate-400">
                    Immutable audit log of all credit grants, consumption, and refunds for this workspace.
                  </p>
                </div>
              </div>

              {ledger.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No credit transactions recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Type</th>
                        <th className="py-2.5 px-4 font-medium">Reason</th>
                        <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                        <th className="py-2.5 px-4 font-medium text-right">Balance After</th>
                        <th className="py-2.5 px-4 font-medium text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                      {ledger.map((item) => {
                        const isPos = item.amount > 0;
                        return (
                          <tr key={item.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] uppercase ${
                                  item.type === 'GRANT' || item.type === 'RENEWAL' || item.type === 'PURCHASE'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : item.type === 'REFUND'
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                    : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {item.type}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-300 max-w-[280px] truncate">
                              {item.reason || item.runId || 'Credit Modification'}
                            </td>
                            <td className={`py-2.5 px-4 text-right font-mono font-semibold ${isPos ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {isPos ? `+${item.amount}` : item.amount}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono text-slate-200">
                              {item.balanceAfter}
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-500 font-mono text-[11px]">
                              {new Date(item.createdAt).toLocaleDateString()}{' '}
                              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
