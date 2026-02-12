/**
 * Error Integration Utilities
 *
 * Integrates error handling, toast notifications, and error logging.
 * Provides a unified way to handle errors across the application.
 */

import { parseError, getUserFriendlyMessage, type AppError } from './errorHandling';
import { errorLogger } from '../services/errorLogger';
import type { ToastAPI } from '../hooks/useToast';

interface HandleErrorOptions {
  toast?: ToastAPI;
  showToast?: boolean;
  logError?: boolean;
  customMessage?: string;
  context?: any;
  onError?: (error: AppError) => void;
}

/**
 * Centralized error handler
 *
 * Handles errors by:
 * 1. Parsing the error into structured format
 * 2. Logging to error service
 * 3. Showing toast notification to user
 * 4. Calling custom error handler if provided
 *
 * @example
 * ```typescript
 * try {
 *   await api.post('/api/growers', data);
 * } catch (error) {
 *   handleError(error, {
 *     toast,
 *     customMessage: 'Failed to create grower',
 *     context: { data }
 *   });
 * }
 * ```
 */
export function handleError(error: unknown, options: HandleErrorOptions = {}): AppError {
  const {
    toast,
    showToast = true,
    logError = true,
    customMessage,
    context,
    onError,
  } = options;

  // Parse error
  const appError = parseError(error);

  // Log error
  if (logError) {
    errorLogger.log(appError, context);
  }

  // Show toast notification
  if (showToast && toast) {
    const message = customMessage || getUserFriendlyMessage(error);
    const description = appError.details?.message || appError.details?.error;

    toast.error(message, description);
  }

  // Call custom error handler
  if (onError) {
    onError(appError);
  }

  return appError;
}

/**
 * Handle async operation with error handling
 *
 * Wraps an async function with automatic error handling.
 *
 * @example
 * ```typescript
 * const handleSubmit = async (data: FormData) => {
 *   await withErrorHandling(
 *     async () => {
 *       await api.post('/api/growers', data);
 *       toast.success('Grower created successfully');
 *     },
 *     {
 *       toast,
 *       customMessage: 'Failed to create grower',
 *       context: { data }
 *     }
 *   );
 * };
 * ```
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: HandleErrorOptions = {}
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, options);
    return null;
  }
}

/**
 * Handle validation errors
 *
 * Special handler for form validation errors that can extract
 * field-specific errors from the API response.
 */
export function handleValidationError(
  error: unknown,
  options: HandleErrorOptions & {
    setFieldErrors?: (errors: Record<string, string>) => void;
  } = {}
): AppError {
  const { setFieldErrors, ...baseOptions } = options;
  const appError = handleError(error, baseOptions);

  // Extract field errors for forms
  if (setFieldErrors && appError.details?.errors) {
    const fieldErrors: Record<string, string> = {};

    if (Array.isArray(appError.details.errors)) {
      // Handle array format: [{ field: "email", message: "Invalid email" }]
      appError.details.errors.forEach((err: any) => {
        if (err.field && err.message) {
          fieldErrors[err.field] = err.message;
        }
      });
    } else if (typeof appError.details.errors === 'object') {
      // Handle object format: { email: "Invalid email", password: "Too short" }
      Object.entries(appError.details.errors).forEach(([field, message]) => {
        fieldErrors[field] = String(message);
      });
    }

    setFieldErrors(fieldErrors);
  }

  return appError;
}

/**
 * Handle authentication errors
 *
 * Special handler for auth errors that redirects to login on 401.
 */
export function handleAuthError(
  error: unknown,
  options: HandleErrorOptions & {
    redirectToLogin?: boolean;
    loginUrl?: string;
  } = {}
): AppError {
  const { redirectToLogin = true, loginUrl = '/login', ...baseOptions } = options;
  const appError = handleError(error, baseOptions);

  // Redirect to login on authentication error
  if (redirectToLogin && appError.type === 'AUTHENTICATION_ERROR') {
    const currentUrl = window.location.pathname;
    window.location.href = `${loginUrl}?redirect=${encodeURIComponent(currentUrl)}&sessionExpired=true`;
  }

  return appError;
}

/**
 * Create error handler for specific context
 *
 * Factory function that creates a pre-configured error handler.
 *
 * @example
 * ```typescript
 * const handleGrowerError = createErrorHandler({
 *   toast,
 *   context: { module: 'growers' }
 * });
 *
 * try {
 *   await api.post('/api/growers', data);
 * } catch (error) {
 *   handleGrowerError(error, 'Failed to create grower');
 * }
 * ```
 */
export function createErrorHandler(defaultOptions: HandleErrorOptions) {
  return (error: unknown, customMessage?: string, additionalContext?: any): AppError => {
    return handleError(error, {
      ...defaultOptions,
      customMessage: customMessage || defaultOptions.customMessage,
      context: {
        ...defaultOptions.context,
        ...additionalContext,
      },
    });
  };
}

/**
 * Global unhandled error handler
 *
 * Catches unhandled errors and promise rejections.
 * Should be set up in App initialization.
 */
export function setupGlobalErrorHandlers(toast?: ToastAPI): void {
  // Unhandled errors
  window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error);
    errorLogger.logCritical(parseError(event.error), {
      type: 'unhandled_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });

    if (toast) {
      toast.error('An unexpected error occurred', 'Please refresh the page or contact support.');
    }
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    errorLogger.logCritical(parseError(event.reason), {
      type: 'unhandled_rejection',
    });

    if (toast) {
      toast.error('An unexpected error occurred', 'Please try again or contact support.');
    }
  });

  console.log('[ErrorHandling] Global error handlers initialized');
}
