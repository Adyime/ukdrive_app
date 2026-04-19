/**
 * Secure Storage Service
 * Handles secure token storage using expo-secure-store
 */

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEYS = {
  ACCESS_TOKEN: 'uk_drive_access_token',
  REFRESH_TOKEN: 'uk_drive_refresh_token',
  USER_TYPE: 'uk_drive_user_type',
  USER_ID: 'uk_drive_user_id',
  USER_PROFILE: 'uk_drive_user_profile', // Store user profile data (phone, fullName, email, profileImageUrl)
  APP_LANGUAGE: 'uk_drive_app_language',
  LAST_RIDE_VEHICLE_SLUG: 'uk_drive_last_ride_vehicle_slug',
  /** Driver onboarding: phone + token so user can resume after refresh */
  DRIVER_ONBOARDING_PHONE: 'uk_drive_driver_onboarding_phone',
  DRIVER_ONBOARDING_TOKEN: 'uk_drive_driver_onboarding_token',
  /** Draft form state for driver onboarding (JSON) */
  DRIVER_ONBOARDING_DRAFT: 'uk_drive_driver_onboarding_draft',
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  userType: 'passenger' | 'driver';
  userId: string;
  userProfile?: {
    fullName: string;
    phone: string;
    gender?: "Male" | "Female" | "Others" | null;
    email?: string;
    profileImageUrl?: string | null;
  };
}

/**
 * Save tokens to secure storage
 */
export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  userType: 'passenger' | 'driver',
  userId: string,
  userProfile?: {
    fullName: string;
    phone: string;
    gender?: "Male" | "Female" | "Others" | null;
    email?: string;
    profileImageUrl?: string | null;
  }
): Promise<void> {
  try {
    const promises: Promise<void>[] = [
      SecureStore.setItemAsync(TOKEN_KEYS.ACCESS_TOKEN, accessToken),
      SecureStore.setItemAsync(TOKEN_KEYS.REFRESH_TOKEN, refreshToken),
      SecureStore.setItemAsync(TOKEN_KEYS.USER_TYPE, userType),
      SecureStore.setItemAsync(TOKEN_KEYS.USER_ID, userId),
    ];
    
    // Store user profile if provided
    if (userProfile) {
      promises.push(
        SecureStore.setItemAsync(TOKEN_KEYS.USER_PROFILE, JSON.stringify(userProfile))
      );
    }
    
    await Promise.all(promises);
  } catch (error) {
    console.error('Failed to save tokens:', error);
    throw error;
  }
}

/**
 * Get tokens from secure storage
 */
export async function getTokens(): Promise<StoredTokens | null> {
  try {
    const [accessToken, refreshToken, userType, userId, userProfileJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEYS.ACCESS_TOKEN),
      SecureStore.getItemAsync(TOKEN_KEYS.REFRESH_TOKEN),
      SecureStore.getItemAsync(TOKEN_KEYS.USER_TYPE),
      SecureStore.getItemAsync(TOKEN_KEYS.USER_ID),
      SecureStore.getItemAsync(TOKEN_KEYS.USER_PROFILE).catch(() => null), // Gracefully handle if not present
    ]);

    if (!accessToken || !refreshToken || !userType || !userId) {
      return null;
    }

    let userProfile:
      | {
          fullName: string;
          phone: string;
          gender?: "Male" | "Female" | "Others" | null;
          email?: string;
          profileImageUrl?: string | null;
        }
      | undefined;
    if (userProfileJson) {
      try {
        userProfile = JSON.parse(userProfileJson);
      } catch (e) {
        console.warn('Failed to parse stored user profile:', e);
      }
    }

    return {
      accessToken,
      refreshToken,
      userType: userType as 'passenger' | 'driver',
      userId,
      userProfile,
    };
  } catch (error) {
    console.error('Failed to get tokens:', error);
    return null;
  }
}

/**
 * Clear all tokens from secure storage
 */
export async function clearTokens(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEYS.ACCESS_TOKEN),
      SecureStore.deleteItemAsync(TOKEN_KEYS.REFRESH_TOKEN),
      SecureStore.deleteItemAsync(TOKEN_KEYS.USER_TYPE),
      SecureStore.deleteItemAsync(TOKEN_KEYS.USER_ID),
      SecureStore.deleteItemAsync(TOKEN_KEYS.USER_PROFILE).catch(() => {}), // Gracefully handle if not present
    ]);
  } catch (error) {
    console.error('Failed to clear tokens:', error);
    throw error;
  }
}

/**
 * Save user type only
 */
export async function saveUserType(
  userType: 'passenger' | 'driver'
): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEYS.USER_TYPE, userType);
  } catch (error) {
    console.error('Failed to save user type:', error);
    throw error;
  }
}

/**
 * Get user type
 */
export async function getUserType(): Promise<'passenger' | 'driver' | null> {
  try {
    const userType = await SecureStore.getItemAsync(TOKEN_KEYS.USER_TYPE);
    return (userType as 'passenger' | 'driver') || null;
  } catch (error) {
    console.error('Failed to get user type:', error);
    return null;
  }
}

/**
 * Get access token only
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const tokens = await getTokens();
    return tokens?.accessToken || null;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Get last selected ride vehicle slug (for preloading "Most used" on create-ride)
 */
export async function getLastRideVehicleSlug(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEYS.LAST_RIDE_VEHICLE_SLUG);
  } catch (error) {
    console.warn('Failed to get last ride vehicle slug:', error);
    return null;
  }
}

/**
 * Save last selected ride vehicle slug
 */
export async function setLastRideVehicleSlug(slug: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEYS.LAST_RIDE_VEHICLE_SLUG, slug);
  } catch (error) {
    console.warn('Failed to save last ride vehicle slug:', error);
  }
}

// ---------------------------------------------------------------------------
// Driver onboarding persistence (resume where user left off)
// ---------------------------------------------------------------------------

export interface DriverOnboardingDraft {
  fullName: string;
  gender: "Male" | "Female" | "Others" | "";
  email: string;
  vehicleSubcategoryId: string | null;
  driverPurpose: string;
  vehicleRegistration: string;
  rcNumber: string;
  vehicleOwnerName: string;
  licenseNumber: string;
  licenseImageUrl: string;
  licenseBackImageUrl: string;
  aadhaarImageUrl: string;
  aadhaarBackImageUrl: string;
  rcImageUrl: string;
  rcBackImageUrl: string;
}

export async function saveDriverOnboardingContext(phone: string, onboardingToken: string): Promise<void> {
  try {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_PHONE, phone),
      SecureStore.setItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_TOKEN, onboardingToken),
    ]);
  } catch (error) {
    console.warn('Failed to save driver onboarding context:', error);
  }
}

export async function getDriverOnboardingContext(): Promise<{ phone: string; onboardingToken: string } | null> {
  try {
    const [phone, onboardingToken] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_PHONE),
      SecureStore.getItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_TOKEN),
    ]);
    if (phone && onboardingToken) return { phone, onboardingToken };
    return null;
  } catch (error) {
    console.warn('Failed to get driver onboarding context:', error);
    return null;
  }
}

export async function clearDriverOnboardingContext(): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_PHONE),
      SecureStore.deleteItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_TOKEN),
      SecureStore.deleteItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_DRAFT),
    ]);
  } catch (error) {
    console.warn('Failed to clear driver onboarding context:', error);
  }
}

export async function saveDriverOnboardingDraft(draft: DriverOnboardingDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_DRAFT, JSON.stringify(draft));
  } catch (error) {
    console.warn('Failed to save driver onboarding draft:', error);
  }
}

export async function getDriverOnboardingDraft(): Promise<DriverOnboardingDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(TOKEN_KEYS.DRIVER_ONBOARDING_DRAFT);
    if (!raw) return null;
    return JSON.parse(raw) as DriverOnboardingDraft;
  } catch (error) {
    console.warn('Failed to get driver onboarding draft:', error);
    return null;
  }
}

export async function getAppLanguage(): Promise<'en' | 'hi' | null> {
  try {
    const language = await SecureStore.getItemAsync(TOKEN_KEYS.APP_LANGUAGE);
    if (language === 'en' || language === 'hi') {
      return language;
    }
    return null;
  } catch (error) {
    console.warn('Failed to get app language:', error);
    return null;
  }
}

export async function setAppLanguage(language: 'en' | 'hi'): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEYS.APP_LANGUAGE, language);
  } catch (error) {
    console.warn('Failed to set app language:', error);
    throw error;
  }
}
