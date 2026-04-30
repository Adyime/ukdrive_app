import Constants from "expo-constants";
import { get } from "../api";

export interface AndroidAppVersionResponse {
  platform: "android";
  latestVersionCode: number;
  minimumRequiredVersionCode: number;
  packageName: string;
  playStoreUrl: string;
}

export type AndroidUpdateStatus = "up_to_date" | "optional" | "required";

export interface AndroidVersionCheckResult extends AndroidAppVersionResponse {
  installedVersionCode: number;
  status: AndroidUpdateStatus;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export function getInstalledAndroidVersionCode(): number | null {
  if (Constants.appOwnership === "expo") {
    return null;
  }

  const candidates = [
    parsePositiveInteger(Constants.nativeBuildVersion),
    parsePositiveInteger(Constants.expoConfig?.android?.versionCode),
  ];

  for (const candidate of candidates) {
    if (candidate !== null) {
      return candidate;
    }
  }

  return null;
}

export async function getAndroidAppVersion():
  Promise<{ success: boolean; data?: AndroidAppVersionResponse; error?: unknown }> {
  return get<AndroidAppVersionResponse>("/api/version/android");
}

export function compareAndroidVersionCodes(
  installedVersionCode: number,
  serverVersion: AndroidAppVersionResponse
): AndroidVersionCheckResult {
  let status: AndroidUpdateStatus = "up_to_date";

  if (installedVersionCode < serverVersion.minimumRequiredVersionCode) {
    status = "required";
  } else if (installedVersionCode < serverVersion.latestVersionCode) {
    status = "optional";
  }

  return {
    ...serverVersion,
    installedVersionCode,
    status,
  };
}
