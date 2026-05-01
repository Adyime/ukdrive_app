import { NativeModules, Platform } from "react-native";

export interface NativeDriverLocationServiceStatus {
  isEnabled: boolean;
  isRunning: boolean;
  baseUrl: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  lastError: string | null;
  lastEvent: string | null;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastLocationAt: number | null;
  lastPostAttemptAt: number | null;
  lastPostSuccessAt: number | null;
  lastEventAt: number | null;
  lastHttpStatus: number | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
}

type NativeDriverLocationServiceModule = {
  start: (
    accessToken: string,
    refreshToken: string,
    baseUrl: string,
    notificationTitle: string,
    notificationBody: string
  ) => Promise<boolean>;
  stop: () => Promise<boolean>;
  getStatus: () => Promise<NativeDriverLocationServiceStatus>;
};

const nativeModule: NativeDriverLocationServiceModule | null =
  Platform.OS === "android"
    ? (NativeModules.DriverLocationService as
        | NativeDriverLocationServiceModule
        | undefined) ?? null
    : null;

export function isNativeDriverLocationServiceAvailable(): boolean {
  return nativeModule !== null;
}

export async function startNativeDriverLocationService(options: {
  accessToken: string;
  refreshToken: string;
  baseUrl: string;
  notificationTitle: string;
  notificationBody: string;
}): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.start(
    options.accessToken,
    options.refreshToken,
    options.baseUrl,
    options.notificationTitle,
    options.notificationBody
  );
}

export async function stopNativeDriverLocationService(): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.stop();
}

export async function getNativeDriverLocationServiceStatus(): Promise<NativeDriverLocationServiceStatus | null> {
  if (!nativeModule) return null;
  return nativeModule.getStatus();
}
