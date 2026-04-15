import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/context/auth-context";
import {
  getDriverActiveRewardOffers,
  getDriverRewardHistory,
  type DriverRewardOffer,
  type DriverRewardHistoryItem,
  type DriverRewardSummary,
} from "@/lib/api/driver";
import { addServiceEventListener } from "@/lib/events";

interface UseDriverRewardsOptions {
  autoFetchOffers?: boolean;
  autoFetchHistory?: boolean;
  historyPageSize?: number;
}

interface UseDriverRewardsReturn {
  offers: DriverRewardOffer[];
  offersLoading: boolean;
  offersError: string | null;
  refreshOffers: () => Promise<void>;

  summary: DriverRewardSummary | null;
  rewards: DriverRewardHistoryItem[];
  historyLoading: boolean;
  historyRefreshing: boolean;
  historyError: string | null;
  historyPage: number;
  historyHasMore: boolean;
  totalRewardsCount: number;
  refreshHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
}

export function useDriverRewards(
  options: UseDriverRewardsOptions = {}
): UseDriverRewardsReturn {
  const {
    autoFetchOffers = false,
    autoFetchHistory = false,
    historyPageSize = 20,
  } = options;

  const { isAuthenticated, isLoading: authLoading, userType } = useAuth();
  const isDriver = userType === "driver";

  const [offers, setOffers] = useState<DriverRewardOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState<boolean>(false);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DriverRewardSummary | null>(null);
  const [rewards, setRewards] = useState<DriverRewardHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [historyRefreshing, setHistoryRefreshing] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyHasMore, setHistoryHasMore] = useState<boolean>(true);
  const [totalRewardsCount, setTotalRewardsCount] = useState<number>(0);

  const offersInFlight = useRef(false);
  const historyInFlight = useRef(false);

  const refreshOffers = useCallback(async () => {
    if (!isAuthenticated || authLoading || !isDriver) return;
    if (offersInFlight.current) return;

    offersInFlight.current = true;
    setOffersLoading(true);
    setOffersError(null);

    try {
      const response = await getDriverActiveRewardOffers();
      if (response.success && response.data) {
        setOffers(response.data.offers ?? []);
      } else {
        setOffersError(
          (response.error as any)?.message ?? "Failed to load active reward offers"
        );
      }
    } catch (err) {
      console.error("[useDriverRewards] refreshOffers error:", err);
      setOffersError("Failed to load active reward offers");
    } finally {
      setOffersLoading(false);
      offersInFlight.current = false;
    }
  }, [isAuthenticated, authLoading, isDriver]);

  const fetchHistoryPage = useCallback(
    async (page: number, reset: boolean) => {
      if (!isAuthenticated || authLoading || !isDriver) return;
      if (historyInFlight.current) return;

      historyInFlight.current = true;
      setHistoryError(null);
      setHistoryLoading(true);

      try {
        const response = await getDriverRewardHistory(page, historyPageSize);
        if (response.success && response.data) {
          setSummary(response.data.summary ?? null);
          setTotalRewardsCount(
            typeof response.meta?.total === "number" ? response.meta.total : 0
          );
          setHistoryHasMore(Boolean(response.meta?.hasMore));
          setHistoryPage(page);

          const newRewards = response.data.rewards ?? [];
          if (reset) {
            setRewards(newRewards);
          } else {
            setRewards((prev) => {
              const combined = [...prev, ...newRewards];
              return combined.filter(
                (item, index, self) =>
                  index === self.findIndex((candidate) => candidate.grantId === item.grantId)
              );
            });
          }
        } else {
          setHistoryError(
            (response.error as any)?.message ?? "Failed to load reward history"
          );
        }
      } catch (err) {
        console.error("[useDriverRewards] fetchHistoryPage error:", err);
        setHistoryError("Failed to load reward history");
      } finally {
        setHistoryLoading(false);
        setHistoryRefreshing(false);
        historyInFlight.current = false;
      }
    },
    [isAuthenticated, authLoading, isDriver, historyPageSize]
  );

  const refreshHistory = useCallback(async () => {
    if (!isAuthenticated || authLoading || !isDriver) return;
    setHistoryRefreshing(true);
    await fetchHistoryPage(1, true);
  }, [isAuthenticated, authLoading, isDriver, fetchHistoryPage]);

  const loadMoreHistory = useCallback(async () => {
    if (!isAuthenticated || authLoading || !isDriver) return;
    if (!historyHasMore || historyLoading) return;
    await fetchHistoryPage(historyPage + 1, false);
  }, [
    isAuthenticated,
    authLoading,
    isDriver,
    historyHasMore,
    historyLoading,
    historyPage,
    fetchHistoryPage,
  ]);

  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    if (!isDriver) return;

    if (autoFetchOffers) {
      refreshOffers();
    }
    if (autoFetchHistory) {
      fetchHistoryPage(1, true);
    }
  }, [
    isAuthenticated,
    authLoading,
    isDriver,
    autoFetchOffers,
    autoFetchHistory,
    refreshOffers,
    fetchHistoryPage,
  ]);

  useEffect(() => {
    if (isAuthenticated || authLoading) return;
    setOffers([]);
    setOffersError(null);
    setSummary(null);
    setRewards([]);
    setHistoryError(null);
    setHistoryPage(1);
    setHistoryHasMore(true);
    setTotalRewardsCount(0);
    setOffersLoading(false);
    setHistoryLoading(false);
    setHistoryRefreshing(false);
  }, [isAuthenticated, authLoading]);

  // Refresh offers immediately when a ride/porter/carpool completes
  useEffect(() => {
    if (!isAuthenticated || authLoading || !isDriver) return;

    const cleanup = addServiceEventListener(() => {
      setTimeout(() => {
        refreshOffers();
      }, 1500);
    });

    return cleanup;
  }, [isAuthenticated, authLoading, isDriver, refreshOffers]);

  return {
    offers,
    offersLoading,
    offersError,
    refreshOffers,
    summary,
    rewards,
    historyLoading,
    historyRefreshing,
    historyError,
    historyPage,
    historyHasMore,
    totalRewardsCount,
    refreshHistory,
    loadMoreHistory,
  };
}

