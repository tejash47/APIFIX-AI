'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/authContext';
import { Shield, Lock, UserCheck, ArrowRight, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const success = await login(identifier, password);
    setIsLoading(false);
    if (success) {
      router.push('/dashboard');
    } else {
      setError('Invalid credentials. Please verify your Email, Phone, Name or User ID and Password.');
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
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Sign In to APIFIX AI</h1>
            <p className="text-xs text-gray-400 font-mono">Autonomous Reliability Control Plane</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-mono text-red-300">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div>
            <label className="block text-gray-300 mb-1 font-medium">
              Email, Phone, Name, or User ID
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                placeholder="alex@apifix.dev / +1 555... / usr_alex_..."
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-gray-300 font-medium">Password</label>
              <Link 
                href="/forgot-password" 
                className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 font-mono"
              >
                <KeyRound className="w-3 h-3" />
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
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
            <span>{isLoading ? 'Signing In...' : 'Sign In to Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          Need a new account?{' '}
          <Link href="/register" className="text-indigo-400 font-semibold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
