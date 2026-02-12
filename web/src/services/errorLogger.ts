/**
 * Error Logging Service
 *
 * Centralized error logging to external services (Sentry, backend, etc.)
 */

import type { AppError } from '../utils/errorHandling';
import { api } from '../utils/api';

interface ErrorLogPayload {
  error: AppError;
  context?: any;
  userAgent: string;
  url: string;
  timestamp: string;
  userId?: string;
  sessionId?: string;
}

interface ErrorLoggerConfig {
  enabled: boolean;
  logToConsole: boolean;
  logToBackend: boolean;
  logToSentry: boolean;
  sentryDsn?: string;
  endpoint?: string;
}

class ErrorLogger {
  private config: ErrorLoggerConfig = {
    enabled: import.meta.env.PROD, // Only in production by default
    logToConsole: true,
    logToBackend: true,
    logToSentry: false,
    endpoint: '/api/logs/errors',
  };

  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeSentry();
  }

  /**
   * Configure error logger
   */
  configure(config: Partial<ErrorLoggerConfig>) {
    this.config = { ...this.config, ...config };

    if (this.config.logToSentry && this.config.sentryDsn) {
      this.initializeSentry();
    }
  }

  /**
   * Log an error
   */
  async log(error: AppError, context?: any): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const payload = this.createPayload(error, context);

    // Log to console
    if (this.config.logToConsole) {
      this.logToConsole(payload);
    }

    // Log to backend
    if (this.config.logToBackend) {
      await this.logToBackend(payload);
    }

    // Log to Sentry
    if (this.config.logToSentry) {
      this.logToSentry(payload);
    }
  }

  /**
   * Log critical errors (always logged regardless of config)
   */
  async logCritical(error: AppError, context?: any): Promise<void> {
    const payload = this.createPayload(error, { ...context, severity: 'critical' });

    // Always log critical errors
    this.logToConsole(payload);

    try {
      await this.logToBackend(payload);
      this.logToSentry(payload);
    } catch (err) {
      console.error('Failed to log critical error:', err);
    }
  }

  /**
   * Create error log payload
   */
  private createPayload(error: AppError, context?: any): ErrorLogPayload {
    return {
      error,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      userId: this.getUserId(),
      sessionId: this.sessionId,
    };
  }

  /**
   * Log to console
   */
  private logToConsole(payload: ErrorLogPayload): void {
    const { error, context } = payload;

    console.group(`🔴 [Error Logged] ${error.type}`);
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Details:', error.details);
    console.error('Context:', context);
    console.error('URL:', payload.url);
    console.error('Timestamp:', payload.timestamp);
    console.groupEnd();
  }

  /**
   * Log to backend
   */
  private async logToBackend(payload: ErrorLogPayload): Promise<void> {
    if (!this.config.endpoint) {
      return;
    }

    try {
      await api.post(this.config.endpoint, payload, {
        // Don't retry for logging errors
        timeout: 5000,
      });
    } catch (err) {
      // Don't throw - logging should never break the app
      if (this.config.logToConsole) {
        console.warn('Failed to log error to backend:', err);
      }
    }
  }

  /**
   * Log to Sentry
   */
  private logToSentry(payload: ErrorLogPayload): void {
    // Sentry integration would go here
    // Example with @sentry/react:
    /*
    import * as Sentry from '@sentry/react';

    Sentry.captureException(new Error(payload.error.message), {
      level: this.getSentryLevel(payload.error.type),
      tags: {
        errorType: payload.error.type,
        errorCode: payload.error.code?.toString(),
      },
      extra: {
        details: payload.error.details,
        context: payload.context,
        url: payload.url,
        sessionId: payload.sessionId,
      },
      user: {
        id: payload.userId,
      },
    });
    */

    if (this.config.logToConsole) {
      console.log('[Sentry] Would log error:', payload.error.type);
    }
  }

  /**
   * Initialize Sentry
   */
  private initializeSentry(): void {
    if (!this.config.logToSentry || !this.config.sentryDsn) {
      return;
    }

    // Sentry initialization would go here
    // Example with @sentry/react:
    /*
    import * as Sentry from '@sentry/react';

    Sentry.init({
      dsn: this.config.sentryDsn,
      environment: import.meta.env.MODE,
      integrations: [
        new Sentry.BrowserTracing(),
        new Sentry.Replay({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
    */

    if (this.config.logToConsole) {
      console.log('[Sentry] Initialized');
    }
  }

  /**
   * Get Sentry severity level
   */
  private getSentryLevel(errorType: string): 'error' | 'warning' | 'info' {
    switch (errorType) {
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
        return 'error';
      case 'VALIDATION_ERROR':
      case 'NOT_FOUND_ERROR':
        return 'warning';
      default:
        return 'info';
    }
  }

  /**
   * Get current user ID from localStorage/auth
   */
  private getUserId(): string | undefined {
    try {
      // Try to get user ID from token or localStorage
      const token = localStorage.getItem('access_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub || payload.user_id;
      }
    } catch (err) {
      // Ignore errors
    }
    return undefined;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track page view (for context in errors)
   */
  trackPageView(pageName: string): void {
    if (!this.config.enabled) {
      return;
    }

    // Could integrate with analytics here
    if (this.config.logToConsole) {
      console.log('[PageView]', pageName);
    }
  }

  /**
   * Set user context
   */
  setUserContext(userId: string, email?: string, name?: string): void {
    if (!this.config.enabled) {
      return;
    }

    // Sentry user context
    /*
    import * as Sentry from '@sentry/react';
    Sentry.setUser({ id: userId, email, username: name });
    */

    if (this.config.logToConsole) {
      console.log('[UserContext]', { userId, email, name });
    }
  }

  /**
   * Clear user context (on logout)
   */
  clearUserContext(): void {
    if (!this.config.enabled) {
      return;
    }

    // Sentry clear user
    /*
    import * as Sentry from '@sentry/react';
    Sentry.setUser(null);
    */

    if (this.config.logToConsole) {
      console.log('[UserContext] Cleared');
    }
  }
}

// Export singleton instance
export const errorLogger = new ErrorLogger();

// Export for testing
export { ErrorLogger };
