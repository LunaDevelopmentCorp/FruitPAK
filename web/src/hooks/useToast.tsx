/**
 * useToast Hook
 *
 * React hook for showing toast notifications from any component.
 */

import { useContext } from 'react';
import { ToastContext } from '../contexts/ToastContext';
import type { ToastType } from '../components/Toast/Toast';

export interface ShowToastOptions {
  type?: ToastType;
  message: string;
  description?: string;
  duration?: number;
}

export interface ToastAPI {
  show: (options: ShowToastOptions) => string;
  success: (message: string, description?: string, duration?: number) => string;
  error: (message: string, description?: string, duration?: number) => string;
  warning: (message: string, description?: string, duration?: number) => string;
  info: (message: string, description?: string, duration?: number) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

export const useToast = (): ToastAPI => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
};
