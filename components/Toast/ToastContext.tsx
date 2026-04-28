import { createContext, useContext, useCallback, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (
    message: string,
    variant?: ToastVariant,
    duration?: number
  ) => void;
  removeToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = 'info', duration = 4000) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
