/**
 * Payment API
 * Handles all payment-related API calls including:
 * - Wallet top-up orders
 * - Ride payment flows
 */

import { get, post } from '../api';

// ============================================
// Types
// ============================================

export type PaymentMethod = 'CASH' | 'WALLET' | 'ONLINE';

export type PaymentOrderStatus = 'CREATED' | 'ATTEMPTED' | 'PAID' | 'FAILED' | 'EXPIRED';

export type RidePaymentStatus =
  | 'PENDING'
  | 'AWAITING_ONLINE'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface PaymentOrder {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export interface OrderStatus {
  orderId: string;
  status: PaymentOrderStatus;
  isPaid: boolean;
}

export interface RidePayment {
  id: string;
  rideId: string;
  paymentMethod: PaymentMethod | null;
  status: RidePaymentStatus;
  fareAmount: number;
  /** When backend applies a reward discount, it may send this. Display only; do not compute on client. */
  discountApplied?: number;
  platformFeeAmount: number;
  platformFeePercent: number;
  driverEarningAmount: number;
  processedAt: string | null;
  failureReason: string | null;
}

export interface PaymentSelectionResult {
  ridePayment: {
    id: string;
    status: RidePaymentStatus;
    paymentMethod: PaymentMethod | null;
    fareAmount: number;
  };
  paymentOrder?: PaymentOrder;
}

export interface CashPaymentStatus {
  canAcceptCash: boolean;
  currentBalance: number;
  minimumRequired: number;
}

// ============================================
// Top-up API Functions
// ============================================

/**
 * Create a Razorpay order for wallet top-up
 */
export async function createTopupOrder(amount: number): Promise<{
  success: boolean;
  data?: { order: PaymentOrder };
  error?: unknown;
}> {
  return post<{ order: PaymentOrder }>('/api/payments/topup/create-order', { amount });
}

/**
 * Get payment order status (for polling after Razorpay checkout)
 */
export async function getOrderStatus(orderId: string): Promise<{
  success: boolean;
  data?: OrderStatus;
  error?: unknown;
}> {
  return get<OrderStatus>(`/api/payments/orders/${orderId}/status`);
}

/**
 * Get payment order details
 */
export async function getPaymentOrder(orderId: string): Promise<{
  success: boolean;
  data?: { order: PaymentOrder };
  error?: unknown;
}> {
  return get<{ order: PaymentOrder }>(`/api/payments/orders/${orderId}`);
}

// ============================================
// Ride Payment API Functions
// ============================================

/**
 * Get payment status for a ride
 */
export async function getRidePayment(rideId: string): Promise<{
  success: boolean;
  data?: { payment: RidePayment | null };
  error?: unknown;
}> {
  // Validate rideId before making request
  if (!rideId || rideId === 'null' || rideId === 'undefined' || rideId.trim() === '') {
    return {
      success: false,
      error: {
        code: 'INVALID_RIDE_ID',
        message: 'Invalid ride ID',
      },
    };
  }
  return get<{ payment: RidePayment | null }>(`/api/rides/${rideId}/payment`);
}

/**
 * Select payment method for a ride (Passenger only)
 * For ONLINE method, also returns a Razorpay order
 */
export async function selectRidePaymentMethod(
  rideId: string,
  method: PaymentMethod
): Promise<{
  success: boolean;
  data?: PaymentSelectionResult;
  error?: unknown;
  message?: string;
}> {
  return post<PaymentSelectionResult>(`/api/rides/${rideId}/payment/select`, { method });
}

/**
 * Process wallet payment for a ride (Passenger only)
 * Must call selectRidePaymentMethod(WALLET) first
 */
export async function processWalletPayment(rideId: string): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: RidePaymentStatus;
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
      status: RidePaymentStatus;
      fareAmount: number;
      processedAt: string | null;
    };
  }>(`/api/rides/${rideId}/payment/pay`);
}

/**
 * Confirm cash payment received (Driver only)
 */
export async function confirmCashPayment(rideId: string): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: RidePaymentStatus;
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
      failureReason: string | null;
    };
  };
  error?: unknown;
  message?: string;
}> {
  return post<{
    payment: {
      id: string;
      status: RidePaymentStatus;
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
      failureReason: string | null;
    };
  }>(`/api/rides/${rideId}/payment/confirm-cash`);
}

/**
 * Create Razorpay order for online ride payment (Passenger only)
 * Alternative to selectRidePaymentMethod(ONLINE) if order already exists
 */
export async function createRidePaymentOrder(rideId: string): Promise<{
  success: boolean;
  data?: { order: PaymentOrder };
  error?: unknown;
  message?: string;
}> {
  return post<{ order: PaymentOrder }>(`/api/rides/${rideId}/payment/create-order`);
}

/**
 * Check if driver can accept cash for a ride (Driver only)
 */
export async function canDriverPayCash(rideId: string): Promise<{
  success: boolean;
  data?: CashPaymentStatus;
  error?: unknown;
}> {
  return get<CashPaymentStatus>(`/api/rides/${rideId}/payment/can-pay-cash`);
}

/**
 * Retry processing online payment after webhook (Recovery endpoint)
 * Used when payment order is PAID but payment processing failed
 */
export async function retryOnlinePayment(rideId: string): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: RidePaymentStatus;
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
      status: RidePaymentStatus;
      fareAmount: number;
      processedAt: string | null;
    };
  }>(`/api/rides/${rideId}/payment/retry-online`);
}

// ============================================
// Driver Payment API Functions
// ============================================

/**
 * Driver confirms payment method and verifies payment (Driver only)
 * ONLINE: Verifies payment is actually completed (2FA)
 * CASH: Processes cash payment (platform fee deducted from driver wallet)
 */
export async function driverConfirmPayment(
  rideId: string,
  method: 'ONLINE' | 'CASH'
): Promise<{
  success: boolean;
  data?: {
    payment: {
      id: string;
      status: RidePaymentStatus;
      paymentMethod: PaymentMethod | null;
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
      failureReason: string | null;
    };
  };
  error?: unknown;
  message?: string;
}> {
  return post<{
    payment: {
      id: string;
      status: RidePaymentStatus;
      paymentMethod: PaymentMethod | null;
      fareAmount: number;
      platformFeeAmount: number;
      driverEarningAmount: number;
      processedAt: string | null;
      failureReason: string | null;
    };
  }>(`/api/rides/${rideId}/payment/driver-confirm`, { method });
}

/**
 * Create Razorpay QR code for ride payment (Driver only)
 * Returns QR code image URL for passenger to scan
 */
export async function createPaymentQRCode(rideId: string): Promise<{
  success: boolean;
  data?: {
    qrCode: {
      qrCodeId: string;
      imageUrl: string;
      shortUrl: string;
    };
    amountRupees?: number;
  };
  error?: unknown;
  message?: string;
}> {
  return post<{
    qrCode: {
      qrCodeId: string;
      imageUrl: string;
      shortUrl: string;
    };
    amountRupees?: number;
  }>(`/api/rides/${rideId}/payment/create-qr`);
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get human-readable payment status label
 */
export function getPaymentStatusLabel(status: RidePaymentStatus): string {
  const labels: Record<RidePaymentStatus, string> = {
    PENDING: 'Pending Payment',
    AWAITING_ONLINE: 'Awaiting Online Payment',
    PROCESSING: 'Processing',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  };
  return labels[status] || status;
}

/**
 * Get payment status color for UI
 */
export function getPaymentStatusColor(status: RidePaymentStatus): string {
  const colors: Record<RidePaymentStatus, string> = {
    PENDING: '#f59e0b', // amber
    AWAITING_ONLINE: '#3b82f6', // blue
    PROCESSING: '#8b5cf6', // violet
    COMPLETED: '#22c55e', // green
    FAILED: '#ef4444', // red
  };
  return colors[status] || '#6b7280';
}

/**
 * Get payment method label
 */
export function getPaymentMethodLabel(method: PaymentMethod | null): string {
  if (!method) return 'Not Selected';
  
  const labels: Record<PaymentMethod, string> = {
    CASH: 'Cash',
    WALLET: 'Wallet',
    ONLINE: 'Online',
  };
  return labels[method] || method;
}

/**
 * Check if payment is in a terminal state (no more updates expected)
 */
export function isPaymentTerminal(status: RidePaymentStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

/**
 * Check if payment requires user action
 */
export function requiresUserAction(status: RidePaymentStatus): boolean {
  return status === 'PENDING' || status === 'AWAITING_ONLINE';
}
