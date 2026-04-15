/**
 * usePorterPayment Hook
 * Manages porter service payment state and operations
 * 
 * Key principles:
 * - Never trust Razorpay success callback alone
 * - Always poll backend for payment confirmation
 * - Display backend errors directly to user
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  selectPorterPaymentMethod,
  processPorterWalletPayment,
  confirmPorterCashPayment,
  createPorterPaymentOrder,
  getPorterPayment,
  type PorterPayment,
  type PaymentMethod,
  type PorterPaymentSelectionResult,
  type PaymentOrder,
} from '@/lib/api/porter';
import { getWalletBalance } from '@/lib/api/wallet';
import { getOrderStatus } from '@/lib/api/payment';
import { openCheckout } from '@/lib/services/razorpay';

// ============================================
// Types
// ============================================

export interface UsePorterPaymentReturn {
  // Payment state
  payment: PorterPayment | null;
  walletBalance: number;
  loading: boolean;
  error: string | null;
  
  // Computed values
  canPayWithWallet: boolean;
  isPaymentComplete: boolean;
  isPaymentPending: boolean;
  
  // Actions
  refresh: () => Promise<void>;
  selectPaymentMethod: (method: PaymentMethod) => Promise<PorterPaymentSelectionResult | null>;
  processWalletPayment: () => Promise<boolean>;
  confirmCashPayment: () => Promise<boolean>;
  createOnlinePaymentOrder: () => Promise<PaymentOrder | null>;
  
  // Polling
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

export interface UsePorterPaymentOptions {
  // Porter service ID to fetch payment for
  porterServiceId: string;
  // Auto-fetch on mount
  autoFetch?: boolean;
  // Polling interval in ms (default: 2000)
  pollingInterval?: number;
}

// ============================================
// Hook Implementation
// ============================================

export function usePorterPayment(options: UsePorterPaymentOptions): UsePorterPaymentReturn {
  const { porterServiceId, autoFetch = true, pollingInterval = 2000 } = options;
  const { isAuthenticated, userType, user } = useAuth();

  // State
  const [payment, setPayment] = useState<PorterPayment | null>(null);
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
    if (!isAuthenticated || !porterServiceId) return;
    if (isFetching.current) return;

    isFetching.current = true;

    try {
      // Fetch wallet balance
      const walletResponse = await getWalletBalance();
      if (walletResponse.success && walletResponse.data) {
        setWalletBalance(walletResponse.data.balance);
      }

      // Fetch porter payment status
      const paymentResponse = await getPorterPayment(porterServiceId);
      if (paymentResponse.success) {
        setPayment(paymentResponse.data?.payment ?? null);
      }

      setError(null);
    } catch (err) {
      console.error('[usePorterPayment] Error fetching data:', err);
      setError('Failed to fetch payment information');
    } finally {
      isFetching.current = false;
    }
  }, [isAuthenticated, porterServiceId]);

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
    if (!porterServiceId) {
      setError('Parcel service ID is required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await processPorterWalletPayment(porterServiceId);

      if (response.success && response.data) {
        setPayment((prev) => prev ? {
          ...prev,
          ...response.data!.payment,
        } : null);
        await fetchPaymentData(); // Refresh wallet balance
        return true;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to process payment';
        setError(errorMessage);
        return false;
      }
    } catch (err) {
      console.error('[usePorterPayment] Error processing wallet payment:', err);
      setError('Failed to process payment');
      return false;
    } finally {
      setLoading(false);
    }
  }, [porterServiceId, fetchPaymentData]);

  /**
   * Select payment method
   */
  const selectMethod = useCallback(async (method: PaymentMethod): Promise<PorterPaymentSelectionResult | null> => {
    if (!porterServiceId) {
      setError('Parcel service ID is required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await selectPorterPaymentMethod(porterServiceId, method);

      if (response.success && response.data) {
        // Update local payment state (backend may have created payment; set even when prev was null)
        const fromApi = response.data.payment;
        const hadNoPayment = !payment;
        setPayment((prev) => ({
          ...(prev || {}),
          ...fromApi,
          platformFeeAmount: (prev?.platformFeeAmount ?? (fromApi as any).platformFeeAmount) ?? 0,
          driverEarningAmount: (prev?.driverEarningAmount ?? (fromApi as any).driverEarningAmount) ?? 0,
          processedAt: prev?.processedAt ?? (fromApi as any).processedAt ?? null,
          porterServiceId: porterServiceId,
        } as PorterPayment));

        // If we had no payment, refetch to get full record (platformFeePercent, etc.)
        if (hadNoPayment) {
          fetchPaymentData();
        }

        // If online payment, return order for Razorpay checkout
        if (method === 'ONLINE' && response.data.order) {
          return response.data;
        }

        // If wallet, automatically process
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
      console.error('[usePorterPayment] Error selecting payment method:', err);
      setError('Failed to select payment method');
      return null;
    } finally {
      setLoading(false);
    }
  }, [porterServiceId, payment, processWalletPayment, fetchPaymentData]);

  /**
   * Confirm cash payment (Driver only)
   */
  const confirmCashPayment = useCallback(async (): Promise<boolean> => {
    if (!porterServiceId) {
      setError('Parcel service ID is required');
      return false;
    }

    if (userType !== 'driver') {
      setError('Only drivers can confirm cash payments');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await confirmPorterCashPayment(porterServiceId);

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
      console.error('[usePorterPayment] Error confirming cash payment:', err);
      setError('Failed to confirm cash payment');
      return false;
    } finally {
      setLoading(false);
    }
  }, [porterServiceId, userType]);

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
      if (!isAuthenticated || !porterServiceId) return;
      
      try {
        const response = await getPorterPayment(porterServiceId);
        
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
        console.error('[usePorterPayment] Polling error:', err);
      }
    };

    // Execute immediately then set interval
    poll();
    pollingRef.current = setInterval(poll, pollingInterval);
  }, [isAuthenticated, porterServiceId, pollingInterval, stopPolling]);

  /**
   * Create online payment order and open Razorpay checkout
   */
  const createOnlinePaymentOrder = useCallback(async (): Promise<PaymentOrder | null> => {
    if (!porterServiceId) {
      setError('Parcel service ID is required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await createPorterPaymentOrder(porterServiceId);

      if (response.success && response.data) {
        const order = response.data.order;

        // Open Razorpay checkout
        const checkoutResult = await openCheckout({
          orderId: order.razorpayOrderId,
          keyId: order.keyId,
          amountPaise: order.amountPaise,
          currency: order.currency,
          description: `Parcel Service Payment ₹${order.amount}`,
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
      console.error('[usePorterPayment] Error creating payment order:', err);
      setError('Failed to create payment order');
      return null;
    } finally {
      setLoading(false);
    }
  }, [porterServiceId, user, startPolling]);

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
