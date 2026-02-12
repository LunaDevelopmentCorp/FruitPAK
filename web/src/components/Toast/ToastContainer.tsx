/**
 * Toast Container Component
 *
 * Container for displaying multiple toast notifications.
 */

import React from 'react';
import { createPortal } from 'react-dom';
import Toast, { ToastProps } from './Toast';

interface ToastContainerProps {
  toasts: Omit<ToastProps, 'onClose'>[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onClose,
  position = 'top-right',
}) => {
  const getPositionStyles = () => {
    const baseStyles = 'fixed z-[9999] flex flex-col pointer-events-none';

    switch (position) {
      case 'top-right':
        return `${baseStyles} top-4 right-4`;
      case 'top-left':
        return `${baseStyles} top-4 left-4`;
      case 'bottom-right':
        return `${baseStyles} bottom-4 right-4`;
      case 'bottom-left':
        return `${baseStyles} bottom-4 left-4`;
      case 'top-center':
        return `${baseStyles} top-4 left-1/2 -translate-x-1/2`;
      case 'bottom-center':
        return `${baseStyles} bottom-4 left-1/2 -translate-x-1/2`;
    }
  };

  if (toasts.length === 0) return null;

  return createPortal(
    <div className={getPositionStyles()}>
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast {...toast} onClose={onClose} />
        </div>
      ))}
    </div>,
    document.body
  );
};

export default ToastContainer;
