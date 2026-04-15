/**
 * Ride API
 * Handles all ride-related API calls
 */

import { get, post, patch } from '../api';

// ============================================
// Types
// ============================================

export enum RideStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  ARRIVING = 'ARRIVING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** @deprecated Legacy vehicle type — use vehicle subcategory slug/id instead. Kept as string alias for backward compat. */
export type VehicleType = string;

export interface PassengerProfile {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

export interface DriverProfile {
  id: string;
  fullName: string;
  phone: string;
  profileImageUrl?: string | null;
  vehicleType?: string | null;
  vehicleCategoryName?: string;
  vehicleSubcategoryName?: string;
  vehicleRegistration?: string;
  rating: number;
  totalRides: number;
  isAvailable: boolean;
  isActive: boolean;
  status: {
    account: 'ACTIVE' | 'BLOCKED';
    verification: 'PENDING' | 'APPROVED' | 'REJECTED';
  };
  createdAt: string;
  /** Driver's last known latitude (for tracking) */
  latitude?: number;
  /** Driver's last known longitude (for tracking) */
  longitude?: number;
}

export interface RideResponse {
  id: string;
  passengerId: string;
  driverId?: string | null;
  requestedDriverId?: string | null;
  expiresAt?: string | Date | null;
  status: RideStatus;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLocation: string;
  destinationLat: number;
  destinationLng: number;
  destination: string;
  vehicleType?: VehicleType | null;
  vehicleCategoryName?: string;
  vehicleSubcategoryName?: string;
  distance?: number | null;
  fare: number;
  baseFare: number;
  /** When backend applies a reward discount, it may send this. Display only; do not compute on client. */
  discountApplied?: number;
  requestedAt: string;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  verificationCode?: string | null;
  verificationCodeExpiresAt?: string | Date | null;
  /** Cached route polyline (encoded Google polyline for pickup → destination) */
  routePolyline?: string | null;
  passenger?: PassengerProfile;
  driver?: DriverProfile | null;
  /** Payment info (included for drivers on COMPLETED rides with pending payment) */
  ridePayment?: {
    id: string;
    rideId: string;
    paymentMethod: string | null;
    status: string;
    fareAmount: number;
    platformFeeAmount: number;
    platformFeePercent: number;
    driverEarningAmount: number;
  } | null;
}

export interface NearbyDriver {
  id: string;
  fullName: string;
  phone: string;
  vehicleType?: string | null;
  vehicleSubcategorySlug?: string;
  vehicleCategorySlug?: string;
  vehicleCategoryName?: string;
  rating: number;
  latitude: number;
  longitude: number;
  heading?: number;
  distanceKm: number;
}

/** Public driver info (no phone, no lat/lng) for passenger driver list */
export interface NearbyDriverPublic {
  id: string;
  fullName: string;
  vehicleType?: string | null;
  vehicleSubcategorySlug?: string;
  vehicleCategorySlug?: string;
  vehicleCategoryName?: string;
  rating: number;
  distanceKm: number;
}

export interface RideEstimateOption {
  vehicleSubcategoryId?: string | null;
  vehicleType?: string | null;
  categoryName: string;
  subcategoryName: string;
  slug: string;
  estimatedFare: number;
  distanceKm: number;
  etaDriverMinutes: number | null;
  etaTripMinutes: number;
  noDriversAvailable: boolean;
}

export interface CreateRideRequest {
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLocation: string;
  destinationLat: number;
  destinationLng: number;
  destination: string;
  vehicleType?: VehicleType;
  vehicleSubcategoryId?: string;
  vehicleSubcategorySlug?: string;
  /** When set, request is sent directly to this driver (30s expiry). */
  requestedDriverId?: string;
}

export interface RideHistoryResponse {
  rides: RideResponse[];
  total: number;
  hasMore: boolean;
}

export interface RideTrackingPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

// ============================================
// Passenger API Functions
// ============================================

/**
 * Create a new ride request (Passenger only).
 * Builds a plain object with primitives only to avoid "cyclical structure in JSON object".
 */
export async function createRide(
  data: CreateRideRequest
): Promise<{ success: boolean; data?: RideResponse; error?: unknown }> {
  const body: Record<string, string | number> = {
    pickupLatitude: Number(data.pickupLatitude),
    pickupLongitude: Number(data.pickupLongitude),
    pickupLocation: String(data.pickupLocation ?? ''),
    destinationLat: Number(data.destinationLat),
    destinationLng: Number(data.destinationLng),
    destination: String(data.destination ?? ''),
  };
  if (data.vehicleType != null) body.vehicleType = String(data.vehicleType);
  if (data.vehicleSubcategoryId != null && data.vehicleSubcategoryId !== '') body.vehicleSubcategoryId = String(data.vehicleSubcategoryId);
  if (data.vehicleSubcategorySlug != null && data.vehicleSubcategorySlug !== '') body.vehicleSubcategorySlug = String(data.vehicleSubcategorySlug);
  if (data.requestedDriverId != null && data.requestedDriverId !== '') body.requestedDriverId = String(data.requestedDriverId);
  return post<RideResponse>('/api/rides/request', body);
}

/**
 * Get ride estimate. Passenger only.
 * - No vehicle: returns list of options (slug/names only; no fare/distance).
 * - With vehicleSlug or vehicleSubcategoryId: returns one option with fare, distance, ETA.
 * Returns 400 when pickup or destination is outside city.
 */
export async function getRideEstimate(
  pickupLat: number,
  pickupLng: number,
  destinationLat: number,
  destinationLng: number,
  options?: { vehicleSlug?: string; vehicleSubcategoryId?: string }
): Promise<{
  success: boolean;
  data?: { options: RideEstimateOption[]; disclaimer?: string };
  error?: unknown;
}> {
  const params = new URLSearchParams({
    pickupLat: pickupLat.toString(),
    pickupLng: pickupLng.toString(),
    destinationLat: destinationLat.toString(),
    destinationLng: destinationLng.toString(),
  });
  if (options?.vehicleSlug) params.set('vehicleSlug', options.vehicleSlug);
  if (options?.vehicleSubcategoryId) params.set('vehicleSubcategoryId', options.vehicleSubcategoryId);
  return get<{ options: RideEstimateOption[]; disclaimer?: string }>(
    `/api/rides/estimate?${params.toString()}`
  );
}

/**
 * Get nearby available drivers (Passenger only).
 * When publicOnly is true, returns public shape only (id, fullName, vehicleType, rating, distanceKm).
 */
export async function getNearbyDrivers(
  latitude: number,
  longitude: number,
  vehicleType?: VehicleType,
  radius?: number,
  vehicleSubcategoryId?: string | null,
  publicOnly?: boolean
): Promise<{
  success: boolean;
  data?: { drivers: NearbyDriver[] | NearbyDriverPublic[] };
  error?: unknown;
}> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });

  if (vehicleType) {
    params.append('vehicleType', vehicleType);
  }

  if (radius) {
    params.append('radius', radius.toString());
  }

  if (vehicleSubcategoryId) {
    params.append('vehicleSubcategoryId', vehicleSubcategoryId);
  }

  if (publicOnly) {
    params.set('publicOnly', 'true');
  }

  return get<{ drivers: NearbyDriver[] | NearbyDriverPublic[] }>(`/api/rides/nearby-drivers?${params.toString()}`);
}

// ============================================
// Driver API Functions
// ============================================

/**
 * Get pending ride requests nearby (Driver only)
 */
export async function getPendingRides(
  latitude: number,
  longitude: number,
  radius?: number
): Promise<{ success: boolean; data?: { rides: RideResponse[] }; error?: unknown }> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });

  if (radius) {
    params.append('radius', radius.toString());
  }

  return get<{ rides: RideResponse[] }>(`/api/rides/pending?${params.toString()}`);
}

/**
 * Accept a pending ride request (Driver only)
 */
export async function acceptRide(
  rideId: string
): Promise<{ success: boolean; data?: RideResponse; error?: unknown }> {
  return post<RideResponse>(`/api/rides/${rideId}/accept`);
}

/**
 * Decline a ride request (Driver only)
 */
export async function declineRide(
  rideId: string
): Promise<{ success: boolean; data?: RideResponse; error?: unknown }> {
  return post<RideResponse>(`/api/rides/${rideId}/decline`);
}

// ============================================
// Shared API Functions (Passenger & Driver)
// ============================================

/**
 * Get the current active ride for the user
 */
export async function getActiveRide(): Promise<{
  success: boolean;
  data?: { ride: RideResponse | null };
  error?: unknown;
}> {
  return get<{ ride: RideResponse | null }>('/api/rides/active');
}

/**
 * Get ride details by ID
 */
export async function getRideById(
  rideId: string
): Promise<{ success: boolean; data?: { ride: RideResponse }; error?: unknown }> {
  return get<{ ride: RideResponse }>(`/api/rides/${rideId}`);
}

/**
 * Update ride status
 */
export async function updateRideStatus(
  rideId: string,
  status: RideStatus,
  verificationCode?: string
): Promise<{ success: boolean; data?: RideResponse; error?: unknown }> {
  const body: { status: RideStatus; verificationCode?: string } = { status };
  if (verificationCode) {
    body.verificationCode = verificationCode;
  }
  return patch<RideResponse>(`/api/rides/${rideId}/status`, body);
}

/**
 * Cancel a ride with optional reason
 */
export async function cancelRide(
  rideId: string,
  reason?: string
): Promise<{ success: boolean; data?: RideResponse; error?: unknown }> {
  return post<RideResponse>(`/api/rides/${rideId}/cancel`, { reason });
}

/**
 * Get ride history with pagination
 */
export async function getRideHistory(
  page: number = 1,
  limit: number = 20
): Promise<{ success: boolean; data?: RideHistoryResponse; error?: unknown }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  return get<RideHistoryResponse>(`/api/rides/history?${params.toString()}`);
}

/**
 * Get driver tracking points for a ride.
 * Used to backfill movement after app resume/reopen.
 */
export async function getRideDriverTrack(
  rideId: string,
  options?: { since?: string; limit?: number }
): Promise<{ success: boolean; data?: { points: RideTrackingPoint[] }; error?: unknown }> {
  const params = new URLSearchParams();
  if (options?.since) {
    params.set("since", options.since);
  }
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const path = query
    ? `/api/rides/${rideId}/driver-track?${query}`
    : `/api/rides/${rideId}/driver-track`;

  return get<{ points: RideTrackingPoint[] }>(path);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: RideStatus): string {
  const labels: Record<RideStatus, string> = {
    [RideStatus.REQUESTED]: 'Finding Driver',
    [RideStatus.ACCEPTED]: 'Driver Assigned',
    [RideStatus.ARRIVING]: 'Driver Arriving',
    [RideStatus.IN_PROGRESS]: 'In Progress',
    [RideStatus.COMPLETED]: 'Completed',
    [RideStatus.CANCELLED]: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: RideStatus): string {
  const colors: Record<RideStatus, string> = {
    [RideStatus.REQUESTED]: '#f59e0b', // amber
    [RideStatus.ACCEPTED]: '#3b82f6', // blue
    [RideStatus.ARRIVING]: '#8b5cf6', // violet
    [RideStatus.IN_PROGRESS]: '#10b981', // emerald
    [RideStatus.COMPLETED]: '#22c55e', // green
    [RideStatus.CANCELLED]: '#ef4444', // red
  };
  return colors[status] || '#6b7280';
}

/**
 * Check if ride is active (not completed or cancelled)
 */
export function isRideActive(status: RideStatus): boolean {
  return ![RideStatus.COMPLETED, RideStatus.CANCELLED].includes(status);
}

/**
 * Check if ride can be cancelled by passenger
 */
export function canPassengerCancel(status: RideStatus): boolean {
  return [RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVING].includes(status);
}

/**
 * Check if ride can be cancelled by driver
 */
export function canDriverCancel(status: RideStatus): boolean {
  return [RideStatus.ACCEPTED, RideStatus.ARRIVING].includes(status);
}

/**
 * Get the next status for driver action
 */
export function getNextDriverStatus(currentStatus: RideStatus): RideStatus | null {
  const transitions: Partial<Record<RideStatus, RideStatus>> = {
    [RideStatus.ACCEPTED]: RideStatus.ARRIVING,
    [RideStatus.ARRIVING]: RideStatus.IN_PROGRESS,
    [RideStatus.IN_PROGRESS]: RideStatus.COMPLETED,
  };
  return transitions[currentStatus] || null;
}

/**
 * Get driver action label for next status
 */
export function getDriverActionLabel(currentStatus: RideStatus): string | null {
  const labels: Partial<Record<RideStatus, string>> = {
    [RideStatus.ACCEPTED]: "I've Arrived",
    [RideStatus.ARRIVING]: 'Start Ride',
    [RideStatus.IN_PROGRESS]: 'Complete Ride',
  };
  return labels[currentStatus] || null;
}

/**
 * Format vehicle type for display
 */
export function formatVehicleType(vehicleType?: VehicleType | string | null): string {
  if (!vehicleType) return 'Any';
  
  const labels: Record<string, string> = {
    bike: 'Bike',
    scooter: 'Scooter',
    erickshaw: 'E-Rickshaw',
    miniauto: 'Mini Auto',
    auto: 'Auto',
    car: 'Car',
    cab: 'Cab',
    motorcycle: 'Motorcycle',
  };
  return labels[vehicleType] || vehicleType;
}

/**
 * Format fare amount
 */
export function formatFare(fare: number): string {
  return `₹${fare.toFixed(2)}`;
}

/**
 * Format distance
 */
export function formatDistance(distanceKm?: number | null): string {
  if (!distanceKm) return 'N/A';
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)}m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Extend ride timeout (passenger "Wait More" action)
 * Resets the timeout clock for the current ride status
 */
export async function extendRideTimeout(
  rideId: string
): Promise<{ success: boolean; data?: { message: string }; error?: unknown }> {
  return post<{ message: string }>(`/api/rides/${rideId}/extend`, {});
}
