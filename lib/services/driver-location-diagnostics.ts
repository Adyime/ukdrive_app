import AsyncStorage from "@react-native-async-storage/async-storage";

const DRIVER_LOCATION_DIAGNOSTICS_KEY =
  "uk_drive_driver_location_diagnostics_v1";

export interface DriverLocationDiagnosticsSnapshot {
  lastTaskInvokedAt: string | null;
  lastTaskAttemptedPublishAt: string | null;
  lastTaskPublishSuccessAt: string | null;
  lastTaskLatitude: number | null;
  lastTaskLongitude: number | null;
  lastTaskErrorCode: string | null;
  lastTaskErrorMessage: string | null;
  lastTaskAuthCheckedAt: string | null;
  lastTaskAuthHasDriverSession: boolean | null;
  lastTaskAccessTokenPresent: boolean | null;
  lastForegroundAttemptAt: string | null;
  lastForegroundSuccessAt: string | null;
  lastForegroundLatitude: number | null;
  lastForegroundLongitude: number | null;
  lastForegroundErrorCode: string | null;
  lastForegroundErrorMessage: string | null;
  lastSuccessfulServerHeartbeatAt: string | null;
  lastAttemptedPublishAt: string | null;
  serviceLastStartAttemptAt: string | null;
  serviceLastStartResult: string | null;
  serviceLastStartErrorMessage: string | null;
  serviceLastStopAt: string | null;
  serviceLastStatusCheckedAt: string | null;
  serviceLastKnownRunning: boolean | null;
  serviceLastKnownHasPermissions: boolean | null;
  serviceLastKnownForegroundPermissionStatus: string | null;
  serviceLastKnownBackgroundPermissionStatus: string | null;
  serviceLastKnownIsLocationEnabled: boolean | null;
  serviceTaskDefinitionKnown: boolean | null;
  serviceLastRegisteredTaskNames: string[];
  serviceExpectedRunningButStoppedAt: string | null;
  serviceExpectedRunningReason: string | null;
  lastAppStateTransitionAt: string | null;
  lastAppState: string | null;
  lastVisibleRoute: string | null;
  lastKeepAwakeErrorAt: string | null;
  lastKeepAwakeErrorMessage: string | null;
  lastKeepAwakeErrorSource: string | null;
}

const DEFAULT_DIAGNOSTICS: DriverLocationDiagnosticsSnapshot = {
  lastTaskInvokedAt: null,
  lastTaskAttemptedPublishAt: null,
  lastTaskPublishSuccessAt: null,
  lastTaskLatitude: null,
  lastTaskLongitude: null,
  lastTaskErrorCode: null,
  lastTaskErrorMessage: null,
  lastTaskAuthCheckedAt: null,
  lastTaskAuthHasDriverSession: null,
  lastTaskAccessTokenPresent: null,
  lastForegroundAttemptAt: null,
  lastForegroundSuccessAt: null,
  lastForegroundLatitude: null,
  lastForegroundLongitude: null,
  lastForegroundErrorCode: null,
  lastForegroundErrorMessage: null,
  lastSuccessfulServerHeartbeatAt: null,
  lastAttemptedPublishAt: null,
  serviceLastStartAttemptAt: null,
  serviceLastStartResult: null,
  serviceLastStartErrorMessage: null,
  serviceLastStopAt: null,
  serviceLastStatusCheckedAt: null,
  serviceLastKnownRunning: null,
  serviceLastKnownHasPermissions: null,
  serviceLastKnownForegroundPermissionStatus: null,
  serviceLastKnownBackgroundPermissionStatus: null,
  serviceLastKnownIsLocationEnabled: null,
  serviceTaskDefinitionKnown: null,
  serviceLastRegisteredTaskNames: [],
  serviceExpectedRunningButStoppedAt: null,
  serviceExpectedRunningReason: null,
  lastAppStateTransitionAt: null,
  lastAppState: null,
  lastVisibleRoute: null,
  lastKeepAwakeErrorAt: null,
  lastKeepAwakeErrorMessage: null,
  lastKeepAwakeErrorSource: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeWithDefaults(
  value: Partial<DriverLocationDiagnosticsSnapshot> | null | undefined
): DriverLocationDiagnosticsSnapshot {
  return {
    ...DEFAULT_DIAGNOSTICS,
    ...(value ?? {}),
    serviceLastRegisteredTaskNames: Array.isArray(
      value?.serviceLastRegisteredTaskNames
    )
      ? value!.serviceLastRegisteredTaskNames.filter(
          (candidate): candidate is string => typeof candidate === "string"
        )
      : DEFAULT_DIAGNOSTICS.serviceLastRegisteredTaskNames,
  };
}

export async function getDriverLocationDiagnostics(): Promise<DriverLocationDiagnosticsSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(DRIVER_LOCATION_DIAGNOSTICS_KEY);
    if (!raw) return DEFAULT_DIAGNOSTICS;
    return mergeWithDefaults(JSON.parse(raw) as DriverLocationDiagnosticsSnapshot);
  } catch (error) {
    console.warn("[DriverLocationDiagnostics] Failed to read diagnostics:", error);
    return DEFAULT_DIAGNOSTICS;
  }
}

export async function updateDriverLocationDiagnostics(
  patch: Partial<DriverLocationDiagnosticsSnapshot>
): Promise<DriverLocationDiagnosticsSnapshot> {
  try {
    const current = await getDriverLocationDiagnostics();
    const next = mergeWithDefaults({
      ...current,
      ...patch,
      serviceLastRegisteredTaskNames:
        patch.serviceLastRegisteredTaskNames ??
        current.serviceLastRegisteredTaskNames,
    });
    await AsyncStorage.setItem(
      DRIVER_LOCATION_DIAGNOSTICS_KEY,
      JSON.stringify(next)
    );
    return next;
  } catch (error) {
    console.warn("[DriverLocationDiagnostics] Failed to persist diagnostics:", error);
    return getDriverLocationDiagnostics();
  }
}

export async function recordBackgroundTaskInvocation(
  latitude: number,
  longitude: number
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastTaskInvokedAt: nowIso(),
    lastTaskLatitude: sanitizeNumber(latitude),
    lastTaskLongitude: sanitizeNumber(longitude),
  });
}

export async function recordBackgroundTaskAuthCheck(
  options: {
    hasDriverSession: boolean;
    hasAccessToken: boolean;
    errorMessage?: string | null;
  }
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastTaskAuthCheckedAt: nowIso(),
    lastTaskAuthHasDriverSession: options.hasDriverSession,
    lastTaskAccessTokenPresent: options.hasAccessToken,
    ...(options.errorMessage
      ? {
          lastTaskErrorCode: "AUTH_CHECK_FAILED",
          lastTaskErrorMessage: options.errorMessage,
        }
      : {}),
  });
}

export async function recordBackgroundPublishAttempt(
  latitude: number,
  longitude: number
): Promise<void> {
  const attemptedAt = nowIso();
  await updateDriverLocationDiagnostics({
    lastTaskAttemptedPublishAt: attemptedAt,
    lastAttemptedPublishAt: attemptedAt,
    lastTaskLatitude: sanitizeNumber(latitude),
    lastTaskLongitude: sanitizeNumber(longitude),
    lastTaskErrorCode: null,
    lastTaskErrorMessage: null,
  });
}

export async function recordBackgroundPublishSuccess(
  updatedAt?: string | null
): Promise<void> {
  const successAt = updatedAt ?? nowIso();
  await updateDriverLocationDiagnostics({
    lastTaskPublishSuccessAt: successAt,
    lastSuccessfulServerHeartbeatAt: successAt,
    lastTaskErrorCode: null,
    lastTaskErrorMessage: null,
  });
}

export async function recordBackgroundPublishFailure(
  code: string,
  message: string
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastTaskErrorCode: code,
    lastTaskErrorMessage: message,
  });
}

export async function recordForegroundPublishAttempt(
  latitude: number,
  longitude: number
): Promise<void> {
  const attemptedAt = nowIso();
  await updateDriverLocationDiagnostics({
    lastForegroundAttemptAt: attemptedAt,
    lastAttemptedPublishAt: attemptedAt,
    lastForegroundLatitude: sanitizeNumber(latitude),
    lastForegroundLongitude: sanitizeNumber(longitude),
    lastForegroundErrorCode: null,
    lastForegroundErrorMessage: null,
  });
}

export async function recordForegroundPublishSuccess(
  updatedAt?: string | null
): Promise<void> {
  const successAt = updatedAt ?? nowIso();
  await updateDriverLocationDiagnostics({
    lastForegroundSuccessAt: successAt,
    lastSuccessfulServerHeartbeatAt: successAt,
    lastForegroundErrorCode: null,
    lastForegroundErrorMessage: null,
  });
}

export async function recordForegroundPublishFailure(
  code: string,
  message: string
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastForegroundErrorCode: code,
    lastForegroundErrorMessage: message,
  });
}

export async function recordDriverServiceStartAttempt(): Promise<void> {
  await updateDriverLocationDiagnostics({
    serviceLastStartAttemptAt: nowIso(),
    serviceLastStartResult: null,
    serviceLastStartErrorMessage: null,
  });
}

export async function recordDriverServiceStartResult(options: {
  result: string;
  errorMessage?: string | null;
  registeredTaskNames?: string[];
  taskDefinitionKnown?: boolean | null;
  isRunning?: boolean | null;
}): Promise<void> {
  await updateDriverLocationDiagnostics({
    serviceLastStartResult: options.result,
    serviceLastStartErrorMessage: options.errorMessage ?? null,
    ...(options.registeredTaskNames
      ? { serviceLastRegisteredTaskNames: options.registeredTaskNames }
      : {}),
    ...(typeof options.taskDefinitionKnown === "boolean"
      ? { serviceTaskDefinitionKnown: options.taskDefinitionKnown }
      : {}),
    ...(typeof options.isRunning === "boolean"
      ? { serviceLastKnownRunning: options.isRunning }
      : {}),
  });
}

export async function recordDriverServiceStopped(): Promise<void> {
  await updateDriverLocationDiagnostics({
    serviceLastStopAt: nowIso(),
    serviceLastKnownRunning: false,
  });
}

export async function recordDriverServiceStatus(options: {
  isRunning: boolean;
  hasPermissions: boolean;
  isLocationEnabled: boolean;
  foregroundPermissionStatus: string;
  backgroundPermissionStatus: string;
  registeredTaskNames: string[];
  taskDefinitionKnown: boolean;
}): Promise<void> {
  await updateDriverLocationDiagnostics({
    serviceLastStatusCheckedAt: nowIso(),
    serviceLastKnownRunning: options.isRunning,
    serviceLastKnownHasPermissions: options.hasPermissions,
    serviceLastKnownForegroundPermissionStatus: options.foregroundPermissionStatus,
    serviceLastKnownBackgroundPermissionStatus: options.backgroundPermissionStatus,
    serviceLastKnownIsLocationEnabled: options.isLocationEnabled,
    serviceLastRegisteredTaskNames: options.registeredTaskNames,
    serviceTaskDefinitionKnown: options.taskDefinitionKnown,
  });
}

export async function recordDriverServiceExpectedRunningButStopped(
  reason: string
): Promise<void> {
  await updateDriverLocationDiagnostics({
    serviceExpectedRunningButStoppedAt: nowIso(),
    serviceExpectedRunningReason: reason,
    serviceLastKnownRunning: false,
  });
}

export async function recordDriverLocationAppState(
  appState: string,
  route?: string | null
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastAppStateTransitionAt: nowIso(),
    lastAppState: appState,
    ...(typeof route === "string" ? { lastVisibleRoute: route } : {}),
  });
}

export async function recordDriverLocationVisibleRoute(
  route: string
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastVisibleRoute: route,
  });
}

export async function recordKeepAwakeDiagnostic(
  source: string,
  message: string
): Promise<void> {
  await updateDriverLocationDiagnostics({
    lastKeepAwakeErrorAt: nowIso(),
    lastKeepAwakeErrorMessage: message,
    lastKeepAwakeErrorSource: source,
  });
}
