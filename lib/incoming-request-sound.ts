import { NativeModules, Platform } from "react-native";

type RideNotificationGuardNativeModule = {
  stopIncomingAlertSound?: () => Promise<void> | void;
};

const nativeRideGuard: RideNotificationGuardNativeModule | null =
  Platform.OS === "android"
    ? ((NativeModules.RideNotificationGuard as RideNotificationGuardNativeModule | undefined) ?? null)
    : null;

export async function stopNativeIncomingAlertSound(): Promise<void> {
  try {
    await nativeRideGuard?.stopIncomingAlertSound?.();
  } catch {
    // best-effort native sound cleanup
  }
}
