/**
 * Error Handling Utilities
 *
 * Reusable functions for consistent error handling across the app.
 */

import { AxiosError } from 'axios';

/**
 * Error types
 */
export enum ErrorType {
  NETWORK = 'NETWORK_ERROR',
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  SERVER = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN_ERROR',
}

/**
 * Structured error object
 */
export interface AppError {
  type: ErrorType;
  message: string;
  code?: number;
  details?: any;
  timestamp: string;
}

/**
 * Parse error into structured format
 */
export function parseError(error: unknown): AppError {
  const timestamp = new Date().toISOString();

  // Axios error
  if (error && typeof error === 'object' && 'isAxiosError' in error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data as any;

    switch (status) {
      case 401:
        return {
          type: ErrorType.AUTHENTICATION,
          message: data?.error?.message || 'Authentication failed',
          code: 401,
          details: data,
          timestamp,
        };

      case 403:
        return {
          type: ErrorType.AUTHORIZATION,
          message: data?.error?.message || 'Access denied',
          code: 403,
          details: data,
          timestamp,
        };

      case 404:
        return {
          type: ErrorType.NOT_FOUND,
          message: data?.error?.message || 'Resource not found',
          code: 404,
          details: data,
          timestamp,
        };

      case 422:
        return {
          type: ErrorType.VALIDATION,
          message: data?.error?.message || 'Validation failed',
          code: 422,
          details: data?.error?.details,
          timestamp,
        };

      case 500:
      case 502:
      case 503:
      case 504:
        return {
          type: ErrorType.SERVER,
          message: data?.error?.message || 'Server error occurred',
          code: status,
          details: data,
          timestamp,
        };

      default:
        if (!axiosError.response) {
          return {
            type: ErrorType.NETWORK,
            message: 'Network error. Please check your connection.',
            details: { originalError: axiosError.message },
            timestamp,
          };
        }

        return {
          type: ErrorType.UNKNOWN,
          message: data?.error?.message || axiosError.message,
          code: status,
          details: data,
          timestamp,
        };
    }
  }

  // Standard Error
  if (error instanceof Error) {
    return {
      type: ErrorType.UNKNOWN,
      message: error.message,
      details: { stack: error.stack },
      timestamp,
    };
  }

  // Unknown error
  return {
    type: ErrorType.UNKNOWN,
    message: 'An unexpected error occurred',
    details: { error },
    timestamp,
  };
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  const appError = parseError(error);

  const messages: Record<ErrorType, string> = {
    [ErrorType.NETWORK]: 'Unable to connect. Please check your internet connection.',
    [ErrorType.VALIDATION]: 'Please check your input and try again.',
    [ErrorType.AUTHENTICATION]: 'Please log in to continue.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to perform this action.',
    [ErrorType.NOT_FOUND]: 'The requested resource was not found.',
    [ErrorType.SERVER]: 'A server error occurred. Please try again later.',
    [ErrorType.UNKNOWN]: 'Something went wrong. Please try again.',
  };

  return appError.message || messages[appError.type];
}

/**
 * Check if error should trigger a retry
 */
export function shouldRetry(error: unknown, retryCount: number = 0): boolean {
  const maxRetries = 3;

  if (retryCount >= maxRetries) return false;

  const appError = parseError(error);

  // Retry on network errors and 5xx server errors
  return (
    appError.type === ErrorType.NETWORK ||
    (appError.type === ErrorType.SERVER && appError.code !== 501)
  );
}

/**
 * Get retry delay (exponential backoff)
 */
export function getRetryDelay(retryCount: number): number {
  const baseDelay = 1000; // 1 second
  return baseDelay * Math.pow(2, retryCount); // 1s, 2s, 4s, 8s...
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error, i)) {
        throw error;
      }

      const delay = getRetryDelay(i);
      console.log(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Log error to service
 */
export function logErrorToService(error: AppError, context?: any) {
  // Send to error logging service (Sentry, LogRocket, etc.)
  console.error('[Error Logged]', {
    ...error,
    context,
    userAgent: navigator.userAgent,
    url: window.location.href,
  });

  // Example: Send to backend
  /*
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...error,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
    }),
  }).catch(console.error);
  */

  // Example: Sentry integration
  /*
  import * as Sentry from '@sentry/react';
  Sentry.captureException(error, {
    extra: { context },
  });
  */
}

/**
 * Create error handler for async operations
 */
export function createErrorHandler(
  onError?: (error: AppError) => void
): (error: unknown) => void {
  return (error: unknown) => {
    const appError = parseError(error);
    logErrorToService(appError);

    if (onError) {
      onError(appError);
    }
  };
}
