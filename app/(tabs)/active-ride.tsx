/**
 * Active Ride Screen
 * Shows the current active ride with real-time map tracking
 * Uses Supabase Realtime for driver location and ride status updates
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, Dimensions, Linking, Platform, StyleSheet, ActivityIndicator, Image, Modal } from "react-native";
import { router } from "expo-router";
import { OneSignal } from "react-native-onesignal";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  HelpCircle,
  Car,
  Navigation2,
  CheckCircle,
  XCircle,
  MapPin,
  Wallet,
  Star,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { Button } from "@/components/ui/button";
import { ChatModal } from "@/components/chat-modal";
import { RideExpiryWarningModal } from "@/components/modals/ride-expiry-warning-modal";
import { useToast } from "@/components/ui/toast";
import { useCall } from "@/hooks/use-call";
import { canUseCommunicationRide } from "@/lib/utils/communication";
import { RideMap, type MapLocation, type NearbyVehicleMarker } from "@/components/ride-map";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import { VerificationCodeInput } from "@/components/verification-code-input";
import { useActiveRideTracking } from "@/hooks/use-realtime";
import { useWatchLocation } from "@/lib/services/location";
import { useEnsureDriverTrackingContinuity } from "@/lib/services/driver-tracking-continuity";
// Driver location API - import from ride API or inline
// The driver location update is handled via the API directly
import {
  getActiveRide,
  getRideDriverTrack,
  updateRideStatus,
  cancelRide,
  getNearbyDrivers,
  type RideResponse,
  type RideTrackingPoint,
  RideStatus,
  isRideActive,
  canPassengerCancel,
  canDriverCancel,
  getNextDriverStatus,
  getDriverActionLabel,
  formatFare,
  formatDistance,
  formatVehicleType,
} from "@/lib/api/ride";
import {
  getRidePayment,
  type PaymentMethod,
  type RidePaymentStatus,
} from "@/lib/api/payment";
import { getRoute, decodePolyline } from "@/lib/services/directions";
import {
  dispatchServiceCompleted,
  addServiceEventListener,
} from "@/lib/events";
import {
  clearActiveRideId,
  markIncomingRideHandled,
  setActiveRideId,
  setHandledRide,
} from "@/lib/incoming-ride-request";

// Constants
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const DRIVER_SURFACE = "#F3EDFC";
const DRIVER_BORDER = "#D8B4FE";
const PASSENGER_SURFACE = "#FFF0E8";
const PASSENGER_BORDER = "#FDE8D8";
const REFRESH_INTERVAL = 10000; // 10 seconds (backup polling)
const LOCATION_UPDATE_INTERVAL = 10000; // 10 seconds fallback watcher cadence
const MAX_RETRY_ATTEMPTS = 3; // Maximum retry attempts for fetching active ride
const RETRY_DELAY_MS = 1000; // Delay between retries in milliseconds
const ROUTE_UPDATE_DEBOUNCE_MS = 10000; // Refresh active route at most every 10s
const SUPPORT_PHONE_NUMBER = "09520559469";

const PASSENGER_CANCEL_REASONS = [
  "Driver is taking too long",
  "Changed my plan",
  "Booked by mistake",
  "Pickup location issue",
  "Fare is too high",
  "Other",
] as const;

// Warning lead times (must match server-side RIDE_CONFIG)
const WARNING_LEAD_SECONDS: Record<string, number> = {
  REQUESTED: 60,
  ACCEPTED: 180,
  ARRIVING: 180,
  IN_PROGRESS: 1800,
};

export default function ActiveRideScreen() {
  const { userType } = useAuth();
  const { showAlert } = useAlert();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [220, "55%", "90%"], []);

  // State
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [driverTrailCoordinates, setDriverTrailCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [, setRouteLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [ridePaymentMethod, setRidePaymentMethod] =
    useState<PaymentMethod | null>(null);
  const [ridePaymentStatus, setRidePaymentStatus] =
    useState<RidePaymentStatus | null>(null);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string>(
    PASSENGER_CANCEL_REASONS[0]
  );

  // Expiry warning state
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [expiryCountdown, setExpiryCountdown] = useState(60);
  const [expiryMessage, setExpiryMessage] = useState("");
  const warningDismissedForRef = useRef<string | null>(null); // Track dismissed warning by warningNotifiedAt value

  // Guard to prevent duplicate navigation to payment screen
  const navigationToPaymentRef = useRef<Set<string>>(new Set());

  // Payment state for drivers after ride completion
  const isRideCompleted = ride?.status === RideStatus.COMPLETED;

  const { initiate: callInitiate, loading: callLoading } = useCall(
    ride?.id ?? null
  );
  const toast = useToast();

  // Get driver ID from ride (for passenger tracking)
  const driverId = ride?.driver?.id || ride?.driverId || null;
  const rideId = ride?.id || null;

  // Realtime subscriptions for ride tracking
  const { rideStatus, driverLocation, isSubscribed } = useActiveRideTracking({
    rideId,
    driverId,
    userType: userType as "passenger" | "driver" | null,
    enabled: !!ride && isRideActive(ride.status),
  });

  // Watch driver's own location (for drivers only)
  // Uses debounced location updater to prevent excessive API calls
  const driverSelfLocation = useWatchLocation({
    enabled: userType === "driver" && !!ride && isRideActive(ride.status),
    distanceInterval: 20, // Update every 20 meters (for GPS accuracy)
    timeInterval: LOCATION_UPDATE_INTERVAL,
    onLocation: async (location) => {
      try {
        const { shouldPublishFromForegroundWatcher } = await import(
          "@/lib/services/driver-foreground-service"
        );
        const shouldPublish = await shouldPublishFromForegroundWatcher();
        if (!shouldPublish) return;

        const { updateDriverLocationDebounced } = await import(
          "@/lib/services/driver-location-updater"
        );
        updateDriverLocationDebounced(
          location.coords.latitude,
          location.coords.longitude
        ).catch((error) => {
          console.error("[ActiveRide] Failed to queue location update:", error);
        });
      } catch (error) {
        console.error("[ActiveRide] Failed location publish fallback check:", error);
      }
    },
  });

  useEnsureDriverTrackingContinuity(
    userType === "driver" && !!ride && isRideActive(ride.status),
    "ActiveRide"
  );

  // Nearby vehicles polling while ride is in REQUESTED status (passenger only)
  const [nearbyVehicles, setNearbyVehicles] = useState<NearbyVehicleMarker[]>([]);
  const nearbyVehiclePrevRef = useRef<Map<string, { latitude: number; longitude: number }>>(new Map());

  useEffect(() => {
    if (
      !ride ||
      ride.status !== RideStatus.REQUESTED ||
      userType !== "passenger" ||
      !ride.pickupLatitude ||
      !ride.pickupLongitude
    ) {
      setNearbyVehicles([]);
      return;
    }

    let cancelled = false;

    const fetchNearby = async () => {
      try {
        const result = await getNearbyDrivers(
          Number(ride.pickupLatitude),
          Number(ride.pickupLongitude),
          ride.vehicleType as any
        );
        if (cancelled || !result.success || !result.data?.drivers) return;

        const prev = nearbyVehiclePrevRef.current;
        const markers: NearbyVehicleMarker[] = (result.data.drivers as any[])
          .filter((d) => Number.isFinite(d.latitude) && Number.isFinite(d.longitude))
          .map((d) => {
            let heading = d.heading ?? undefined;
            const old = prev.get(d.id);
            if (old && !heading) {
              const dlat = d.latitude - old.latitude;
              const dlng = d.longitude - old.longitude;
              if (Math.abs(dlat) > 0.00001 || Math.abs(dlng) > 0.00001) {
                heading = (Math.atan2(dlng, dlat) * 180) / Math.PI;
              }
            }
            prev.set(d.id, { latitude: d.latitude, longitude: d.longitude });
            // Resolve vehicle type for correct marker icon — try category fields first
            const resolvedType = [
              d.vehicleCategorySlug,
              d.vehicleCategoryName,
              d.vehicleType,
              d.vehicleSubcategorySlug,
            ].find((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);
            return { id: d.id, latitude: d.latitude, longitude: d.longitude, vehicleType: resolvedType, heading };
          });
        nearbyVehiclePrevRef.current = prev;
        setNearbyVehicles(markers);
      } catch (err) {
        console.warn("[ActiveRide] Failed to fetch nearby vehicles:", err);
      }
    };

    fetchNearby();
    const interval = setInterval(fetchNearby, 7000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ride?.id, ride?.status, ride?.pickupLatitude, ride?.pickupLongitude, ride?.vehicleType, userType]);

  // Update ride state when realtime updates come in
  useEffect(() => {
    if (rideStatus.ride) {
      // Merge realtime update with existing ride data
      setRide((prev) => {
        if (!prev) return prev;
        const newStatus = rideStatus.ride!.status as any;

        // Hide verification input if status changed away from ARRIVING
        if (
          prev.status === RideStatus.ARRIVING &&
          newStatus !== RideStatus.ARRIVING
        ) {
          setShowVerificationInput(false);
        }

        const updatedRide = {
          ...prev,
          status: newStatus,
          acceptedAt: rideStatus.ride!.accepted_at || prev.acceptedAt,
          arrivedAt: rideStatus.ride!.arrived_at || prev.arrivedAt,
          startedAt: rideStatus.ride!.started_at || prev.startedAt,
          completedAt: rideStatus.ride!.completed_at || prev.completedAt,
          cancelledAt: rideStatus.ride!.cancelled_at || prev.cancelledAt,
          cancellationReason:
            rideStatus.ride!.cancellation_reason || prev.cancellationReason,
        };

        return updatedRide;
      });
    }
  }, [rideStatus.ride, userType]);

  // Detect ride expiry warning from server via Supabase Realtime
  useEffect(() => {
    if (userType !== "passenger") return;
    const warningAt = rideStatus.ride?.warning_notified_at;
    if (!warningAt || !ride) return;

    // Don't show if already dismissed for this specific warning
    if (warningDismissedForRef.current === warningAt) return;

    // Calculate remaining time until auto-cancel
    const warningTime = new Date(warningAt).getTime();
    const leadSeconds = WARNING_LEAD_SECONDS[ride.status] || 60;
    const cancelTime = warningTime + leadSeconds * 1000;
    const remaining = Math.max(0, Math.floor((cancelTime - Date.now()) / 1000));

    if (remaining <= 0) return; // Already expired

    // Set contextual message
    const messages: Record<string, string> = {
      REQUESTED:
        "No driver has accepted your ride yet. It will be auto-cancelled soon.",
      ACCEPTED:
        "Your driver hasn't started moving. The ride may be auto-cancelled.",
      ARRIVING: "Pickup hasn't started yet. The ride may be auto-cancelled.",
      IN_PROGRESS: "This ride has been running for a very long time.",
    };

    setExpiryMessage(
      messages[ride.status] || "Your ride will be auto-cancelled soon."
    );
    setExpiryCountdown(remaining);
    setShowExpiryWarning(true);
  }, [rideStatus.ride?.warning_notified_at, ride?.status, userType]);

  // Debounce timer ref for route updates
  const routeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastInProgressRouteFetchRef = useRef(0);
  const lastDriverTrackTimestampRef = useRef<string | null>(null);
  const trackRideIdRef = useRef<string | null>(null);

  const hadRideRef = useRef(false);

  const mergeDriverTrackPoints = useCallback(
    (incomingPoints: RideTrackingPoint[]) => {
      if (!incomingPoints.length) return;

      const validPoints = incomingPoints
        .map((point) => ({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          timestamp: point.timestamp,
        }))
        .filter(
          (point) =>
            Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
        );

      if (!validPoints.length) return;

      setDriverTrailCoordinates((prev) => {
        const merged = [...prev];
        const seen = new Set(prev.map((point) => `${point.latitude}:${point.longitude}`));

        for (const point of validPoints) {
          const key = `${point.latitude}:${point.longitude}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({
            latitude: point.latitude,
            longitude: point.longitude,
          });
        }

        return merged;
      });

      const latestPoint = validPoints[validPoints.length - 1];
      lastDriverTrackTimestampRef.current = latestPoint.timestamp;
    },
    []
  );

  // Fetch active ride on mount
  useEffect(() => {
    fetchActiveRide();
  }, []);

  // Track whether we ever had a ride, so we can auto-redirect when it clears
  useEffect(() => {
    if (ride) {
      hadRideRef.current = true;
    } else if (hadRideRef.current && !loading) {
      hadRideRef.current = false;
      router.replace("/(tabs)");
    }
  }, [ride, loading]);

  // Keep a persistent active-ride lock for global notification gating.
  useEffect(() => {
    if (userType !== "driver") return;

    const currentRideId = ride?.id;
    if (ride && currentRideId && isRideActive(ride.status)) {
      void Promise.allSettled([setHandledRide(currentRideId), setActiveRideId(currentRideId)]);
      return;
    }

    void clearActiveRideId();
  }, [userType, ride?.id, ride?.status]);

  // Passenger: when ride is completed, route to payment flow for all methods.
  useEffect(() => {
    if (
      userType !== "passenger" ||
      !ride?.id ||
      ride.status !== RideStatus.COMPLETED ||
      navigationToPaymentRef.current.has(ride.id)
    ) {
      return;
    }

    let cancelled = false;

    const checkPaymentAndRedirect = async () => {
      try {
        const response = await getRidePayment(ride.id);
        if (!response.success || !response.data?.payment || cancelled) return;

        const payment = response.data.payment;
        setRidePaymentMethod(payment.paymentMethod);
        setRidePaymentStatus(payment.status);

        if (payment.status === "PENDING" && !payment.paymentMethod) {
          navigationToPaymentRef.current.add(ride.id);
          router.replace({
            pathname: "/ride-payment",
            params: { rideId: ride.id },
          });
          return;
        }

        if (payment.status === "PENDING" || payment.status === "COMPLETED") {
          navigationToPaymentRef.current.add(ride.id);
          router.replace({
            pathname: "/payment-status",
            params: { rideId: ride.id },
          } as never);
        }
      } catch {
        // Ignore transient poll errors
      }
    };

    checkPaymentAndRedirect();
    const interval = setInterval(checkPaymentAndRedirect, 2500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userType, ride?.id, ride?.status]);

  // Auto-redirect driver to payment confirmation when ride is completed
  useEffect(() => {
    if (
      userType === "driver" &&
      ride?.status === RideStatus.COMPLETED &&
      ride?.id &&
      !navigationToPaymentRef.current.has(ride.id)
    ) {
      navigationToPaymentRef.current.add(ride.id);
      router.replace({
        pathname: "/ride-payment-confirmation",
        params: { rideId: ride.id },
      } as never);
    }
  }, [ride?.status, ride?.id, userType]);

  // Listen for service events to refresh ride data
  // This ensures the screen updates if navigated to right after ride creation
  useEffect(() => {
    const cleanup = addServiceEventListener(() => {
      // Small delay to ensure database has committed
      setTimeout(() => {
        fetchActiveRide(true);
      }, 500);
    });
    return cleanup;
  }, []);

  // Always poll active ride status as a fallback.
  // Realtime can occasionally miss updates on simulator/network hiccups,
  // which can leave UI stuck on REQUESTED/FINDING DRIVER.
  useEffect(() => {
    if (!ride || !isRideActive(ride.status)) return;

    const intervalMs =
      userType === "passenger"
        ? REFRESH_INTERVAL
        : ride.status === RideStatus.IN_PROGRESS
        ? 5000
        : REFRESH_INTERVAL;

    const interval = setInterval(() => fetchActiveRide(true), intervalMs);
    return () => clearInterval(interval);
  }, [ride?.id, ride?.status, userType]);

  const fetchActiveRide = async (
    silent: boolean = false,
    retryCount: number = 0
  ) => {
    if (!silent) setLoading(true);

    try {
      const response = await getActiveRide();

      if (response.success) {
        const rideData = response.data?.ride || null;

        // If no ride found but we still have retries left, try again after a delay
        // This handles the case where navigation happens before DB transaction commits
        if (!rideData && retryCount < MAX_RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return fetchActiveRide(silent, retryCount + 1);
        }

        setRide(rideData);
      } else {
        // Retry on failure if we have retries left
        if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return fetchActiveRide(silent, retryCount + 1);
        }

        if (!silent) {
          showAlert(
            "Alert",
            "Failed to fetch ride details. Please pull down to refresh."
          );
        }
      }
    } catch (error) {
      console.error("[ActiveRide] Error fetching active ride:", error);

      // Retry on exception if we have retries left
      if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchActiveRide(silent, retryCount + 1);
      }

      if (!silent) {
        showAlert(
          "Alert",
          "Failed to fetch ride details. Please check your connection and try again."
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchDriverTrack = useCallback(
    async ({
      since,
      limit = 500,
      silent = true,
    }: {
      since?: string;
      limit?: number;
      silent?: boolean;
    } = {}) => {
      if (
        userType !== "passenger" ||
        !ride?.id ||
        !driverId ||
        !isRideActive(ride.status)
      ) {
        return;
      }

      try {
        const response = await getRideDriverTrack(ride.id, { since, limit });
        if (response.success) {
          mergeDriverTrackPoints(response.data?.points ?? []);
          return;
        }

        if (!silent) {
          console.warn("[ActiveRide] Failed to fetch driver track:", response.error);
        }
      } catch (error) {
        if (!silent) {
          console.warn("[ActiveRide] Driver track fetch error:", error);
        }
      }
    },
    [userType, ride?.id, ride?.status, driverId, mergeDriverTrackPoints]
  );

  useEffect(() => {
    if (
      userType !== "passenger" ||
      !ride?.id ||
      !driverId ||
      !isRideActive(ride.status)
    ) {
      trackRideIdRef.current = null;
      lastDriverTrackTimestampRef.current = null;
      setDriverTrailCoordinates([]);
      return;
    }

    const isNewRide = trackRideIdRef.current !== ride.id;
    if (isNewRide) {
      trackRideIdRef.current = ride.id;
      lastDriverTrackTimestampRef.current = null;
      setDriverTrailCoordinates([]);
    }

    void fetchDriverTrack({
      since: isNewRide
        ? undefined
        : lastDriverTrackTimestampRef.current ?? undefined,
      limit: isNewRide ? 1000 : 500,
    });
  }, [userType, ride?.id, ride?.status, driverId, fetchDriverTrack]);

  useEffect(() => {
    if (
      userType !== "passenger" ||
      !ride?.id ||
      !driverId ||
      !isRideActive(ride.status)
    ) {
      return;
    }

    const interval = setInterval(() => {
      void fetchDriverTrack({
        since: lastDriverTrackTimestampRef.current ?? undefined,
        limit: 300,
      });
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [userType, ride?.id, ride?.status, driverId, fetchDriverTrack]);

  useEffect(() => {
    if (userType !== "passenger" || !driverLocation.location) return;

    const nextPoint = {
      latitude: driverLocation.location.latitude,
      longitude: driverLocation.location.longitude,
    };

    setDriverTrailCoordinates((prev) => {
      const lastPoint = prev[prev.length - 1];
      if (
        lastPoint &&
        Math.abs(lastPoint.latitude - nextPoint.latitude) < 0.000001 &&
        Math.abs(lastPoint.longitude - nextPoint.longitude) < 0.000001
      ) {
        return prev;
      }
      return [...prev, nextPoint];
    });

    if (driverLocation.location.lastUpdated instanceof Date) {
      lastDriverTrackTimestampRef.current =
        driverLocation.location.lastUpdated.toISOString();
    }
  }, [userType, driverLocation.location]);

  useEffect(() => {
    const driverLatitude = Number(ride?.driver?.latitude);
    const driverLongitude = Number(ride?.driver?.longitude);
    if (
      userType !== "passenger" ||
      !ride?.id ||
      !Number.isFinite(driverLatitude) ||
      !Number.isFinite(driverLongitude)
    ) {
      return;
    }

    const seedPoint = {
      latitude: driverLatitude,
      longitude: driverLongitude,
    };

    setDriverTrailCoordinates((prev) => {
      if (prev.length > 0) return prev;
      return [seedPoint];
    });
  }, [userType, ride?.id, ride?.driver?.latitude, ride?.driver?.longitude]);

  // Immediately decode cached route polyline when ride loads (instant display)
  useEffect(() => {
    if (
      ride?.routePolyline &&
      ride.status === RideStatus.IN_PROGRESS &&
      routeCoordinates.length === 0
    ) {
      try {
        const decodedRoute = decodePolyline(ride.routePolyline);
        if (decodedRoute.length > 0) {
          setRouteCoordinates(decodedRoute);
        }
      } catch (err) {
        console.warn(
          "[ActiveRide] Failed to decode cached polyline on mount:",
          err
        );
      }
    }
  }, [ride?.routePolyline, ride?.status]);

  const handleCallSupport = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE_NUMBER}`).catch((dialError) => {
      console.error("[ActiveRide] Failed to open support dialer:", dialError);
      showAlert(
        "Alert",
        `Unable to open phone dialer. Please call ${SUPPORT_PHONE_NUMBER}.`
      );
    });
  }, [showAlert]);

  const handleUpdateStatus = async (verificationCode?: string) => {
    if (!ride) return;

    const nextStatus = getNextDriverStatus(ride.status);
    if (!nextStatus) return;

    // If next status is IN_PROGRESS, require verification code
    if (nextStatus === RideStatus.IN_PROGRESS && !verificationCode) {
      setShowVerificationInput(true);
      return;
    }

    setActionLoading(true);
    setVerificationError(null);

    try {
      const response = await updateRideStatus(
        ride.id,
        nextStatus,
        verificationCode
      );

      if (response.success && response.data) {
        setRide(response.data);
        setShowVerificationInput(false);
        setVerificationError(null);

        // Auto-open Google Maps navigation to destination when ride starts (after OTP)
        if (
          nextStatus === RideStatus.IN_PROGRESS &&
          userType === "driver" &&
          response.data
        ) {
          const destLat = Number(response.data.destinationLat);
          const destLng = Number(response.data.destinationLng);
          if (destLat && destLng) {
            setTimeout(() => {
              openNavigationToCoordinates(destLat, destLng);
            }, 500);
          }
        }

        if (nextStatus === RideStatus.COMPLETED) {
          dispatchServiceCompleted();
          const rideId = response.data.id;

          // For drivers: Navigate to payment confirmation (replace so stack stays clean)
          if (userType === "driver") {
            setTimeout(() => {
              router.replace({
                pathname: "/ride-payment-confirmation",
                params: { rideId },
              } as never);
            }, 400);
          } else {
            // For passengers: brief toast, then navigate to payment (no blocking alert)
            toast.show({
              text: `Ride completed. Fare: ${formatFare(response.data.fare)}`,
            });
            setTimeout(async () => {
              try {
                let paymentResponse = null;
                for (let attempt = 0; attempt < 3; attempt++) {
                  paymentResponse = await getRidePayment(rideId);
                  if (
                    paymentResponse.success &&
                    paymentResponse.data?.payment
                  ) {
                    break;
                  }
                  if (attempt < 2) {
                    await new Promise((resolve) =>
                      setTimeout(resolve, 1000 * (attempt + 1))
                    );
                  }
                }
                if (paymentResponse?.success && paymentResponse.data?.payment) {
                  const payment = paymentResponse.data.payment;
                  if (payment.status === "PENDING" && !payment.paymentMethod) {
                    router.replace({
                      pathname: "/ride-payment",
                      params: { rideId },
                    });
                    return;
                  }
                  if (
                    payment.paymentMethod === "CASH" &&
                    payment.status === "PENDING"
                  ) {
                    router.replace({
                      pathname: "/payment-status",
                      params: { rideId },
                    });
                    return;
                  }
                  if (payment.status === "COMPLETED") {
                    router.replace({
                      pathname: "/payment-status",
                      params: { rideId },
                    });
                    return;
                  }
                }
              } catch (error) {
                console.error(
                  "[ActiveRide] Error checking payment status:",
                  error
                );
              }
              router.replace({
                pathname: "/ride-payment",
                params: { rideId },
              });
            }, 600);
          }
        }
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to update ride status";

        // Check if it's a verification code error
        const errorCode =
          typeof response.error === "object" &&
          response.error !== null &&
          "code" in response.error
            ? String((response.error as { code: string }).code)
            : "";

        if (errorCode.includes("VERIFICATION")) {
          setVerificationError(errorMessage);
        } else {
          const isCompletionDistanceError =
            userType === "driver" &&
            nextStatus === RideStatus.COMPLETED &&
            /within\s+500\s+meters/i.test(errorMessage);

          if (isCompletionDistanceError) {
            showAlert("Alert", errorMessage, [
              {
                text: "Call Support",
                onPress: () => {
                  handleCallSupport();
                },
              },
              { text: "OK", style: "cancel" },
            ]);
          } else {
            showAlert("Alert", errorMessage);
          }
        }
      }
    } catch (error) {
      console.error("Error updating ride status:", error);
      showAlert("Alert", "Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    await handleUpdateStatus(code);
  };

  const handleSafeBack = useCallback(() => {
    if (userType === "passenger" && ride?.id) {
      router.replace("/(tabs)");
      return;
    }

    if (userType === "driver") {
      router.replace("/(tabs)/rides");
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  }, [userType, ride?.id]);

  // Shared navigation helper for opening external maps to coordinates
  const openNavigationToCoordinates = useCallback(
    (lat: number, lng: number) => {
      const url =
        Platform.OS === "ios"
          ? `maps://app?daddr=${lat},${lng}&dirflg=d`
          : `google.navigation:q=${lat},${lng}`;
      Linking.openURL(url).catch(() => {
        const fallback =
          Platform.OS === "ios"
            ? `https://maps.apple.com/?daddr=${lat},${lng}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        Linking.openURL(fallback).catch((e) =>
          console.warn("Could not open maps:", e)
        );
      });
    },
    []
  );

  const submitCancellation = useCallback(
    async (reason: string) => {
      if (!ride) return;
      setCancelLoading(true);

      try {
        const response = await cancelRide(ride.id, reason);

        if (response.success) {
          markIncomingRideHandled(ride.id);
          await clearActiveRideId();
          try {
            OneSignal.Notifications.clearAll();
          } catch {
            // best-effort cleanup
          }
          dispatchServiceCompleted();
          hadRideRef.current = false;
          setRide(null);
          setShowCancelReasonModal(false);
          toast.show({ text: "Ride cancelled." });
          router.replace(userType === "driver" ? "/(tabs)/rides" : "/(tabs)");
        } else {
          const errorMessage =
            typeof response.error === "object" &&
            response.error !== null &&
            "message" in response.error
              ? String((response.error as { message: string }).message)
              : "Failed to cancel ride";
          showAlert("Alert", errorMessage);
        }
      } catch (error) {
        console.error("Error cancelling ride:", error);
        showAlert("Alert", "Something went wrong. Please try again.");
      } finally {
        setCancelLoading(false);
      }
    },
    [ride, showAlert, toast, userType]
  );

  const handleCancelRide = async () => {
    if (!ride) return;

    if (userType === "passenger") {
      setSelectedCancelReason(PASSENGER_CANCEL_REASONS[0]);
      setShowCancelReasonModal(true);
      return;
    }

    showAlert("Cancel Ride", "Are you sure you want to cancel this ride?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: () => {
          void submitCancellation("Cancelled by driver");
        },
      },
    ]);
  };

  // Map locations
  const mapLocations = useMemo(() => {
    if (!ride)
      return { pickup: undefined, destination: undefined, driver: undefined };

    const pickup: MapLocation | undefined =
      ride.pickupLatitude && ride.pickupLongitude
        ? {
            latitude: Number(ride.pickupLatitude),
            longitude: Number(ride.pickupLongitude),
            title: ride.pickupLocation || "Pickup",
          }
        : undefined;

    const destination: MapLocation | undefined =
      ride.destinationLat && ride.destinationLng
        ? {
            latitude: Number(ride.destinationLat),
            longitude: Number(ride.destinationLng),
            title: ride.destination || "Destination",
          }
        : undefined;

    // Use realtime driver location if available, otherwise use driver's last known stored position
    let driver: MapLocation | undefined;
    if (driverLocation.location) {
      // Realtime location from Supabase subscription
      driver = {
        latitude: driverLocation.location.latitude,
        longitude: driverLocation.location.longitude,
        title: ride.driver?.fullName || "Driver",
      };
    } else if (userType === "driver" && driverSelfLocation.location) {
      // Driver's own location (for driver view)
      driver = {
        latitude: driverSelfLocation.location.coords.latitude,
        longitude: driverSelfLocation.location.coords.longitude,
        title: "You",
      };
    } else if (
      userType === "passenger" &&
      ride.driver?.latitude &&
      ride.driver?.longitude
    ) {
      // Fallback to driver's last known stored location (for passenger view)
      driver = {
        latitude: ride.driver.latitude,
        longitude: ride.driver.longitude,
        title: ride.driver.fullName || "Driver",
      };
    }

    return { pickup, destination, driver };
  }, [ride, driverLocation.location, driverSelfLocation.location, userType]);

  // Resolve driver marker vehicle type/category with passenger-search-like fallback order.
  // Prefer category/subcategory labels when available because legacy vehicleType can be stale.
  const driverMarkerVehicleType = useMemo(() => {
    if (!ride) return null;

    const driver = ride.driver;
    const markerVehicleTypeCandidates = [
      driver?.vehicleCategoryName,
      driver?.vehicleSubcategoryName,
      driver?.vehicleType,
      ride.vehicleType,
    ];

    const resolved = markerVehicleTypeCandidates.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0
    );

    return resolved ?? null;
  }, [ride]);

  // Fetch route based on ride status (memoized with useCallback)
  const fetchRoute = useCallback(async () => {
    if (!ride || !isRideActive(ride.status)) {
      setRouteCoordinates([]);
      return;
    }

    // Don't show route for REQUESTED status (no driver assigned)
    if (ride.status === RideStatus.REQUESTED) {
      setRouteCoordinates([]);
      return;
    }

    // Don't show route for completed/cancelled rides
    if (
      ride.status === RideStatus.COMPLETED ||
      ride.status === RideStatus.CANCELLED
    ) {
      setRouteCoordinates([]);
      return;
    }

    // Ensure mapLocations is available
    if (!mapLocations) {
      setRouteCoordinates([]);
      return;
    }

    setRouteLoading(true);

    try {
      let origin: { latitude: number; longitude: number } | null = null;
      let destination: { latitude: number; longitude: number } | null = null;

      // Determine route based on status
      if (
        ride.status === RideStatus.ACCEPTED ||
        ride.status === RideStatus.ARRIVING
      ) {
        // Route from driver location to pickup location
        const driverLoc = mapLocations.driver;
        const pickupLoc = mapLocations.pickup;

        if (!driverLoc || !pickupLoc) {
          setRouteCoordinates([]);
          setRouteLoading(false);
          return;
        }

        origin = {
          latitude: driverLoc.latitude,
          longitude: driverLoc.longitude,
        };
        destination = {
          latitude: pickupLoc.latitude,
          longitude: pickupLoc.longitude,
        };
      } else if (ride.status === RideStatus.IN_PROGRESS) {
        // Real-time navigation in trip: driver location -> destination
        const driverLoc = mapLocations.driver;
        const destLoc = mapLocations.destination;

        if (!destLoc) {
          setRouteCoordinates([]);
          setRouteLoading(false);
          return;
        }

        if (driverLoc) {
          origin = {
            latitude: driverLoc.latitude,
            longitude: driverLoc.longitude,
          };
        } else if (ride.routePolyline) {
          // Fallback to cached full route until a live driver coordinate is available.
          try {
            const decodedRoute = decodePolyline(ride.routePolyline);
            if (decodedRoute.length > 0) {
              setRouteCoordinates(decodedRoute);
              setRouteLoading(false);
              return;
            }
          } catch (err) {
            console.warn("[ActiveRide] Failed to decode cached polyline:", err);
          }
          const pickupLoc = mapLocations.pickup;
          if (!pickupLoc) {
            setRouteCoordinates([]);
            setRouteLoading(false);
            return;
          }
          origin = {
            latitude: pickupLoc.latitude,
            longitude: pickupLoc.longitude,
          };
        } else {
          const pickupLoc = mapLocations.pickup;
          if (!pickupLoc) {
            setRouteCoordinates([]);
            setRouteLoading(false);
            return;
          }
          origin = {
            latitude: pickupLoc.latitude,
            longitude: pickupLoc.longitude,
          };
        }

        destination = {
          latitude: destLoc.latitude,
          longitude: destLoc.longitude,
        };
      }

      if (!origin || !destination) {
        setRouteCoordinates([]);
        setRouteLoading(false);
        return;
      }

      const routeInfo = await getRoute(origin, destination, ride.vehicleType);

      if (routeInfo && routeInfo.coordinates.length > 0) {
        setRouteCoordinates(routeInfo.coordinates);
      } else {
        // Fallback to straight line if API fails (though RideMap won't show it now)
        setRouteCoordinates([origin, destination]);
      }
    } catch (error) {
      console.error("[ActiveRide] Error fetching route:", error);
      // Fallback to straight line on error
      if (mapLocations) {
        const pickupLoc = mapLocations.pickup;
        const destLoc = mapLocations.destination;
        if (pickupLoc && destLoc) {
          setRouteCoordinates([
            { latitude: pickupLoc.latitude, longitude: pickupLoc.longitude },
            { latitude: destLoc.latitude, longitude: destLoc.longitude },
          ]);
        } else {
          setRouteCoordinates([]);
        }
      } else {
        setRouteCoordinates([]);
      }
    } finally {
      setRouteLoading(false);
    }
  }, [ride, mapLocations]);

  // Fetch route when ride status changes, ride is loaded, or locations change
  useEffect(() => {
    if (!ride || !isRideActive(ride.status)) {
      setRouteCoordinates([]);
      return;
    }

    // Ensure mapLocations is available
    if (!mapLocations) {
      return;
    }

    // For ACCEPTED/ARRIVING: need driver and pickup locations
    if (
      ride.status === RideStatus.ACCEPTED ||
      ride.status === RideStatus.ARRIVING
    ) {
      if (!mapLocations.driver || !mapLocations.pickup) {
        // Wait for locations to be available
        return;
      }
    }

    // For IN_PROGRESS: need destination and a route origin (driver preferred, pickup fallback)
    if (ride.status === RideStatus.IN_PROGRESS) {
      const hasOrigin = !!mapLocations.driver || !!mapLocations.pickup;
      if (!hasOrigin || !mapLocations.destination) {
        return;
      }
    }

    // Clear any pending debounced update
    if (routeUpdateTimeoutRef.current) {
      clearTimeout(routeUpdateTimeoutRef.current);
      routeUpdateTimeoutRef.current = null;
    }

    // For ACCEPTED/ARRIVING status, debounce route updates when driver location changes
    // This minimizes Google Maps API calls while driver is moving
    if (
      ride.status === RideStatus.ACCEPTED ||
      ride.status === RideStatus.ARRIVING
    ) {
      routeUpdateTimeoutRef.current = setTimeout(() => {
        fetchRoute();
      }, ROUTE_UPDATE_DEBOUNCE_MS);
    } else if (ride.status === RideStatus.IN_PROGRESS) {
      const now = Date.now();
      const elapsed = now - lastInProgressRouteFetchRef.current;
      const remaining = Math.max(0, REFRESH_INTERVAL - elapsed);
      const runFetch = () => {
        lastInProgressRouteFetchRef.current = Date.now();
        fetchRoute();
      };

      if (remaining === 0) {
        runFetch();
      } else {
        routeUpdateTimeoutRef.current = setTimeout(runFetch, remaining);
      }
    } else {
      // For other statuses, fetch immediately
      fetchRoute();
    }

    return () => {
      if (routeUpdateTimeoutRef.current) {
        clearTimeout(routeUpdateTimeoutRef.current);
        routeUpdateTimeoutRef.current = null;
      }
    };
  }, [
    ride?.status,
    ride?.id,
    mapLocations?.pickup,
    mapLocations?.destination,
    mapLocations?.driver,
    fetchRoute,
  ]);

  // Auto-expand sheet for terminal statuses
  useEffect(() => {
    if (
      ride?.status === RideStatus.COMPLETED ||
      ride?.status === RideStatus.CANCELLED
    ) {
      setTimeout(() => {
        bottomSheetRef.current?.snapToIndex(2);
      }, 400);
    }
  }, [ride?.status]);

  // Determine if user can cancel
  const canCancel =
    ride &&
    ((userType === "passenger" && canPassengerCancel(ride.status)) ||
      (userType === "driver" && canDriverCancel(ride.status)));

  // Get driver action info
  const driverActionLabel =
    ride && userType === "driver" ? getDriverActionLabel(ride.status) : null;
  const nextStatus = ride ? getNextDriverStatus(ride.status) : null;

  // Show loading state
  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={brandColor} />
        <Text
          style={{
            color: "#6B7280",
            marginTop: 16,
            fontSize: 15,
            fontFamily: "Figtree_400Regular",
          }}
        >
          Loading ride...
        </Text>
      </SafeAreaView>
    );
  }

  // Show no active ride state
  if (!ride) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "#F9FAFB",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Car size={40} color="#9CA3AF" />
          </View>
          <Text
            style={{
              fontSize: 20,
              color: "#111827",
              marginBottom: 8,
              textAlign: "center",
              fontFamily: "Figtree_700Bold",
            }}
          >
            No Active Ride
          </Text>
          <Text
            style={{
              color: "#6B7280",
              textAlign: "center",
              marginBottom: 24,
              fontSize: 15,
              fontFamily: "Figtree_400Regular",
            }}
          >
            {userType === "driver"
              ? "Accept a ride from the Rides tab to get started."
              : "Book a ride to see your active trip here."}
          </Text>
          <Button
            onPress={() => {
              if (userType === "driver") {
                router.replace("/(tabs)/rides");
              } else {
                router.replace("/(tabs)/create-ride");
              }
            }}
            size="lg"
          >
            {userType === "driver" ? "View Available Rides" : "Book a Ride"}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Render ride status view (Uber-style, for bottom sheet)
  const renderStatusView = () => {
    switch (ride.status) {
      case RideStatus.REQUESTED: {
        const requestedSurface =
          userType === "driver" ? DRIVER_SURFACE : PASSENGER_SURFACE;
        const requestedBorder =
          userType === "driver" ? DRIVER_BORDER : PASSENGER_BORDER;
        return (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: requestedSurface,
                  borderWidth: 1,
                  borderColor: requestedBorder,
                  marginRight: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Car size={20} color={brandColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    color: "#111827",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  Finding Your Driver
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#6B7280",
                    marginTop: 2,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {"We're looking for nearby drivers..."}
                </Text>
              </View>
            </View>
            <View style={{ marginTop: 4, alignItems: "center" }}>
              <ActivityIndicator size="small" color={brandColor} />
            </View>
          </View>
        );
      }

      case RideStatus.ACCEPTED:
      case RideStatus.ARRIVING: {
        const statusTitle =
          ride.status === RideStatus.ACCEPTED
            ? userType === "passenger"
              ? "Driver On The Way"
              : "Head to Pickup"
            : userType === "passenger"
            ? "Driver Has Arrived"
            : "At Pickup Location";
        const statusSubtitle =
          ride.status === RideStatus.ACCEPTED
            ? userType === "passenger"
              ? "Your driver is heading to your pickup location."
              : "Navigate to the pickup location."
            : userType === "passenger"
            ? "Your driver is waiting at the pickup point."
            : "Wait for the passenger to board.";
        const statusSurface =
          userType === "driver" ? DRIVER_SURFACE : PASSENGER_SURFACE;
        const statusBorder =
          userType === "driver" ? DRIVER_BORDER : PASSENGER_BORDER;

        return (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: statusSurface,
                  borderWidth: 1,
                  borderColor: statusBorder,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                {ride.status === RideStatus.ARRIVING ? (
                  <MapPin size={20} color={brandColor} />
                ) : (
                  <Car size={20} color={brandColor} />
                )}
              </View>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text
                  style={{
                    fontSize: 18,
                    color: "#111827",
                    marginBottom: 2,
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {statusTitle}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {statusSubtitle}
                </Text>
              </View>
              {isSubscribed && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#F0FDF4",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 20,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "#10B981",
                      marginRight: 5,
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#10B981",
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    Live
                  </Text>
                </View>
              )}
            </View>

            {userType === "passenger" && ride.driver && (
              <View
                style={{
                  marginTop: 8,
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginBottom: 8,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  Driver Details
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: `${brandColor}20`,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                      overflow: "hidden",
                    }}
                  >
                    {ride.driver.profileImageUrl?.trim() ? (
                      <Image
                        source={{ uri: ride.driver.profileImageUrl }}
                        style={{ width: 44, height: 44, borderRadius: 22 }}
                      />
                    ) : (
                      <Text
                        style={{
                          fontSize: 18,
                          color: brandColor,
                          fontFamily: "Figtree_700Bold",
                        }}
                      >
                        {ride.driver.fullName?.charAt(0)?.toUpperCase() || "D"}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        color: "#111827",
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      {ride.driver.fullName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#6B7280",
                        marginTop: 2,
                        fontFamily: "Figtree_400Regular",
                      }}
                    >
                      {ride.driver.vehicleCategoryName
                        ? ride.driver.vehicleSubcategoryName
                          ? `${ride.driver.vehicleCategoryName} - ${ride.driver.vehicleSubcategoryName}`
                          : ride.driver.vehicleCategoryName
                        : formatVehicleType(ride.driver.vehicleType)}{" "}
                      - {ride.driver.vehicleRegistration}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Star size={14} color="#FBBF24" />
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#111827",
                        marginLeft: 4,
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      {ride.driver.rating.toFixed(1)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      }

      case RideStatus.IN_PROGRESS: {
        const inProgressSurface =
          userType === "driver" ? DRIVER_SURFACE : PASSENGER_SURFACE;
        const inProgressBorder =
          userType === "driver" ? DRIVER_BORDER : PASSENGER_BORDER;
        return (
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#F0FDF4",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Navigation2 size={22} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 18,
                    color: "#111827",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  Ride In Progress
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#6B7280",
                    marginTop: 2,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {userType === "passenger"
                    ? "Enjoy your ride!"
                    : "Navigate to destination safely."}
                </Text>
              </View>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: inProgressSurface,
                borderRadius: 16,
                padding: 12,
                borderWidth: 1,
                borderColor: inProgressBorder,
              }}
            >
              <MapPin size={16} color={brandColor} />
              <Text
                style={{
                  fontSize: 13,
                  color: "#374151",
                  flex: 1,
                  marginLeft: 8,
                  fontFamily: "Figtree_500Medium",
                }}
                numberOfLines={2}
              >
                {ride.destination}
              </Text>
            </View>
          </View>
        );
      }

      case RideStatus.COMPLETED:
        return (
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#F0FDF4",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <CheckCircle size={38} color="#10B981" />
            </View>
            <Text
              style={{
                fontSize: 22,
                color: "#111827",
                marginBottom: 4,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Ride Complete!
            </Text>
            {typeof ride.discountApplied === "number" &&
              ride.discountApplied > 0 && (
                <Text
                  style={{
                    fontSize: 13,
                    color: "#10B981",
                    marginBottom: 4,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  Discount -{formatFare(ride.discountApplied)}
                </Text>
              )}
            <Text
              style={{
                fontSize: 34,
                color: "#10B981",
                marginBottom: 4,
                fontFamily: "Figtree_700Bold",
              }}
            >
              {formatFare(ride.fare)}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#6B7280",
                textAlign: "center",
                fontFamily: "Figtree_400Regular",
              }}
            >
              {userType === "driver"
                ? "Please confirm the payment method."
                : "Thank you for riding with us!"}
            </Text>
          </View>
        );

      case RideStatus.CANCELLED:
        return (
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#FEF2F2",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <XCircle size={38} color="#EF4444" />
            </View>
            <Text
              style={{
                fontSize: 22,
                color: "#111827",
                marginBottom: 4,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Ride Cancelled
            </Text>
            {ride.cancellationReason && (
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  textAlign: "center",
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Reason: {ride.cancellationReason}
              </Text>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  const showRideCommunication =
    canUseCommunicationRide(ride.status) &&
    ((userType === "passenger" && ride.driver) ||
      (userType === "driver" && ride.passenger));
  const showSupportCall = isRideActive(ride.status);

  return (
    <View style={{ flex: 1 }}>
      {/* Full-screen map background */}
      <View style={StyleSheet.absoluteFillObject}>
        <RideMap
          pickupLocation={mapLocations.pickup}
          destinationLocation={mapLocations.destination}
          driverLocation={mapLocations.driver}
          driverTrailCoordinates={
            userType === "passenger" && driverTrailCoordinates.length > 1
              ? driverTrailCoordinates
              : undefined
          }
          driverVehicleType={driverMarkerVehicleType}
          nearbyVehicles={ride?.status === RideStatus.REQUESTED ? nearbyVehicles : undefined}
          height={SCREEN_HEIGHT}
          showRoute={true}
          routeCoordinates={
            routeCoordinates.length > 0 ? routeCoordinates : undefined
          }
          interactive={true}
          zoomMode={
            routeCoordinates.length > 0 ? "active-route" : "all-markers"
          }
          status={ride.status}
          activeRouteCoordinates={
            routeCoordinates.length > 0 ? routeCoordinates : undefined
          }
        />
      </View>

      {/* Floating back button */}
      <TouchableOpacity
        style={{
          position: "absolute",
          top: insets.top + 12,
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
        onPress={handleSafeBack}
      >
        <ArrowLeft size={20} color="#111827" />
      </TouchableOpacity>

      {/* Floating chat/call buttons */}
      {(showRideCommunication || showSupportCall) && (
          <View
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 16,
              flexDirection: "row",
              gap: 8,
            }}
          >
            {showRideCommunication && (
              <>
                <TouchableOpacity
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#FFF",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 4,
                  }}
                  onPress={() => setChatVisible(true)}
                >
                  <MessageCircle size={18} color="#111827" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#FFF",
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.15,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 2 },
                    elevation: 4,
                  }}
                  onPress={() => callInitiate()}
                  disabled={callLoading}
                >
                  {callLoading ? (
                    <ActivityIndicator size="small" color="#111827" />
                  ) : (
                    <Phone size={18} color="#111827" />
                  )}
                </TouchableOpacity>
              </>
            )}
            {showSupportCall && (
              <TouchableOpacity
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#FFF",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 4,
                }}
                onPress={handleCallSupport}
              >
                <HelpCircle size={18} color={brandColor} />
              </TouchableOpacity>
            )}
          </View>
        )}

      {/* Bottom Sheet */}
      <BottomSheet
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture={true}
        android_keyboardInputMode="adjustResize"
        ref={bottomSheetRef}
        index={1}
        snapPoints={snapPoints}
        enablePanDownToClose={false}
        backgroundStyle={{
          backgroundColor: "#FFF",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
        handleIndicatorStyle={{ backgroundColor: "#D1D5DB", width: 40 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status view */}
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}>
            {renderStatusView()}
          </View>

          {/* Route card (hidden for terminal statuses since status view already shows route/fare) */}
          {ride.status !== RideStatus.COMPLETED &&
            ride.status !== RideStatus.CANCELLED && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ marginRight: 10, alignItems: "center" }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: "#16A34A",
                        }}
                      />
                      <View
                        style={{
                          width: 1.5,
                          height: 14,
                          backgroundColor: "#D1D5DB",
                          marginVertical: 2,
                        }}
                      />
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 1.5,
                          backgroundColor: "#EF4444",
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={2}
                        style={{
                          fontSize: 13,
                          color: "#111827",
                          fontFamily: "Figtree_500Medium",
                        }}
                      >
                        {ride.pickupLocation}
                      </Text>
                      <View style={{ height: 6 }} />
                      <Text
                        numberOfLines={2}
                        style={{
                          fontSize: 13,
                          color: "#111827",
                          fontFamily: "Figtree_500Medium",
                        }}
                      >
                        {ride.destination}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: "#E5E7EB",
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 13,
                        color: "#6B7280",
                      }}
                    >
                      Fare
                    </Text>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_700Bold",
                          fontSize: 16,
                          color: brandColor,
                        }}
                      >
                        {formatFare(ride.fare)}
                      </Text>
                      {ride.distance && (
                        <Text
                          style={{
                            fontSize: 12,
                            color: "#9CA3AF",
                            marginTop: 2,
                            fontFamily: "Figtree_400Regular",
                          }}
                        >
                          {formatDistance(ride.distance)}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}

          {/* Driver/Passenger info (timestamps) */}
          {(ride.status === RideStatus.ACCEPTED ||
            ride.status === RideStatus.ARRIVING ||
            ride.status === RideStatus.IN_PROGRESS) && (
            <View
              style={{
                marginHorizontal: 16,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginBottom: 16,
              }}
            >
              {ride.requestedAt && (
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#9CA3AF",
                      fontFamily: "Figtree_400Regular",
                    }}
                  >
                    Requested
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      marginTop: 1,
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    {new Date(ride.requestedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              )}
              {ride.acceptedAt && (
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#9CA3AF",
                      fontFamily: "Figtree_400Regular",
                    }}
                  >
                    Accepted
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: "#374151",
                      marginTop: 1,
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    {new Date(ride.acceptedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Verification Code Display (Passenger) */}
          {userType === "passenger" &&
            (ride.status === RideStatus.ACCEPTED ||
              ride.status === RideStatus.ARRIVING) &&
            ride.verificationCode && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <VerificationCodeDisplay
                  code={ride.verificationCode}
                  expiresAt={ride.verificationCodeExpiresAt}
                  serviceType="ride"
                />
              </View>
            )}

          {/* Verification Code Input (Driver) */}
          {userType === "driver" &&
            showVerificationInput &&
            ride.status === RideStatus.ARRIVING &&
            nextStatus === RideStatus.IN_PROGRESS && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <VerificationCodeInput
                  onVerify={handleVerifyCode}
                  serviceType="ride"
                  error={verificationError}
                  loading={actionLoading}
                />
              </View>
            )}

          {/* Payment CTA - COMPLETED (passenger only) */}
          {isRideCompleted && userType === "passenger" && (
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  navigationToPaymentRef.current.delete(ride.id);
                  if (
                    ridePaymentStatus === "PENDING" &&
                    !ridePaymentMethod
                  ) {
                    router.replace({
                      pathname: "/ride-payment",
                      params: { rideId: ride.id },
                    } as never);
                    return;
                  }
                  router.replace({
                    pathname: "/payment-status",
                    params: { rideId: ride.id },
                  });
                }}
                activeOpacity={0.85}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 16,
                  backgroundColor: brandColor,
                  borderRadius: 16,
                }}
              >
                <Wallet size={20} color="#FFF" />
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: 16,
                    marginLeft: 8,
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {!ridePaymentMethod && ridePaymentStatus === "PENDING"
                    ? "Pay Now"
                    : "View Payment Status"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Navigate to Pickup (Driver) */}
          {userType === "driver" &&
            (ride.status === RideStatus.ACCEPTED ||
              ride.status === RideStatus.ARRIVING) &&
            ride.pickupLatitude != null &&
            ride.pickupLongitude != null && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    backgroundColor: "#F0FDF4",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                  }}
                  onPress={() =>
                    openNavigationToCoordinates(
                      Number(ride.pickupLatitude),
                      Number(ride.pickupLongitude)
                    )
                  }
                >
                  <Navigation2 size={18} color="#10B981" />
                  <Text
                    style={{
                      color: "#10B981",
                      marginLeft: 8,
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    Navigate to Pickup
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          {/* Navigate to Destination (Driver) */}
          {userType === "driver" &&
            ride.status === RideStatus.IN_PROGRESS &&
            ride.destinationLat != null &&
            ride.destinationLng != null && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 12,
                    backgroundColor: "#F0FDF4",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                  }}
                  onPress={() =>
                    openNavigationToCoordinates(
                      Number(ride.destinationLat),
                      Number(ride.destinationLng)
                    )
                  }
                >
                  <Navigation2 size={18} color="#10B981" />
                  <Text
                    style={{
                      color: "#10B981",
                      marginLeft: 8,
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    Navigate to Destination
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          {/* Driver action button */}
          {userType === "driver" &&
            driverActionLabel &&
            nextStatus &&
            !showVerificationInput &&
            !isRideCompleted && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => handleUpdateStatus()}
                  disabled={actionLoading}
                  activeOpacity={0.85}
                  style={{
                    paddingVertical: 16,
                    backgroundColor: actionLoading ? "#9CA3AF" : brandColor,
                    borderRadius: 16,
                    alignItems: "center",
                  }}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        color: "#FFF",
                        fontSize: 16,
                        fontFamily: "Figtree_700Bold",
                      }}
                    >
                      {driverActionLabel}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

          {/* Cancel Button */}
          {canCancel && (
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={handleCancelRide}
                disabled={cancelLoading || actionLoading}
                activeOpacity={0.85}
                style={{
                  paddingVertical: 14,
                  backgroundColor: "#FFF",
                  borderRadius: 16,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#EF4444",
                }}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text
                    style={{
                      color: "#EF4444",
                      fontSize: 15,
                      fontFamily: "Figtree_700Bold",
                    }}
                  >
                    Cancel Ride
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

        </BottomSheetScrollView>
      </BottomSheet>

      <Modal
        visible={showCancelReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!cancelLoading) setShowCancelReasonModal(false);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: 18,
              borderWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontFamily: "Figtree_700Bold",
                color: "#111827",
                marginBottom: 6,
              }}
            >
              Cancel Ride
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Figtree_400Regular",
                color: "#6B7280",
                marginBottom: 14,
              }}
            >
              Please select reason
            </Text>

            <View style={{ gap: 8 }}>
              {PASSENGER_CANCEL_REASONS.map((reason) => {
                const isSelected = selectedCancelReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    activeOpacity={0.85}
                    onPress={() => setSelectedCancelReason(reason)}
                    style={{
                      borderWidth: 1,
                      borderColor: isSelected ? "#F36D14" : "#E5E7EB",
                      backgroundColor: isSelected ? "#FFF3EB" : "#FFFFFF",
                      borderRadius: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: isSelected
                          ? "Figtree_600SemiBold"
                          : "Figtree_500Medium",
                        color: isSelected ? "#F36D14" : "#111827",
                      }}
                    >
                      {reason}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View
              style={{
                marginTop: 16,
                flexDirection: "row",
                gap: 10,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={cancelLoading}
                onPress={() => setShowCancelReasonModal(false)}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Figtree_600SemiBold",
                    color: "#374151",
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={cancelLoading || !selectedCancelReason}
                onPress={() => {
                  void submitCancellation(selectedCancelReason);
                }}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  backgroundColor:
                    cancelLoading || !selectedCancelReason
                      ? "#F9A97B"
                      : "#EF4444",
                }}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Figtree_700Bold",
                      color: "#FFFFFF",
                    }}
                  >
                    Confirm Cancel
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Chat Modal */}
      {ride &&
        canUseCommunicationRide(ride.status) &&
        (userType === "passenger" ? ride.driver : ride.passenger) && (
          <ChatModal
            visible={chatVisible}
            onClose={() => setChatVisible(false)}
            rideId={ride.id}
            otherPartyName={
              userType === "passenger"
                ? ride.driver?.fullName ?? "Driver"
                : ride.passenger?.fullName ?? "Passenger"
            }
            userType={userType as "passenger" | "driver"}
            brandColor={brandColor}
            enabled={canUseCommunicationRide(ride.status)}
            onNewMessageWhenNotFocused={(msg) => {
              const name =
                userType === "passenger"
                  ? ride.driver?.fullName ?? "Driver"
                  : ride.passenger?.fullName ?? "Passenger";
              toast.show({
                text: `New message from ${name}`,
                action: "Open",
                onAction: () => setChatVisible(true),
              });
            }}
          />
        )}

      {/* Ride Expiry Warning Modal */}
      {ride && userType === "passenger" && (
        <RideExpiryWarningModal
          visible={showExpiryWarning}
          rideId={ride.id}
          statusMessage={expiryMessage}
          countdownSeconds={expiryCountdown}
          onDismiss={() => {
            setShowExpiryWarning(false);
            warningDismissedForRef.current =
              rideStatus.ride?.warning_notified_at ?? null;
          }}
        />
      )}
    </View>
  );
}
