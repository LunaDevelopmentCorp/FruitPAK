/**
 * API Client with Axios Interceptors
 *
 * Configures Axios with request/response interceptors for:
 * - Authentication (JWT tokens)
 * - Error handling
 * - Request/response logging
 * - Retry logic
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

// Create Axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Request Interceptor ──────────────────────────────────────────

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Add authentication token if available
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Log request in development
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
      });
    }

    return config;
  },
  (error: AxiosError) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// ── Response Interceptor ─────────────────────────────────────────

api.interceptors.response.use(
  (response) => {
    // Log response in development
    if (import.meta.env.DEV) {
      console.log(`[API] Response ${response.status}:`, response.data);
    }

    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    // Log error
    console.error('[API] Response error:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data,
    });

    // Handle specific error cases
    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // Unauthorized - token expired or invalid
          handleUnauthorized(originalRequest);
          break;

        case 403:
          // Forbidden - insufficient permissions
          handleForbidden(data);
          break;

        case 404:
          // Not found
          handleNotFound(data);
          break;

        case 422:
          // Validation error
          handleValidationError(data);
          break;

        case 429:
          // Rate limit exceeded
          handleRateLimit(data);
          break;

        case 500:
        case 502:
        case 503:
        case 504:
          // Server errors
          handleServerError(status, data);
          break;

        default:
          handleGenericError(error);
      }
    } else if (error.request) {
      // Request made but no response received (network error)
      handleNetworkError();
    } else {
      // Error setting up the request
      console.error('[API] Request setup error:', error.message);
    }

    return Promise.reject(error);
  }
);

// ── Error Handlers ───────────────────────────────────────────────

function handleUnauthorized(originalRequest?: AxiosRequestConfig & { _retry?: boolean }) {
  // Clear tokens
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');

  // Try to refresh token
  const refreshToken = localStorage.getItem('refresh_token');
  if (refreshToken && originalRequest && !originalRequest._retry) {
    originalRequest._retry = true;

    // Attempt token refresh
    return api
      .post('/api/auth/refresh', { refresh_token: refreshToken })
      .then((response) => {
        const { access_token } = response.data;
        localStorage.setItem('access_token', access_token);

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }
        return api(originalRequest);
      })
      .catch(() => {
        // Refresh failed, redirect to login
        window.location.href = '/login?sessionExpired=true';
      });
  }

  // No refresh token, redirect to login
  window.location.href = '/login?sessionExpired=true';
}

function handleForbidden(data: any) {
  const message = data?.error?.message || 'You do not have permission to access this resource';

  // Show error notification
  showErrorNotification('Permission Denied', message);
}

function handleNotFound(data: any) {
  const message = data?.error?.message || 'The requested resource was not found';

  showErrorNotification('Not Found', message);
}

function handleValidationError(data: any) {
  const errors = data?.error?.details?.errors || [];

  if (errors.length > 0) {
    // Show first validation error
    const firstError = errors[0];
    showErrorNotification(
      'Validation Error',
      `${firstError.field}: ${firstError.message}`
    );
  } else {
    showErrorNotification('Validation Error', data?.error?.message || 'Invalid input');
  }
}

function handleRateLimit(data: any) {
  const message = data?.error?.message || 'Too many requests. Please try again later.';
  const retryAfter = data?.retry_after || 60;

  showErrorNotification(
    'Rate Limit Exceeded',
    `${message} (Retry after ${retryAfter} seconds)`
  );
}

function handleServerError(status: number, data: any) {
  const message =
    data?.error?.message || 'A server error occurred. Please try again later.';

  showErrorNotification(`Server Error (${status})`, message);

  // Log to error tracking service
  logError({
    type: 'ServerError',
    status,
    message,
    timestamp: new Date().toISOString(),
  });
}

function handleNetworkError() {
  showErrorNotification(
    'Network Error',
    'Unable to connect to the server. Please check your internet connection.'
  );
}

function handleGenericError(error: AxiosError) {
  showErrorNotification('Error', error.message || 'An unexpected error occurred');
}

// ── Utility Functions ────────────────────────────────────────────

function showErrorNotification(title: string, message: string) {
  // Integration with toast library (react-hot-toast, sonner, etc.)
  // For now, just console.error
  console.error(`[${title}] ${message}`);

  // Example with react-hot-toast:
  // import toast from 'react-hot-toast';
  // toast.error(message, { duration: 5000 });

  // Example with custom toast component:
  // window.dispatchEvent(new CustomEvent('show-toast', {
  //   detail: { type: 'error', title, message }
  // }));
}

function logError(error: any) {
  // Send to error logging service (Sentry, LogRocket, etc.)
  console.error('[Error Logged]', error);

  // Example: Send to backend
  /*
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(error),
  }).catch(console.error);
  */
}

// ── API Helper Functions ─────────────────────────────────────────

/**
 * Extract error message from API response
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    return data?.error?.message || data?.detail || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Check if error is a specific status code
 */
export function isErrorStatus(error: unknown, status: number): boolean {
  return axios.isAxiosError(error) && error.response?.status === status;
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error: unknown): boolean {
  return isErrorStatus(error, 422);
}

/**
 * Extract validation errors from API response
 */
export function getValidationErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error)) return {};

  const errors = error.response?.data?.error?.details?.errors || [];
  const errorMap: Record<string, string> = {};

  errors.forEach((err: any) => {
    errorMap[err.field] = err.message;
  });

  return errorMap;
}

export default api;
