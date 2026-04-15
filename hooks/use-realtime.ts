/**
 * Realtime Subscription Hooks
 * Custom React hooks for subscribing to Supabase Realtime updates
 * 
 * IMPORTANT: Callbacks (onUpdate, onError) are stored in refs to prevent
 * infinite re-subscriptions when they're inline functions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  subscribeToDriverLocation,
  subscribeToRideStatus,
  subscribeToNewRides,
  subscribeToPorterStatus,
  subscribeToNewPorterServices,
  subscribeToCarPoolStatus,
  subscribeToCarPoolMemberStatus,
  subscribeToNewCarPools,
  unsubscribeChannel,
  type DriverLocationUpdate,
  type RideStatusUpdate,
  type PorterStatusUpdate,
  type CarPoolStatusUpdate,
  type CarPoolMemberStatusUpdate,
} from '@/lib/supabase';

// Types
export interface DriverLocation {
  latitude: number;
  longitude: number;
  isOnline: boolean;
  lastUpdated: Date;
}

export interface UseDriverLocationOptions {
  driverId: string | null;
  enabled?: boolean;
  onUpdate?: (location: DriverLocation) => void;
  onError?: (error: Error) => void;
}

export interface UseRideStatusOptions {
  rideId: string | null;
  enabled?: boolean;
  onUpdate?: (ride: RideStatusUpdate) => void;
  onError?: (error: Error) => void;
}

export interface UseNewRidesOptions {
  enabled?: boolean;
  onNewRide?: (ride: RideStatusUpdate) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to subscribe to driver location updates
 * Use this for passengers to track driver in real-time
 */
export function useDriverLocation({
  driverId,
  enabled = true,
  onUpdate,
  onError,
}: UseDriverLocationOptions) {
  const [location, setLocation] = useState<DriverLocation | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions on callback changes
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  
  // Update refs when callbacks change (without triggering re-subscription)
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    // Don't subscribe if disabled or no driver ID
    if (!enabled || !driverId) {
      setIsSubscribed(false);
      return;
    }

    // Subscribe to driver location
    const channel = subscribeToDriverLocation(
      driverId,
      (data: DriverLocationUpdate) => {
        const locationData: DriverLocation = {
          latitude: data.latitude,
          longitude: data.longitude,
          isOnline: data.is_online,
          lastUpdated: new Date(data.last_location_updated_at),
        };
        setLocation(locationData);
        setError(null);
        onUpdateRef.current?.(locationData);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    // Cleanup on unmount or driver change
    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [driverId, enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    location,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Hook to subscribe to ride status updates
 * Use this to get real-time ride status changes
 */
export function useRideStatus({
  rideId,
  enabled = true,
  onUpdate,
  onError,
}: UseRideStatusOptions) {
  const [ride, setRide] = useState<RideStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    // Don't subscribe if disabled or no ride ID
    if (!enabled || !rideId) {
      setIsSubscribed(false);
      return;
    }

    // Subscribe to ride status
    const channel = subscribeToRideStatus(
      rideId,
      (data: RideStatusUpdate) => {
        setRide(data);
        setError(null);
        onUpdateRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    // Cleanup on unmount or ride change
    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [rideId, enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    ride,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Hook to subscribe to new ride requests
 * Use this for drivers to receive new ride notifications
 */
export function useNewRides({
  enabled = true,
  onNewRide,
  onError,
}: UseNewRidesOptions) {
  const [latestRide, setLatestRide] = useState<RideStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions
  const onNewRideRef = useRef(onNewRide);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onNewRideRef.current = onNewRide;
  }, [onNewRide]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled) {
      setIsSubscribed(false);
      return;
    }

    // Subscribe to new rides
    const channel = subscribeToNewRides(
      (data: RideStatusUpdate) => {
        setLatestRide(data);
        setError(null);
        onNewRideRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    latestRide,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Combined hook for active ride tracking
 * Subscribes to both ride status and driver location (for passengers)
 */
export function useActiveRideTracking({
  rideId,
  driverId,
  userType,
  enabled = true,
}: {
  rideId: string | null;
  driverId: string | null;
  userType: 'passenger' | 'driver' | null;
  enabled?: boolean;
}) {
  // Subscribe to ride status for both passenger and driver
  const rideStatus = useRideStatus({
    rideId,
    enabled: enabled && !!rideId,
  });

  // Only subscribe to driver location if user is a passenger and there's a driver
  const driverLocation = useDriverLocation({
    driverId,
    enabled: enabled && userType === 'passenger' && !!driverId,
  });

  return {
    rideStatus,
    driverLocation,
    isSubscribed: rideStatus.isSubscribed || driverLocation.isSubscribed,
    hasError: !!rideStatus.error || !!driverLocation.error,
  };
}

/**
 * Hook to subscribe to porter service status updates
 */
export function usePorterStatus({
  porterServiceId,
  enabled = true,
  onUpdate,
  onError,
}: {
  porterServiceId: string | null;
  enabled?: boolean;
  onUpdate?: (porter: PorterStatusUpdate) => void;
  onError?: (error: Error) => void;
}) {
  const [porter, setPorter] = useState<PorterStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled || !porterServiceId) {
      setIsSubscribed(false);
      return;
    }

    const channel = subscribeToPorterStatus(
      porterServiceId,
      (data: PorterStatusUpdate) => {
        setPorter(data);
        setError(null);
        onUpdateRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [porterServiceId, enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    porter,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Hook to subscribe to new porter service requests
 */
export function useNewPorterServices({
  enabled = true,
  onNewPorter,
  onError,
}: {
  enabled?: boolean;
  onNewPorter?: (porter: PorterStatusUpdate) => void;
  onError?: (error: Error) => void;
}) {
  const [latestPorter, setLatestPorter] = useState<PorterStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions
  const onNewPorterRef = useRef(onNewPorter);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onNewPorterRef.current = onNewPorter;
  }, [onNewPorter]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled) {
      setIsSubscribed(false);
      return;
    }

    const channel = subscribeToNewPorterServices(
      (data: PorterStatusUpdate) => {
        setLatestPorter(data);
        setError(null);
        onNewPorterRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    latestPorter,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Combined hook for active porter service tracking
 * Subscribes to both porter status and driver location (for customers)
 */
export function useActivePorterTracking({
  porterServiceId,
  driverId,
  userType,
  enabled = true,
}: {
  porterServiceId: string | null;
  driverId: string | null;
  userType: 'passenger' | 'driver' | null;
  enabled?: boolean;
}) {
  // Subscribe to porter status for both customer and driver
  const porterStatus = usePorterStatus({
    porterServiceId,
    enabled: enabled && !!porterServiceId,
  });

  // Only subscribe to driver location if user is a customer and there's a driver
  const driverLocation = useDriverLocation({
    driverId,
    enabled: enabled && userType === 'passenger' && !!driverId,
  });

  return {
    porterStatus,
    driverLocation,
    isSubscribed: porterStatus.isSubscribed || driverLocation.isSubscribed,
    hasError: !!porterStatus.error || !!driverLocation.error,
  };
}


/**
 * Hook to subscribe to car pool status updates
 */
export function useCarPoolStatus({
  carPoolId,
  enabled = true,
  onUpdate,
  onError,
}: {
  carPoolId: string | null;
  enabled?: boolean;
  onUpdate?: (carPool: CarPoolStatusUpdate) => void;
  onError?: (error: Error) => void;
}) {
  const [carPool, setCarPool] = useState<CarPoolStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled || !carPoolId) {
      setIsSubscribed(false);
      return;
    }

    const channel = subscribeToCarPoolStatus(
      carPoolId,
      (data: CarPoolStatusUpdate) => {
        setCarPool(data);
        setError(null);
        onUpdateRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [carPoolId, enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    carPool,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Hook to subscribe to car pool member status updates
 */
export function useCarPoolMemberStatus({
  carPoolId,
  enabled = true,
  onUpdate,
  onError,
}: {
  carPoolId: string | null;
  enabled?: boolean;
  onUpdate?: (member: CarPoolMemberStatusUpdate) => void;
  onError?: (error: Error) => void;
}) {
  const [member, setMember] = useState<CarPoolMemberStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled || !carPoolId) {
      setIsSubscribed(false);
      return;
    }

    const channel = subscribeToCarPoolMemberStatus(
      carPoolId,
      (data: CarPoolMemberStatusUpdate) => {
        setMember(data);
        setError(null);
        onUpdateRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [carPoolId, enabled]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    member,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Hook to subscribe to new car pools
 */
export function useNewCarPools({
  enabled = true,
  onNewCarPool,
  onError,
}: {
  enabled?: boolean;
  onNewCarPool?: (carPool: CarPoolStatusUpdate) => void;
  onError?: (error: Error) => void;
}) {
  const [latestCarPool, setLatestCarPool] = useState<CarPoolStatusUpdate | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  
  // Use refs for callbacks to prevent re-subscriptions
  const onNewCarPoolRef = useRef(onNewCarPool);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onNewCarPoolRef.current = onNewCarPool;
  }, [onNewCarPool]);
  
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!enabled) {
      setIsSubscribed(false);
      return;
    }

    const channel = subscribeToNewCarPools(
      (data: CarPoolStatusUpdate) => {
        setLatestCarPool(data);
        setError(null);
        onNewCarPoolRef.current?.(data);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [enabled]); // Removed callback dependencies

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  return {
    latestCarPool,
    isSubscribed,
    error,
    unsubscribe,
  };
}

/**
 * Combined hook for active car pool tracking
 * Subscribes to both car pool status and driver location (for passengers)
 */
export function useActiveCarPoolTracking({
  carPoolId,
  driverId,
  userType,
  enabled = true,
}: {
  carPoolId: string | null;
  driverId: string | null;
  userType: 'passenger' | 'driver' | null;
  enabled?: boolean;
}) {
  // Subscribe to car pool status for both passenger and driver
  const carPoolStatus = useCarPoolStatus({
    carPoolId,
    enabled: enabled && !!carPoolId,
  });

  const carPoolMemberStatus = useCarPoolMemberStatus({
    carPoolId,
    enabled: enabled && !!carPoolId,
  });

  // Only subscribe to driver location if user is a passenger and there's a driver
  const driverLocation = useDriverLocation({
    driverId,
    enabled: enabled && userType === 'passenger' && !!driverId,
  });

  return {
    carPoolStatus,
    carPoolMemberStatus,
    driverLocation,
    isSubscribed:
      carPoolStatus.isSubscribed ||
      carPoolMemberStatus.isSubscribed ||
      driverLocation.isSubscribed,
    hasError:
      !!carPoolStatus.error ||
      !!carPoolMemberStatus.error ||
      !!driverLocation.error,
  };
}
