import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import {
  getDriverServiceStatus,
  startDriverService,
} from "@/lib/services/driver-foreground-service";

const CONTINUITY_CHECK_INTERVAL_MS = 10_000;

export function useEnsureDriverTrackingContinuity(
  enabled: boolean,
  logTag: string
): void {
  const checkInFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let isMounted = true;

    const ensureTrackingServiceRunning = async () => {
      if (!isMounted || checkInFlightRef.current) return;
      checkInFlightRef.current = true;

      try {
        const status = await getDriverServiceStatus();
        if (!status.isRunning) {
          await startDriverService();
        }
      } catch (error) {
        console.warn(`[${logTag}] Failed to enforce tracking continuity:`, error);
      } finally {
        checkInFlightRef.current = false;
      }
    };

    void ensureTrackingServiceRunning();

    const interval = setInterval(() => {
      void ensureTrackingServiceRunning();
    }, CONTINUITY_CHECK_INTERVAL_MS);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          void ensureTrackingServiceRunning();
        }
      }
    );

    return () => {
      isMounted = false;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [enabled, logTag]);
}
