/**
 * Driver API Client
 * API functions for driver-specific operations
 */

import { apiRequest, patch, type ApiResponse } from '../api';

// Types
export interface LocationUpdateResponse {
  location: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  };
}

export interface DriverStatusResponse {
  location: {
    latitude: number;
    longitude: number;
    updatedAt: string;
  } | null;
  isOnline: boolean;
  isAvailable: boolean;
  isActive: boolean;
  verificationStatus: string | null;
  walletBalance: number;
  isWalletNegative: boolean;
  canGoOnline: boolean;
}

export interface OnlineStatusResponse {
  isOnline: boolean;
  isAvailable: boolean;
}

export interface DriverVehicleSubcategory {
  id: string;
  name: string;
  slug: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface DriverVehicleChangeRequest {
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  requestedAt: string | null;
  reviewedAt: string | null;
  target: {
    vehicleSubcategoryId: string | null;
    driverPurpose: "passenger" | "delivery" | "both" | null;
    vehicleRegistration: string | null;
    vehicleSubcategory: DriverVehicleSubcategory | null;
  };
  documents: {
    front_image: string | null;
    back_image: string | null;
    front_preview_url: string | null;
    back_preview_url: string | null;
  };
}

export interface DriverProfileResponse {
  id: string;
  fullName: string;
  phone: string;
  profileImageUrl: string | null;
  vehicleSubcategoryId: string | null;
  driverPurpose: "passenger" | "delivery" | "both";
  vehicleRegistration: string | null;
  licenseNumber: string | null;
  rating: number;
  totalRides: number;
  isAvailable: boolean;
  isActive: boolean;
  verificationStatus: string | null;
  createdAt: string;
  vehicleSubcategory: DriverVehicleSubcategory | null;
  vehicleChangeRequest: DriverVehicleChangeRequest | null;
}

export interface DriverVehicleUpdatePayload {
  vehicleSubcategoryId?: string;
  driverPurpose?: "passenger" | "delivery" | "both";
  vehicleRegistration?: string;
  rcImageUrl?: string;
  rcBackImageUrl?: string;
}

export interface DriverVehicleUpdateResponse {
  id: string;
  vehicleSubcategoryId: string | null;
  driverPurpose: "passenger" | "delivery" | "both";
  vehicleSubcategory: DriverVehicleSubcategory | null;
  requiresVehicleReview: boolean;
  vehicleChangeRequest: DriverVehicleChangeRequest | null;
}

export type DriverDocumentType = "license" | "aadhaar" | "rc";
export type DriverDocumentReviewStatus = "pending" | "approved" | "rejected";

export interface DriverVerificationDocument {
  front_image: string | null;
  back_image: string | null;
  front_preview_url?: string | null;
  back_preview_url?: string | null;
  status: DriverDocumentReviewStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export interface DriverDocumentsVerificationResponse {
  driverId: string;
  overallStatus: DriverDocumentReviewStatus;
  verificationStatus: string | null;
  documents: Record<DriverDocumentType, DriverVerificationDocument>;
}

export interface DriverDocumentResubmitPayload {
  frontImage: string;
  backImage: string;
}

export interface DriverDocumentResubmitResponse {
  updated: boolean;
  documentType: DriverDocumentType;
  overallStatus: DriverDocumentReviewStatus;
  document: DriverVerificationDocument;
}

export type DriverRewardMissionType =
  | "RIDE_COUNT"
  | "SPECIAL_EVENT"
  | "TIME_BASED"
  | "RATING";

export type DriverRewardTimePeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "ONE_TIME";

export interface DriverRewardOfferProgress {
  currentValue: number | null;
  targetValue: number | null;
  minimumRating: number | null;
  progressPercent: number | null;
  unit: "rides" | "minutes" | "rating" | "event";
  grantPeriod: string;
  alreadyRewardedInPeriod: boolean;
  isEarnableNow: boolean;
  maxCompletions: number | null;
  completionsUsed: number;
}

export interface DriverRewardOffer {
  missionId: string;
  title: string;
  description: string;
  type: DriverRewardMissionType;
  timePeriod: DriverRewardTimePeriod;
  rewardAmount: number;
  progress: DriverRewardOfferProgress;
  periodWindow: {
    start: string;
    end: string | null;
  };
  trackingNote: string | null;
}

export interface DriverRewardSummary {
  totalRewards: number;
  totalEarned: number;
  thisMonthEarned: number;
  lastRewardAt: string | null;
}

export interface DriverRewardHistoryItem {
  grantId: string;
  missionId: string;
  missionTitle: string | null;
  missionType: DriverRewardMissionType | null;
  timePeriod: DriverRewardTimePeriod | null;
  amount: number;
  grantPeriod: string;
  referenceType: string | null;
  referenceId: string | null;
  walletTxnId: string | null;
  createdAt: string;
}

export interface DriverRewardHistoryResponse {
  summary: DriverRewardSummary;
  rewards: DriverRewardHistoryItem[];
}

/**
 * Update driver's current location
 */
export async function updateDriverLocation(
  latitude: number,
  longitude: number
): Promise<ApiResponse<LocationUpdateResponse>> {
  return apiRequest<LocationUpdateResponse>('/api/driver/location', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
  });
}

/**
 * Get driver's current location and status
 */
export async function getDriverLocation(): Promise<ApiResponse<DriverStatusResponse>> {
  return apiRequest<DriverStatusResponse>('/api/driver/location', {
    method: 'GET',
  });
}

/**
 * Get authenticated driver's full profile
 */
export async function getDriverProfile(): Promise<ApiResponse<DriverProfileResponse>> {
  return apiRequest<DriverProfileResponse>("/api/auth/driver/me", {
    method: "GET",
  });
}

/**
 * Get driver document verification details with per-document status/reason.
 */
export async function getDriverDocumentsForVerification(): Promise<
  ApiResponse<DriverDocumentsVerificationResponse>
> {
  return apiRequest<DriverDocumentsVerificationResponse>("/api/auth/driver/documents", {
    method: "GET",
  });
}

/**
 * Re-submit a specific document with new front/back images.
 */
export async function resubmitDriverDocument(
  type: DriverDocumentType,
  payload: DriverDocumentResubmitPayload
): Promise<ApiResponse<DriverDocumentResubmitResponse>> {
  return patch<DriverDocumentResubmitResponse>(
    `/api/auth/driver/documents/${type}/resubmit`,
    payload
  );
}

/**
 * Update authenticated driver's vehicle assignment
 */
export async function updateDriverVehicle(
  payload: DriverVehicleUpdatePayload
): Promise<ApiResponse<DriverVehicleUpdateResponse>> {
  return apiRequest<DriverVehicleUpdateResponse>("/api/auth/driver/me/vehicle", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/**
 * Set driver availability for rides
 */
export async function setAvailability(
  isAvailable: boolean
): Promise<ApiResponse<OnlineStatusResponse>> {
  return apiRequest<OnlineStatusResponse>('/api/driver/location/availability', {
    method: 'PATCH',
    body: JSON.stringify({ isAvailable }),
  });
}

/**
 * Set available for rides
 */
export async function setAvailableForRides(): Promise<ApiResponse<OnlineStatusResponse>> {
  return setAvailability(true);
}

/**
 * Set unavailable for rides (busy, break, etc.)
 */
export async function setUnavailableForRides(): Promise<ApiResponse<OnlineStatusResponse>> {
  return setAvailability(false);
}

/**
 * Get active mission-based reward offers for the authenticated driver
 */
export async function getDriverActiveRewardOffers(): Promise<
  ApiResponse<{ offers: DriverRewardOffer[] }>
> {
  return apiRequest<{ offers: DriverRewardOffer[] }>("/api/driver/rewards/active-offers", {
    method: "GET",
  });
}

/**
 * Get mission reward grant history for the authenticated driver
 */
export async function getDriverRewardHistory(
  page: number = 1,
  limit: number = 20,
  dateFrom?: string,
  dateTo?: string
): Promise<ApiResponse<DriverRewardHistoryResponse>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  return apiRequest<DriverRewardHistoryResponse>(
    `/api/driver/rewards/history?${params.toString()}`,
    {
      method: "GET",
    }
  );
}
