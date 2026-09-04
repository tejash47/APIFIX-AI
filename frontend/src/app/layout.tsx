import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/authContext';
import { ToastProvider } from '../lib/ToastContext';

export const metadata: Metadata = {
  title: 'APIFIX AI — Autonomous API Reliability & Repair Platform',
  description: 'An autonomous AI reliability engineer that detects failures, traces root causes, generates safe patches, and verifies every repair.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-gray-100 font-sans antialiased selection:bg-indigo-500 selection:text-white min-h-screen">
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
