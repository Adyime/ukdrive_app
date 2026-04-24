/**
 * Authentication API
 * Handles all auth-related API calls
 */

import { post, get, patch } from '../api';

export type UserType = 'passenger' | 'driver';
export type GenderOption = "Male" | "Female" | "Others";

export interface CurrentUserProfileResponse {
  id: string;
  fullName: string;
  phone: string;
  gender?: GenderOption | null;
  email?: string;
  profileImageUrl?: string | null;
  createdAt?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface UpdateProfileImageResponse {
  id: string;
  profileImageUrl: string | null;
}

export interface OtpSendResponse {
  sent: boolean;
  expiresIn: number;
  retryAfter?: number;
}

export interface OtpVerifyResponse {
  verified: boolean;
  isNewUser: boolean;
  requiresRegistration?: boolean;
  requiresOnboarding?: boolean;
  requiresSessionTakeover?: boolean;
  sessionTakeoverToken?: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  };
  registrationToken?: string;
  onboardingToken?: string;
  user?: unknown;
  onboardingSteps?: {
    step: number;
    name: string;
    completed: boolean;
  }[];
}

export interface PassengerRegistrationData {
  fullName: string;
  phone: string;
  gender: GenderOption;
  email?: string;
  referralCode?: string;
}

export interface DriverOnboardingData {
  personalDetails: {
    fullName: string;
    gender: GenderOption;
    email?: string;
  };
  vehicleData: {
    vehicleSubcategoryId: string;
    driverPurpose?: "passenger" | "delivery" | "both";
    vehicleRegistration: string;
    rcNumber: string;
    vehicleOwnerName: string;
  };
  documents: {
    licenseNumber: string;
    licenseImageUrl: string;
    licenseBackImageUrl: string;
    aadhaarImageUrl: string;
    aadhaarBackImageUrl: string;
    rcImageUrl: string;
    rcBackImageUrl: string;
  };
}

/**
 * Send OTP to phone number
 */
export async function sendOtp(
  phone: string,
  userType: UserType
): Promise<{ success: boolean; data?: OtpSendResponse; error?: unknown }> {
  return post<OtpSendResponse>(`/api/auth/${userType}/send-otp`, { phone });
}

/**
 * Verify OTP
 */
export async function verifyOtp(
  phone: string,
  otp: string,
  userType: UserType,
  options?: {
    forceLogin?: boolean;
    sessionTakeoverToken?: string;
  }
): Promise<{ success: boolean; data?: OtpVerifyResponse; error?: unknown }> {
  return post<OtpVerifyResponse>(`/api/auth/${userType}/verify-otp`, {
    phone,
    otp,
    ...(options?.forceLogin ? { forceLogin: true } : {}),
    ...(options?.sessionTakeoverToken
      ? { sessionTakeoverToken: options.sessionTakeoverToken }
      : {}),
  });
}

/**
 * Register new passenger
 */
export async function registerPassenger(
  data: PassengerRegistrationData,
  registrationToken: string
): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  return post(
    '/api/auth/passenger/register',
    data,
    {
      'X-Registration-Token': registrationToken,
    } as HeadersInit
  );
}

/**
 * Complete driver onboarding
 */
export async function onboardDriver(
  data: DriverOnboardingData,
  onboardingToken: string
): Promise<{ success: boolean; data?: unknown; error?: unknown }> {
  return post(
    '/api/auth/driver/onboarding',
    data,
    {
      'X-Onboarding-Token': onboardingToken,
    } as HeadersInit
  );
}

export interface LogoutResponse {
  loggedOut: boolean;
}

/**
 * Logout user (driver or passenger)
 */
export async function logout(
  userType: UserType
): Promise<{ success: boolean; data?: LogoutResponse; error?: unknown }> {
  return post<LogoutResponse>(`/api/auth/${userType}/logout`);
}

/**
 * Get current user profile (passenger or driver)
 */
export async function getCurrentUser(
  userType: UserType
): Promise<{ success: boolean; data?: CurrentUserProfileResponse; error?: unknown }> {
  return get<CurrentUserProfileResponse>(`/api/auth/${userType}/me`);
}

/**
 * Update current user profile image (driver/passenger)
 */
export async function updateProfileImage(
  userType: UserType,
  profileImage: string | null
): Promise<{ success: boolean; data?: UpdateProfileImageResponse; error?: unknown }> {
  return patch<UpdateProfileImageResponse>(`/api/auth/${userType}/me/profile-image`, {
    profileImage,
  });
}

/**
 * Request account deletion
 * Creates a pending deletion request that admin will review
 */
export async function requestAccountDeletion(
  userType: UserType
): Promise<{ success: boolean; data?: { requested: boolean }; error?: unknown }> {
  return post(`/api/auth/${userType}/delete-account`);
}

// Note: refreshTokens has been moved to ./token-refresh.ts to avoid circular dependencies
// Import it from there if needed: import { refreshTokens } from './token-refresh';
