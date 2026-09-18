'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield, Lock, KeyRound, ArrowRight, ArrowLeft, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userHint, setUserHint] = useState<{ name?: string; emailHint?: string; phoneHint?: string } | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Step 1: Initiate reset session
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data.success) {
        setResetCode(data.resetCode || '');
        setUserHint(data.user || null);
        setSuccessMsg('Reset code generated! Please enter your new password.');
        setStep(2);
      } else {
        setError(data.error || 'No registered account found matching that credential.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setError('Connection to server failed. Please check backend connection.');
    }
  };

  // Step 2: Verify & reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: resetCode, newPassword })
      });

      const data = await res.json();
      setIsLoading(false);

      if (res.ok && data.success) {
        setStep(3);
      } else {
        setError(data.error || 'Failed to reset password. Code may have expired.');
      }
    } catch (err: any) {
      setIsLoading(false);
      setError('Password reset failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background Grid Field */}
      <div className="pointer-events-none absolute inset-0 grid-field" aria-hidden />

      <div className="w-full max-w-md p-8 rounded-2xl border border-panelBorder bg-panel/80 shadow-2xl backdrop-blur-xl z-10 space-y-6">
        
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {step === 3 ? 'Password Updated' : 'Account Recovery'}
            </h1>
            <p className="text-xs text-gray-400 font-mono">
              {step === 1 && 'Enter your account details to reset password'}
              {step === 2 && 'Set a new secure password for your account'}
              {step === 3 && 'Your credentials have been securely updated'}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-mono text-red-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && step === 2 && (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-mono text-emerald-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 1: Request Reset */}
        {step === 1 && (
          <form onSubmit={handleRequestReset} className="space-y-4 text-xs font-mono">
            <div>
              <label className="block text-gray-300 mb-1 font-medium">
                Email, Phone Number, Name, or User ID
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600 font-mono"
                placeholder="alex@apifix.dev / +1 555... / usr_alex_..."
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold font-sans text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 mt-2"
            >
              <span>{isLoading ? 'Finding Account...' : 'Continue to Reset Session'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 2: Enter Code & New Password */}
        {step === 2 && (
          <form onSubmit={handleResetPassword} className="space-y-4 text-xs font-mono">
            {userHint && (
              <div className="p-3 rounded-lg border border-panelBorder bg-bg/60 text-gray-300 text-[11px] space-y-1">
                <div className="text-gray-400">Account Found:</div>
                <div className="font-semibold text-white">{userHint.name || 'User'}</div>
                {userHint.emailHint && <div>Email: <span className="text-indigo-300">{userHint.emailHint}</span></div>}
                {userHint.phoneHint && <div>Phone ending in: <span className="text-indigo-300">...{userHint.phoneHint}</span></div>}
              </div>
            )}

            <div>
              <label className="block text-gray-300 mb-1 font-medium">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                value={resetCode}
                onChange={e => setResetCode(e.target.value)}
                required
                maxLength={6}
                className="w-full px-3.5 py-2.5 rounded-lg border border-panelBorder bg-bg text-center text-lg tracking-widest text-indigo-300 font-mono focus:outline-none focus:border-indigo-500 transition-all"
                placeholder="123456"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-1 font-medium">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-gray-300 mb-1 font-medium">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold font-sans text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 mt-2"
            >
              <span>{isLoading ? 'Updating Password...' : 'Save New Password'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* STEP 3: Success Confirmation */}
        {step === 3 && (
          <div className="text-center space-y-4 py-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Password Reset Complete</h3>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                Your password has been securely updated. You can now sign in with your new credentials.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold font-sans text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
            >
              <span>Go to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Footer Back to Login */}
        <div className="pt-2 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>

      </div>
    </div>
  );
}
