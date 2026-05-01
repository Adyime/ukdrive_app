/**
 * Driver Foreground Service
 * 
 * Manages background location tracking for drivers when they are "Available".
 * Uses expo-task-manager and expo-location to run a foreground service on Android
 * that keeps GPS active even when the app is backgrounded.
 * 
 * Features:
 * - Foreground service with ongoing notification (Android)
 * - Background location updates every ~10 seconds
 * - Automatic heartbeat to server to maintain "online" status
 * - Graceful start/stop lifecycle
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { updateDriverLocation } from '@/lib/api/driver';
import { getTokens } from '@/lib/storage';
import {
  recordBackgroundPublishAttempt,
  recordBackgroundPublishFailure,
  recordBackgroundPublishSuccess,
  recordBackgroundTaskAuthCheck,
  recordBackgroundTaskInvocation,
  recordDriverServiceExpectedRunningButStopped,
  recordDriverServiceStartAttempt,
  recordDriverServiceStartResult,
  recordDriverServiceStatus,
  recordDriverServiceStopped,
} from '@/lib/services/driver-location-diagnostics';

// Task name for the background location task
export const DRIVER_LOCATION_TASK = 'DRIVER_LOCATION_TASK';

// Configuration
const LOCATION_UPDATE_INTERVAL = 10000; // 10 seconds
const LOCATION_DISTANCE_INTERVAL = 10; // 10 meters minimum movement
const LOCATION_ACCURACY = Location.Accuracy.Balanced; // Good accuracy with reasonable battery

// State tracking
let isServiceRunning = false;
let lastUpdateTime = 0;
const MIN_UPDATE_INTERVAL_MS = 10000; // Minimum 10 seconds between server updates
const SERVICE_STATUS_CACHE_MS = 5000;
let lastServiceStatusCheckAt = 0;

async function getRegisteredTaskNames(): Promise<string[]> {
  try {
    const registeredTasks = await TaskManager.getRegisteredTasksAsync();
    return registeredTasks
      .map((task) => task.taskName)
      .filter((taskName): taskName is string => typeof taskName === "string");
  } catch (error) {
    console.warn(
      "[DriverForegroundService] Failed to read registered tasks:",
      error
    );
    return [];
  }
}

/**
 * Define the background location task
 * This must be called at the top level (outside of components) for it to work
 */
TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[DriverForegroundService] Task error:', error);
    await recordBackgroundPublishFailure(
      "TASK_ERROR",
      error.message || "Background task error"
    );
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };

    if (locations && locations.length > 0) {
      // Get the most recent location
      const location = locations[locations.length - 1];
      const { latitude, longitude } = location.coords;
      await recordBackgroundTaskInvocation(latitude, longitude);

      // Throttle server updates
      const now = Date.now();
      if (now - lastUpdateTime < MIN_UPDATE_INTERVAL_MS) {
        return;
      }
      lastUpdateTime = now;

      // Check if user is authenticated before attempting to update location
      try {
        const tokens = await getTokens();
        const hasDriverSession =
          !!tokens?.accessToken && tokens.userType === "driver";
        await recordBackgroundTaskAuthCheck({
          hasDriverSession,
          hasAccessToken: !!tokens?.accessToken,
        });
        if (!tokens?.accessToken || tokens.userType !== 'driver') {
          // User is not authenticated as a driver, skip location update
          // This can happen if the user logged out or is not logged in
          await recordBackgroundPublishFailure(
            "NO_DRIVER_SESSION",
            "Background task could not find a logged-in driver session."
          );
          return;
        }
      } catch (error) {
        // If we can't check tokens, skip the update to avoid errors
        console.warn('[DriverForegroundService] Could not verify authentication, skipping update');
        await recordBackgroundTaskAuthCheck({
          hasDriverSession: false,
          hasAccessToken: false,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Failed to verify stored driver tokens.",
        });
        return;
      }

      try {
        await recordBackgroundPublishAttempt(latitude, longitude);
        const response = await updateDriverLocation(latitude, longitude);
        if (!response.success) {
          await recordBackgroundPublishFailure(
            response.error?.code ?? "LOCATION_UPDATE_FAILED",
            response.error?.message ?? "Background task could not publish driver location."
          );
          // Only log non-auth errors (auth errors are expected if user logged out)
          if (response.error?.code !== 'UNAUTHORIZED' && response.error?.code !== 'SESSION_EXPIRED') {
            console.warn('[DriverForegroundService] Failed to update location:', response.error);
          }
        } else {
          await recordBackgroundPublishSuccess(
            response.data?.location?.updatedAt ?? null
          );
        }
      } catch (err) {
        console.error('[DriverForegroundService] Error updating location:', err);
        await recordBackgroundPublishFailure(
          "TASK_EXCEPTION",
          err instanceof Error
            ? err.message
            : "Background task threw while publishing driver location."
        );
      }
    }
  }
});

/**
 * Check if the foreground service is currently running
 */
export function isDriverServiceRunning(): boolean {
  return isServiceRunning;
}

/**
 * Check if background location is available on this device
 */
export async function isBackgroundLocationAvailable(): Promise<boolean> {
  // Background location only works on native platforms
  if (Platform.OS === 'web') {
    return false;
  }

  // Check if the task is defined
  const isTaskDefined = await TaskManager.isTaskDefined(DRIVER_LOCATION_TASK);
  if (!isTaskDefined) {
    return false;
  }

  return true;
}

/**
 * Request necessary permissions for background location
 * Returns true if all permissions are granted
 */
export async function requestBackgroundLocationPermissions(): Promise<boolean> {
  try {
    // First request foreground permission
    const foregroundStatus = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus.status !== 'granted') {
      console.warn('[DriverForegroundService] Foreground location permission denied');
      return false;
    }

    // Then request background permission (required for foreground service)
    const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus.status !== 'granted') {
      console.warn('[DriverForegroundService] Background location permission denied');
      if (Platform.OS === 'ios') {
        // iOS requires "Always" access for reliable background tracking.
        return false;
      }
      // Some Android variants allow startup and prompt upgrade later.
      return true;
    }

    return true;
  } catch (error) {
    console.error('[DriverForegroundService] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Start the driver foreground service
 * This will start background location tracking and show an ongoing notification
 * 
 * @returns true if service started successfully, false otherwise
 */
export async function startDriverService(): Promise<boolean> {
  await recordDriverServiceStartAttempt();

  if (isServiceRunning) {
    console.log('[DriverForegroundService] Service already running');
    const [registeredTaskNames, taskDefinitionKnown] = await Promise.all([
      getRegisteredTaskNames(),
      Promise.resolve(TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)),
    ]);
    await recordDriverServiceStartResult({
      result: "already_running",
      registeredTaskNames,
      taskDefinitionKnown,
      isRunning: true,
    });
    return true;
  }

  // Web platform doesn't support background location
  if (Platform.OS === 'web') {
    console.warn('[DriverForegroundService] Background location not supported on web');
    await recordDriverServiceStartResult({
      result: "web_unsupported",
      errorMessage: "Background location is not supported on web.",
      isRunning: false,
    });
    return false;
  }

  try {
    const [registeredTaskNamesBeforeStart, taskDefinitionKnown] =
      await Promise.all([
        getRegisteredTaskNames(),
        Promise.resolve(TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)),
      ]);

    // Check and request permissions
    const hasPermission = await requestBackgroundLocationPermissions();
    if (!hasPermission) {
      await recordDriverServiceStartResult({
        result: "permission_denied",
        errorMessage: "Background location permission was not granted.",
        registeredTaskNames: registeredTaskNamesBeforeStart,
        taskDefinitionKnown,
        isRunning: false,
      });
      return false;
    }

    // Check if location services are enabled
    const isEnabled = await Location.hasServicesEnabledAsync();
    if (!isEnabled) {
      console.warn('[DriverForegroundService] Location services are disabled');
      await recordDriverServiceStartResult({
        result: "location_disabled",
        errorMessage: "Location services are disabled on the device.",
        registeredTaskNames: registeredTaskNamesBeforeStart,
        taskDefinitionKnown,
        isRunning: false,
      });
      return false;
    }

    // Check if already running (in case of app restart)
    const isAlreadyRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    if (isAlreadyRunning) {
      console.log('[DriverForegroundService] Task was already running, marking as active');
      isServiceRunning = true;
      lastServiceStatusCheckAt = Date.now();
      await recordDriverServiceStartResult({
        result: "already_registered",
        registeredTaskNames: registeredTaskNamesBeforeStart,
        taskDefinitionKnown,
        isRunning: true,
      });
      return true;
    }

    // Start background location updates with foreground service
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
      accuracy: LOCATION_ACCURACY,
      timeInterval: LOCATION_UPDATE_INTERVAL,
      distanceInterval: LOCATION_DISTANCE_INTERVAL,
      deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL,
      deferredUpdatesDistance: LOCATION_DISTANCE_INTERVAL,

      // Android foreground service configuration
      foregroundService: {
        notificationTitle: 'UK Drive - Available',
        notificationBody: 'You are available for ride requests',
        notificationColor: '#843FE3', // Driver brand purple
        // On Android, keep the tracking service alive when the task is swiped
        // away from recents so passenger maps can continue receiving heartbeats.
        killServiceOnDestroy: false,
      },

      // iOS configuration
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
    });

    isServiceRunning = true;
    lastUpdateTime = 0; // Reset throttle timer
    lastServiceStatusCheckAt = Date.now();
    await recordDriverServiceStartResult({
      result: "started",
      registeredTaskNames: await getRegisteredTaskNames(),
      taskDefinitionKnown,
      isRunning: true,
    });
    console.log('[DriverForegroundService] Service started successfully');
    return true;
  } catch (error) {
    console.error('[DriverForegroundService] Failed to start service:', error);
    isServiceRunning = false;
    lastServiceStatusCheckAt = Date.now();
    await recordDriverServiceStartResult({
      result: "error",
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to start the Android driver tracking service.",
      registeredTaskNames: await getRegisteredTaskNames(),
      taskDefinitionKnown: TaskManager.isTaskDefined(DRIVER_LOCATION_TASK),
      isRunning: false,
    });
    return false;
  }
}

/**
 * Stop the driver foreground service
 * This will stop background location tracking and remove the notification
 * 
 * @returns true if service stopped successfully, false otherwise
 */
export async function stopDriverService(): Promise<boolean> {
  if (!isServiceRunning) {
    // Check if it's running anyway (in case state got out of sync)
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
      if (!isRunning) {
        console.log('[DriverForegroundService] Service not running');
        await recordDriverServiceStopped();
        return true;
      }
    } catch {
      // Task might not exist
      await recordDriverServiceStopped();
      return true;
    }
  }

  try {
    // Stop location updates
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);

    isServiceRunning = false;
    lastServiceStatusCheckAt = Date.now();
    await recordDriverServiceStopped();
    console.log('[DriverForegroundService] Service stopped successfully');
    return true;
  } catch (error) {
    console.error('[DriverForegroundService] Failed to stop service:', error);
    // Mark as stopped even if there was an error
    isServiceRunning = false;
    lastServiceStatusCheckAt = Date.now();
    await recordDriverServiceStopped();
    return false;
  }
}

/**
 * Toggle the driver service based on availability
 * Convenience function that starts or stops based on the desired state
 * 
 * @param available - Whether the driver wants to be available
 * @returns true if the operation succeeded, false otherwise
 */
export async function setDriverServiceAvailable(available: boolean): Promise<boolean> {
  if (available) {
    return startDriverService();
  } else {
    return stopDriverService();
  }
}

/**
 * Get the current status of the foreground service
 */
export async function getDriverServiceStatus(): Promise<{
  isRunning: boolean;
  hasPermissions: boolean;
  isLocationEnabled: boolean;
}> {
  try {
    // Check actual running state
    let actuallyRunning = false;
    try {
      actuallyRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    } catch {
      actuallyRunning = false;
    }

    // Sync internal state
    isServiceRunning = actuallyRunning;
    lastServiceStatusCheckAt = Date.now();

    // Check permissions
    const foregroundPerm = await Location.getForegroundPermissionsAsync();
    let backgroundPerm = { status: 'undetermined' as Location.PermissionStatus };
    try {
      backgroundPerm = await Location.getBackgroundPermissionsAsync();
    } catch {
      // Background permission may not be available
    }

    const hasForegroundPermission = foregroundPerm.status === 'granted';
    const hasBackgroundPermission = backgroundPerm.status === 'granted';
    const hasPermissions =
      hasForegroundPermission &&
      (Platform.OS === 'ios' ? hasBackgroundPermission : true);

    // Check location services
    const isLocationEnabled = await Location.hasServicesEnabledAsync();
    const [registeredTaskNames, taskDefinitionKnown] = await Promise.all([
      getRegisteredTaskNames(),
      Promise.resolve(TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)),
    ]);

    await recordDriverServiceStatus({
      isRunning: actuallyRunning,
      hasPermissions,
      isLocationEnabled,
      foregroundPermissionStatus: foregroundPerm.status,
      backgroundPermissionStatus: backgroundPerm.status,
      registeredTaskNames,
      taskDefinitionKnown,
    });

    return {
      isRunning: actuallyRunning,
      hasPermissions,
      isLocationEnabled,
    };
  } catch (error) {
    console.error('[DriverForegroundService] Error getting status:', error);
    await recordDriverServiceStatus({
      isRunning: false,
      hasPermissions: false,
      isLocationEnabled: false,
      foregroundPermissionStatus: "unknown",
      backgroundPermissionStatus: "unknown",
      registeredTaskNames: await getRegisteredTaskNames(),
      taskDefinitionKnown: TaskManager.isTaskDefined(DRIVER_LOCATION_TASK),
    });
    return {
      isRunning: false,
      hasPermissions: false,
      isLocationEnabled: false,
    };
  }
}

/**
 * Foreground watchers should only publish as a fallback when the
 * background task is not running.
 */
export async function shouldPublishFromForegroundWatcher(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  if (AppState.currentState === "active") return true;

  const now = Date.now();
  if (
    now - lastServiceStatusCheckAt <= SERVICE_STATUS_CACHE_MS
  ) {
    return !isServiceRunning;
  }

  lastServiceStatusCheckAt = now;

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(
      DRIVER_LOCATION_TASK
    );
    isServiceRunning = running;
    if (!running) {
      await recordDriverServiceExpectedRunningButStopped(
        "foreground_fallback_detected_no_background_task"
      );
    }
    return !running;
  } catch {
    // Fail open so we don't lose tracking updates
    await recordDriverServiceExpectedRunningButStopped(
      "foreground_fallback_status_check_failed"
    );
    return true;
  }
}
