'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/authContext';
import { Shield, Lock, Mail, User, Phone, ArrowRight, Sparkles, Hash } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  // Generated user ID preview
  const nameSlug = (name || 'dev').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 10) || 'user';
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const phoneSuffix = cleanPhone.length >= 4 ? cleanPhone.slice(-4) : (cleanPhone || '0000');
  const previewUserId = `usr_${nameSlug}_${phoneSuffix}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    const success = await register(email, password, name, phone);
    setIsLoading(false);
    if (success) {
      router.push('/dashboard');
    } else {
      setError('Account creation encountered an issue. Please verify information or use another email/phone.');
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background Grid */}
      <div className="pointer-events-none absolute inset-0 grid-field" aria-hidden />

      <div className="w-full max-w-md p-8 rounded-2xl border border-panelBorder bg-panel/80 shadow-2xl backdrop-blur-xl z-10 space-y-5">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Create APIFIX Account</h1>
            <p className="text-xs text-gray-400 font-mono">Autonomous Reliability Control Plane</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-mono text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs font-mono">
          <div>
            <label className="block text-gray-300 mb-1 font-medium">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                placeholder="Alex Mercer"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-1 font-medium">Phone Number</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                placeholder="+1 (555) 234-5678"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-1 font-medium">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-panelBorder bg-bg text-white focus:outline-none focus:border-indigo-500 transition-all placeholder:text-gray-600"
                placeholder="alex@apifix.dev"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 mb-1 font-medium">Password</label>
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

          {/* User ID Preview Tag */}
          <div className="p-2.5 rounded-lg border border-indigo-500/20 bg-indigo-950/30 flex items-center justify-between text-gray-300">
            <div className="flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] text-gray-400">Assigned User ID:</span>
            </div>
            <span className="text-[11px] font-mono text-indigo-300 font-semibold">{previewUserId}_****</span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold font-sans text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 mt-4"
          >
            <span>{isLoading ? 'Creating Account...' : 'Register & Enter Dashboard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-400 font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
