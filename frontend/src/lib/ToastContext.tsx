'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  toast: {
    success: (title: string, message?: string) => string;
    error: (title: string, message?: string) => string;
    info: (title: string, message?: string) => string;
    warning: (title: string, message?: string) => string;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<Toast, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newToast: Toast = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const toastHelpers = {
    success: (title: string, message?: string) => showToast({ type: 'success', title, message }),
    error: (title: string, message?: string) => showToast({ type: 'error', title, message }),
    info: (title: string, message?: string) => showToast({ type: 'info', title, message }),
    warning: (title: string, message?: string) => showToast({ type: 'warning', title, message })
  };

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast, toast: toastHelpers }}>
      {children}

      {/* Floating Toast Notification Container */}
      <aside
        aria-live="polite"
        aria-label="Notification alerts"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          const isWarning = t.type === 'warning';

          const borderCol = isSuccess
            ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100 shadow-emerald-500/10'
            : isError
            ? 'border-red-500/40 bg-red-950/90 text-red-100 shadow-red-500/10'
            : isWarning
            ? 'border-amber-500/40 bg-amber-950/90 text-amber-100 shadow-amber-500/10'
            : 'border-indigo-500/40 bg-indigo-950/90 text-indigo-100 shadow-indigo-500/10';

          const IconComponent = isSuccess
            ? CheckCircle2
            : isError
            ? AlertCircle
            : isWarning
            ? AlertTriangle
            : Info;

          const iconCol = isSuccess
            ? 'text-emerald-400'
            : isError
            ? 'text-red-400'
            : isWarning
            ? 'text-amber-400'
            : 'text-indigo-400';

          return (
            <div
              key={t.id}
              role="alert"
              className={`pointer-events-auto p-3.5 rounded-xl border ${borderCol} shadow-2xl backdrop-blur-xl flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-3 duration-200 font-sans`}
            >
              <IconComponent className={`w-4 h-4 ${iconCol} shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-white tracking-tight">{t.title}</h4>
                {t.message && <p className="text-[11px] text-gray-300 mt-0.5 leading-relaxed">{t.message}</p>}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-gray-400 hover:text-white transition-all p-0.5 rounded-md hover:bg-white/10"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      toasts: [],
      showToast: () => '',
      dismissToast: () => {},
      toast: {
        success: (title: string) => { console.log('[Toast Success]', title); return ''; },
        error: (title: string) => { console.error('[Toast Error]', title); return ''; },
        info: (title: string) => { console.log('[Toast Info]', title); return ''; },
        warning: (title: string) => { console.warn('[Toast Warning]', title); return ''; }
      }
    };
  }
  return context;
}
