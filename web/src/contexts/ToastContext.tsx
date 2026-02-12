/**
 * Toast Context
 *
 * Provides toast notification functionality throughout the app.
 */

import React, { createContext, useState, useCallback } from 'react';
import ToastContainer from '../components/Toast/ToastContainer';
import type { ToastProps } from '../components/Toast/Toast';
import type { ShowToastOptions, ToastAPI } from '../hooks/useToast';

export const ToastContext = createContext<ToastAPI | null>(null);

interface ToastProviderProps {
  children: React.ReactNode;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
  children,
  position = 'top-right',
}) => {
  const [toasts, setToasts] = useState<Omit<ToastProps, 'onClose'>[]>([]);

  const show = useCallback((options: ShowToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const toast: Omit<ToastProps, 'onClose'> = {
      id,
      type: options.type || 'info',
      message: options.message,
      description: options.description,
      duration: options.duration ?? 5000,
    };

    setToasts((prev) => [...prev, toast]);
    return id;
  }, []);

  const success = useCallback((message: string, description?: string, duration?: number): string => {
    return show({ type: 'success', message, description, duration });
  }, [show]);

  const error = useCallback((message: string, description?: string, duration?: number): string => {
    return show({ type: 'error', message, description, duration });
  }, [show]);

  const warning = useCallback((message: string, description?: string, duration?: number): string => {
    return show({ type: 'warning', message, description, duration });
  }, [show]);

  const info = useCallback((message: string, description?: string, duration?: number): string => {
    return show({ type: 'info', message, description, duration });
  }, [show]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const handleClose = useCallback((id: string) => {
    dismiss(id);
  }, [dismiss]);

  const value: ToastAPI = {
    show,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={handleClose} position={position} />
    </ToastContext.Provider>
  );
};
