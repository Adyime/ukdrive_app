/**
 * Token Refresh Utility
 * 
 * This file is separate from api.ts to avoid circular dependencies.
 * api.ts imports this, but this file doesn't import api.ts.
 */

/**
 * Auth tokens response from refresh endpoint
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Refresh access token using refresh token
 * 
 * This function makes a direct fetch call (not using apiRequest)
 * to avoid infinite loops when apiRequest tries to refresh on failure.
 * 
 * The server implements token rotation:
 * - Old refresh token is revoked
 * - New access + refresh tokens are issued
 * 
 * @param refreshToken - The current refresh token
 * @returns New tokens on success, error on failure
 */
export async function refreshTokens(
  refreshToken: string
): Promise<{ 
  success: boolean; 
  data?: AuthTokens; 
  error?: { code: string; message: string; status?: number };
}> {
  const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const url = `${API_BASE_URL}/api/auth/refresh`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

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
          status: response.status,
        },
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: data.error?.code || 'REFRESH_FAILED',
          message: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
        },
      };
    }

    // Handle both success: true/false format and direct data
    if (data.success === false) {
      return {
        success: false,
        error: {
          code: data.error?.code || 'REFRESH_FAILED',
          message: data.error?.message || 'Token refresh failed',
          status: response.status,
        },
      };
    }

    // Extract tokens from response
    const tokens: AuthTokens = data.data || data;
    
    return {
      success: true,
      data: tokens,
    };
  } catch (error) {
    // Network error or other exception
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
        status: undefined, // Network errors don't have HTTP status
      },
    };
  }
}
