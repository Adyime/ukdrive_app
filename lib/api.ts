/**
 * Base API Client
 * Handles all HTTP requests to the server
 * 
 * Features:
 * - Automatic token refresh on SESSION_EXPIRED
 * - Single flight queue to prevent concurrent refresh attempts
 * - Error classification (auth errors vs server errors)
 * - Event-based logout on auth failures
 */

import { dispatchUnauthorized, dispatchTokenRefreshed } from './events';
import { refreshTokens } from './api/token-refresh';
import { getTokens, saveTokens } from './storage';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Log API URL in development
if (__DEV__) {
  console.log('API Base URL:', API_BASE_URL);
}

// ============================================
// Single Flight Queue for Token Refresh
// ============================================
// These variables are at module level to ensure all concurrent
// requests share the same refresh promise. If 5 API calls fail
// simultaneously with expired token, they all await the SAME
// refresh promise instead of triggering 5 separate refresh attempts.

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// Queue of pending requests waiting for refresh to complete
type PendingRequest = {
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
};
let pendingRequests: PendingRequest[] = [];

/**
 * Process pending requests after refresh completes
 */
function processPendingRequests(newAccessToken: string | null, error: Error | null): void {
  const requests = [...pendingRequests]; // Copy array before clearing
  pendingRequests = [];
  
  requests.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(newAccessToken);
    }
  });
}

// ============================================
// Types
// ============================================

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  timestamp?: string;
  path?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
    [key: string]: unknown;
  };
}

const EXPECTED_NON_CRITICAL_ERROR_CODES = new Set([
  'RIDE_NOT_YOURS',
  'RIDE_NOT_FOUND',
  'RIDE_EXPIRED',
  'RIDE_ALREADY_ACCEPTED',
  'RIDE_ALREADY_CANCELLED',
  'RIDE_NOT_ASSIGNED_TO_YOU',
  'PORTER_SERVICE_NOT_YOURS',
  'PORTER_SERVICE_NOT_FOUND',
  'PORTER_SERVICE_ALREADY_ACCEPTED',
  'FORBIDDEN',
]);

function isExpectedNonCriticalClientError(
  status: number,
  code: unknown
): boolean {
  if (typeof code !== 'string') return false;
  if (![403, 404, 409].includes(status)) return false;
  return EXPECTED_NON_CRITICAL_ERROR_CODES.has(code.toUpperCase());
}

/**
 * Normalize API errors and map specific codes to user-friendly messages.
 */
function normalizeError(
  error: ApiError | undefined,
  fallbackMessage: string
): ApiError {
  const base: ApiError =
    error ?? {
      code: "API_ERROR",
      message: fallbackMessage,
    };

  if (base.code === "CITY_SERVICE_UNAVAILABLE") {
    // Use the server's specific message (e.g. "Your pickup location is outside our service area.")
    // Only fall back to a generic message if the server didn't provide one
    if (!base.message || base.message === "CITY_SERVICE_UNAVAILABLE") {
      return {
        ...base,
        message: "Service is not available in your area.",
      };
    }
    return base;
  }

  if (base.code === "INVALID_OTP") {
    return { ...base, message: "Invalid OTP. Please try again." };
  }
  if (base.code === "OTP_EXPIRED") {
    return { ...base, message: "OTP has expired. Please request a new one." };
  }
  if (base.code === "OTP_MAX_ATTEMPTS") {
    return { ...base, message: "Too many attempts. Please request a new OTP." };
  }

  return base;
}

// ============================================
// Token Management
// ============================================

/**
 * Get stored access token
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const tokens = await getTokens();
    return tokens?.accessToken || null;
  } catch {
    return null;
  }
}

/**
 * Attempt to refresh tokens using the refresh token
 * Uses single flight queue to prevent concurrent refresh attempts
 * 
 * @returns New access token on success, null on failure
 */
async function attemptTokenRefresh(): Promise<string | null> {
  // CRITICAL: Check if refresh is already in progress FIRST
  // If yes, wait for the existing promise
  // We check BOTH conditions to ensure we have a valid promise to wait for
  if (isRefreshing && refreshPromise !== null) {
    if (__DEV__) {
      console.log('[API] Refresh already in progress, waiting for existing promise...');
    }
    try {
      const result = await refreshPromise;
      return result;
    } catch (error) {
      // If the refresh promise rejects, return null
      if (__DEV__) {
        console.warn('[API] Refresh promise rejected:', error);
      }
      return null;
    }
  }

  // Start new refresh - set flag and create promise atomically
  // This prevents race conditions where multiple calls pass the check
  isRefreshing = true;

  // Create the refresh promise immediately and assign it
  // This ensures that any concurrent calls will see refreshPromise !== null
  refreshPromise = (async (): Promise<string | null> => {
    try {
      const storedTokens = await getTokens();
      
      if (!storedTokens?.refreshToken) {
        if (__DEV__) {
          console.warn('[API] No refresh token available');
        }
        return null;
      }

      if (__DEV__) {
        console.log('[API] Attempting token refresh...');
      }

      const result = await refreshTokens(storedTokens.refreshToken);
      
      if (result.success && result.data) {
        // Save new tokens (token rotation: old refresh token is replaced)
        await saveTokens(
          result.data.accessToken,
          result.data.refreshToken,
          storedTokens.userType,
          storedTokens.userId,
          storedTokens.userProfile
        );

        if (__DEV__) {
          console.log('[API] Token refresh successful');
        }

        // Dispatch event to notify auth context that tokens were refreshed
        // This allows auth context to fetch user profile if it's missing
        dispatchTokenRefreshed();

        return result.data.accessToken;
      }

      // Refresh failed - classify the error
      const status = result.error?.status;
      const errorCode = result.error?.code;
      
      if (__DEV__) {
        console.warn('[API] Token refresh failed:', {
          status,
          code: errorCode,
          message: result.error?.message,
        });
      }

      // Error classification:
      // - 401/403: Auth error (token invalid/expired) -> logout
      // - 500/503/network: Server error -> don't logout, show connection error
      if (status === 401 || status === 403) {
        // Security issue - dispatch unauthorized event to trigger logout
        // This is debounced in events.ts to prevent multiple dispatches
        if (__DEV__) {
          console.warn('[API] Auth error during refresh - dispatching unauthorized event');
        }
        dispatchUnauthorized();
      }
      // For server errors (500, 503) or network errors (no status), we don't logout
      // The user might just be in a tunnel or the server had a hiccup

      return null;
    } catch (error) {
      if (__DEV__) {
        console.error('[API] Token refresh error:', error);
      }
      return null;
    } finally {
      // Clear refresh state
      isRefreshing = false;
    }
  })();

  try {
    const newAccessToken = await refreshPromise;
    
    // Process any pending requests that were waiting for refresh
    processPendingRequests(newAccessToken, null);

    return newAccessToken;
  } catch (error) {
    // Process pending requests with error
    processPendingRequests(null, error instanceof Error ? error : new Error('Refresh failed'));
    return null;
  } finally {
    // Clear the promise reference
    refreshPromise = null;
  }
}

// ============================================
// API Request
// ============================================

/**
 * Base fetch wrapper with error handling and automatic token refresh
 * 
 * @param endpoint - API endpoint
 * @param options - Fetch options
 * @param skipRefresh - If true, skip token refresh on SESSION_EXPIRED (used internally to prevent loops)
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  skipRefresh: boolean = false
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get access token if available
  let token = await getAccessToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Log request in development
  if (__DEV__) {
    let logBody = options.body;
    try {
      // Try to parse and format JSON body for better readability
      if (typeof options.body === 'string') {
        const parsed = JSON.parse(options.body);
        // Sanitize sensitive data in logs
        const sanitized = { ...parsed };
        if (sanitized.documents) {
          sanitized.documents = {
            ...sanitized.documents,
            licenseImageUrl: sanitized.documents.licenseImageUrl ? '***' : '',
            licenseBackImageUrl: sanitized.documents.licenseBackImageUrl ? '***' : '',
            aadhaarImageUrl: sanitized.documents.aadhaarImageUrl ? '***' : '',
            aadhaarBackImageUrl: sanitized.documents.aadhaarBackImageUrl ? '***' : '',
            rcImageUrl: sanitized.documents.rcImageUrl ? '***' : '',
            rcBackImageUrl: sanitized.documents.rcBackImageUrl ? '***' : '',
          };
        }
        if (sanitized.refreshToken) {
          sanitized.refreshToken = '***';
        }
        logBody = JSON.stringify(sanitized, null, 2);
      }
    } catch {
      // Not JSON, use as-is
    }

    if (__DEV__) {
      console.log(`[API] ${options.method || 'GET'} ${url}`, {
        body: logBody,
        headers: Object.keys(headers),
      });
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: `Server returned non-JSON response: ${text.substring(0, 100)}`,
        },
      };
    }

    // Check for SESSION_EXPIRED and attempt refresh
    const isSessionExpired = 
      (response.status === 401 && data.error?.code === 'SESSION_EXPIRED') ||
      (data.success === false && data.error?.code === 'SESSION_EXPIRED');

    if (isSessionExpired && !skipRefresh) {
      if (__DEV__) {
        console.log('[API] Session expired, attempting token refresh...');
      }

      // Attempt to refresh the token
      const newAccessToken = await attemptTokenRefresh();

      if (newAccessToken) {
        // Retry the original request with new token
        if (__DEV__) {
          console.log('[API] Retrying request with new token...');
        }
        
        // Update the authorization header with new token
        headers['Authorization'] = `Bearer ${newAccessToken}`;
        
        // Retry the request (with skipRefresh=true to prevent infinite loops)
        return apiRequest<T>(endpoint, { ...options, headers }, true);
      }

      // Refresh failed - return the original error
      // The attemptTokenRefresh function has already dispatched unauthorized event
      // if it was an auth error (401/403)
      if (__DEV__) {
        console.warn('[API] Token refresh failed, returning original error');
      }
    }

    if (!response.ok) {
      // Validation errors and OTP errors are expected client errors, log as warnings not errors (no LogBox)
      const isOtpError = ['INVALID_OTP', 'OTP_EXPIRED', 'OTP_MAX_ATTEMPTS'].includes(data.error?.code);
      const isExpectedNonCritical = isExpectedNonCriticalClientError(
        response.status,
        data.error?.code
      );
      const isExpected400 =
        response.status === 400 &&
        (data.error?.details || data.error?.code === 'CITY_SERVICE_UNAVAILABLE' || isOtpError);
      if (__DEV__ && (isExpected400 || isExpectedNonCritical)) {
        console.warn(`[API] Client response (${response.status}):`, {
          code: data.error?.code,
          message: data.error?.message,
          details: data.error?.details,
          path: data.error?.path,
        });
      } else if (__DEV__ && response.status === 404 && endpoint.includes('referral/status')) {
        // Referral status endpoint may be missing on older backends; treat as optional
        console.warn('[API] Referral status endpoint not found (404); using default.');
      } else if (__DEV__ && !isSessionExpired) {
        // Only log non-SESSION_EXPIRED errors as errors
        console.error(`[API] Error Response (${response.status}):`, data);
      }

      return {
        success: false,
        error: normalizeError(
          data.error,
          data.message || `HTTP ${response.status}: ${response.statusText}`
        ),
      };
    }

    // Log response in development
    if (__DEV__) {
      console.log(`[API] Response:`, { status: response.status, data });
    }

    // Handle both success: true/false format and direct data
    if (data.success === false) {
      // Validation and OTP errors are expected, log as warnings not errors (no LogBox)
      const isOtpError = ['INVALID_OTP', 'OTP_EXPIRED', 'OTP_MAX_ATTEMPTS'].includes(data.error?.code);
      if (__DEV__ && data.error?.code === 'VALIDATION_ERROR' && data.error?.details && !isSessionExpired) {
        console.warn(`[API] Validation Error:`, {
          code: data.error?.code,
          message: data.error?.message,
          details: data.error.details,
          path: data.error?.path,
        });
      } else if (__DEV__ && isOtpError && !isSessionExpired) {
        console.warn(`[API] OTP Error:`, {
          code: data.error?.code,
          message: data.error?.message,
          path: data.error?.path,
        });
      } else if (__DEV__ && data.error?.details && !isSessionExpired) {
        // Other API errors are logged as errors
        console.error(`[API] API Error:`, {
          code: data.error?.code,
          message: data.error?.message,
          details: data.error.details,
          path: data.error?.path,
        });
      }

      return {
        success: false,
        error: normalizeError(
          data.error,
          data.message || "An error occurred"
        ),
      };
    }

    return {
      success: true,
      data: data.data || data,
      message: data.message,
      meta: data.meta,
    };
  } catch (error) {
    console.error('[API] Request Error:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed. Please check if the server is running.',
      },
    };
  }
}

// ============================================
// HTTP Methods
// ============================================

/**
 * GET request
 */
export async function get<T>(endpoint: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

/**
 * POST request
 */
export async function post<T>(
  endpoint: string,
  body?: unknown,
  customHeaders?: HeadersInit
): Promise<ApiResponse<T>> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers,
  });
}

/**
 * PATCH request
 */
export async function patch<T>(
  endpoint: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export async function del<T>(endpoint: string): Promise<ApiResponse<T>> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}
