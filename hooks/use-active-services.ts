/**
 * useActiveServices Hook
 * Fetches and manages all active services (ride, porter, carpool) for the current user
 * Automatically refreshes when service events are dispatched
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { getActiveRide, isRideActive, type RideResponse } from '@/lib/api/ride';
import { getActivePorterService, type PorterServiceResponse } from '@/lib/api/porter';
import { getActiveCarPool, type CarPoolResponse } from '@/lib/api/carPool';
import { addServiceEventListener } from '@/lib/events';
import { clearActiveRideId, setActiveRideId, setHandledRide } from '@/lib/incoming-ride-request';

export interface ActiveServices {
  ride: RideResponse | null;
  porter: PorterServiceResponse | null;
  carPool: CarPoolResponse | null;
  hasAny: boolean;
  count: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useActiveServices(refreshTrigger?: number): ActiveServices {
  const { isAuthenticated, isLoading: authLoading, userType } = useAuth();
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [porter, setPorter] = useState<PorterServiceResponse | null>(null);
  const [carPool, setCarPool] = useState<CarPoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveServices = useCallback(async () => {
    // Don't fetch if auth is still loading or user is not authenticated
    if (authLoading || !isAuthenticated) {
      setRide(null);
      setPorter(null);
      setCarPool(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all active services in parallel
      const [rideResponse, porterResponse, carPoolResponse] = await Promise.all([
        getActiveRide(),
        getActivePorterService(),
        getActiveCarPool(),
      ]);

      // Handle SESSION_EXPIRED errors gracefully - don't treat as critical errors
      // Update ride
      if (rideResponse.success && rideResponse.data?.ride) {
        const rideData = rideResponse.data.ride;
        const isPassengerCashSettledRide =
          userType === "passenger" &&
          rideData.status === "COMPLETED" &&
          rideData.ridePayment?.status === "PENDING" &&
          rideData.ridePayment?.paymentMethod === "CASH";

        setRide(isPassengerCashSettledRide ? null : rideData);
        if (userType === "driver") {
          if (isRideActive(rideData.status)) {
            void Promise.allSettled([setHandledRide(rideData.id), setActiveRideId(rideData.id)]);
          } else {
            void clearActiveRideId();
          }
        }
      } else {
        setRide(null);
        if (userType === "driver") {
          void clearActiveRideId();
        }
      }

      // Update porter
      if (porterResponse.success && porterResponse.data?.porterService) {
        setPorter(porterResponse.data.porterService);
      } else {
        setPorter(null);
      }

      // Update car pool
      if (carPoolResponse.success && carPoolResponse.data) {
        setCarPool(carPoolResponse.data);
      } else {
        setCarPool(null);
      }
    } catch (err) {
      // Only log non-SESSION_EXPIRED errors
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch active services';
      if (!errorMessage.includes('SESSION_EXPIRED')) {
        console.error('[useActiveServices] Error fetching active services:', err);
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, authLoading, userType]);

  // Fetch on mount and when refreshTrigger changes, but only if authenticated
  useEffect(() => {
    if (!authLoading) {
      fetchActiveServices();
    }
  }, [fetchActiveServices, refreshTrigger, authLoading]);

  // Listen for service events to auto-refresh
  // Small delay ensures database transaction has committed before we fetch
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const cleanup = addServiceEventListener(() => {
      // Delay fetch slightly to ensure database has committed
      setTimeout(() => {
        fetchActiveServices();
      }, 500);
    });
    
    return cleanup;
  }, [isAuthenticated, fetchActiveServices]);

  // Fallback polling for passenger car-pool state transitions (e.g., OTP becoming available)
  // This keeps passenger state in sync even if push/realtime is delayed.
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    if (userType !== "passenger") return;
    if (!carPool) return;
    if (
      carPool.status !== "OPEN" &&
      carPool.status !== "CONFIRMED" &&
      carPool.status !== "IN_PROGRESS"
    ) {
      return;
    }

    const interval = setInterval(() => {
      fetchActiveServices();
    }, 4000);

    return () => clearInterval(interval);
  }, [
    isAuthenticated,
    authLoading,
    userType,
    carPool?.id,
    carPool?.status,
    fetchActiveServices,
  ]);

  // Calculate derived values
  const hasAny = ride !== null || porter !== null || carPool !== null;
  const count = [ride, porter, carPool].filter(Boolean).length;

  return {
    ride,
    porter,
    carPool,
    hasAny,
    count,
    loading,
    error,
    refresh: fetchActiveServices,
  };
}
