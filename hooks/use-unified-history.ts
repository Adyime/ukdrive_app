/**
 * useUnifiedHistory Hook
 * Fetches and merges history from all three services (rides, porter, carpool)
 * with pagination and filtering support
 */

import { useState, useEffect, useCallback } from 'react';
import { getRideHistory, type RideResponse } from '@/lib/api/ride';
import { getPorterServiceHistory, type PorterServiceResponse } from '@/lib/api/porter';
import { getMyCarPools, CarPoolStatus, type CarPoolResponse } from '@/lib/api/carPool';

// History-specific status filters
const CARPOOL_HISTORY_STATUSES = [CarPoolStatus.COMPLETED, CarPoolStatus.CANCELLED];

export type HistoryFilter = 'all' | 'ride' | 'porter' | 'pool';

export interface UnifiedHistoryItem {
  id: string;
  type: 'ride' | 'porter' | 'pool';
  service: RideResponse | PorterServiceResponse | CarPoolResponse;
  date: Date;
  fare?: number | null;
  status: string;
}

export interface UseUnifiedHistoryReturn {
  items: UnifiedHistoryItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilter: (filter: HistoryFilter) => void;
  filter: HistoryFilter;
}

export function useUnifiedHistory(
  limit: number = 20
): UseUnifiedHistoryReturn {
  const [items, setItems] = useState<UnifiedHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [page, setPage] = useState(1);
  const [ridePage, setRidePage] = useState(1);
  const [porterPage, setPorterPage] = useState(1);
  const [poolPage, setPoolPage] = useState(1);
  const [rideHasMore, setRideHasMore] = useState(true);
  const [porterHasMore, setPorterHasMore] = useState(true);
  const [poolHasMore, setPoolHasMore] = useState(true);

  // Helper to get date from service
  const getServiceDate = (service: RideResponse | PorterServiceResponse | CarPoolResponse): Date => {
    if ('departureTime' in service && service.departureTime) {
      return new Date(service.departureTime);
    }
    if ('requestedAt' in service) {
      return new Date(service.requestedAt);
    }
    if ('createdAt' in service) {
      return new Date(service.createdAt);
    }
    return new Date();
  };

  // Helper to get fare from service
  const getServiceFare = (service: RideResponse | PorterServiceResponse | CarPoolResponse): number | null => {
    if ('fare' in service && typeof service.fare === 'number') {
      return service.fare;
    }
    if ('calculatedFarePerPerson' in service && typeof service.calculatedFarePerPerson === 'number') {
      return service.calculatedFarePerPerson;
    }
    return null;
  };

  // Helper to get status from service
  const getServiceStatus = (service: RideResponse | PorterServiceResponse | CarPoolResponse): string => {
    return service.status || 'UNKNOWN';
  };

  // Convert services to unified items
  const convertToUnifiedItems = (
    rides: RideResponse[],
    porters: PorterServiceResponse[],
    pools: CarPoolResponse[]
  ): UnifiedHistoryItem[] => {
    const items: UnifiedHistoryItem[] = [];

    rides.forEach((ride) => {
      items.push({
        id: `ride-${ride.id}`,
        type: 'ride',
        service: ride,
        date: getServiceDate(ride),
        fare: getServiceFare(ride),
        status: getServiceStatus(ride),
      });
    });

    porters.forEach((porter) => {
      items.push({
        id: `porter-${porter.id}`,
        type: 'porter',
        service: porter,
        date: getServiceDate(porter),
        fare: getServiceFare(porter),
        status: getServiceStatus(porter),
      });
    });

    pools.forEach((pool) => {
      items.push({
        id: `pool-${pool.id}`,
        type: 'pool',
        service: pool,
        date: getServiceDate(pool),
        fare: getServiceFare(pool),
        status: getServiceStatus(pool),
      });
    });

    // Sort by date descending (newest first)
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  // Fetch history from all services
  const fetchHistory = useCallback(
    async (isRefresh: boolean = false) => {
      try {
        setError(null);

        // Determine which services to fetch based on filter
        const shouldFetchRides = filter === 'all' || filter === 'ride';
        const shouldFetchPorters = filter === 'all' || filter === 'porter';
        const shouldFetchPools = filter === 'all' || filter === 'pool';

        // Use page 1 for refresh, otherwise use current page state
        const currentRidePage = isRefresh ? 1 : ridePage;
        const currentPorterPage = isRefresh ? 1 : porterPage;
        const currentPoolPage = isRefresh ? 1 : poolPage;
        const currentRideHasMore = isRefresh ? true : rideHasMore;
        const currentPorterHasMore = isRefresh ? true : porterHasMore;
        const currentPoolHasMore = isRefresh ? true : poolHasMore;

        // Fetch in parallel
        const promises: Promise<any>[] = [];

        if (shouldFetchRides && currentRideHasMore) {
          promises.push(getRideHistory(currentRidePage, limit));
        } else {
          promises.push(Promise.resolve({ success: true, data: { rides: [], total: 0, hasMore: false } }));
        }

        if (shouldFetchPorters && currentPorterHasMore) {
          promises.push(getPorterServiceHistory(currentPorterPage, limit));
        } else {
          promises.push(Promise.resolve({ success: true, data: { services: [], total: 0, hasMore: false } }));
        }

        if (shouldFetchPools && currentPoolHasMore) {
          // Only fetch completed/cancelled car pools for history
          promises.push(getMyCarPools(currentPoolPage, limit, CARPOOL_HISTORY_STATUSES));
        } else {
          promises.push(Promise.resolve({ success: true, data: [], meta: { total: 0, hasMore: false } }));
        }

        const [rideResponse, porterResponse, poolResponse] = await Promise.all(promises);

        // Extract data
        const rides: RideResponse[] = rideResponse.success && rideResponse.data?.rides
          ? rideResponse.data.rides
          : [];
        // Backend returns 'services', not 'porterServices'
        const porters: PorterServiceResponse[] = porterResponse.success && porterResponse.data?.services
          ? porterResponse.data.services
          : [];
        const pools: CarPoolResponse[] = poolResponse.success && poolResponse.data
          ? (Array.isArray(poolResponse.data) ? poolResponse.data : [])
          : [];

        // Update pagination state based on responses
        const newRideHasMore = rideResponse.success && rideResponse.data ? (rideResponse.data.hasMore || false) : false;
        const newPorterHasMore = porterResponse.success && porterResponse.data ? (porterResponse.data.hasMore || false) : false;
        const newPoolHasMore = poolResponse.success && poolResponse.meta ? (poolResponse.meta.hasMore || false) : false;

        setRideHasMore(newRideHasMore);
        setPorterHasMore(newPorterHasMore);
        setPoolHasMore(newPoolHasMore);

        // Increment page counters only if we got data and there's more
        if (rideResponse.success && rides.length > 0) {
          setRidePage(prev => prev + 1);
        }
        if (porterResponse.success && porters.length > 0) {
          setPorterPage(prev => prev + 1);
        }
        if (poolResponse.success && pools.length > 0) {
          setPoolPage(prev => prev + 1);
        }

        // Convert to unified items
        const newItems = convertToUnifiedItems(rides, porters, pools);

        // Apply filter
        const filteredItems = filter === 'all'
          ? newItems
          : newItems.filter(item => item.type === filter);

        if (isRefresh) {
          // On refresh, replace all items
          setItems(filteredItems);
          // Reset page counters (already happened above with isRefresh logic)
          setPage(1);
          setRidePage(filteredItems.filter(i => i.type === 'ride').length > 0 ? 2 : 1);
          setPorterPage(filteredItems.filter(i => i.type === 'porter').length > 0 ? 2 : 1);
          setPoolPage(filteredItems.filter(i => i.type === 'pool').length > 0 ? 2 : 1);
        } else {
          // Append for pagination
          setItems((prev) => {
            const combined = [...prev, ...filteredItems];
            // Remove duplicates and sort
            const unique = combined.filter((item, index, self) =>
              index === self.findIndex((t) => t.id === item.id)
            );
            return unique.sort((a, b) => b.date.getTime() - a.date.getTime());
          });
        }

        // Calculate totals
        const rideTotal = rideResponse.success && rideResponse.data ? rideResponse.data.total : 0;
        const porterTotal = porterResponse.success && porterResponse.data ? porterResponse.data.total : 0;
        const poolTotal = poolResponse.success && poolResponse.meta ? poolResponse.meta.total : 0;
        setTotal(rideTotal + porterTotal + poolTotal);

        // Check if more items available
        setHasMore(newRideHasMore || newPorterHasMore || newPoolHasMore);

      } catch (err) {
        console.error('[useUnifiedHistory] Error fetching history:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load history';
        setError(errorMessage);
      }
    },
    [filter, limit, ridePage, porterPage, poolPage, rideHasMore, porterHasMore, poolHasMore]
  );

  const loadMore = useCallback(async () => {
    if (loading || refreshing || !hasMore) return;
    setLoading(true);
    await fetchHistory(false); // Not a refresh, so use current page states
    setPage(prev => prev + 1);
    setLoading(false);
  }, [loading, refreshing, hasMore, fetchHistory]);

  const refresh = useCallback(async () => {
    if (loading) return;
    setRefreshing(true);
    await fetchHistory(true); // Pass true for refresh
    setRefreshing(false);
  }, [loading, fetchHistory]);

  // Reset when filter changes
  useEffect(() => {
    setPage(1);
    setRidePage(1);
    setPorterPage(1);
    setPoolPage(1);
    setRideHasMore(true);
    setPorterHasMore(true);
    setPoolHasMore(true);
    setItems([]);
    setLoading(true);
    fetchHistory(true).finally(() => setLoading(false));
  }, [filter]); // Only run when filter changes - fetchHistory is stable due to useCallback deps

  return {
    items,
    loading,
    refreshing,
    error,
    hasMore,
    total,
    loadMore,
    refresh,
    setFilter,
    filter,
  };
}
