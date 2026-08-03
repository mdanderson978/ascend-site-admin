import { useEffect } from 'react';
import { CloseIcon } from './Icons';

export interface ToastMessage { id: number; message: string; kind: 'success' | 'error' | 'info' }

export function Toast({ toast, dismiss }: { toast: ToastMessage; dismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 8000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);
  return <div className={`toast toast--${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}><span>{toast.message}</span><button onClick={() => dismiss(toast.id)} aria-label="Dismiss notification"><CloseIcon /></button></div>;
}

export function ToastRegion({ toasts, dismiss }: { toasts: ToastMessage[]; dismiss: (id: number) => void }) {
  return <div className="toast-region" aria-live="polite">{toasts.map(toast => <Toast key={toast.id} toast={toast} dismiss={dismiss} />)}</div>;
}
