/**
 * useWallet Hook
 * Manages wallet state including balance and transaction history
 * 
 * Key principle: Never store money state locally.
 * Always fetch from backend as source of truth.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/auth-context';
import {
  getWalletBalance,
  getWalletTransactions,
  type WalletBalance,
  type WalletTransaction,
  type WalletTransactionType,
} from '@/lib/api/wallet';

// ============================================
// Types
// ============================================

export interface UseWalletReturn {
  // Balance
  balance: number;
  formattedBalance: string;
  walletId: string | null;
  isActive: boolean;
  
  // Transactions
  transactions: WalletTransaction[];
  transactionsLoading: boolean;
  transactionsHasMore: boolean;
  transactionsPage: number;
  
  // State
  loading: boolean;
  error: string | null;
  
  // Actions
  refresh: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  loadMoreTransactions: () => Promise<void>;
  resetTransactions: () => void;
}

export interface UseWalletOptions {
  // Auto-fetch on mount
  autoFetch?: boolean;
  // Fetch transactions on mount
  fetchTransactions?: boolean;
  // Transaction filter
  transactionType?: WalletTransactionType;
  // Transaction reference type filter
  referenceType?: string;
  // Transactions per page
  pageSize?: number;
}

// ============================================
// Hook Implementation
// ============================================

export function useWallet(options: UseWalletOptions = {}): UseWalletReturn {
  const {
    autoFetch = true,
    fetchTransactions = true,
    transactionType,
    referenceType,
    pageSize = 20,
  } = options;

  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Balance state
  const [balance, setBalance] = useState<number>(0);
  const [formattedBalance, setFormattedBalance] = useState<string>('₹0.00');
  const [walletId, setWalletId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Transactions state
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState<boolean>(false);
  const [transactionsHasMore, setTransactionsHasMore] = useState<boolean>(true);
  const [transactionsPage, setTransactionsPage] = useState<number>(1);

  // Prevent duplicate fetches
  const isFetchingBalance = useRef(false);
  const isFetchingTransactions = useRef(false);

  /**
   * Fetch wallet balance from backend
   */
  const refreshBalance = useCallback(async () => {
    if (!isAuthenticated || authLoading) return;
    if (isFetchingBalance.current) return;

    isFetchingBalance.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await getWalletBalance();

      if (response.success && response.data) {
        setBalance(response.data.balance);
        setFormattedBalance(response.data.formattedBalance);
        setWalletId(response.data.walletId);
        setIsActive(response.data.isActive);
      } else {
        const errorMessage = (response.error as any)?.message || 'Failed to fetch wallet balance';
        setError(errorMessage);
      }
    } catch (err) {
      console.error('[useWallet] Error fetching balance:', err);
      setError('Failed to fetch wallet balance');
    } finally {
      setLoading(false);
      isFetchingBalance.current = false;
    }
  }, [isAuthenticated, authLoading]);

  /**
   * Fetch transactions from backend
   */
  const fetchTransactionsPage = useCallback(async (page: number, reset: boolean = false) => {
    if (!isAuthenticated || authLoading) return;
    if (isFetchingTransactions.current) return;

    isFetchingTransactions.current = true;
    setTransactionsLoading(true);

    try {
      const response = await getWalletTransactions(
        page,
        pageSize,
        transactionType,
        referenceType
      );

      if (response.success && response.data) {
        if (reset) {
          setTransactions(response.data.transactions);
        } else {
          setTransactions((prev) => [...prev, ...response.data!.transactions]);
        }
        setTransactionsHasMore(response.data.hasMore);
        setTransactionsPage(response.data.page);
      }
    } catch (err) {
      console.error('[useWallet] Error fetching transactions:', err);
    } finally {
      setTransactionsLoading(false);
      isFetchingTransactions.current = false;
    }
  }, [isAuthenticated, authLoading, pageSize, transactionType, referenceType]);

  /**
   * Load more transactions (pagination)
   */
  const loadMoreTransactions = useCallback(async () => {
    if (!transactionsHasMore || transactionsLoading) return;
    await fetchTransactionsPage(transactionsPage + 1, false);
  }, [transactionsHasMore, transactionsLoading, transactionsPage, fetchTransactionsPage]);

  /**
   * Reset and refresh transactions from page 1
   */
  const resetTransactions = useCallback(() => {
    setTransactions([]);
    setTransactionsPage(1);
    setTransactionsHasMore(true);
  }, []);

  /**
   * Full refresh - balance and transactions
   */
  const refresh = useCallback(async () => {
    await refreshBalance();
    if (fetchTransactions) {
      resetTransactions();
      await fetchTransactionsPage(1, true);
    }
  }, [refreshBalance, fetchTransactions, resetTransactions, fetchTransactionsPage]);

  // Auto-fetch on mount and when auth changes
  useEffect(() => {
    if (autoFetch && isAuthenticated && !authLoading) {
      refreshBalance();
      if (fetchTransactions) {
        fetchTransactionsPage(1, true);
      }
    }
  }, [autoFetch, isAuthenticated, authLoading, refreshBalance, fetchTransactions, fetchTransactionsPage]);

  // Reset state when user logs out
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      setBalance(0);
      setFormattedBalance('₹0.00');
      setWalletId(null);
      setIsActive(true);
      setTransactions([]);
      setTransactionsPage(1);
      setTransactionsHasMore(true);
      setError(null);
      setLoading(false);
    }
  }, [isAuthenticated, authLoading]);

  return {
    // Balance
    balance,
    formattedBalance,
    walletId,
    isActive,
    
    // Transactions
    transactions,
    transactionsLoading,
    transactionsHasMore,
    transactionsPage,
    
    // State
    loading,
    error,
    
    // Actions
    refresh,
    refreshBalance,
    loadMoreTransactions,
    resetTransactions,
  };
}
