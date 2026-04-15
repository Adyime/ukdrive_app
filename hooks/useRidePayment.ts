/**
 * useRidePayment Hook
 * Manages ride payment state and operations
 * 
 * Key principles:
 * - Never trust Razorpay success callback alone
 * - Always poll backend for payment confirmation
 * - Display backend errors directly to user
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  getRidePayment,
  selectRidePaymentMethod,
  processWalletPayment as processWalletPaymentApi,
  confirmCashPayment as confirmCashPaymentApi,
  createRidePaymentOrder,
  type RidePayment,
  type PaymentMethod,
  type PaymentSelectionResult,
  type PaymentOrder,
} from '@/lib/api/payment';
import { getWalletBalance } from '@/lib/api/wallet';
import { usePaymentStatus } from './usePaymentStatus';

// ============================================
// Types
// ============================================

export interface UseRidePaymentReturn {
  // Payment state
  payment: RidePayment | null;
  walletBalance: number;
  loading: boolean;
  error: string | null;
  
  // Computed values
  canPayWithWallet: boolean;
  isPaymentComplete: boolean;
  isPaymentPending: boolean;
  
  // Actions
  refresh: () => Promise<void>;
  selectPaymentMethod: (method: PaymentMethod) => Promise<PaymentSelectionResult | null>;
  processWalletPayment: () => Promise<boolean>;
  confirmCashPayment: () => Promise<boolean>;
  createOnlinePaymentOrder: () => Promise<PaymentOrder | null>;
  
  // Polling
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
}

export interface UseRidePaymentOptions {
  // Ride ID to fetch payment for
  rideId: string;
  // Auto-fetch on mount
  autoFetch?: boolean;
  // Polling interval in ms (default: 2000)
  pollingInterval?: number;
  // Use Supabase realtime subscription instead of polling (default: false)
  useRealtime?: boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useRidePayment(options: UseRidePaymentOptions): UseRidePaymentReturn {
  const { rideId, autoFetch = true, pollingInterval = 2000, useRealtime = false } = options;
  const { isAuthenticated, userType } = useAuth();

  // State
  const [payment, setPayment] = useState<RidePayment | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // Refs
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetching = useRef(false);

  // Supabase realtime subscription (if enabled)
  const paymentStatus = usePaymentStatus({
    rideId: useRealtime && rideId ? rideId : null,
    enabled: useRealtime && isAuthenticated && !!rideId && rideId !== 'null' && rideId !== 'undefined' && rideId.trim() !== '',
    onUpdate: (updatedPayment) => {
      setPayment(updatedPayment);
      setError(null);
    },
    onError: (err) => {
      console.warn('[useRidePayment] Realtime subscription error, falling back to polling:', err);
      setError(err.message);
      // Fallback to polling if subscription fails
      if (!isPolling) {
        startPolling();
      }
    },
  });

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
    if (!isAuthenticated || !rideId || rideId === 'null' || rideId === 'undefined' || rideId.trim() === '') return;
    if (isFetching.current) return;

    isFetching.current = true;

    try {
      // Fetch payment and wallet balance in parallel
      const [paymentResponse, walletResponse] = await Promise.all([
        getRidePayment(rideId),
        getWalletBalance(),
      ]);

      if (paymentResponse.success && paymentResponse.data) {
        setPayment(paymentResponse.data.payment);
      }

      if (walletResponse.success && walletResponse.data) {
        setWalletBalance(walletResponse.data.balance);
      }

      setError(null);
    } catch (err) {
      console.error('[useRidePayment] Error fetching data:', err);
      setError('Failed to fetch payment information');
    } finally {
      isFetching.current = false;
    }
  }, [isAuthenticated, rideId]);

  /**
   * Refresh payment data (public API)
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchPaymentData();
    setLoading(false);
  }, [fetchPaymentData]);

  /**
   * Select payment method
   */
  const selectMethod = useCallback(async (method: PaymentMethod): Promise<PaymentSelectionResult | null> => {
    if (!rideId) {
      setError('Ride ID is required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await selectRidePaymentMethod(rideId, method);

      if (response.success && response.data) {
        // Update local payment state
        setPayment((prev) => prev ? {
          ...prev,
          paymentMethod: response.data!.ridePayment.paymentMethod,
          status: response.data!.ridePayment.status,
        } : null);

        return response.data;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to select payment method';
        setError(errorMessage);
        return null;
      }
    } catch (err) {
      console.error('[useRidePayment] Error selecting payment method:', err);
      setError('Failed to select payment method');
      return null;
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  /**
   * Process wallet payment
   */
  const processWallet = useCallback(async (): Promise<boolean> => {
    if (!rideId) {
      setError('Ride ID is required');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await processWalletPaymentApi(rideId);

      if (response.success && response.data) {
        // Refresh to get updated state
        await fetchPaymentData();
        return true;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to process payment';
        setError(errorMessage);
        return false;
      }
    } catch (err) {
      console.error('[useRidePayment] Error processing wallet payment:', err);
      setError('Failed to process payment');
      return false;
    } finally {
      setLoading(false);
    }
  }, [rideId, fetchPaymentData]);

  /**
   * Confirm cash payment (driver only)
   */
  const confirmCash = useCallback(async (): Promise<boolean> => {
    if (!rideId) {
      setError('Ride ID is required');
      return false;
    }

    if (userType !== 'driver') {
      setError('Only drivers can confirm cash payments');
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await confirmCashPaymentApi(rideId);

      if (response.success && response.data) {
        // Refresh to get updated state
        await fetchPaymentData();
        return true;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to confirm cash payment';
        setError(errorMessage);
        return false;
      }
    } catch (err) {
      console.error('[useRidePayment] Error confirming cash payment:', err);
      setError('Failed to confirm cash payment');
      return false;
    } finally {
      setLoading(false);
    }
  }, [rideId, userType, fetchPaymentData]);

  /**
   * Create online payment order
   */
  const createOnlineOrder = useCallback(async (): Promise<PaymentOrder | null> => {
    if (!rideId) {
      setError('Ride ID is required');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await createRidePaymentOrder(rideId);

      if (response.success && response.data) {
        return response.data.order;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to create payment order';
        setError(errorMessage);
        return null;
      }
    } catch (err) {
      console.error('[useRidePayment] Error creating payment order:', err);
      setError('Failed to create payment order');
      return null;
    } finally {
      setLoading(false);
    }
  }, [rideId]);

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
      if (!isAuthenticated || !rideId || rideId === 'null' || rideId === 'undefined' || rideId.trim() === '') return;
      
      try {
        const response = await getRidePayment(rideId);
        
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
        console.error('[useRidePayment] Polling error:', err);
      }
    };

    // Execute immediately then set interval
    poll();
    pollingRef.current = setInterval(poll, pollingInterval);
  }, [isAuthenticated, rideId, pollingInterval, stopPolling]);

  // Sync payment from realtime subscription
  useEffect(() => {
    if (useRealtime && paymentStatus.payment) {
      setPayment(paymentStatus.payment);
      setLoading(false);
    }
  }, [useRealtime, paymentStatus.payment]);

  // Auto-fetch on mount (only if not using realtime)
  useEffect(() => {
    if (!useRealtime && autoFetch && isAuthenticated && rideId && rideId !== 'null' && rideId !== 'undefined' && rideId.trim() !== '') {
      refresh();
    } else if (useRealtime && autoFetch && isAuthenticated && rideId && rideId !== 'null' && rideId !== 'undefined' && rideId.trim() !== '') {
      // Initial fetch even with realtime to get current state
      refresh();
    }
  }, [autoFetch, isAuthenticated, rideId, refresh, useRealtime]);

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Auto-stop polling when payment is terminal (only if using polling)
  useEffect(() => {
    if (!useRealtime && (payment?.status === 'COMPLETED' || payment?.status === 'FAILED')) {
      stopPolling();
    }
  }, [payment?.status, stopPolling, useRealtime]);

  return {
    // State
    payment,
    walletBalance,
    loading,
    error,
    
    // Computed
    canPayWithWallet,
    isPaymentComplete,
    isPaymentPending,
    
    // Actions
    refresh,
    selectPaymentMethod: selectMethod,
    processWalletPayment: processWallet,
    confirmCashPayment: confirmCash,
    createOnlinePaymentOrder: createOnlineOrder,
    
    // Polling
    startPolling,
    stopPolling,
    isPolling,
  };
}
