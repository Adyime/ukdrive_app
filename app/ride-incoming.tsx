/**
 * Ride Incoming Screen
 * Full-screen incoming ride requests for drivers.
 * Shows requests in a stack with independent timers.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, Navigation, X, Check } from "lucide-react-native";
import { Audio } from "expo-av";
import { OneSignal } from "react-native-onesignal";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import {
  getRideById,
  acceptRide,
  getPendingRides,
  formatDistance,
  type RideResponse,
} from "@/lib/api/ride";
import { getDriverLocation } from "@/lib/api/driver";
import {
  addNotificationEventListener,
  addServiceEventListener,
  dispatchServiceCreated,
  dispatchServiceUpdated,
} from "@/lib/events";
import {
  clearIncomingRidePopup,
  getPendingIncomingRideRequests,
  IncomingRideRequestPayload,
  isRideHandled,
  markIncomingRideHandled,
  markIncomingRidePopupVisible,
  setActiveRideId,
  setHandledRide,
  subscribeToPendingIncomingRideId,
} from "@/lib/incoming-ride-request";
import { stopNativeIncomingAlertSound } from "@/lib/incoming-request-sound";
import { recordKeepAwakeDiagnostic } from "@/lib/services/driver-location-diagnostics";
import { subscribeToRideStatus, unsubscribeChannel } from "@/lib/supabase";

const COUNTDOWN_SECONDS = 18;
const BRAND_PURPLE = "#843FE3";

function getRideDispatchWaveKey(ride: RideResponse): string {
  if (typeof ride.expiresAt === "string" && ride.expiresAt.trim().length > 0) {
    return ride.expiresAt;
  }
  if (ride.expiresAt instanceof Date) {
    return ride.expiresAt.toISOString();
  }
  return ride.requestedAt;
}

function decodeParam(value: string | undefined): string {
  if (!value) return "";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  let normalized = decoded;
  for (let i = 0; i < 2; i += 1) {
    normalized = normalized
      .replace(/\\\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  return normalized
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .trim();
}

function normalizeFareValue(value: string): string {
  if (!value) return "";
  const sanitized = value
    .replace(/(?:\\\\u20B9|\\u20B9|₹|INR|RS\.?)/gi, " ")
    .replace(/[^\d.,-]/g, " ")
    .trim();
  const matches = sanitized.match(/-?\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return "";
  const candidate = matches[matches.length - 1].replace(/,/g, "");
  const numericFare = Number(candidate);
  if (!Number.isFinite(numericFare)) return "";
  return numericFare.toFixed(2);
}

function normalizeDistanceValue(value: string): string {
  if (!value) return "";
  const sanitized = value
    .replace(/(?:km|kilometer|kilometre|m|meter|metre)/gi, " ")
    .replace(/[^\d.,-]/g, " ")
    .trim();
  const matches = sanitized.match(/-?\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return "";
  const candidate = matches[matches.length - 1].replace(/,/g, "");
  const numericDistance = Number(candidate);
  if (!Number.isFinite(numericDistance) || numericDistance < 0) return "";
  return String(numericDistance);
}

function parseNotificationTimestamp(value?: string): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1_000_000_000_000) return numeric;
    if (numeric > 1_000_000_000) return numeric * 1000;
    return null;
  }
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return asDate;
  return null;
}

function isIncomingSentAtNewer(currentSentAt?: string, incomingSentAt?: string): boolean {
  const currentMs = parseNotificationTimestamp(currentSentAt);
  const incomingMs = parseNotificationTimestamp(incomingSentAt);
  if (incomingMs == null) return false;
  if (currentMs == null) return true;
  return incomingMs > currentMs;
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}

function getApiErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code.toUpperCase();
  }
  return "";
}

function isRideNoLongerAvailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = getApiErrorCode(error);
  const message =
    "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? String((error as { message: string }).message).toLowerCase()
      : "";

  if (
    code === "RIDE_NOT_FOUND" ||
    code === "RIDE_EXPIRED" ||
    code === "RIDE_ALREADY_ACCEPTED" ||
    code === "RIDE_ALREADY_CANCELLED"
  ) {
    return true;
  }

  return /no longer|already|expired|not available|not found|assigned/.test(message);
}

function isRideDetailsAccessRestricted(error: unknown): boolean {
  const code = getApiErrorCode(error);
  return code === "RIDE_NOT_YOURS" || code === "FORBIDDEN";
}

const RINGTONE_URI = require("@/assets/ukdrive.mp3");

type IncomingRideCard = {
  rideId: string;
  pickupLocation: string;
  destination: string;
  fare: string;
  distance: string;
  sentAt?: string;
  expiresAtMs: number;
  countdown: number;
  loading: boolean;
  accepting: boolean;
  declining: boolean;
};

function getRequestExpiresAtMs(sentAt?: string): number {
  const sentAtMs = parseNotificationTimestamp(sentAt);
  const requestStartedAtMs = sentAtMs ?? Date.now();
  return requestStartedAtMs + COUNTDOWN_SECONDS * 1000;
}

function getCountdownFromExpiresAt(expiresAtMs: number): number {
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function toIncomingRideCard(
  payload: IncomingRideRequestPayload
): IncomingRideCard {
  const pickupLocation = decodeParam(payload.pickupLocation);
  const destination = decodeParam(payload.destination);
  const fare = normalizeFareValue(decodeParam(payload.fare));
  const distance = normalizeDistanceValue(decodeParam(payload.distance));
  const expiresAtMs = getRequestExpiresAtMs(payload.sentAt);

  return {
    rideId: payload.rideId,
    pickupLocation,
    destination,
    fare,
    distance,
    sentAt: payload.sentAt,
    expiresAtMs,
    countdown: getCountdownFromExpiresAt(expiresAtMs),
    loading: !pickupLocation || !destination || !fare,
    accepting: false,
    declining: false,
  };
}

export default function RideIncomingScreen() {
  const params = useLocalSearchParams<{
    rideId: string;
    pickupLocation?: string;
    destination?: string;
    fare?: string;
    distance?: string;
    sentAt?: string;
    action?: string;
  }>();
  const {
    rideId,
    pickupLocation: paramPickup,
    destination: paramDest,
    fare: paramFare,
    distance: paramDistance,
    sentAt: paramSentAt,
    action: paramAction,
  } = params;

  const { userType, user } = useAuth();
  const toast = useToast();

  const initialPayloadRef = useRef<IncomingRideRequestPayload | null>(
    rideId
      ? {
          rideId,
          pickupLocation: paramPickup,
          destination: paramDest,
          fare: paramFare,
          distance: paramDistance,
          sentAt: paramSentAt,
        }
      : null
  );

  const [requests, setRequests] = useState<IncomingRideCard[]>(() => {
    if (!initialPayloadRef.current) return [];
    return [toIncomingRideCard(initialPayloadRef.current)];
  });

  const requestsRef = useRef<IncomingRideCard[]>(requests);
  const hydratingRideIdsRef = useRef<Set<string>>(new Set());
  const pollInFlightRef = useRef(false);
  const pendingSyncInFlightRef = useRef(false);
  const syncingHandledRef = useRef(false);
  const autoActionHandledRef = useRef(false);
  const endScreenInFlightRef = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);
  const ringtoneStartingRef = useRef(false);
  const ringtonePlayingRef = useRef(false);
  const rideStatusChannelsRef = useRef(new Map<string, ReturnType<typeof subscribeToRideStatus>>());

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  const clearRideNotifications = useCallback(() => {
    try {
      OneSignal.Notifications.clearAll();
    } catch {
      // best-effort cleanup
    }
  }, []);

  const stopRingtone = useCallback(async () => {
    try {
      await stopNativeIncomingAlertSound();
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      ringtoneStartingRef.current = false;
      ringtonePlayingRef.current = false;
    } catch {
      // ignore
    }
  }, []);

  const navigateToHome = useCallback(() => {
    try {
      if (typeof router.canGoBack === "function" && router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)");
      }
    } catch {
      router.replace("/(tabs)");
    }
  }, []);

  const cleanupRideStatusSubscriptions = useCallback(() => {
    for (const channel of rideStatusChannelsRef.current.values()) {
      unsubscribeChannel(channel);
    }
    rideStatusChannelsRef.current.clear();
  }, []);

  const endIncomingScreen = useCallback(
    (navigateHome: boolean) => {
      if (endScreenInFlightRef.current) return;
      endScreenInFlightRef.current = true;
      cleanupRideStatusSubscriptions();
      clearIncomingRidePopup();
      clearRideNotifications();
      void stopRingtone();
      if (navigateHome) {
        navigateToHome();
      }
    },
    [cleanupRideStatusSubscriptions, clearRideNotifications, navigateToHome, stopRingtone]
  );

  const upsertRideRequest = useCallback((payload: IncomingRideRequestPayload) => {
    if (!payload.rideId) return;
    void stopNativeIncomingAlertSound();

    const incoming = toIncomingRideCard(payload);

    setRequests((prev) => {
      const existingIndex = prev.findIndex((item) => item.rideId === payload.rideId);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const merged: IncomingRideCard = {
          ...existing,
          pickupLocation: incoming.pickupLocation || existing.pickupLocation,
          destination: incoming.destination || existing.destination,
          fare: incoming.fare || existing.fare,
          distance: incoming.distance || existing.distance,
          sentAt: incoming.sentAt ?? existing.sentAt,
          expiresAtMs: isIncomingSentAtNewer(existing.sentAt, incoming.sentAt)
            ? incoming.expiresAtMs
            : existing.expiresAtMs,
          countdown: isIncomingSentAtNewer(existing.sentAt, incoming.sentAt)
            ? getCountdownFromExpiresAt(incoming.expiresAtMs)
            : existing.countdown,
          loading:
            existing.loading &&
            (!incoming.pickupLocation || !incoming.destination || !incoming.fare),
        };
        const next = prev.slice();
        next[existingIndex] = merged;
        return next;
      }
      return [...prev, incoming];
    });
  }, []);

  const removeRideRequests = useCallback((rideIds: string[]) => {
    if (rideIds.length === 0) return;
    const rideIdSet = new Set(rideIds.filter(Boolean));
    if (rideIdSet.size === 0) return;

    for (const id of rideIdSet) {
      clearIncomingRidePopup(id);
      const channel = rideStatusChannelsRef.current.get(id);
      if (channel) {
        unsubscribeChannel(channel);
        rideStatusChannelsRef.current.delete(id);
      }
    }

    setRequests((prev) => prev.filter((request) => !rideIdSet.has(request.rideId)));
  }, []);

  const removeClosedRideRequests = useCallback(
    async (rideIds: string[]) => {
      const uniqueRideIds = Array.from(new Set(rideIds.filter(Boolean)));
      if (uniqueRideIds.length === 0) return;

      void stopNativeIncomingAlertSound();
      await Promise.allSettled(uniqueRideIds.map((id) => setHandledRide(id)));
      clearRideNotifications();
      dispatchServiceUpdated();
      removeRideRequests(uniqueRideIds);
    },
    [clearRideNotifications, removeRideRequests]
  );

  const hydrateRideRequest = useCallback(
    async (targetRideId: string) => {
      if (!targetRideId || hydratingRideIdsRef.current.has(targetRideId)) return;
      hydratingRideIdsRef.current.add(targetRideId);

      try {
        const res = await getRideById(targetRideId);

        if (res.success && res.data?.ride) {
          const ride = res.data.ride;
          const status = typeof ride.status === "string" ? ride.status.toUpperCase() : "";
          const requestedDriverId =
            typeof ride.requestedDriverId === "string" ? ride.requestedDriverId : null;
          const assignedDriverId = typeof ride.driverId === "string" ? ride.driverId : null;

          if (status && status !== "REQUESTED") {
            markIncomingRideHandled(targetRideId);
            clearRideNotifications();

            if (
              assignedDriverId &&
              user?.id &&
              assignedDriverId === user.id &&
              status !== "CANCELLED" &&
              status !== "COMPLETED"
            ) {
              endIncomingScreen(false);
              router.replace("/(tabs)/active-ride");
              return;
            }

            await removeClosedRideRequests([targetRideId]);
            return;
          }

          if (requestedDriverId && user?.id && requestedDriverId !== user.id) {
            markIncomingRideHandled(targetRideId);
            clearRideNotifications();
            await removeClosedRideRequests([targetRideId]);
            return;
          }

          setRequests((prev) =>
            prev.map((request) => {
              if (request.rideId !== targetRideId) return request;
              return {
                ...request,
                pickupLocation: ride.pickupLocation ?? request.pickupLocation,
                destination: ride.destination ?? request.destination,
                fare: ride.fare != null ? String(ride.fare.toFixed(2)) : request.fare,
                distance: ride.distance != null ? String(Number(ride.distance)) : request.distance,
                loading: false,
              };
            })
          );
          return;
        }

        if (res.error && isRideNoLongerAvailable(res.error)) {
          markIncomingRideHandled(targetRideId);
          clearRideNotifications();
          await removeClosedRideRequests([targetRideId]);
          return;
        }

        if (res.error && isRideDetailsAccessRestricted(res.error)) {
          setRequests((prev) =>
            prev.map((request) =>
              request.rideId === targetRideId
                ? {
                    ...request,
                    loading: false,
                  }
                : request
            )
          );
          return;
        }

        setRequests((prev) =>
          prev.map((request) =>
            request.rideId === targetRideId
              ? {
                  ...request,
                  loading: false,
                }
              : request
          )
        );
      } catch {
        setRequests((prev) =>
          prev.map((request) =>
            request.rideId === targetRideId
              ? {
                  ...request,
                  loading: false,
                }
              : request
          )
        );
      } finally {
        hydratingRideIdsRef.current.delete(targetRideId);
      }
    },
    [clearRideNotifications, endIncomingScreen, removeClosedRideRequests, user?.id]
  );

  const setRequestActionState = useCallback(
    (
      targetRideId: string,
      patch: Partial<Pick<IncomingRideCard, "accepting" | "declining">>
    ) => {
      setRequests((prev) =>
        prev.map((request) =>
          request.rideId === targetRideId
            ? {
                ...request,
                ...patch,
              }
            : request
        )
      );
    },
    []
  );

  const handleAccept = useCallback(
    async (targetRideId: string) => {
      if (!targetRideId || endScreenInFlightRef.current) return;
      const target = requestsRef.current.find((request) => request.rideId === targetRideId);
      if (!target || target.accepting || target.declining) return;

      setRequestActionState(targetRideId, { accepting: true });
      try {
        const res = await acceptRide(targetRideId);
        if (res.success && res.data) {
          await setHandledRide(targetRideId);
          await setActiveRideId(targetRideId);
          clearRideNotifications();
          dispatchServiceCreated();
          endIncomingScreen(false);
          router.replace("/(tabs)/active-ride");
          return;
        }

        const message = getApiErrorMessage(res.error, "Failed to accept ride");
        if (isRideNoLongerAvailable(res.error)) {
          await removeClosedRideRequests([targetRideId]);
          toast.info(message || "Ride is no longer available.");
          return;
        }

        toast.error(message);
      } catch (error) {
        if (isRideNoLongerAvailable(error)) {
          await removeClosedRideRequests([targetRideId]);
          toast.info(getApiErrorMessage(error, "Ride is no longer available."));
          return;
        }
        toast.error("Something went wrong. Please try again.");
      } finally {
        setRequestActionState(targetRideId, { accepting: false });
      }
    },
    [clearRideNotifications, endIncomingScreen, removeClosedRideRequests, setRequestActionState, toast]
  );

  const handleDismiss = useCallback(
    async (targetRideId: string) => {
      if (!targetRideId || endScreenInFlightRef.current) return;
      const target = requestsRef.current.find((request) => request.rideId === targetRideId);
      if (!target || target.accepting || target.declining) return;

      setRequestActionState(targetRideId, { declining: true });
      try {
        await setHandledRide(targetRideId);
        clearRideNotifications();
        dispatchServiceUpdated();
        removeRideRequests([targetRideId]);
      } catch {
        toast.error("Failed to dismiss.");
      } finally {
        setRequestActionState(targetRideId, { declining: false });
      }
    },
    [clearRideNotifications, removeRideRequests, setRequestActionState, toast]
  );

  // Only drivers should see this screen.
  useEffect(() => {
    if (userType && userType !== "driver") {
      router.back();
    }
  }, [userType]);

  // Keep incoming popup gate active while this screen is mounted.
  useEffect(() => {
    if (!rideId) return;
    markIncomingRidePopupVisible(rideId);
    return () => {
      cleanupRideStatusSubscriptions();
      clearIncomingRidePopup();
      void stopRingtone();
    };
  }, [cleanupRideStatusSubscriptions, rideId, stopRingtone]);

  // Route params may change if app receives another deep-link while this route is open.
  useEffect(() => {
    if (!rideId) return;
    upsertRideRequest({
      rideId,
      pickupLocation: paramPickup,
      destination: paramDest,
      fare: paramFare,
      distance: paramDistance,
      sentAt: paramSentAt,
    });
  }, [rideId, paramPickup, paramDest, paramFare, paramDistance, paramSentAt, upsertRideRequest]);

  // Merge already queued ride requests into the stack.
  useEffect(() => {
    const queuedRequests = getPendingIncomingRideRequests();
    for (const queuedRequest of queuedRequests) {
      upsertRideRequest(queuedRequest);
    }
  }, [upsertRideRequest]);

  // Listen for newly queued incoming rides while this screen is open.
  useEffect(() => {
    return subscribeToPendingIncomingRideId((request) => {
      upsertRideRequest(request);
    });
  }, [upsertRideRequest]);

  // Reliability sync: while incoming screen is open, keep pulling pending rides so
  // multiple requests are shown as stacked cards even if a push event is missed.
  useEffect(() => {
    if (!rideId || endScreenInFlightRef.current) return;

    const syncPendingRides = async () => {
      if (pendingSyncInFlightRef.current) return;
      pendingSyncInFlightRef.current = true;

      try {
        const statusResponse = await getDriverLocation();
        const currentLocation = statusResponse.data?.location;
        if (!statusResponse.success || !currentLocation) {
          return;
        }

        const pendingResponse = await getPendingRides(
          currentLocation.latitude,
          currentLocation.longitude
        );
        const pendingRides = pendingResponse.data?.rides ?? [];
        if (!pendingResponse.success || pendingRides.length === 0) {
          return;
        }

        for (const pendingRide of pendingRides) {
          const status =
            typeof pendingRide.status === "string"
              ? pendingRide.status.toUpperCase()
              : "";
          if (status && status !== "REQUESTED") continue;

          const dispatchWaveKey = getRideDispatchWaveKey(pendingRide);
          upsertRideRequest({
            rideId: pendingRide.id,
            pickupLocation: pendingRide.pickupLocation,
            destination: pendingRide.destination,
            fare: pendingRide.fare.toFixed(2),
            distance: pendingRide.distance != null ? String(Number(pendingRide.distance)) : undefined,
            sentAt: dispatchWaveKey,
          });
        }
      } catch {
        // best-effort sync
      } finally {
        pendingSyncInFlightRef.current = false;
      }
    };

    void syncPendingRides();
    const interval = setInterval(() => {
      void syncPendingRides();
    }, 2500);

    return () => clearInterval(interval);
  }, [rideId, upsertRideRequest]);

  // Hydrate missing request details per card.
  useEffect(() => {
    for (const request of requests) {
      if (!request.loading) continue;
      void hydrateRideRequest(request.rideId);
    }
  }, [requests, hydrateRideRequest]);

  // One timer tick for all stacked requests.
  useEffect(() => {
    if (requests.length === 0 || endScreenInFlightRef.current) return;

    const timer = setInterval(() => {
      let expiredRideIds: string[] = [];

      setRequests((prev) => {
        const next: IncomingRideCard[] = [];
        for (const request of prev) {
          const nextCountdown = getCountdownFromExpiresAt(request.expiresAtMs);
          if (nextCountdown <= 0) {
            expiredRideIds.push(request.rideId);
            continue;
          }
          next.push({
            ...request,
            countdown: nextCountdown,
          });
        }
        return next;
      });

      if (expiredRideIds.length > 0) {
        void removeClosedRideRequests(expiredRideIds);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [requests.length, removeClosedRideRequests]);

  // Close screen when no requests remain.
  useEffect(() => {
    if (!rideId || endScreenInFlightRef.current) return;
    if (requests.length > 0) return;
    endIncomingScreen(true);
  }, [endIncomingScreen, requests.length, rideId]);

  // Sync handled state in case another surface marks rides as handled.
  const syncHandledState = useCallback(() => {
    if (syncingHandledRef.current) return;
    syncingHandledRef.current = true;

    void (async () => {
      try {
        const handledRideIds: string[] = [];
        const snapshot = requestsRef.current;

        for (const request of snapshot) {
          if (await isRideHandled(request.rideId, request.sentAt)) {
            handledRideIds.push(request.rideId);
          }
        }

        if (handledRideIds.length > 0) {
          clearRideNotifications();
          removeRideRequests(handledRideIds);
        }
      } finally {
        syncingHandledRef.current = false;
      }
    })();
  }, [clearRideNotifications, removeRideRequests]);

  useEffect(() => {
    const cleanupNotifications = addNotificationEventListener(syncHandledState);
    const cleanupServices = addServiceEventListener(syncHandledState);

    return () => {
      cleanupNotifications();
      cleanupServices();
    };
  }, [syncHandledState]);

  // Realtime close for requests accepted by another driver or cancelled.
  useEffect(() => {
    const activeRideIds = new Set(requests.map((request) => request.rideId));

    for (const [trackedRideId, channel] of rideStatusChannelsRef.current.entries()) {
      if (activeRideIds.has(trackedRideId)) continue;
      unsubscribeChannel(channel);
      rideStatusChannelsRef.current.delete(trackedRideId);
    }

    for (const request of requests) {
      if (rideStatusChannelsRef.current.has(request.rideId)) continue;

      const channel = subscribeToRideStatus(request.rideId, (updated) => {
        const status = typeof updated.status === "string" ? updated.status.toUpperCase() : "";
        if (status !== "ACCEPTED" && status !== "CANCELLED") return;
        if (status === "ACCEPTED" && updated.driver_id === user?.id) return;

        void stopNativeIncomingAlertSound();
        markIncomingRideHandled(request.rideId);
        clearRideNotifications();
        dispatchServiceUpdated();
        removeRideRequests([request.rideId]);
      });

      rideStatusChannelsRef.current.set(request.rideId, channel);
    }
  }, [clearRideNotifications, removeRideRequests, requests, user?.id]);

  // Polling fallback for stale subscriptions/network hiccups.
  useEffect(() => {
    if (requests.length === 0) return;

    const poll = setInterval(() => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;

      void (async () => {
        try {
          const toClose: string[] = [];
          const snapshot = requestsRef.current;

          for (const request of snapshot) {
            try {
              const res = await getRideById(request.rideId);
              if (res.success && res.data?.ride) {
                const status =
                  typeof res.data.ride.status === "string"
                    ? res.data.ride.status.toUpperCase()
                    : "";

                if (!status || status === "REQUESTED") {
                  continue;
                }

                if (
                  status === "ACCEPTED" &&
                  typeof res.data.ride.driverId === "string" &&
                  res.data.ride.driverId === user?.id
                ) {
                  continue;
                }

                toClose.push(request.rideId);
                continue;
              }

              if (res.error && isRideNoLongerAvailable(res.error)) {
                toClose.push(request.rideId);
              }
            } catch {
              // ignore polling errors for individual rides
            }
          }

          if (toClose.length > 0) {
            await removeClosedRideRequests(toClose);
          }
        } finally {
          pollInFlightRef.current = false;
        }
      })();
    }, 3000);

    return () => clearInterval(poll);
  }, [removeClosedRideRequests, requests.length, user?.id]);

  // Optional deep-link auto-action support for targeted ride.
  useEffect(() => {
    if (!paramAction || autoActionHandledRef.current || !rideId) return;
    const targetExists = requests.some((request) => request.rideId === rideId);
    if (!targetExists) return;

    const action = String(paramAction).toLowerCase();
    autoActionHandledRef.current = true;

    if (action === "accept") {
      void handleAccept(rideId);
      return;
    }

    if (action === "decline" || action === "dismiss") {
      void handleDismiss(rideId);
    }
  }, [handleAccept, handleDismiss, paramAction, requests, rideId]);

  // Stop native alert sound whenever new requests arrive.
  // The JS expo-av ringtone below handles audio while this screen is open;
  // without this, the native IncomingRequestSoundController (restarted by the
  // push notification extension for every new ride) would play simultaneously.
  const requestCount = requests.length;
  useEffect(() => {
    if (requestCount > 0) {
      void stopNativeIncomingAlertSound();
    }
  }, [requestCount]);

  // Loop ringtone while at least one request is visible.
  const ensureRingtonePlaying = useCallback(async () => {
    if (ringtoneStartingRef.current || ringtonePlayingRef.current) return;
    ringtoneStartingRef.current = true;

    try {
      await stopNativeIncomingAlertSound();
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        RINGTONE_URI,
        { shouldPlay: true, isLooping: true }
      );

      if (endScreenInFlightRef.current || requestsRef.current.length === 0) {
        await sound.unloadAsync();
        ringtoneStartingRef.current = false;
        ringtonePlayingRef.current = false;
        return;
      }

      soundRef.current = sound;
      ringtonePlayingRef.current = true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to start incoming ride ringtone.";
        if (message.toLowerCase().includes("keep awake")) {
          await recordKeepAwakeDiagnostic("ride-incoming:ensureRingtonePlaying", message);
        }
        console.warn("[RideIncoming] Failed to start ringtone:", message);
      } finally {
        ringtoneStartingRef.current = false;
      }
  }, []);

  useEffect(() => {
    if (requestCount === 0 || endScreenInFlightRef.current) {
      void stopRingtone();
      return;
    }
    if (!ringtonePlayingRef.current) {
      void ensureRingtonePlaying();
    }
  }, [ensureRingtonePlaying, requestCount, stopRingtone]);

  useEffect(() => {
    return () => {
      ringtoneStartingRef.current = false;
      ringtonePlayingRef.current = false;
      void stopRingtone();
    };
  }, [stopRingtone]);

  if (!rideId) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Missing ride ID</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const title = requests.length > 1 ? "Incoming ride requests" : "Incoming ride request";
  const iosIncomingHint =
    Platform.OS === "ios"
      ? "If you opened from a notification, respond quickly. Expired requests are removed automatically."
      : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{requests.length} request{requests.length === 1 ? "" : "s"} waiting</Text>
        {iosIncomingHint ? (
          <Text style={styles.iosHint}>{iosIncomingHint}</Text>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {requests.map((request, index) => (
          <View key={request.rideId} style={[styles.card, index > 0 ? styles.stackedCard : null]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Ride Request {index + 1}</Text>
              <View style={styles.timerPill}>
                <Text style={styles.timerText}>{request.countdown}s</Text>
              </View>
            </View>

            {request.loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={BRAND_PURPLE} />
              </View>
            ) : (
              <>
                <View style={styles.row}>
                  <MapPin size={18} color="#6B7280" />
                  <Text style={styles.label}>Pickup</Text>
                </View>
                <Text style={styles.value} numberOfLines={2}>
                  {request.pickupLocation || "\u2014"}
                </Text>

                <View style={[styles.row, { marginTop: 14 }]}>
                  <Navigation size={18} color="#6B7280" />
                  <Text style={styles.label}>Destination</Text>
                </View>
                <Text style={styles.value} numberOfLines={2}>
                  {request.destination || "\u2014"}
                </Text>

                <View style={[styles.row, { marginTop: 14, justifyContent: "space-between" }]}>
                  <View>
                    <Text style={styles.label}>Estimated fare</Text>
                    <Text style={styles.fare}>{"\u20B9"}{request.fare || "0.00"}</Text>
                  </View>
                  {request.distance ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={styles.label}>Estimated distance</Text>
                      <Text style={styles.distanceValue}>
                        {formatDistance(Number(request.distance))}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            )}

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.declineButton]}
                onPress={() => void handleDismiss(request.rideId)}
                disabled={request.accepting || request.declining || endScreenInFlightRef.current}
              >
                {request.declining ? (
                  <ActivityIndicator size="small" color="#111827" />
                ) : (
                  <>
                    <X size={20} color="#111827" />
                    <Text style={styles.declineButtonText}>Dismiss</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.acceptButton]}
                onPress={() => void handleAccept(request.rideId)}
                disabled={request.accepting || request.declining || endScreenInFlightRef.current}
              >
                {request.accepting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Check size={20} color="#FFF" />
                    <Text style={styles.acceptButtonText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontFamily: "Figtree_500Medium",
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 16,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: BRAND_PURPLE,
    borderRadius: 12,
  },
  backBtnText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 16,
    color: "#FFF",
  },
  header: {
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: "center",
  },
  title: {
    fontFamily: "Figtree_700Bold",
    fontSize: 22,
    color: "#111827",
  },
  subtitle: {
    fontFamily: "Figtree_400Regular",
    fontSize: 14,
    color: "#6B7280",
    marginTop: 6,
  },
  iosHint: {
    fontFamily: "Figtree_400Regular",
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
    textAlign: "center",
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  stackedCard: {
    marginTop: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 15,
    color: "#111827",
  },
  timerPill: {
    backgroundColor: "#F3E8FF",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timerText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 12,
    color: BRAND_PURPLE,
  },
  loadingBox: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontFamily: "Figtree_500Medium",
    fontSize: 11,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: "Figtree_500Medium",
    fontSize: 15,
    color: "#111827",
    marginTop: 4,
    marginLeft: 24,
  },
  fare: {
    fontFamily: "Figtree_700Bold",
    fontSize: 22,
    color: BRAND_PURPLE,
    marginTop: 4,
    marginLeft: 24,
  },
  distanceValue: {
    fontFamily: "Figtree_700Bold",
    fontSize: 18,
    color: BRAND_PURPLE,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  declineButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  declineButtonText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 15,
    color: "#111827",
  },
  acceptButton: {
    backgroundColor: BRAND_PURPLE,
  },
  acceptButtonText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
});
