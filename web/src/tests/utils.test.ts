/**
 * Utility function tests
 */

import { describe, it, expect } from 'vitest';

describe('Utility Functions', () => {
  it('should format currency correctly', () => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(999999.99)).toBe('$999,999.99');
  });

  it('should format dates correctly', () => {
    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    };

    const testDate = new Date('2026-02-12');
    expect(formatDate(testDate)).toMatch(/02\/12\/2026/);
  });

  it('should validate email addresses', () => {
    const isValidEmail = (email: string) => {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('should truncate long strings', () => {
    const truncate = (str: string, maxLength: number) => {
      if (str.length <= maxLength) return str;
      return str.slice(0, maxLength - 3) + '...';
    };

    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('This is a very long string', 10)).toBe('This is...');
    expect(truncate('Exactly ten', 11)).toBe('Exactly ten');
  });
});

describe('API Error Handling', () => {
  it('should handle API errors correctly', () => {
    const handleApiError = (error: any) => {
      if (error.response) {
        return {
          message: error.response.data.error?.message || 'An error occurred',
          code: error.response.status,
        };
      }
      return {
        message: 'Network error',
        code: 0,
      };
    };

    const mockError = {
      response: {
        status: 404,
        data: {
          error: {
            message: 'Resource not found',
          },
        },
      },
    };

    const result = handleApiError(mockError);
    expect(result.message).toBe('Resource not found');
    expect(result.code).toBe(404);
  });
});
