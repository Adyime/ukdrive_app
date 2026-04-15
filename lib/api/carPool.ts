/**
 * Car Pool Service API
 * Handles all car pool-related API calls
 */

import { get, patch, post } from '../api';
import type { PaymentMethod, PaymentOrder } from './payment';
export type { PaymentMethod, PaymentOrder };

// ============================================
// Types
// ============================================

export enum CarPoolStatus {
  CREATED = 'CREATED',
  OPEN = 'OPEN',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum CarPoolMemberStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  OTP_AVAILABLE = 'OTP_AVAILABLE',
  IN_RIDE = 'IN_RIDE',
  DROPPED_OFF = 'DROPPED_OFF',
  CANCELLED = 'CANCELLED',
}

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
}

export interface CarPoolMemberResponse {
  id: string;
  carPoolId: string;
  passengerId: string;
  status: CarPoolMemberStatus;
  passengerCount: number;
  // Pickup
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLocation: string;
  // Destination
  destinationLatitude: number;
  destinationLongitude: number;
  destinationLocation: string;
  // Fare
  fare?: number | null;
  // Member-level OTP / pickup verification
  verificationCode?: string | null;
  verificationCodeGeneratedAt?: string | null;
  otpVerifiedAt?: string | null;
  // Timestamps
  requestedAt: string;
  confirmedAt?: string | null;
  pickedUpAt?: string | null;
  droppedOffAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  // Passenger info
  passenger?: PassengerProfile;
}

export interface CarPoolResponse {
  id: string;
  driverId: string;
  status: CarPoolStatus;
  // Route
  startLatitude: number;
  startLongitude: number;
  startLocation: string;
  endLatitude: number;
  endLongitude: number;
  endLocation: string;
  // Schedule
  departureTime: string;
  // Capacity
  maxPassengers: number;
  currentPassengerCount: number;
  // Fare
  baseFare: number;
  // Each passenger pays baseFare (fixed price per booking)
  calculatedFarePerPerson: number;
  // Total fare for driver (baseFare * passengerCount)
  totalFareForDriver?: number;
  // Vehicle type
  vehicleType?: string | null;
  vehicleCategoryName?: string;
  vehicleSubcategoryName?: string;
  // Notes
  notes?: string | null;
  // Timestamps
  createdAt: string;
  openedAt?: string | null;
  confirmedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  // Verification code
  verificationCode?: string | null;
  verificationCodeExpiresAt?: string | Date | null;
  // Relations
  driver?: DriverProfile;
  members?: CarPoolMemberResponse[];
}

export interface AvailableCarPool {
  id: string;
  driverId: string;
  status: CarPoolStatus;
  startLocation: string;
  endLocation: string;
  departureTime: string;
  maxPassengers: number;
  currentPassengerCount: number;
  availableSeats: number;
  baseFare: number;
  calculatedFarePerPerson: number;
  vehicleType?: string | null;
  driver: {
    id: string;
    fullName: string;
    rating: number;
    vehicleType?: string;
  };
  // Distance from passenger's location (if calculated)
  distanceFromPickup?: number;
}

export interface CreateCarPoolRequest {
  startLatitude: number;
  startLongitude: number;
  startLocation: string;
  endLatitude: number;
  endLongitude: number;
  endLocation: string;
  departureTime: string; // ISO datetime string
  maxPassengers: number; // 1-6
  baseFare: number; // fixed price per passenger, minimum 20
  vehicleType?: string;
  vehicleSubcategoryId?: string;
  notes?: string;
}

export interface JoinCarPoolRequest {
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLocation: string;
  destinationLatitude: number;
  destinationLongitude: number;
  destinationLocation: string;
  passengerCount?: number;
}

export interface CarPoolSearchParams {
  latitude?: number;
  longitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  departureAfter?: string; // ISO datetime string
  departureBefore?: string; // ISO datetime string
  radius?: number; // in km
  page?: number;
  limit?: number;
}

export interface CarPoolHistoryResponse {
  pools: CarPoolResponse[];
  total: number;
  hasMore: boolean;
}

export interface UpdateCarPoolSeatsRequest {
  maxPassengers: number;
}

// ============================================
// Driver API Functions
// ============================================

/**
 * Create a new car pool (Driver only)
 */
export async function createCarPool(
  data: CreateCarPoolRequest
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>('/api/car-pool/create', data);
}

/**
 * Open a car pool for joining (Driver only)
 */
export async function openCarPool(
  carPoolId: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>(`/api/car-pool/${carPoolId}/open`);
}

/**
 * Manually confirm a car pool (Driver only)
 */
export async function confirmCarPool(
  carPoolId: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>(`/api/car-pool/${carPoolId}/confirm`);
}

/**
 * Update seat capacity for an active car pool (Driver only)
 */
export async function updateCarPoolSeats(
  carPoolId: string,
  data: UpdateCarPoolSeatsRequest
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return patch<CarPoolResponse>(`/api/car-pool/${carPoolId}/seats`, data);
}

/**
 * @deprecated Global pool start is deprecated.
 * Use verifyCarPoolMemberPickupOtp for member-level pickup verification.
 */
export async function startCarPool(
  carPoolId: string,
  verificationCode?: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  const body: { verificationCode?: string } = {};
  if (verificationCode) {
    body.verificationCode = verificationCode;
  }
  return post<CarPoolResponse>(`/api/car-pool/${carPoolId}/start`, body);
}

/**
 * Verify pickup OTP for a specific member (Driver only)
 */
export async function verifyCarPoolMemberPickupOtp(
  carPoolId: string,
  memberId: string,
  verificationCode: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>(
    `/api/car-pool/${carPoolId}/member/${memberId}/pickup/verify-otp`,
    { verificationCode }
  );
}

/**
 * Mark member as no-show (Driver only)
 */
export async function markCarPoolMemberNoShow(
  carPoolId: string,
  memberId: string,
  reason?: string
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(
    `/api/car-pool/${carPoolId}/member/${memberId}/pickup/no-show`,
    { reason }
  );
}

/**
 * Regenerate member pickup OTP (Passenger self or pool driver)
 */
export async function regenerateCarPoolMemberPickupOtp(
  carPoolId: string,
  memberId: string
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(
    `/api/car-pool/${carPoolId}/member/${memberId}/pickup/regenerate-otp`
  );
}

/**
 * Drop off a passenger (Driver only)
 */
export async function dropOffPassenger(
  carPoolId: string,
  memberId: string
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(`/api/car-pool/${carPoolId}/member/${memberId}/drop-off`);
}

/**
 * Complete a car pool ride (Driver only)
 */
export async function completeCarPool(
  carPoolId: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>(`/api/car-pool/${carPoolId}/complete`);
}

/**
 * Cancel a car pool (Driver only)
 */
export async function cancelCarPool(
  carPoolId: string,
  reason?: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>(`/api/car-pool/${carPoolId}/cancel`, { reason });
}

/**
 * Accept a join request (Driver only)
 */
export async function acceptJoinRequest(
  carPoolId: string,
  memberId: string
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(`/api/car-pool/${carPoolId}/member/${memberId}/accept`);
}

/**
 * Reject a join request (Driver only)
 */
export async function rejectJoinRequest(
  carPoolId: string,
  memberId: string,
  reason?: string
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(`/api/car-pool/${carPoolId}/member/${memberId}/reject`, { reason });
}

// ============================================
// Passenger API Functions
// ============================================

/**
 * Browse available car pools (Passenger only)
 */
export async function getAvailableCarPools(
  params?: CarPoolSearchParams
): Promise<{ success: boolean; data?: AvailableCarPool[]; meta?: { page?: number; limit?: number; total?: number; hasMore?: boolean; [key: string]: unknown }; error?: unknown; message?: string }> {
  const queryParams = new URLSearchParams();
  
  if (params?.latitude !== undefined) {
    queryParams.append('latitude', params.latitude.toString());
  }
  if (params?.longitude !== undefined) {
    queryParams.append('longitude', params.longitude.toString());
  }
  if (params?.destinationLatitude !== undefined) {
    queryParams.append('destinationLatitude', params.destinationLatitude.toString());
  }
  if (params?.destinationLongitude !== undefined) {
    queryParams.append('destinationLongitude', params.destinationLongitude.toString());
  }
  if (params?.departureAfter) {
    queryParams.append('departureAfter', params.departureAfter);
  }
  if (params?.departureBefore) {
    queryParams.append('departureBefore', params.departureBefore);
  }
  if (params?.radius !== undefined) {
    queryParams.append('radius', params.radius.toString());
  }
  if (params?.page !== undefined) {
    queryParams.append('page', params.page.toString());
  }
  if (params?.limit !== undefined) {
    queryParams.append('limit', params.limit.toString());
  }

  const queryString = queryParams.toString();
  return get<AvailableCarPool[]>(`/api/car-pool/available${queryString ? `?${queryString}` : ''}`);
}

/**
 * Request to join a car pool (Passenger only)
 */
export async function joinCarPool(
  carPoolId: string,
  data: JoinCarPoolRequest
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(`/api/car-pool/${carPoolId}/join`, data);
}

/**
 * Leave a car pool (Passenger only)
 */
export async function leaveCarPool(
  carPoolId: string,
  reason?: string
): Promise<{ success: boolean; data?: CarPoolMemberResponse; error?: unknown }> {
  return post<CarPoolMemberResponse>(`/api/car-pool/${carPoolId}/leave`, { reason });
}

/**
 * Regenerate verification code for a car pool (Passenger only, when code expires)
 */
export async function regenerateCarPoolVerificationCode(
  carPoolId: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return post<CarPoolResponse>(`/api/car-pool/${carPoolId}/regenerate-verification-code`);
}

// ============================================
// Shared API Functions
// ============================================

/**
 * Get car pool details by ID
 */
export async function getCarPoolById(
  carPoolId: string
): Promise<{ success: boolean; data?: CarPoolResponse; error?: unknown }> {
  return get<CarPoolResponse>(`/api/car-pool/${carPoolId}`);
}

/**
 * Get my car pools (Driver or Passenger)
 */
export async function getMyCarPools(
  page: number = 1,
  limit: number = 20,
  status?: CarPoolStatus[]
): Promise<{ success: boolean; data?: CarPoolResponse[]; meta?: { page?: number; limit?: number; total?: number; hasMore?: boolean; [key: string]: unknown }; error?: unknown }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (status && status.length > 0) {
    params.append('status', status.join(','));
  }

  return get<CarPoolResponse[]>(`/api/car-pool/my-pools?${params.toString()}`);
}

/**
 * Get active car pool (Driver or Passenger)
 */
export async function getActiveCarPool(): Promise<{ success: boolean; data?: CarPoolResponse | null; error?: unknown }> {
  const response = await getMyCarPools(1, 20, [
    CarPoolStatus.CREATED,
    CarPoolStatus.OPEN,
    CarPoolStatus.CONFIRMED,
    CarPoolStatus.IN_PROGRESS,
  ]);
  
  if (response.success && response.data && response.data.length > 0) {
    const getPoolPriority = (pool: CarPoolResponse): number => {
      const hasMemberOtp = pool.members?.some(
        (member) =>
          member.status === CarPoolMemberStatus.OTP_AVAILABLE &&
          !!member.verificationCode
      );
      if (hasMemberOtp) return 0;
      if (pool.status === CarPoolStatus.IN_PROGRESS) return 1;
      if (pool.status === CarPoolStatus.CONFIRMED) return 2;
      if (pool.status === CarPoolStatus.OPEN) return 3;
      return 4;
    };

    const getPoolTime = (pool: CarPoolResponse): number => {
      const candidate =
        pool.confirmedAt ??
        pool.startedAt ??
        pool.openedAt ??
        pool.departureTime ??
        pool.createdAt;
      const timestamp = new Date(candidate).getTime();
      return Number.isFinite(timestamp) ? timestamp : 0;
    };

    const bestPool = [...response.data].sort((a, b) => {
      const priorityDiff = getPoolPriority(a) - getPoolPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      return getPoolTime(b) - getPoolTime(a);
    })[0];

    return { success: true, data: bestPool };
  }
  
  return { success: true, data: null };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: CarPoolStatus): string {
  const labels: Record<CarPoolStatus, string> = {
    [CarPoolStatus.CREATED]: 'Created',
    [CarPoolStatus.OPEN]: 'Open for Joining',
    [CarPoolStatus.CONFIRMED]: 'Confirmed',
    [CarPoolStatus.IN_PROGRESS]: 'In Progress',
    [CarPoolStatus.COMPLETED]: 'Completed',
    [CarPoolStatus.CANCELLED]: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: CarPoolStatus): string {
  const colors: Record<CarPoolStatus, string> = {
    [CarPoolStatus.CREATED]: '#6b7280', // gray
    [CarPoolStatus.OPEN]: '#3b82f6', // blue
    [CarPoolStatus.CONFIRMED]: '#8b5cf6', // violet
    [CarPoolStatus.IN_PROGRESS]: '#10b981', // emerald
    [CarPoolStatus.COMPLETED]: '#22c55e', // green
    [CarPoolStatus.CANCELLED]: '#ef4444', // red
  };
  return colors[status] || '#6b7280';
}

/**
 * Get member status label
 */
export function getMemberStatusLabel(status: CarPoolMemberStatus): string {
  const labels: Record<CarPoolMemberStatus, string> = {
    [CarPoolMemberStatus.PENDING]: 'Pending',
    [CarPoolMemberStatus.CONFIRMED]: 'Confirmed',
    [CarPoolMemberStatus.OTP_AVAILABLE]: 'Waiting Pickup OTP',
    [CarPoolMemberStatus.IN_RIDE]: 'In Ride',
    [CarPoolMemberStatus.DROPPED_OFF]: 'Dropped Off',
    [CarPoolMemberStatus.CANCELLED]: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get member status color
 */
export function getMemberStatusColor(status: CarPoolMemberStatus): string {
  const colors: Record<CarPoolMemberStatus, string> = {
    [CarPoolMemberStatus.PENDING]: '#f59e0b', // amber
    [CarPoolMemberStatus.CONFIRMED]: '#3b82f6', // blue
    [CarPoolMemberStatus.OTP_AVAILABLE]: '#8b5cf6', // violet
    [CarPoolMemberStatus.IN_RIDE]: '#10b981', // emerald
    [CarPoolMemberStatus.DROPPED_OFF]: '#22c55e', // green
    [CarPoolMemberStatus.CANCELLED]: '#ef4444', // red
  };
  return colors[status] || '#6b7280';
}

/**
 * Check if car pool is active (not completed or cancelled)
 */
export function isCarPoolActive(status: CarPoolStatus): boolean {
  return ![CarPoolStatus.COMPLETED, CarPoolStatus.CANCELLED].includes(status);
}

/**
 * Check if car pool can be cancelled by driver
 */
export function canDriverCancel(status: CarPoolStatus): boolean {
  return [CarPoolStatus.CREATED, CarPoolStatus.OPEN, CarPoolStatus.CONFIRMED].includes(status);
}

/**
 * Check if passenger can leave car pool
 */
export function canPassengerLeave(status: CarPoolStatus, memberStatus: CarPoolMemberStatus): boolean {
  if (memberStatus === CarPoolMemberStatus.CANCELLED || memberStatus === CarPoolMemberStatus.DROPPED_OFF) {
    return false;
  }
  return [CarPoolStatus.CREATED, CarPoolStatus.OPEN].includes(status);
}

/**
 * Get the next status for driver action
 */
export function getNextDriverStatus(currentStatus: CarPoolStatus): CarPoolStatus | null {
  const transitions: Partial<Record<CarPoolStatus, CarPoolStatus>> = {
    [CarPoolStatus.CREATED]: CarPoolStatus.OPEN,
    [CarPoolStatus.OPEN]: CarPoolStatus.CONFIRMED,
    [CarPoolStatus.CONFIRMED]: CarPoolStatus.IN_PROGRESS,
    [CarPoolStatus.IN_PROGRESS]: CarPoolStatus.COMPLETED,
  };
  return transitions[currentStatus] || null;
}

/**
 * Get driver action label for next status
 */
export function getDriverActionLabel(currentStatus: CarPoolStatus): string | null {
  const labels: Partial<Record<CarPoolStatus, string>> = {
    [CarPoolStatus.CREATED]: 'Open for Joining',
    [CarPoolStatus.OPEN]: 'Confirm Pool',
    [CarPoolStatus.CONFIRMED]: 'Start Ride',
    [CarPoolStatus.IN_PROGRESS]: 'Complete Ride',
  };
  return labels[currentStatus] || null;
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
 * Format date/time
 */
export function formatDateTime(dateTime: string | Date): string {
  const date = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  if (dateOnly.getTime() === yesterday.getTime()) {
    return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format departure time for display
 */
export function formatDepartureTime(departureTime: string | Date): string {
  return formatDateTime(departureTime);
}

/**
 * Check if departure time is in the past
 */
export function isDepartureTimePast(departureTime: string | Date): boolean {
  const date = typeof departureTime === 'string' ? new Date(departureTime) : departureTime;
  return date < new Date();
}

/**
 * Get available seats count
 */
export function getAvailableSeats(maxPassengers: number, currentPassengerCount: number): number {
  return Math.max(0, maxPassengers - currentPassengerCount);
}

// ============================================
// Payment API Functions (Per Member)
// ============================================

export interface CarPoolMemberPayment {
  id: string;
  memberId: string;
  paymentMethod: PaymentMethod | null;
  status: 'PENDING' | 'AWAITING_ONLINE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fareAmount: number;
  platformFeeAmount: number;
  platformFeePercent: number;
  driverEarningAmount: number;
  discountApplied?: number;
  processedAt: string | null;
  failureReason?: string | null;
}

export interface CarPoolPaymentSelectionResult {
  payment: {
    id: string;
    status: CarPoolMemberPayment['status'];
    paymentMethod: PaymentMethod | null;
    fareAmount: number;
  };
  order?: PaymentOrder;
}

/**
 * Get payment status for a carpool member.
 */
export async function getCarPoolMemberPayment(
  carPoolId: string,
  memberId: string
): Promise<{
  success: boolean;
  data?: { payment: CarPoolMemberPayment | null };
  error?: unknown;
  message?: string;
}> {
  return get<{ payment: CarPoolMemberPayment | null }>(`/api/car-pool/${carPoolId}/member/${memberId}/payment`);
}

/**
 * Select payment method for carpool member (Passenger only)
 */
export async function selectCarPoolPaymentMethod(
  carPoolId: string,
  memberId: string,
  method: PaymentMethod
): Promise<{
  success: boolean;
  data?: CarPoolPaymentSelectionResult;
  error?: unknown;
  message?: string;
}> {
  return post<CarPoolPaymentSelectionResult>(`/api/car-pool/${carPoolId}/member/${memberId}/payment/select-method`, { method });
}

/**
 * Process wallet payment for carpool member (Passenger only)
 */
export async function processCarPoolWalletPayment(
  carPoolId: string,
  memberId: string
): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: CarPoolMemberPayment['status'];
      fareAmount: number;
      processedAt: string | null;
    };
  };
  error?: unknown;
  message?: string;
}> {
  return post<{
    payment: {
      id: string;
      status: CarPoolMemberPayment['status'];
      fareAmount: number;
      processedAt: string | null;
    };
  }>(`/api/car-pool/${carPoolId}/member/${memberId}/payment/pay`);
}

/**
 * Confirm cash payment received (Driver only)
 */
export async function confirmCarPoolCashPayment(
  carPoolId: string,
  memberId: string
): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: CarPoolMemberPayment['status'];
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
    };
  };
  error?: unknown;
  message?: string;
}> {
  return post<{
    payment: {
      id: string;
      status: CarPoolMemberPayment['status'];
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
    };
  }>(`/api/car-pool/${carPoolId}/member/${memberId}/payment/confirm-cash`);
}

/**
 * Create Razorpay order for online carpool payment (Passenger only)
 */
export async function createCarPoolPaymentOrder(
  carPoolId: string,
  memberId: string
): Promise<{
  success: boolean;
  data?: { order: PaymentOrder };
  error?: unknown;
  message?: string;
}> {
  return post<{ order: PaymentOrder }>(`/api/car-pool/${carPoolId}/member/${memberId}/payment/create-order`);
}

/**
 * Check if driver can accept cash for car pool (Driver only)
 */
export async function canDriverAcceptCashForCarPool(carPoolId: string): Promise<{
  success: boolean;
  data?: {
    canAccept: boolean;
    currentBalance: number;
    minimumRequired: number;
  };
  error?: unknown;
}> {
  return get<{
    canAccept: boolean;
    currentBalance: number;
    minimumRequired: number;
  }>(`/api/car-pool/${carPoolId}/payment/can-pay-cash`);
}
