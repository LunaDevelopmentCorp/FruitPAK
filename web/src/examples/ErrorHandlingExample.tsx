/**
 * Error Handling Usage Example
 *
 * Demonstrates how to use the error handling system throughout the app.
 */

import React, { useState } from 'react';
import { useToast } from '../hooks/useToast';
import { handleError, withErrorHandling, handleValidationError, handleAuthError } from '../utils/errorIntegration';
import { api } from '../utils/api';

const ErrorHandlingExample: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Example 1: Basic error handling
  const handleBasicError = async () => {
    setLoading(true);
    try {
      await api.get('/api/growers');
      toast.success('Growers loaded successfully');
    } catch (error) {
      handleError(error, {
        toast,
        customMessage: 'Failed to load growers',
        context: { action: 'load_growers' }
      });
    } finally {
      setLoading(false);
    }
  };

  // Example 2: Using withErrorHandling wrapper
  const handleWithWrapper = async () => {
    setLoading(true);
    await withErrorHandling(
      async () => {
        const response = await api.post('/api/growers', {
          name: 'Test Grower',
          code: 'GR001'
        });
        toast.success('Grower created successfully');
        return response.data;
      },
      {
        toast,
        customMessage: 'Failed to create grower',
        context: { action: 'create_grower' }
      }
    );
    setLoading(false);
  };

  // Example 3: Validation error handling with form
  const handleFormSubmit = async (data: any) => {
    setLoading(true);
    setFieldErrors({});

    try {
      await api.post('/api/growers', data);
      toast.success('Grower created successfully');
    } catch (error) {
      handleValidationError(error, {
        toast,
        customMessage: 'Please check your input',
        setFieldErrors,
        context: { action: 'submit_form', data }
      });
    } finally {
      setLoading(false);
    }
  };

  // Example 4: Auth error handling
  const handleProtectedAction = async () => {
    setLoading(true);
    try {
      await api.get('/api/protected-resource');
      toast.success('Resource loaded');
    } catch (error) {
      handleAuthError(error, {
        toast,
        redirectToLogin: true,
        context: { action: 'protected_action' }
      });
    } finally {
      setLoading(false);
    }
  };

  // Example 5: Manual toast notifications
  const showToasts = () => {
    toast.success('Operation completed', 'Everything went well!');

    setTimeout(() => {
      toast.error('Something went wrong', 'Please try again later');
    }, 1000);

    setTimeout(() => {
      toast.warning('Warning message', 'Please review your data');
    }, 2000);

    setTimeout(() => {
      toast.info('Information', 'This is an informational message');
    }, 3000);
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Error Handling Examples</h1>

      <div className="space-y-4">
        <button
          onClick={handleBasicError}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Example 1: Basic Error Handling
        </button>

        <button
          onClick={handleWithWrapper}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          Example 2: With Error Wrapper
        </button>

        <button
          onClick={() => handleFormSubmit({ name: '', code: '' })}
          disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          Example 3: Validation Errors
        </button>

        <button
          onClick={handleProtectedAction}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          Example 4: Auth Error Handling
        </button>

        <button
          onClick={showToasts}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
        >
          Example 5: Show All Toast Types
        </button>
      </div>

      {Object.keys(fieldErrors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <h3 className="font-medium text-red-900 mb-2">Validation Errors:</h3>
          <ul className="list-disc list-inside space-y-1">
            {Object.entries(fieldErrors).map(([field, message]) => (
              <li key={field} className="text-sm text-red-700">
                <strong>{field}:</strong> {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-gray-50 border rounded p-4 mt-8">
        <h3 className="font-medium mb-2">Usage Notes:</h3>
        <ul className="text-sm space-y-2 list-disc list-inside">
          <li>All API calls automatically have error handling via Axios interceptors</li>
          <li>Token refresh happens automatically on 401 errors</li>
          <li>Rate limit errors (429) show retry information</li>
          <li>Validation errors (422) extract field-specific errors</li>
          <li>Network errors trigger automatic retry with exponential backoff</li>
          <li>All errors are logged to the error service</li>
          <li>ErrorBoundary catches React component errors</li>
          <li>Global handlers catch unhandled errors and promise rejections</li>
        </ul>
      </div>
    </div>
  );
};

export default ErrorHandlingExample;
