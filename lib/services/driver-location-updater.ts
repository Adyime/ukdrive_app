/**
 * Driver Location Updater Service
 *
 * Centralized service for updating driver location with:
 * - Debouncing to prevent excessive API calls
 * - Request deduplication (only one request at a time)
 * - Minimum time threshold (heartbeat roughly every N seconds)
 *
 * This prevents multiple screens from calling the API simultaneously
 * and keeps the driver's last heartbeat fresh even while stationary.
 */

import { updateDriverLocation } from "@/lib/api/driver";
import {
  recordForegroundPublishAttempt,
  recordForegroundPublishFailure,
  recordForegroundPublishSuccess,
} from "@/lib/services/driver-location-diagnostics";

// Configuration
const MIN_UPDATE_INTERVAL_MS = 10000; // Minimum 10 seconds between updates
const DEBOUNCE_MS = 2000; // Wait 2 seconds after last location update before sending

// State
let lastUpdateTime = 0;
let lastUpdateLocation: { latitude: number; longitude: number } | null = null;
let pendingUpdate: { latitude: number; longitude: number; timestamp: number } | null =
  null;
let updateTimeout: ReturnType<typeof setTimeout> | null = null;
let isUpdating = false;

/**
 * Update driver location (debounced and throttled)
 *
 * This function:
 * 1. Debounces updates (waits for location to stabilize)
 * 2. Throttles updates (minimum time between updates)
 * 3. Guarantees a heartbeat roughly every 10 seconds while tracking is active
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

  // Throttle rapid bursts from the watcher, but always keep the latest point queued.
  const timeSinceLastUpdate = now - lastUpdateTime;
  if (timeSinceLastUpdate < MIN_UPDATE_INTERVAL_MS && lastUpdateLocation) {
    pendingUpdate = { latitude, longitude, timestamp: now };

    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }

    const remainingDelay = Math.max(
      DEBOUNCE_MS,
      MIN_UPDATE_INTERVAL_MS - timeSinceLastUpdate
    );

    updateTimeout = setTimeout(() => {
      if (!pendingUpdate) return;
      const nextUpdate = pendingUpdate;
      pendingUpdate = null;
      void updateDriverLocationDebounced(
        nextUpdate.latitude,
        nextUpdate.longitude
      );
    }, remainingDelay);

    return;
  }

  if (isUpdating) {
    // A publish is in flight, so replace any older queued point with the newest one.
    pendingUpdate = { latitude, longitude, timestamp: now };
    return;
  }

  if (updateTimeout) {
    clearTimeout(updateTimeout);
    updateTimeout = null;
  }

  isUpdating = true;
  lastUpdateTime = now;
  lastUpdateLocation = { latitude, longitude };

  try {
    await recordForegroundPublishAttempt(latitude, longitude);
    const response = await updateDriverLocation(latitude, longitude);

    if (!response.success) {
      console.warn("[DriverLocationUpdater] Failed to update location:", response.error);
      await recordForegroundPublishFailure(
        response.error?.code ?? "LOCATION_UPDATE_FAILED",
        response.error?.message ??
          "Foreground fallback could not publish driver location."
      );
      // Allow the next watcher tick to retry immediately.
      lastUpdateTime = 0;
    } else {
      await recordForegroundPublishSuccess(
        response.data?.location?.updatedAt ?? null
      );
    }
  } catch (error) {
    console.error("[DriverLocationUpdater] Error updating location:", error);
    await recordForegroundPublishFailure(
      "FOREGROUND_EXCEPTION",
      error instanceof Error
        ? error.message
        : "Foreground fallback threw while publishing driver location."
    );
    lastUpdateTime = 0;
  } finally {
    isUpdating = false;

    if (pendingUpdate) {
      const nextUpdate = pendingUpdate;
      const nextDelay = Math.max(
        0,
        MIN_UPDATE_INTERVAL_MS - (Date.now() - lastUpdateTime)
      );

      pendingUpdate = null;
      setTimeout(() => {
        void updateDriverLocationDebounced(
          nextUpdate.latitude,
          nextUpdate.longitude
        );
      }, nextDelay);
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
