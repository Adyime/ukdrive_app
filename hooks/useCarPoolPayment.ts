/**
 * useCarPoolPayment Hook
 * Manages carpool member payment state and operations
 * 
 * Key principles:
 * - Never trust Razorpay success callback alone
 * - Always poll backend for payment confirmation
 * - Display backend errors directly to user
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  selectCarPoolPaymentMethod,
  processCarPoolWalletPayment,
  confirmCarPoolCashPayment,
  createCarPoolPaymentOrder,
  getCarPoolMemberPayment,
  type CarPoolMemberPayment,
  type PaymentMethod,
  type CarPoolPaymentSelectionResult,
  type PaymentOrder,
} from '@/lib/api/carPool';
import { getWalletBalance } from '@/lib/api/wallet';
import { getOrderStatus } from '@/lib/api/payment';
import { openCheckout } from '@/lib/services/razorpay';

// ============================================
// Types
// ============================================

export interface UseCarPoolPaymentReturn {
  // Payment state
  payment: CarPoolMemberPayment | null;
  walletBalance: number;
  loading: boolean;
  error: string | null;
  
  // Computed values
  canPayWithWallet: boolean;
  isPaymentComplete: boolean;
  isPaymentPending: boolean;
  
  // Actions
  refresh: () => Promise<void>;
  selectPaymentMethod: (method: PaymentMethod) => Promise<CarPoolPaymentSelectionResult | null>;
  processWalletPayment: () => Promise<boolean>;
  confirmCashPayment: () => Promise<boolean>;
  createOnlinePaymentOrder: () => Promise<PaymentOrder | null>;
  
  // Polling
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

export interface UseCarPoolPaymentOptions {
  // Car pool ID
  carPoolId: string;
  // Member ID to fetch payment for
  memberId: string;
  // Auto-fetch on mount
  autoFetch?: boolean;
  // Polling interval in ms (default: 2000)
  pollingInterval?: number;
}

// ============================================
// Hook Implementation
// ============================================

export function useCarPoolPayment(options: UseCarPoolPaymentOptions): UseCarPoolPaymentReturn {
  const { carPoolId, memberId, autoFetch = true, pollingInterval = 2000 } = options;
  const { isAuthenticated, userType, user } = useAuth();

  // State
  const [payment, setPayment] = useState<CarPoolMemberPayment | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // Refs
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetching = useRef(false);

  // Computed values
  const canPayWithWallet = payment 
    ? walletBalance >= payment.fareAmount 
    : false;
  
  const isPaymentComplete = payment?.status === 'COMPLETED';
  const isPaymentPending = payment?.status === 'PENDING' || payment?.status === 'AWAITING_ONLINE';

  /**
   * Fetch payment status and wallet balance
   */
  const fetchPaymentData = useCallback(async () => {
    if (!isAuthenticated || !memberId) return;
    if (isFetching.current) return;

    isFetching.current = true;

    try {
      // Fetch wallet balance
      const walletResponse = await getWalletBalance();
      if (walletResponse.success && walletResponse.data) {
        setWalletBalance(walletResponse.data.balance);
      }

      // Fetch carpool member payment status
      const paymentResponse = await getCarPoolMemberPayment(carPoolId, memberId);
      if (paymentResponse.success) {
        setPayment(paymentResponse.data?.payment ?? null);
        setError(null);
      } else {
        const errorMessage = (paymentResponse.error as any)?.message || 'Failed to fetch payment information';
        setError(errorMessage);
      }
    } catch (err) {
      console.error('[useCarPoolPayment] Error fetching data:', err);
      setError('Failed to fetch payment information');
    } finally {
      isFetching.current = false;
    }
  }, [isAuthenticated, carPoolId, memberId]);

  /**
   * Refresh payment data (public API)
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchPaymentData();
    setLoading(false);
  }, [fetchPaymentData]);

  /**
   * Process wallet payment
   */
  const processWalletPayment = useCallback(async (): Promise<boolean> => {
    if (!memberId) {
      setError('Member ID is required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await processCarPoolWalletPayment(carPoolId, memberId);

      if (response.success && response.data) {
        setPayment((prev) => prev ? {
          ...prev,
          ...response.data!.payment,
        } : null);
        await fetchPaymentData();
        return true;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to process payment';
        setError(errorMessage);
        return false;
      }
    } catch (err) {
      console.error('[useCarPoolPayment] Error processing wallet payment:', err);
      setError('Failed to process payment');
      return false;
    } finally {
      setLoading(false);
    }
  }, [carPoolId, memberId, fetchPaymentData]);

  /**
   * Select payment method
   */
  const selectMethod = useCallback(async (method: PaymentMethod): Promise<CarPoolPaymentSelectionResult | null> => {
    if (!memberId) {
      setError('Member ID is required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await selectCarPoolPaymentMethod(carPoolId, memberId, method);

      if (response.success && response.data) {
        setPayment((prev) => prev ? {
          ...prev,
          ...response.data!.payment,
        } : null);

        if (method === 'ONLINE' && response.data.order) {
          return response.data;
        }

        if (method === 'WALLET') {
          await processWalletPayment();
        }

        return response.data;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to select payment method';
        setError(errorMessage);
        return null;
      }
    } catch (err) {
      console.error('[useCarPoolPayment] Error selecting payment method:', err);
      setError('Failed to select payment method');
      return null;
    } finally {
      setLoading(false);
    }
  }, [carPoolId, memberId, processWalletPayment]);

  /**
   * Confirm cash payment (Driver only)
   */
  const confirmCashPayment = useCallback(async (): Promise<boolean> => {
    if (!memberId) {
      setError('Member ID is required');
      return false;
    }

    if (userType !== 'driver') {
      setError('Only drivers can confirm cash payments');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await confirmCarPoolCashPayment(carPoolId, memberId);

      if (response.success && response.data) {
        setPayment((prev) => prev ? {
          ...prev,
          ...response.data!.payment,
        } : null);
        return true;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to confirm cash payment';
        setError(errorMessage);
        return false;
      }
    } catch (err) {
      console.error('[useCarPoolPayment] Error confirming cash payment:', err);
      setError('Failed to confirm cash payment');
      return false;
    } finally {
      setLoading(false);
    }
  }, [carPoolId, memberId, userType]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsPolling(false);
  }, []);

  /**
   * Start polling for payment status
   * Used after Razorpay checkout to wait for webhook confirmation
   */
  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // Already polling

    setIsPolling(true);

    const poll = async () => {
      if (!isAuthenticated || !carPoolId || !memberId) return;
      
      try {
        const response = await getCarPoolMemberPayment(carPoolId, memberId);
        
        if (response.success && response.data?.payment) {
          const currentStatus = response.data.payment.status;
          setPayment(response.data.payment);
          
          // Stop polling when payment is complete or failed
          if (currentStatus === 'COMPLETED' || currentStatus === 'FAILED') {
            stopPolling();
            return;
          }
        }
      } catch (err) {
        console.error('[useCarPoolPayment] Polling error:', err);
      }
    };

    // Execute immediately then set interval
    poll();
    pollingRef.current = setInterval(poll, pollingInterval);
  }, [isAuthenticated, carPoolId, memberId, pollingInterval, stopPolling]);

  /**
   * Create online payment order and open Razorpay checkout
   */
  const createOnlinePaymentOrder = useCallback(async (): Promise<PaymentOrder | null> => {
    if (!memberId) {
      setError('Member ID is required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await createCarPoolPaymentOrder(carPoolId, memberId);

      if (response.success && response.data) {
        const order = response.data.order;

        // Open Razorpay checkout
        const checkoutResult = await openCheckout({
          orderId: order.razorpayOrderId,
          keyId: order.keyId,
          amountPaise: order.amountPaise,
          currency: order.currency,
          description: `Ride Share Payment ₹${order.amount}`,
          prefill: {
            name: user?.fullName || '',
            contact: user?.phone || '',
          },
        });

        if (checkoutResult.success) {
          // Start polling for payment confirmation
          startPolling();
          return order;
        } else {
          setError('Payment was cancelled or failed');
          return null;
        }
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to create payment order';
        setError(errorMessage);
        return null;
      }
    } catch (err) {
      console.error('[useCarPoolPayment] Error creating payment order:', err);
      setError('Failed to create payment order');
      return null;
    } finally {
      setLoading(false);
    }
  }, [carPoolId, memberId, user, startPolling]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchPaymentData().finally(() => setLoading(false));
    }
  }, [autoFetch, fetchPaymentData]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Stop polling when payment is complete
  useEffect(() => {
    if (isPaymentComplete) {
      stopPolling();
    }
  }, [isPaymentComplete, stopPolling]);

  return {
    payment,
    walletBalance,
    loading,
    error,
    canPayWithWallet,
    isPaymentComplete,
    isPaymentPending,
    refresh,
    selectPaymentMethod: selectMethod,
    processWalletPayment,
    confirmCashPayment,
    createOnlinePaymentOrder,
    startPolling,
    stopPolling,
    isPolling,
  };
}
