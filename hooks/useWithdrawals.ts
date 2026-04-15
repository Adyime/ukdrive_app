/**
 * useWithdrawals Hook
 * Manages driver withdrawal state and operations
 * 
 * Key principles:
 * - Only drivers can use withdrawals
 * - Never modify wallet balance locally
 * - Display backend errors directly to user
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  getWithdrawals,
  getWithdrawalById,
  requestWithdrawal as requestWithdrawalApi,
  cancelWithdrawal as cancelWithdrawalApi,
  type Withdrawal,
  type WithdrawalStatus,
  type WithdrawalRequestPayload,
} from '@/lib/api/wallet';

// ============================================
// Types
// ============================================

export interface UseWithdrawalsReturn {
  // State
  withdrawals: Withdrawal[];
  loading: boolean;
  hasMore: boolean;
  error: string | null;
  page: number;
  
  // Actions
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  requestWithdrawal: (amount: number, payload: WithdrawalRequestPayload) => Promise<Withdrawal | null>;
  cancelWithdrawal: (id: string) => Promise<boolean>;
  getWithdrawal: (id: string) => Promise<Withdrawal | null>;
  
  // Submission state
  isSubmitting: boolean;
}

export interface UseWithdrawalsOptions {
  // Auto-fetch on mount
  autoFetch?: boolean;
  // Filter by status
  status?: WithdrawalStatus;
  // Page size
  pageSize?: number;
}

// ============================================
// Hook Implementation
// ============================================

export function useWithdrawals(options: UseWithdrawalsOptions = {}): UseWithdrawalsReturn {
  const { autoFetch = true, status, pageSize = 20 } = options;
  const { isAuthenticated, userType } = useAuth();

  // State
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Refs
  const isFetching = useRef(false);

  // Only drivers can use withdrawals
  const isDriver = userType === 'driver';

  /**
   * Fetch withdrawals page
   */
  const fetchWithdrawals = useCallback(async (pageNum: number, reset: boolean = false) => {
    if (!isAuthenticated || !isDriver) {
      setLoading(false);
      return;
    }
    if (isFetching.current) return;

    isFetching.current = true;
    if (reset) {
      setLoading(true);
    }

    try {
      const response = await getWithdrawals(pageNum, pageSize, status);

      if (response.success && response.data) {
        if (reset) {
          setWithdrawals(response.data.withdrawals);
        } else {
          setWithdrawals((prev) => [...prev, ...response.data!.withdrawals]);
        }
        setHasMore(response.data.hasMore);
        setPage(response.data.page);
        setError(null);
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to fetch withdrawals';
        setError(errorMessage);
      }
    } catch (err) {
      console.error('[useWithdrawals] Error fetching withdrawals:', err);
      setError('Failed to fetch withdrawals');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [isAuthenticated, isDriver, pageSize, status]);

  /**
   * Refresh withdrawals (from page 1)
   */
  const refresh = useCallback(async () => {
    setWithdrawals([]);
    setPage(1);
    setHasMore(true);
    await fetchWithdrawals(1, true);
  }, [fetchWithdrawals]);

  /**
   * Load more withdrawals (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loading || isFetching.current) return;
    await fetchWithdrawals(page + 1, false);
  }, [hasMore, loading, page, fetchWithdrawals]);

  /**
   * Request a new withdrawal
   */
  const requestWithdrawal = useCallback(async (
    amount: number,
    payload: WithdrawalRequestPayload
  ): Promise<Withdrawal | null> => {
    if (!isDriver) {
      setError('Only drivers can request withdrawals');
      return null;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await requestWithdrawalApi(amount, payload);

      if (response.success && response.data) {
        // Add new withdrawal to the top of the list
        setWithdrawals((prev) => [response.data!.withdrawal, ...prev]);
        return response.data.withdrawal;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to request withdrawal';
        setError(errorMessage);
        return null;
      }
    } catch (err) {
      console.error('[useWithdrawals] Error requesting withdrawal:', err);
      setError('Failed to request withdrawal');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [isDriver]);

  /**
   * Cancel a pending withdrawal
   */
  const cancelWithdrawalFn = useCallback(async (id: string): Promise<boolean> => {
    if (!isDriver) {
      setError('Only drivers can cancel withdrawals');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await cancelWithdrawalApi(id);

      if (response.success) {
        // Remove from list
        setWithdrawals((prev) => prev.filter((w) => w.id !== id));
        return true;
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to cancel withdrawal';
        setError(errorMessage);
        return false;
      }
    } catch (err) {
      console.error('[useWithdrawals] Error cancelling withdrawal:', err);
      setError('Failed to cancel withdrawal');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [isDriver]);

  /**
   * Get single withdrawal by ID
   */
  const getWithdrawal = useCallback(async (id: string): Promise<Withdrawal | null> => {
    if (!isDriver) {
      return null;
    }

    try {
      const response = await getWithdrawalById(id);

      if (response.success && response.data) {
        return response.data.withdrawal;
      }
      return null;
    } catch (err) {
      console.error('[useWithdrawals] Error fetching withdrawal:', err);
      return null;
    }
  }, [isDriver]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && isAuthenticated && isDriver) {
      fetchWithdrawals(1, true);
    } else if (!isDriver) {
      setLoading(false);
    }
  }, [autoFetch, isAuthenticated, isDriver, fetchWithdrawals]);

  // Reset state when user logs out or is not a driver
  useEffect(() => {
    if (!isAuthenticated || !isDriver) {
      setWithdrawals([]);
      setPage(1);
      setHasMore(true);
      setError(null);
      setLoading(false);
    }
  }, [isAuthenticated, isDriver]);

  return {
    // State
    withdrawals,
    loading,
    hasMore,
    error,
    page,
    
    // Actions
    refresh,
    loadMore,
    requestWithdrawal,
    cancelWithdrawal: cancelWithdrawalFn,
    getWithdrawal,
    
    // Submission state
    isSubmitting,
  };
}
