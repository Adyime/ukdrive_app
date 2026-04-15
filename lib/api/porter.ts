/**
 * Porter Service API
 * Handles all porter service-related API calls
 */

import { get, post, patch } from '../api';
import type { PaymentMethod, PaymentOrder } from './payment';

// ============================================
// Types
// ============================================

export enum PorterStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export type PackageType =
  | 'DOCUMENT'
  | 'FOOD'
  | 'ELECTRONICS'
  | 'FURNITURE'
  | 'CLOTHING'
  | 'OTHER';

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

export interface PorterServiceResponse {
  id: string;
  customerId: string;
  driverId?: string | null;
  status: PorterStatus;
  // Pickup location
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLocation: string;
  pickupContactName: string;
  pickupContactPhone: string;
  // Delivery location
  deliveryLatitude: number;
  deliveryLongitude: number;
  deliveryLocation: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  // Package details
  packageType: PackageType;
  packageWeight?: number | null;
  packageDimensions?: string | null;
  packageDescription?: string | null;
  isFragile: boolean;
  // Vehicle type
  vehicleType?: string | null;
  vehicleCategoryName?: string;
  vehicleSubcategoryName?: string;
  // Fare and distance
  distance?: number | null;
  fare: number;
  baseFare: number;
  weightCharge?: number | null;
  // Timestamps
  requestedAt: string;
  acceptedAt?: string | null;
  pickedUpAt?: string | null;
  inTransitAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  // Verification code
  verificationCode?: string | null;
  verificationCodeExpiresAt?: string | Date | null;
  // Payment party
  paymentParty: 'SENDER' | 'RECEIVER';
  // Relations
  customer?: PassengerProfile;
  driver?: DriverProfile | null;
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
  distanceKm: number;
}

export interface PorterEstimateOption {
  vehicleSubcategoryId: string;
  vehicleType?: string | null;
  categoryName: string;
  subcategoryName: string;
  slug: string;
  estimatedFare: number;
  distanceKm: number;
}

export interface CreatePorterRequest {
  pickupLatitude: number;
  pickupLongitude: number;
  pickupLocation: string;
  pickupContactName: string;
  pickupContactPhone: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  deliveryLocation: string;
  deliveryContactName: string;
  deliveryContactPhone: string;
  packageType: PackageType;
  packageWeight: number;
  packageDimensions?: string; // "LxWxH" format in cm
  packageDescription?: string;
  isFragile?: boolean;
  vehicleType?: string;
  vehicleSubcategoryId?: string;
  paymentParty?: 'SENDER' | 'RECEIVER';
}

export interface PorterHistoryResponse {
  services: PorterServiceResponse[];  // Backend returns 'services' field
  total: number;
  hasMore: boolean;
}

// ============================================
// Passenger API Functions
// ============================================

/**
 * Create a new porter service request (Passenger only)
 */
export async function createPorterService(
  data: CreatePorterRequest
): Promise<{ success: boolean; data?: PorterServiceResponse; error?: unknown }> {
  return post<PorterServiceResponse>('/api/porter/request', data);
}

/**
 * Get nearby available drivers for porter service (Passenger only)
 */
export async function getNearbyDriversForPorter(
  latitude: number,
  longitude: number,
  vehicleType?: string,
  radius?: number,
  vehicleSubcategoryId?: string
): Promise<{ success: boolean; data?: { drivers: NearbyDriver[] }; error?: unknown }> {
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

  return get<{ drivers: NearbyDriver[] }>(`/api/porter/nearby-drivers?${params.toString()}`);
}

/**
 * Get porter estimate: list of vehicle options with estimated fare and distance.
 * Requires pickup and delivery in same city.
 */
export async function getPorterEstimate(
  pickupLat: number,
  pickupLng: number,
  deliveryLat: number,
  deliveryLng: number,
  options?: { packageType?: PackageType; packageWeight?: number; isFragile?: boolean }
): Promise<{
  success: boolean;
  data?: { options: PorterEstimateOption[]; disclaimer?: string };
  error?: unknown;
}> {
  const params = new URLSearchParams({
    pickupLat: pickupLat.toString(),
    pickupLng: pickupLng.toString(),
    deliveryLat: deliveryLat.toString(),
    deliveryLng: deliveryLng.toString(),
  });
  if (options?.packageType) params.set('packageType', options.packageType);
  if (options?.packageWeight != null) params.set('packageWeight', options.packageWeight.toString());
  if (options?.isFragile) params.set('isFragile', 'true');
  return get<{ options: PorterEstimateOption[]; disclaimer?: string }>(
    `/api/porter/estimate?${params.toString()}`
  );
}

// ============================================
// Driver API Functions
// ============================================

/**
 * Get pending porter service requests nearby (Driver only)
 */
export async function getPendingPorterServices(
  latitude: number,
  longitude: number,
  radius?: number
): Promise<{ success: boolean; data?: { services: PorterServiceResponse[] }; error?: unknown }> {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
  });

  if (radius) {
    params.append('radius', radius.toString());
  }

  return get<{ services: PorterServiceResponse[] }>(`/api/porter/pending?${params.toString()}`);
}

/**
 * Accept a pending porter service request (Driver only)
 */
export async function acceptPorterService(
  porterServiceId: string
): Promise<{ success: boolean; data?: PorterServiceResponse; error?: unknown }> {
  return post<PorterServiceResponse>(`/api/porter/${porterServiceId}/accept`);
}

/**
 * Decline a pending porter service request (Driver only)
 */
export async function declinePorterService(
  porterServiceId: string
): Promise<{ success: boolean; data?: PorterServiceResponse; error?: unknown }> {
  return post<PorterServiceResponse>(`/api/porter/${porterServiceId}/decline`);
}

// ============================================
// Shared API Functions (Passenger & Driver)
// ============================================

/**
 * Get the current active porter service for the user
 */
export async function getActivePorterService(): Promise<{
  success: boolean;
  data?: { porterService: PorterServiceResponse | null };
  error?: unknown;
}> {
  return get<{ porterService: PorterServiceResponse | null }>('/api/porter/active');
}

/**
 * Get porter service details by ID
 */
export async function getPorterServiceById(
  porterServiceId: string
): Promise<{ success: boolean; data?: { porterService: PorterServiceResponse }; error?: unknown }> {
  return get<{ porterService: PorterServiceResponse }>(`/api/porter/${porterServiceId}`);
}

/**
 * Update porter service status
 */
export async function updatePorterStatus(
  porterServiceId: string,
  status: PorterStatus,
  verificationCode?: string
): Promise<{ success: boolean; data?: PorterServiceResponse; error?: unknown }> {
  const body: { status: PorterStatus; verificationCode?: string } = { status };
  if (verificationCode) {
    body.verificationCode = verificationCode;
  }
  return patch<PorterServiceResponse>(`/api/porter/${porterServiceId}/status`, body);
}

/**
 * Cancel a porter service with optional reason
 */
export async function cancelPorterService(
  porterServiceId: string,
  reason?: string
): Promise<{ success: boolean; data?: PorterServiceResponse; error?: unknown }> {
  return post<PorterServiceResponse>(`/api/porter/${porterServiceId}/cancel`, { reason });
}

/**
 * Get porter service history with pagination
 */
export async function getPorterServiceHistory(
  page: number = 1,
  limit: number = 20
): Promise<{ success: boolean; data?: PorterHistoryResponse; error?: unknown }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  return get<PorterHistoryResponse>(`/api/porter/history?${params.toString()}`);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: PorterStatus): string {
  const labels: Record<PorterStatus, string> = {
    [PorterStatus.REQUESTED]: 'Finding Driver',
    [PorterStatus.ACCEPTED]: 'Driver Assigned',
    [PorterStatus.PICKED_UP]: 'Package Picked Up',
    [PorterStatus.IN_TRANSIT]: 'In Transit',
    [PorterStatus.DELIVERED]: 'Delivered',
    [PorterStatus.CANCELLED]: 'Cancelled',
  };
  return labels[status] || status;
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: PorterStatus): string {
  const colors: Record<PorterStatus, string> = {
    [PorterStatus.REQUESTED]: '#f59e0b', // amber
    [PorterStatus.ACCEPTED]: '#3b82f6', // blue
    [PorterStatus.PICKED_UP]: '#8b5cf6', // violet
    [PorterStatus.IN_TRANSIT]: '#10b981', // emerald
    [PorterStatus.DELIVERED]: '#22c55e', // green
    [PorterStatus.CANCELLED]: '#ef4444', // red
  };
  return colors[status] || '#6b7280';
}

/**
 * Check if porter service is active (not completed or cancelled)
 */
export function isPorterServiceActive(status: PorterStatus): boolean {
  return ![PorterStatus.DELIVERED, PorterStatus.CANCELLED].includes(status);
}

/**
 * Check if porter service can be cancelled by customer
 */
export function canCustomerCancel(status: PorterStatus): boolean {
  return [PorterStatus.REQUESTED, PorterStatus.ACCEPTED].includes(status);
}

/**
 * Check if porter service can be cancelled by driver
 */
export function canDriverCancel(status: PorterStatus): boolean {
  return [PorterStatus.ACCEPTED].includes(status);
}

/**
 * Get the next status for driver action
 */
export function getNextDriverStatus(currentStatus: PorterStatus): PorterStatus | null {
  const transitions: Partial<Record<PorterStatus, PorterStatus>> = {
    [PorterStatus.ACCEPTED]: PorterStatus.PICKED_UP,
    [PorterStatus.PICKED_UP]: PorterStatus.IN_TRANSIT,
    [PorterStatus.IN_TRANSIT]: PorterStatus.DELIVERED,
  };
  return transitions[currentStatus] || null;
}

/**
 * Get driver action label for next status
 */
export function getDriverActionLabel(currentStatus: PorterStatus): string | null {
  const labels: Partial<Record<PorterStatus, string>> = {
    [PorterStatus.ACCEPTED]: "Mark as Picked Up",
    [PorterStatus.PICKED_UP]: "Mark as In Transit",
    [PorterStatus.IN_TRANSIT]: "Mark as Delivered",
  };
  return labels[currentStatus] || null;
}

/**
 * Format package type for display
 */
export function formatPackageType(packageType: PackageType): string {
  const labels: Record<PackageType, string> = {
    DOCUMENT: 'Document',
    FOOD: 'Food',
    ELECTRONICS: 'Electronics',
    FURNITURE: 'Furniture',
    CLOTHING: 'Clothing',
    OTHER: 'Other',
  };
  return labels[packageType] || packageType;
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
 * Format weight
 */
export function formatWeight(weightKg?: number | null): string {
  if (!weightKg) return 'N/A';
  return `${weightKg.toFixed(1)} kg`;
}

// ============================================
// Payment API Functions
// ============================================

export type { PaymentMethod, PaymentOrder };

export interface PorterPayment {
  id: string;
  porterServiceId: string;
  paymentMethod: PaymentMethod | null;
  status: 'PENDING' | 'AWAITING_ONLINE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fareAmount: number;
  platformFeeAmount: number;
  driverEarningAmount: number;
  platformFeePercent?: number;
  processedAt: string | null;
}

export interface PorterPaymentSelectionResult {
  payment: {
    id: string;
    status: PorterPayment['status'];
    paymentMethod: PaymentMethod | null;
    fareAmount: number;
  };
  order?: PaymentOrder;
}

/**
 * Get payment status for a porter service.
 */
export async function getPorterPayment(
  porterServiceId: string
): Promise<{
  success: boolean;
  data?: { payment: PorterPayment | null };
  error?: unknown;
  message?: string;
}> {
  return get<{ payment: PorterPayment | null }>(`/api/porter/${porterServiceId}/payment`);
}

/**
 * Select payment method for porter service (Customer only)
 */
export async function selectPorterPaymentMethod(
  porterServiceId: string,
  method: PaymentMethod
): Promise<{
  success: boolean;
  data?: PorterPaymentSelectionResult;
  error?: unknown;
  message?: string;
}> {
  return post<PorterPaymentSelectionResult>(`/api/porter/${porterServiceId}/payment/select-method`, { method });
}

/**
 * Process wallet payment for porter service (Customer only)
 */
export async function processPorterWalletPayment(porterServiceId: string): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: PorterPayment['status'];
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
      status: PorterPayment['status'];
      fareAmount: number;
      processedAt: string | null;
    };
  }>(`/api/porter/${porterServiceId}/payment/pay`);
}

/**
 * Confirm cash payment received (Driver only)
 */
export async function confirmPorterCashPayment(porterServiceId: string): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: PorterPayment['status'];
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
      status: PorterPayment['status'];
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
    };
  }>(`/api/porter/${porterServiceId}/payment/confirm-cash`);
}

/**
 * Create Razorpay order for online porter payment (Customer only)
 */
export async function createPorterPaymentOrder(porterServiceId: string): Promise<{
  success: boolean;
  data?: { order: PaymentOrder };
  error?: unknown;
  message?: string;
}> {
  return post<{ order: PaymentOrder }>(`/api/porter/${porterServiceId}/payment/create-order`);
}

/**
 * Check if driver can accept cash for porter service (Driver only)
 */
export async function canDriverAcceptCashForPorter(porterServiceId: string): Promise<{
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
  }>(`/api/porter/${porterServiceId}/payment/can-pay-cash`);
}

/**
 * Create QR payment order for receiver-pays porter service (Driver only)
 * Returns a checkout URL that can be shown as a QR code
 */
export async function createReceiverQROrder(porterServiceId: string): Promise<{
  success: boolean;
  data?: {
    order: {
      orderId: string;
      razorpayOrderId: string;
      amount: number;
      amountPaise: number;
      currency: string;
      keyId: string;
    };
    checkoutUrl: string;
  };
  error?: unknown;
}> {
  return post<{
    order: {
      orderId: string;
      razorpayOrderId: string;
      amount: number;
      amountPaise: number;
      currency: string;
      keyId: string;
    };
    checkoutUrl: string;
  }>(`/api/porter/${porterServiceId}/payment/receiver-qr-order`, {});
}
