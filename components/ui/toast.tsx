'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

export type ToastTone = 'default' | 'success' | 'error';

interface ToastApi {
  show(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_MS = 2600;

/** Shows one short message at a time under the header; a new one replaces the current one. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, tone: ToastTone = 'default') => {
    window.clearTimeout(timerRef.current);
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message, tone }));
    timerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* The live region stays in the DOM so screen readers announce each new message. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed top-20 left-1/2 z-[60] -translate-x-1/2"
      >
        {toast && (
          <div
            key={toast.id}
            className={cn(
              'flex w-max max-w-[calc(100vw-32px)] items-center gap-2 rounded-full border border-line bg-surface-3 px-4 py-2.5 text-[14px] font-medium shadow-pop',
              'transition-[opacity,translate] duration-200 ease-out starting:-translate-y-2 starting:opacity-0',
              toast.tone === 'error' ? 'text-danger' : 'text-fg',
            )}
          >
            {toast.tone === 'success' && <Check aria-hidden="true" className="size-4 shrink-0 text-accent" />}
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
