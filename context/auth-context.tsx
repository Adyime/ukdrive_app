/**
 * Authentication Context
 * Manages authentication state and provides auth methods
 * 
 * Features:
 * - Persists auth state to secure storage
 * - Listens for unauthorized events to trigger automatic logout
 * - Handles token refresh failures gracefully
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { getTokens, saveTokens, clearTokens } from '@/lib/storage';
import { logout as logoutApi, getCurrentUser, type UserType } from '@/lib/api/auth';
import { addUnauthorizedListener, addTokenRefreshedListener } from '@/lib/events';
import { 
  registerForPushNotifications, 
  unregisterFromPushNotifications,
} from '@/lib/services/onesignal';
import { stopDriverService } from '@/lib/services/driver-foreground-service';
import { unregisterDeviceToken } from '@/lib/api/notifications';
import { clearActiveRideId } from '@/lib/incoming-ride-request';

export interface User {
  id: string;
  fullName: string;
  phone: string;
  gender?: "Male" | "Female" | "Others" | null;
  email?: string;
  profileImageUrl?: string | null;
  [key: string]: unknown;
}

interface AuthState {
  user: User | null;
  userType: UserType | null;
  tokens: {
    accessToken: string;
    refreshToken: string;
  } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (tokens: { accessToken: string; refreshToken: string }, user: User, userType: UserType) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    userType: null,
    tokens: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Track if logout is in progress to prevent multiple logout calls
  const isLoggingOut = useRef(false);

  /**
   * Load tokens from storage on mount
   */
  useEffect(() => {
    loadStoredAuth();
  }, []);

  /**
   * Fetch and update user profile from server
   */
  const refreshUserProfile = useCallback(async () => {
    const stored = await getTokens();
    if (!stored || !stored.userType) {
      return;
    }

    try {
      const profileResponse = await getCurrentUser(stored.userType);
      if (profileResponse.success && profileResponse.data) {
        const profileData = profileResponse.data as any;
        const updatedUser: User = {
          id: profileData.id || stored.userId,
          fullName: profileData.fullName || '',
          phone: profileData.phone || '',
          gender: profileData.gender ?? null,
          email: profileData.email,
          profileImageUrl: profileData.profileImageUrl ?? null,
        };

        // Update stored profile
        await saveTokens(
          stored.accessToken,
          stored.refreshToken,
          stored.userType,
          stored.userId,
          {
            fullName: updatedUser.fullName,
            phone: updatedUser.phone,
            gender: updatedUser.gender ?? null,
            email: updatedUser.email,
            profileImageUrl: updatedUser.profileImageUrl ?? null,
          }
        );

        // Update state
        setState((prev) => ({
          ...prev,
          user: updatedUser,
        }));

        if (__DEV__) {
          console.log('[Auth] User profile refreshed from server');
        }
      }
    } catch (error) {
      console.warn('[Auth] Failed to refresh user profile:', error);
    }
  }, []);

  /**
   * Listen for unauthorized events (fired by api.ts when refresh token fails)
   * This triggers automatic logout when the session is truly expired
   */
  useEffect(() => {
    const handleUnauthorized = () => {
      // Prevent multiple logout calls
      if (isLoggingOut.current) {
        if (__DEV__) {
          console.log('[Auth] Logout already in progress, ignoring duplicate event');
        }
        return;
      }

      // Check if already logged out
      if (!state.isAuthenticated) {
        if (__DEV__) {
          console.log('[Auth] Already logged out, ignoring unauthorized event');
        }
        return;
      }

      console.log('[Auth] Received unauthorized event, logging out...');
      isLoggingOut.current = true;
      clearActiveRideId().catch(() => {});
      stopDriverService().catch(() => {});

      // Clear local state and storage immediately without calling logout API
      // (since the session is already invalid on the server)
      clearTokens()
        .then(() => {
          setState({
            user: null,
            userType: null,
            tokens: null,
            isLoading: false,
            isAuthenticated: false,
          });
          
          // Navigate to auth screen only if not already there
          // Use a small delay to ensure state is updated
          setTimeout(() => {
            router.replace('/(auth)' as any);
          }, 100);
        })
        .catch((error) => {
          console.error('[Auth] Failed to clear tokens on unauthorized:', error);
          // Still update state even if storage clear fails
          setState({
            user: null,
            userType: null,
            tokens: null,
            isLoading: false,
            isAuthenticated: false,
          });
        })
        .finally(() => {
          // Keep isLoggingOut true for a bit longer to prevent rapid re-triggers
          setTimeout(() => {
            isLoggingOut.current = false;
          }, 2000);
        });
    };

    // Add event listener and get cleanup function
    const cleanup = addUnauthorizedListener(handleUnauthorized);

    return cleanup;
  }, [state.isAuthenticated]);

  /**
   * Listen for token refreshed events (fired by api.ts after successful token refresh)
   * This allows us to refresh user profile if it's missing
   */
  useEffect(() => {
    const handleTokenRefreshed = () => {
      // Check if user profile is missing and fetch it
      const checkAndRefreshProfile = async () => {
        const stored = await getTokens();
        if (
          stored &&
          (!stored.userProfile ||
            !stored.userProfile.fullName ||
            !stored.userProfile.phone ||
            typeof stored.userProfile.gender === "undefined" ||
            typeof stored.userProfile.profileImageUrl === "undefined")
        ) {
          if (__DEV__) {
            console.log('[Auth] Token refreshed, fetching user profile...');
          }
          await refreshUserProfile();
        }
      };
      checkAndRefreshProfile();
    };

    // Add event listener and get cleanup function
    const cleanup = addTokenRefreshedListener(handleTokenRefreshed);

    return cleanup;
  }, [refreshUserProfile]);

  // Backfill missing gender for already-authenticated sessions without requiring logout.
  useEffect(() => {
    if (!state.isAuthenticated) return;
    if (typeof state.user?.gender !== 'undefined') return;
    refreshUserProfile();
  }, [state.isAuthenticated, state.user?.gender, refreshUserProfile]);

  const loadStoredAuth = async () => {
    try {
      const stored = await getTokens();
      if (stored) {
        // Restore user object with profile data if available
        let user: User = {
          id: stored.userId,
          fullName: stored.userProfile?.fullName || '',
          phone: stored.userProfile?.phone || '',
          gender: stored.userProfile?.gender ?? null,
          email: stored.userProfile?.email,
          profileImageUrl: stored.userProfile?.profileImageUrl ?? null,
        };

        // If user profile is missing or incomplete, fetch it from server
        if (
          !stored.userProfile ||
          !stored.userProfile.fullName ||
          !stored.userProfile.phone ||
          typeof stored.userProfile.gender === "undefined" ||
          typeof stored.userProfile.profileImageUrl === "undefined"
        ) {
          try {
            const profileResponse = await getCurrentUser(stored.userType);
            if (profileResponse.success && profileResponse.data) {
              const profileData = profileResponse.data as any;
              user = {
                id: profileData.id || stored.userId,
                fullName: profileData.fullName || '',
                phone: profileData.phone || '',
                gender: profileData.gender ?? null,
                email: profileData.email,
                profileImageUrl: profileData.profileImageUrl ?? null,
              };

              // Update stored profile with fetched data
              await saveTokens(
                stored.accessToken,
                stored.refreshToken,
                stored.userType,
                stored.userId,
                {
                  fullName: user.fullName,
                  phone: user.phone,
                  gender: user.gender ?? null,
                  email: user.email,
                  profileImageUrl: user.profileImageUrl ?? null,
                }
              );
            }
          } catch (error) {
            console.warn('[Auth] Failed to fetch user profile, using stored data:', error);
            // Continue with stored data even if fetch fails
          }
        }
        
        setState({
          user,
          userType: stored.userType,
          tokens: {
            accessToken: stored.accessToken,
            refreshToken: stored.refreshToken,
          },
          isLoading: false,
          isAuthenticated: true,
        });

        // Register for push notifications on app restart (fire-and-forget)
        // This ensures device token is registered even if it changed or wasn't registered before
        registerForPushNotifications(stored.userId, stored.userType).catch(err => {
          console.warn('[Auth] Failed to register for push notifications on app restart:', err);
        });
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Failed to load stored auth:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Login and save tokens
   */
  const login = useCallback(
    async (
      tokens: { accessToken: string; refreshToken: string },
      user: User,
      userType: UserType
    ) => {
      try {
        await clearActiveRideId();

        // Extract user profile data to store
        const userProfile = {
          fullName: user.fullName || '',
          phone: user.phone || '',
          gender: user.gender ?? null,
          email: user.email,
          profileImageUrl: user.profileImageUrl ?? null,
        };
        
        await saveTokens(
          tokens.accessToken,
          tokens.refreshToken,
          userType,
          user.id,
          userProfile
        );
        setState({
          user,
          userType,
          tokens,
          isLoading: false,
          isAuthenticated: true,
        });

        // Register for push notifications after successful login (fire-and-forget)
        registerForPushNotifications(user.id, userType).catch(err => {
          console.warn('[Auth] Failed to register for push notifications:', err);
        });
      } catch (error) {
        console.error('Failed to save tokens:', error);
        throw error;
      }
    },
    []
  );

  /**
   * Logout and clear tokens
   */
  const logout = useCallback(async () => {
    try {
      await clearActiveRideId();
      await stopDriverService().catch(() => {});

      // Unregister device token before logout (fire-and-forget)
      try {
        await unregisterDeviceToken();
        unregisterFromPushNotifications();
      } catch (error) {
        console.warn('[Auth] Failed to unregister device token:', error);
      }

      // Call logout API if user is authenticated
      if (state.userType && state.tokens) {
        try {
          await logoutApi(state.userType);
        } catch (error) {
          // Log error but continue with local logout to prevent stuck states
          console.error('Logout API call failed:', error);
        }
      }

      // Clear local tokens regardless of API call result
      await clearTokens();
      setState({
        user: null,
        userType: null,
        tokens: null,
        isLoading: false,
        isAuthenticated: false,
      });

      // Explicitly navigate to auth screen after logout
      router.replace('/(auth)' as any);
    } catch (error) {
      console.error('Failed to clear tokens:', error);
      throw error;
    }
  }, [state.userType, state.tokens]);

  /**
   * Update user information
   */
  const updateUser = useCallback(async (user: User) => {
    try {
      // Update stored profile if tokens exist
      const stored = await getTokens();
      if (stored) {
        const userProfile = {
          fullName: user.fullName || '',
          phone: user.phone || '',
          gender: user.gender ?? null,
          email: user.email,
          profileImageUrl: user.profileImageUrl ?? null,
        };
        await saveTokens(
          stored.accessToken,
          stored.refreshToken,
          stored.userType,
          stored.userId,
          userProfile
        );
      }
      setState((prev) => ({
        ...prev,
        user,
      }));
    } catch (error) {
      console.error('Failed to update user profile in storage:', error);
      // Still update state even if storage update fails
      setState((prev) => ({
        ...prev,
        user,
      }));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
