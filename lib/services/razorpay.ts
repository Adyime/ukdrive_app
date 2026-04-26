/**
 * Razorpay Service
 * Wrapper for Razorpay React Native SDK
 * 
 * CRITICAL: Never trust Razorpay success callback alone.
 * Always poll backend for payment confirmation via webhook.
 */

import RazorpayCheckout from 'react-native-razorpay';
import { Platform } from 'react-native';

// ============================================
// Types
// ============================================

export interface RazorpayOptions {
  // Required: Razorpay order ID (from backend)
  orderId: string;
  // Required: Razorpay key ID (from backend)
  keyId: string;
  // Required: Amount in paise (smallest currency unit)
  amountPaise: number;
  // Currency code (default: INR)
  currency?: string;
  // Business name shown in checkout
  name?: string;
  // Description shown in checkout
  description?: string;
  // Prefill customer information
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  // Theme customization
  theme?: {
    color?: string;
  };
  // Notes (metadata)
  notes?: Record<string, string>;
}

export interface RazorpaySuccessResult {
  success: true;
  paymentId: string;
  orderId: string;
  signature: string;
}

export interface RazorpayErrorResult {
  success: false;
  error: {
    code: string;
    description: string;
    platform: string;
    source?: string;
    step?: string;
    reason?: string;
  };
}

export type RazorpayResult = RazorpaySuccessResult | RazorpayErrorResult;

// ============================================
// Constants
// ============================================

const DEFAULT_THEME_COLOR = '#10B981'; // Emerald-500 (app primary color)
const DEFAULT_BUSINESS_NAME = 'UK Drive';

// ============================================
// Main Checkout Function
// ============================================

/**
 * Open Razorpay checkout modal
 * 
 * @param options - Checkout options including order details
 * @returns Promise<RazorpayResult> - Success with payment details or error
 * 
 * IMPORTANT: A success result does NOT mean the payment is complete!
 * The client-side success callback only indicates that Razorpay received
 * the payment attempt. You MUST poll the backend to confirm the payment
 * was actually processed via webhook.
 */
export async function openCheckout(options: RazorpayOptions): Promise<RazorpayResult> {
  const razorpayOptions = {
    key: options.keyId,
    amount: options.amountPaise,
    currency: options.currency || 'INR',
    name: options.name || DEFAULT_BUSINESS_NAME,
    description: options.description || 'Payment',
    order_id: options.orderId,
    prefill: {
      name: options.prefill?.name || '',
      email: options.prefill?.email || '',
      contact: options.prefill?.contact || '',
    },
    theme: {
      color: options.theme?.color || DEFAULT_THEME_COLOR,
    },
    notes: options.notes || {},
  };

  try {
    if (__DEV__) {
      console.log('[Razorpay] Opening checkout:', {
        orderId: options.orderId,
        amount: options.amountPaise / 100,
        currency: options.currency || 'INR',
      });
    }

    const result = await RazorpayCheckout.open(razorpayOptions);

    if (__DEV__) {
      console.log('[Razorpay] Checkout success callback:', result);
    }

    // Success callback received - BUT this doesn't guarantee payment is complete
    // Backend webhook is the source of truth
    return {
      success: true,
      paymentId: result.razorpay_payment_id,
      orderId: result.razorpay_order_id,
      signature: result.razorpay_signature,
    };
  } catch (error: any) {
    const code = error?.code?.toString() || 'UNKNOWN';
    const description =
      error?.description || error?.message || 'Payment failed or cancelled';

    if (__DEV__) {
      console.log('[Razorpay] Checkout error/cancelled:', {
        platform: Platform.OS,
        code,
        description,
        raw: error,
      });
    }

    // Handle cancellation and errors
    const errorResult: RazorpayErrorResult = {
      success: false,
      error: {
        code,
        description,
        platform: Platform.OS,
        source: error.source,
        step: error.step,
        reason: error.reason,
      },
    };

    return errorResult;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Check if error was due to user cancellation
 */
export function isUserCancellation(result: RazorpayErrorResult): boolean {
  // Razorpay returns code 0 or 2 for user cancellation
  const cancelCodes = ['0', '2', 'PAYMENT_CANCELLED'];
  return cancelCodes.includes(result.error.code);
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(result: RazorpayErrorResult): string {
  if (isUserCancellation(result)) {
    return 'Payment was cancelled';
  }

  // Return Razorpay's description if available, otherwise generic message
  return result.error.description || 'Payment failed. Please try again.';
}

/**
 * Format amount for display (paise to rupees)
 */
export function formatAmountFromPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/**
 * Convert rupees to paise
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
