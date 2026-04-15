/**
 * Driver Location Updater Service
 * 
 * Centralized service for updating driver location with:
 * - Debouncing to prevent excessive API calls
 * - Request deduplication (only one request at a time)
 * - Minimum distance threshold (only update if moved significantly)
 * - Minimum time threshold (only update every N seconds)
 * 
 * This prevents multiple screens from calling the API simultaneously
 * and reduces server load and API costs.
 */

import { updateDriverLocation } from '@/lib/api/driver';

// Configuration
const MIN_UPDATE_INTERVAL_MS = 10000; // Minimum 10 seconds between updates
const MIN_DISTANCE_METERS = 50; // Minimum 50 meters movement before updating
const DEBOUNCE_MS = 2000; // Wait 2 seconds after last location update before sending

// State
let lastUpdateTime = 0;
let lastUpdateLocation: { latitude: number; longitude: number } | null = null;
let pendingUpdate: { latitude: number; longitude: number; timestamp: number } | null = null;
let updateTimeout: ReturnType<typeof setTimeout> | null = null;
let isUpdating = false;

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Update driver location (debounced and throttled)
 * 
 * This function:
 * 1. Debounces updates (waits for location to stabilize)
 * 2. Throttles updates (minimum time between updates)
 * 3. Filters by distance (only updates if moved significantly)
 * 4. Prevents duplicate requests (only one request at a time)
 * 
 * @param latitude - Driver's latitude
 * @param longitude - Driver's longitude
 * @returns Promise that resolves when update is queued (not necessarily sent)
 */
export async function updateDriverLocationDebounced(
  latitude: number,
  longitude: number
): Promise<void> {
  const now = Date.now();

  // Check if we should update based on time threshold
  const timeSinceLastUpdate = now - lastUpdateTime;
  if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL_MS && lastUpdateLocation) {
    // Too soon, but store the location for later
    pendingUpdate = { latitude, longitude, timestamp: now };
    
    // Clear existing timeout and set a new one
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    
    // Schedule update after debounce period
    updateTimeout = setTimeout(() => {
      if (pendingUpdate) {
        updateDriverLocationDebounced(pendingUpdate.latitude, pendingUpdate.longitude);
        pendingUpdate = null;
      }
    }, DEBOUNCE_MS);
    
    return;
  }

  // Check if we should update based on distance threshold
  if (lastUpdateLocation) {
    const distance = calculateDistance(
      lastUpdateLocation.latitude,
      lastUpdateLocation.longitude,
      latitude,
      longitude
    );

    if (distance < MIN_DISTANCE_METERS) {
      // Not moved enough, but store for later if enough time passes
      pendingUpdate = { latitude, longitude, timestamp: now };
      
      // Clear existing timeout and set a new one
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      // Schedule update after debounce period (in case driver is stationary)
      updateTimeout = setTimeout(() => {
        if (pendingUpdate) {
          const timeSincePending = Date.now() - pendingUpdate.timestamp;
          // Only update if enough time has passed
          if (timeSincePending >= MIN_UPDATE_INTERVAL_MS) {
            updateDriverLocationDebounced(pendingUpdate.latitude, pendingUpdate.longitude);
            pendingUpdate = null;
          }
        }
      }, DEBOUNCE_MS);
      
      return;
    }
  }

  // Prevent duplicate requests
  if (isUpdating) {
    // Request already in progress, store this location for next update
    pendingUpdate = { latitude, longitude, timestamp: now };
    return;
  }

  // Clear any pending timeout
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }

  // Update location
  isUpdating = true;
  lastUpdateTime = now;
  lastUpdateLocation = { latitude, longitude };

  try {
    const response = await updateDriverLocation(latitude, longitude);
    
    if (!response.success) {
      console.warn('[DriverLocationUpdater] Failed to update location:', response.error);
      // Reset lastUpdateTime to allow retry sooner
      lastUpdateTime = 0;
    }
  } catch (error) {
    console.error('[DriverLocationUpdater] Error updating location:', error);
    // Reset lastUpdateTime to allow retry sooner
    lastUpdateTime = 0;
  } finally {
    isUpdating = false;
    
    // Process any pending update
    if (pendingUpdate) {
      const timeSincePending = Date.now() - pendingUpdate.timestamp;
      // Only process if enough time has passed
      if (timeSincePending >= MIN_UPDATE_INTERVAL_MS) {
        // Use setTimeout to avoid blocking
        setTimeout(() => {
          updateDriverLocationDebounced(pendingUpdate!.latitude, pendingUpdate!.longitude);
          pendingUpdate = null;
        }, 100);
      }
    }
  }
}

/**
 * Reset the location updater state
 * Useful when driver goes offline or app restarts
 */
export function resetLocationUpdater(): void {
  lastUpdateTime = 0;
  lastUpdateLocation = null;
  pendingUpdate = null;
  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }
  isUpdating = false;
}
