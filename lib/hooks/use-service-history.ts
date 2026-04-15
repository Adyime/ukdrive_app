/**
 * Generic Service History Hook
 * Handles pagination for service history screens (Ride, Porter, Car Pool)
 */

import { useState, useCallback, useEffect } from 'react';

export interface UseServiceHistoryOptions<T> {
  fetchHistory: (page: number, limit: number) => Promise<{
    success: boolean;
    data?: {
      items: T[];
      total: number;
      hasMore: boolean;
    };
    error?: unknown;
  }>;
  limit?: number;
  initialPage?: number;
}

export interface UseServiceHistoryReturn<T> {
  items: T[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  page: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

export function useServiceHistory<T>({
  fetchHistory,
  limit = 20,
  initialPage = 1,
}: UseServiceHistoryOptions<T>): UseServiceHistoryReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);

  const loadPage = useCallback(
    async (pageNum: number, append: boolean = false) => {
      try {
        setError(null);
        const response = await fetchHistory(pageNum, limit);

        if (response.success && response.data) {
          const { items: newItems, total: totalItems, hasMore: moreAvailable } = response.data;

          if (append) {
            setItems((prev) => [...prev, ...newItems]);
          } else {
            setItems(newItems);
          }

          setTotal(totalItems);
          setHasMore(moreAvailable);
          setPage(pageNum);
        } else {
          const errorMessage =
            typeof response.error === 'object' &&
            response.error !== null &&
            'message' in response.error
              ? String((response.error as { message: string }).message)
              : 'Failed to load history';
          setError(errorMessage);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load history';
        setError(errorMessage);
      }
    },
    [fetchHistory, limit]
  );

  const loadMore = useCallback(async () => {
    if (loading || refreshing || !hasMore) return;

    setLoading(true);
    await loadPage(page + 1, true);
    setLoading(false);
  }, [loading, refreshing, hasMore, page, loadPage]);

  const refresh = useCallback(async () => {
    if (loading) return;

    setRefreshing(true);
    await loadPage(initialPage, false);
    setRefreshing(false);
  }, [loading, initialPage, loadPage]);

  const reset = useCallback(() => {
    setItems([]);
    setPage(initialPage);
    setHasMore(true);
    setError(null);
    setTotal(0);
  }, [initialPage]);

  // Load initial page on mount
  useEffect(() => {
    let mounted = true;
    const initialLoad = async () => {
      setLoading(true);
      await loadPage(initialPage, false);
      if (mounted) {
        setLoading(false);
      }
    };
    initialLoad();
    return () => {
      mounted = false;
    };
  }, [loadPage, initialPage]); // Run on mount and when dependencies change

  return {
    items,
    loading,
    refreshing,
    error,
    hasMore,
    total,
    page,
    loadMore,
    refresh,
    reset,
  };
}
