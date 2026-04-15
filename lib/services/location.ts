/**
 * Location Service
 * GPS tracking and location management using expo-location
 */

import * as Location from 'expo-location';
import { useEffect, useState, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import type { LocationWithAddress } from '@/lib/utils/location';

// Re-export LocationWithAddress for convenience
export type { LocationWithAddress } from '@/lib/utils/location';

// Types
export interface LocationPermissionStatus {
  foreground: 'granted' | 'denied' | 'undetermined';
  background: 'granted' | 'denied' | 'undetermined';
}

export interface WatchLocationOptions {
  accuracy?: Location.Accuracy;
  distanceInterval?: number; // meters
  timeInterval?: number; // milliseconds
  onLocation: (location: Location.LocationObject) => void;
  onError?: (error: Error) => void;
}

// Constants
const DEFAULT_ACCURACY = Location.Accuracy.High;
const DEFAULT_DISTANCE_INTERVAL = 10; // 10 meters
const DEFAULT_TIME_INTERVAL = 5000; // 5 seconds

/**
 * Request foreground location permissions
 */
export async function requestForegroundPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting foreground permission:', error);
    return false;
  }
}

/**
 * Request background location permissions
 * Note: Required for tracking driver location when app is in background
 */
export async function requestBackgroundPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestBackgroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting background permission:', error);
    return false;
  }
}

/**
 * Check current location permission status
 */
export async function getLocationPermissions(): Promise<LocationPermissionStatus> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    
    // Try to get background permissions, but handle errors gracefully
    // Background permissions may not be available if ACCESS_BACKGROUND_LOCATION is not in manifest
    let backgroundStatus: 'granted' | 'denied' | 'undetermined' = 'undetermined';
    try {
      const background = await Location.getBackgroundPermissionsAsync();
      backgroundStatus = background.status === 'granted' ? 'granted'
        : background.status === 'denied' ? 'denied' : 'undetermined';
    } catch (bgError: any) {
      // If background permission check fails (e.g., manifest not configured),
      // just log it and continue with undetermined status
      if (bgError?.message?.includes('ACCESS_BACKGROUND_LOCATION')) {
        console.warn('Background location permission check failed. Make sure ACCESS_BACKGROUND_LOCATION is in AndroidManifest.');
      } else {
        console.warn('Background location permission check failed:', bgError);
      }
    }

    return {
      foreground: foreground.status === 'granted' ? 'granted' 
        : foreground.status === 'denied' ? 'denied' : 'undetermined',
      background: backgroundStatus,
    };
  } catch (error) {
    console.error('Error getting location permissions:', error);
    return {
      foreground: 'undetermined',
      background: 'undetermined',
    };
  }
}

/**
 * Check if location services are enabled
 */
export async function isLocationEnabled(): Promise<boolean> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch (error) {
    console.warn('Error checking location services:', error);
    return true; // Assume enabled if check fails
  }
}

/**
 * Get current device location with high accuracy
 * Throws errors with specific types for better error handling
 */
export async function getCurrentPosition(): Promise<LocationWithAddress> {
  // Check if location services are enabled
  const servicesEnabled = await isLocationEnabled();
  if (!servicesEnabled) {
    const error = new Error('Location services are disabled');
    (error as any).code = 'LOCATION_DISABLED';
    throw error;
  }

  // Request permission first
  const granted = await requestForegroundPermission();
  if (!granted) {
    const error = new Error('Location permission denied');
    (error as any).code = 'PERMISSION_DENIED';
    throw error;
  }

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: DEFAULT_ACCURACY,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error: any) {
    // Handle specific error types
    if (error?.code === 'E_LOCATION_SERVICES_DISABLED') {
      const newError = new Error('Location services are disabled');
      (newError as any).code = 'LOCATION_DISABLED';
      throw newError;
    }
    
    if (error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      const newError = new Error('Location permission denied');
      (newError as any).code = 'PERMISSION_DENIED';
      throw newError;
    }

    if (error?.code === 'E_LOCATION_TIMEOUT' || error?.message?.includes('timeout')) {
      const newError = new Error('Location request timed out');
      (newError as any).code = 'LOCATION_TIMEOUT';
      throw newError;
    }

    // Generic error
    const newError = new Error(error?.message || 'Failed to get current location');
    (newError as any).code = 'LOCATION_ERROR';
    throw newError;
  }
}

/**
 * Get current location with address (reverse geocoding)
 */
export async function getCurrentPositionWithAddress(): Promise<LocationWithAddress> {
  const position = await getCurrentPosition();

  try {
    const addresses = await Location.reverseGeocodeAsync({
      latitude: position.latitude,
      longitude: position.longitude,
    });

    if (addresses.length > 0) {
      const addr = addresses[0];
      const parts = [addr.name, addr.street, addr.city, addr.region].filter(Boolean);
      position.address = parts.join(', ') || undefined;
    }
  } catch (error: any) {
    // Permission denied or location not authorized: fail softly (position without address)
    const msg = error?.message ?? '';
    if (msg.includes('Not authorized') || msg.includes('permission') || msg.includes('rejected')) {
      if (__DEV__) console.warn('Reverse geocode skipped (location not authorized):', msg);
    } else {
      console.error('Error reverse geocoding:', error);
    }
  }

  return position;
}

/**
 * Start watching location changes
 * Returns a cleanup function to stop watching
 */
export async function watchLocation(
  options: WatchLocationOptions
): Promise<{ remove: () => void }> {
  // Check if location services are enabled
  const servicesEnabled = await isLocationEnabled();
  if (!servicesEnabled) {
    const error = new Error('Location services are disabled');
    (error as any).code = 'LOCATION_DISABLED';
    options.onError?.(error);
    throw error;
  }

  // Request permission first
  const granted = await requestForegroundPermission();
  if (!granted) {
    const error = new Error('Location permission denied');
    (error as any).code = 'PERMISSION_DENIED';
    options.onError?.(error);
    throw error;
  }

  try {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: options.accuracy ?? DEFAULT_ACCURACY,
        distanceInterval: options.distanceInterval ?? DEFAULT_DISTANCE_INTERVAL,
        timeInterval: options.timeInterval ?? DEFAULT_TIME_INTERVAL,
      },
      (location) => {
        options.onLocation(location);
      }
    );

    return subscription;
  } catch (error: any) {
    // Handle specific error types
    let finalError: Error;
    
    if (error?.code === 'E_LOCATION_SERVICES_DISABLED' || 
        error?.message?.includes('unsatisfied device settings') ||
        error?.message?.includes('Location services')) {
      finalError = new Error('Location services are disabled. Please enable location services in device settings.');
      (finalError as any).code = 'LOCATION_DISABLED';
    } else if (error?.message?.includes('permission') || error?.message?.includes('Permission')) {
      finalError = new Error('Location permission denied');
      (finalError as any).code = 'PERMISSION_DENIED';
    } else {
      finalError = error instanceof Error ? error : new Error(error?.message || 'Failed to watch location');
      (finalError as any).code = error?.code || 'LOCATION_ERROR';
    }
    
    console.error('Error watching location:', finalError);
    options.onError?.(finalError);
    throw finalError;
  }
}

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(address: string): Promise<LocationWithAddress | null> {
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length > 0) {
      return {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
        address,
      };
    }
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

// Reverse geocoding cache to minimize API calls
const REVERSE_GEOCODE_CACHE_TTL_MS = 10 * 60 * 1000; // Cache for 10 minutes
const REVERSE_GEOCODE_COORD_PRECISION = 3; // Round to 3 decimal places (~100 meters) for cache key

interface CachedGeocode {
  address: string;
  timestamp: number;
}

const reverseGeocodeCache = new Map<string, CachedGeocode>();

/**
 * Reverse geocode coordinates to address
 * Uses caching to minimize API calls
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<string | null> {
  // Round coordinates for cache key (reduces cache misses from minor GPS variations)
  const roundCoord = (coord: number) => 
    Math.round(coord * Math.pow(10, REVERSE_GEOCODE_COORD_PRECISION)) / Math.pow(10, REVERSE_GEOCODE_COORD_PRECISION);
  
  const cacheKey = `${roundCoord(latitude)},${roundCoord(longitude)}`;
  
  // Check cache
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < REVERSE_GEOCODE_CACHE_TTL_MS) {
      return cached.address;
    }
    // Cache expired, remove it
    reverseGeocodeCache.delete(cacheKey);
  }

  try {
    const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (addresses.length > 0) {
      const addr = addresses[0];
      const parts = [addr.name, addr.street, addr.city].filter(Boolean);
      const address = parts.join(', ') || null;
      
      // Cache the result
      if (address) {
        reverseGeocodeCache.set(cacheKey, {
          address,
          timestamp: Date.now(),
        });
        
        // Limit cache size (keep last 200 entries)
        if (reverseGeocodeCache.size > 200) {
          const firstKey = reverseGeocodeCache.keys().next().value;
          if (firstKey) {
            reverseGeocodeCache.delete(firstKey);
          }
        }
      }
      
      return address;
    }
    return null;
  } catch (error: any) {
    const msg = error?.message ?? '';
    if (msg.includes('Not authorized') || msg.includes('permission') || msg.includes('rejected')) {
      if (__DEV__) console.warn('Reverse geocode skipped (location not authorized):', msg);
    } else {
      console.error('Error reverse geocoding:', error);
    }
    return null;
  }
}

// ============================================
// React Hooks
// ============================================

/**
 * Hook to get and track current location
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<LocationWithAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const position = await getCurrentPositionWithAddress();
      setLocation(position);
    } catch (err: any) {
      // Don't log errors to console - handle gracefully in UI
      setError(err.message || 'Failed to get location');
      setErrorCode(err.code || 'UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { location, loading, error, errorCode, refresh };
}

/**
 * Hook to watch location changes in real-time
 * Automatically handles app state changes and cleanup
 */
export function useWatchLocation(options?: {
  enabled?: boolean;
  accuracy?: Location.Accuracy;
  distanceInterval?: number;
  timeInterval?: number;
  onLocation?: (location: Location.LocationObject) => void;
}) {
  const {
    enabled = true,
    accuracy = DEFAULT_ACCURACY,
    distanceInterval = DEFAULT_DISTANCE_INTERVAL,
    timeInterval = DEFAULT_TIME_INTERVAL,
    onLocation,
  } = options ?? {};

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastErrorCodeRef = useRef<string | null>(null);

  const stopWatching = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
      setIsWatching(false);
    }
  }, []);

  // Store options in ref to avoid dependency issues
  const optionsRef = useRef({ accuracy, distanceInterval, timeInterval, onLocation });
  optionsRef.current = { accuracy, distanceInterval, timeInterval, onLocation };

  const startWatching = useCallback(async () => {
    if (subscriptionRef.current) return;

    // Don't retry if location services are disabled (prevents spam)
    if (lastErrorCodeRef.current === 'LOCATION_DISABLED') {
      return;
    }

    try {
      const opts = optionsRef.current;
      const sub = await watchLocation({
        accuracy: opts.accuracy,
        distanceInterval: opts.distanceInterval,
        timeInterval: opts.timeInterval,
        onLocation: (loc) => {
          setLocation(loc);
          setError(null);
          lastErrorCodeRef.current = null;
          opts.onLocation?.(loc);
        },
        onError: (err: any) => {
          setError(err.message);
          lastErrorCodeRef.current = err.code || null;
        },
      });

      subscriptionRef.current = sub;
      setIsWatching(true);
      lastErrorCodeRef.current = null;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to start location tracking';
      setError(errorMessage);
      lastErrorCodeRef.current = err.code || null;
      setIsWatching(false);
    }
  }, []);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came to foreground, restart watching if enabled
        // Reset error code to allow retry (user might have enabled location services)
        if (enabled && !subscriptionRef.current) {
          lastErrorCodeRef.current = null;
          startWatching();
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, startWatching]);

  // Start/stop watching based on enabled prop
  useEffect(() => {
    if (enabled) {
      startWatching();
    } else {
      stopWatching();
    }

    return () => {
      stopWatching();
    };
  }, [enabled, startWatching, stopWatching]);

  return {
    location,
    error,
    isWatching,
    startWatching,
    stopWatching,
  };
}

/**
 * Hook to get location permissions status
 */
export function useLocationPermissions() {
  const [permissions, setPermissions] = useState<LocationPermissionStatus>({
    foreground: 'undetermined',
    background: 'undetermined',
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const perms = await getLocationPermissions();
    setPermissions(perms);
    setLoading(false);
  }, []);

  const requestForeground = useCallback(async () => {
    const granted = await requestForegroundPermission();
    await refresh();
    return granted;
  }, [refresh]);

  const requestBackground = useCallback(async () => {
    const granted = await requestBackgroundPermission();
    await refresh();
    return granted;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    permissions,
    loading,
    refresh,
    requestForeground,
    requestBackground,
  };
}

