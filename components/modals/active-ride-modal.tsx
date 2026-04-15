/**
 * Active Ride Modal
 * Displays the active ride screen as a modal overlay
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ScrollView, RefreshControl, TouchableOpacity, Dimensions, Modal, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { OneSignal } from "react-native-onesignal";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { Loading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { ChatModal } from "@/components/chat-modal";
import { RideStatusCard } from "@/components/ride-status-card";
import { useToast } from "@/components/ui/toast";
import { useCall } from "@/hooks/use-call";
import { canUseCommunicationRide } from "@/lib/utils/communication";
import { RideMap, type MapLocation } from "@/components/ride-map";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import { VerificationCodeInput } from "@/components/verification-code-input";
import { useActiveRideTracking } from "@/hooks/use-realtime";
import { useWatchLocation } from "@/lib/services/location";
import {
  getActiveRide,
  getRideDriverTrack,
  updateRideStatus,
  cancelRide,
  type RideResponse,
  type RideTrackingPoint,
  RideStatus,
  isRideActive,
  canPassengerCancel,
  canDriverCancel,
  getNextDriverStatus,
  getDriverActionLabel,
  formatFare,
} from "@/lib/api/ride";
import { getRoute, decodePolyline } from "@/lib/services/directions";
import { dispatchServiceCompleted } from "@/lib/events";
import {
  getRidePayment,
  confirmCashPayment,
  type RidePayment,
  getPaymentStatusLabel,
  getPaymentStatusColor,
} from "@/lib/api/payment";
import { formatAmount } from "@/lib/api/wallet";
import { clearActiveRideId, markIncomingRideHandled } from "@/lib/incoming-ride-request";

// Constants
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_HEIGHT = SCREEN_HEIGHT * 0.3;
const REFRESH_INTERVAL = 10000;
const LOCATION_UPDATE_INTERVAL = 10000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const ROUTE_UPDATE_DEBOUNCE_MS = 10000;

export interface ActiveRideModalProps {
  visible: boolean;
  onClose: () => void;
  onRideComplete?: () => void;
  rideId?: string;
}

export function ActiveRideModal({
  visible,
  onClose,
  onRideComplete,
  rideId,
}: ActiveRideModalProps) {
  const { userType } = useAuth();
  const brandColor = userType === "driver" ? "#843FE3" : "#F36D14";

  // State
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const routeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastInProgressRouteFetchRef = useRef(0);
  const lastDriverTrackTimestampRef = useRef<string | null>(null);
  const trackRideIdRef = useRef<string | null>(null);

  const { initiate: callInitiate, loading: callLoading } = useCall(
    ride?.id ?? null
  );
  const toast = useToast();
  const { showAlert } = useAlert();

  // Payment state
  const [ridePayment, setRidePayment] = useState<RidePayment | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [cashConfirmLoading, setCashConfirmLoading] = useState(false);

  // Get driver ID from ride
  const driverId = ride?.driver?.id || ride?.driverId || null;
  const activeRideId = ride?.id || null;

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

  // Realtime subscriptions
  const { rideStatus, driverLocation, isSubscribed } = useActiveRideTracking({
    rideId: activeRideId,
    driverId,
    userType: userType as "passenger" | "driver" | null,
    enabled: visible && !!ride && isRideActive(ride.status),
  });

  // Watch driver's location
  const driverSelfLocation = useWatchLocation({
    enabled:
      visible && userType === "driver" && !!ride && isRideActive(ride.status),
    distanceInterval: 20,
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
        ).catch(console.error);
      } catch (error) {
        console.warn("[ActiveRideModal] Failed location publish fallback check:", error);
      }
    },
  });

  // Update ride state from realtime
  useEffect(() => {
    if (rideStatus.ride) {
      setRide((prev) => {
        if (!prev) return prev;
        const newStatus = rideStatus.ride!.status as any;

        if (
          prev.status === RideStatus.ARRIVING &&
          newStatus !== RideStatus.ARRIVING
        ) {
          setShowVerificationInput(false);
        }

        return {
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
      });
    }
  }, [rideStatus.ride]);

  // Fetch ride on mount
  useEffect(() => {
    if (visible) {
      fetchActiveRide();
    }
  }, [visible]);

  // Navigate to ride payment screen (passenger) - defined early for use in callback
  const handlePayRide = useCallback(() => {
    if (!ride?.id) return;
    onClose();
    router.replace({
      pathname: "/ride-payment",
      params: { rideId: ride.id },
    });
  }, [ride?.id, onClose]);

  // Fetch payment status with retry logic (defined before useEffect)
  const fetchPaymentStatusWithRetry = useCallback(
    async (retries = 3) => {
      if (!ride?.id) return;

      setPaymentLoading(true);
      let attempt = 0;

      while (attempt < retries) {
        try {
          const response = await getRidePayment(ride.id);
          if (response.success && response.data?.payment) {
            const payment = response.data.payment;
            setRidePayment(payment);

            // Auto-navigate passenger to payment screen if payment is pending
            if (
              userType === "passenger" &&
              payment.status === "PENDING" &&
              !payment.paymentMethod
            ) {
              // Small delay to let user see the completion alert first
              setTimeout(() => {
                handlePayRide();
              }, 2000);
            } else if (userType === "passenger") {
              setTimeout(() => {
                onClose();
                router.replace({
                  pathname: "/payment-status",
                  params: { rideId: ride.id },
                });
              }, 1500);
            }

            setPaymentLoading(false);
            return;
          }
        } catch (error) {
          console.error(
            `[ActiveRideModal] Error fetching payment status (attempt ${
              attempt + 1
            }/${retries}):`,
            error
          );
        }

        attempt++;
        if (attempt < retries) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }

      setPaymentLoading(false);
    },
    [ride?.id, userType, handlePayRide, onClose]
  );

  // Fetch payment status when ride is completed (with retry logic)
  useEffect(() => {
    if (ride?.id && ride.status === RideStatus.COMPLETED) {
      // Add a small delay to ensure backend has created the payment record
      const timeoutId = setTimeout(() => {
        fetchPaymentStatusWithRetry();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [ride?.id, ride?.status, fetchPaymentStatusWithRetry]);

  // Handle driver cash confirmation
  const handleConfirmCash = async () => {
    if (!ride?.id) return;

    setCashConfirmLoading(true);
    try {
      const response = await confirmCashPayment(ride.id);
      if (response.success && response.data?.payment) {
        setRidePayment({
          ...ridePayment,
          ...response.data.payment,
        } as RidePayment);
        toast.success(
          `Payment of ${formatAmount(
            response.data.payment.fareAmount
          )} confirmed.`
        );
      } else {
        const errorMessage =
          (response.error as any)?.message || "Failed to confirm cash payment";
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error("Failed to confirm cash payment. Please try again.");
    } finally {
      setCashConfirmLoading(false);
    }
  };

  // Navigate to payment status screen
  const handleViewPaymentStatus = () => {
    if (!ride?.id) return;
    onClose();
    router.replace({
      pathname: "/payment-status",
      params: { rideId: ride.id },
    });
  };

  // Backup polling
  useEffect(() => {
    if (!visible || !ride || !isRideActive(ride.status)) return;

    const interval = setInterval(() => {
      if (userType === "passenger" || !isSubscribed) {
        fetchActiveRide(true);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [visible, ride, isSubscribed, userType]);

  const fetchActiveRide = async (
    silent: boolean = false,
    retryCount: number = 0
  ) => {
    if (!silent) setLoading(true);

    try {
      const response = await getActiveRide();

      if (response.success) {
        const rideData = response.data?.ride || null;

        if (!rideData && retryCount < MAX_RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return fetchActiveRide(silent, retryCount + 1);
        }

        setRide(rideData);
      } else {
        if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return fetchActiveRide(silent, retryCount + 1);
        }

        if (!silent) {
          toast.error("Failed to fetch ride details.");
        }
      }
    } catch (error) {
      if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchActiveRide(silent, retryCount + 1);
      }

      if (!silent) {
        toast.error("Failed to fetch ride details.");
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
          console.warn(
            "[ActiveRideModal] Failed to fetch driver track:",
            response.error
          );
        }
      } catch (error) {
        if (!silent) {
          console.warn("[ActiveRideModal] Driver track fetch error:", error);
        }
      }
    },
    [userType, ride?.id, ride?.status, driverId, mergeDriverTrackPoints]
  );

  useEffect(() => {
    if (
      userType !== "passenger" ||
      !visible ||
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
  }, [userType, visible, ride?.id, ride?.status, driverId, fetchDriverTrack]);

  useEffect(() => {
    if (
      userType !== "passenger" ||
      !visible ||
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
  }, [userType, visible, ride?.id, ride?.status, driverId, fetchDriverTrack]);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActiveRide();
    void fetchDriverTrack({
      since: lastDriverTrackTimestampRef.current ?? undefined,
      limit: 500,
    });
    setRefreshing(false);
  };

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
          "[ActiveRideModal] Failed to decode cached polyline on mount:",
          err
        );
      }
    }
  }, [ride?.routePolyline, ride?.status]);

  const handleUpdateStatus = async (verificationCode?: string) => {
    if (!ride) return;

    const nextStatus = getNextDriverStatus(ride.status);
    if (!nextStatus) return;

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

        if (nextStatus === RideStatus.COMPLETED) {
          toast.success(
            `Ride completed! Trip fare: ${formatFare(response.data.fare)}`
          );
          // Fetch payment status after a short delay to ensure backend has created it
          setTimeout(() => {
            fetchPaymentStatusWithRetry();
          }, 500);
        }
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to update ride status";

        const errorCode =
          typeof response.error === "object" &&
          response.error !== null &&
          "code" in response.error
            ? String((response.error as { code: string }).code)
            : "";

        if (errorCode.includes("VERIFICATION")) {
          setVerificationError(errorMessage);
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    await handleUpdateStatus(code);
  };

  const handleCancelRide = async () => {
    if (!ride) return;

    showAlert("Cancel Ride", "Are you sure you want to cancel this ride?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: async () => {
          setCancelLoading(true);

          try {
            const response = await cancelRide(ride.id, "Cancelled by user");

            if (response.success) {
              markIncomingRideHandled(ride.id);
              await clearActiveRideId();
              try {
                OneSignal.Notifications.clearAll();
              } catch {
                // best-effort cleanup
              }
              dispatchServiceCompleted();
              setRide(null);
              toast.success("Ride cancelled.");
              onClose();
              onRideComplete?.();
            } else {
              const errorMessage =
                typeof response.error === "object" &&
                response.error !== null &&
                "message" in response.error
                  ? String((response.error as { message: string }).message)
                  : "Failed to cancel ride";
              toast.error(errorMessage);
            }
          } catch (error) {
            toast.error("Something went wrong. Please try again.");
          } finally {
            setCancelLoading(false);
          }
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

  // Route fetching
  const fetchRoute = useCallback(async () => {
    if (!ride || !isRideActive(ride.status)) {
      setRouteCoordinates([]);
      return;
    }

    if (
      ride.status === RideStatus.REQUESTED ||
      ride.status === RideStatus.COMPLETED ||
      ride.status === RideStatus.CANCELLED
    ) {
      setRouteCoordinates([]);
      return;
    }

    if (!mapLocations) {
      setRouteCoordinates([]);
      return;
    }

    setRouteLoading(true);

    try {
      let origin: { latitude: number; longitude: number } | null = null;
      let destination: { latitude: number; longitude: number } | null = null;

      if (
        ride.status === RideStatus.ACCEPTED ||
        ride.status === RideStatus.ARRIVING
      ) {
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
        // Real-time passenger navigation: driver location -> destination
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
          try {
            const decodedRoute = decodePolyline(ride.routePolyline);
            if (decodedRoute.length > 0) {
              setRouteCoordinates(decodedRoute);
              setRouteLoading(false);
              return;
            }
          } catch (err) {
            console.warn(
              "[ActiveRideModal] Failed to decode cached polyline:",
              err
            );
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
        setRouteCoordinates([origin, destination]);
      }
    } catch (error) {
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

  // Fetch route effect
  useEffect(() => {
    if (!ride || !isRideActive(ride.status) || !mapLocations) {
      setRouteCoordinates([]);
      return;
    }

    if (
      ride.status === RideStatus.ACCEPTED ||
      ride.status === RideStatus.ARRIVING
    ) {
      if (!mapLocations.driver || !mapLocations.pickup) return;
    }

    if (ride.status === RideStatus.IN_PROGRESS) {
      const hasOrigin = !!mapLocations.driver || !!mapLocations.pickup;
      if (!hasOrigin || !mapLocations.destination) return;
    }

    if (routeUpdateTimeoutRef.current) {
      clearTimeout(routeUpdateTimeoutRef.current);
      routeUpdateTimeoutRef.current = null;
    }

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

  const canCancel =
    ride &&
    ((userType === "passenger" && canPassengerCancel(ride.status)) ||
      (userType === "driver" && canDriverCancel(ride.status)));

  const driverActionLabel =
    ride && userType === "driver" ? getDriverActionLabel(ride.status) : null;
  const nextStatus = ride ? getNextDriverStatus(ride.status) : null;

  const getStatusInfo = (status: string) => {
    const statusMap: Record<
      string,
      { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
    > = {
      REQUESTED: { label: "Finding Driver", color: "#D97706", icon: "search" },
      ACCEPTED: { label: "Driver On The Way", color: "#3B82F6", icon: "car" },
      ARRIVING: { label: "Driver Arrived", color: "#8B5CF6", icon: "location" },
      IN_PROGRESS: {
        label: "Ride In Progress",
        color: "#10B981",
        icon: "navigate",
      },
      COMPLETED: {
        label: "Ride Completed",
        color: "#22C55E",
        icon: "checkmark-circle",
      },
      CANCELLED: {
        label: "Ride Cancelled",
        color: "#EF4444",
        icon: "close-circle",
      },
    };
    return (
      statusMap[status] || {
        label: status,
        color: "#6B7280",
        icon: "help-circle",
      }
    );
  };

  const handleClose = () => {
    if (ride && !isRideActive(ride.status)) {
      onRideComplete?.();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView
        className="flex-1 bg-gray-50 dark:bg-gray-900"
        edges={["top"]}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <TouchableOpacity onPress={handleClose} className="p-2 -ml-2">
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
          <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Active Ride
          </Text>
          <View className="w-10" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <Loading message="Loading ride..." />
          </View>
        ) : !ride ? (
          <View className="flex-1 items-center justify-center p-6">
            <Ionicons name="car-outline" size={48} color="#6B7280" />
            <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-4">
              No Active Ride
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              Book a ride to see your active trip here.
            </Text>
            <Button onPress={handleClose} className="mt-6">
              Close
            </Button>
          </View>
        ) : (
          <>
            {/* Map */}
            {isRideActive(ride.status) &&
              ride.status !== RideStatus.REQUESTED && (
                <View className="px-4 pt-4">
                  <RideMap
                    pickupLocation={mapLocations.pickup}
                    destinationLocation={mapLocations.destination}
                    driverLocation={mapLocations.driver}
                    driverTrailCoordinates={
                      userType === "passenger" && driverTrailCoordinates.length > 1
                        ? driverTrailCoordinates
                        : undefined
                    }
                    driverVehicleType={
                      ride.driver?.vehicleType ?? ride.vehicleType ?? null
                    }
                    height={MAP_HEIGHT}
                    showRoute={true}
                    routeCoordinates={
                      routeCoordinates.length > 0 ? routeCoordinates : undefined
                    }
                    interactive={true}
                    zoomMode={
                      routeCoordinates.length > 0
                        ? "active-route"
                        : "all-markers"
                    }
                    status={ride.status}
                    activeRouteCoordinates={
                      routeCoordinates.length > 0 ? routeCoordinates : undefined
                    }
                  />
                </View>
              )}

            <ScrollView
              className="flex-1"
              contentContainerClassName="p-4 pb-8"
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                />
              }
            >
              {/* Status Card */}
              <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
                {(() => {
                  const statusInfo = getStatusInfo(ride.status);
                  return (
                    <View className="items-center">
                      <View
                        className="w-14 h-14 rounded-full items-center justify-center mb-3"
                        style={{ backgroundColor: `${statusInfo.color}20` }}
                      >
                        <Ionicons
                          name={statusInfo.icon}
                          size={28}
                          color={statusInfo.color}
                        />
                      </View>
                      <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {statusInfo.label}
                      </Text>
                      {ride.status === RideStatus.COMPLETED && (
                        <View className="items-center mt-2">
                          {typeof ride.discountApplied === "number" &&
                            ride.discountApplied > 0 && (
                              <Text className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                                Discount -{formatFare(ride.discountApplied)}
                              </Text>
                            )}
                          <Text className="text-2xl font-bold text-emerald-600">
                            {formatFare(ride.fare)}
                          </Text>
                        </View>
                      )}
                      {isSubscribed && isRideActive(ride.status) && (
                        <View className="flex-row items-center mt-2">
                          <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                          <Text className="text-xs text-green-600">
                            Live tracking
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>

              {/* Ride Details */}
              <RideStatusCard
                ride={ride}
                userType={userType as "passenger" | "driver"}
                showDetails={true}
                className="mb-4"
              />

              {/* Verification Code Display (Passenger) */}
              {userType === "passenger" &&
                (ride.status === RideStatus.ACCEPTED ||
                  ride.status === RideStatus.ARRIVING) &&
                ride.verificationCode && (
                  <View className="mb-4">
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
                  <View className="mb-4">
                    <VerificationCodeInput
                      onVerify={handleVerifyCode}
                      serviceType="ride"
                      error={verificationError}
                      loading={actionLoading}
                    />
                  </View>
                )}

              {/* Driver Actions */}
              {userType === "driver" &&
                driverActionLabel &&
                nextStatus &&
                !showVerificationInput && (
                  <Button
                    onPress={() => handleUpdateStatus()}
                    loading={actionLoading}
                    disabled={actionLoading}
                    size="lg"
                    className="mb-3"
                  >
                    {actionLoading ? "Updating..." : driverActionLabel}
                  </Button>
                )}

              {/* Cancel Button */}
              {canCancel && (
                <Button
                  onPress={handleCancelRide}
                  loading={cancelLoading}
                  disabled={cancelLoading || actionLoading}
                  variant="outline"
                  size="lg"
                  className="border-red-500"
                >
                  <Text className="text-red-500 font-semibold">
                    {cancelLoading ? "Cancelling..." : "Cancel Ride"}
                  </Text>
                </Button>
              )}

              {/* Payment Section for Completed Rides */}
              {ride.status === RideStatus.COMPLETED && (
                <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
                  <Text className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Payment
                  </Text>

                  {paymentLoading ? (
                    <View className="items-center py-4">
                      <ActivityIndicator size="small" color={brandColor} />
                      <Text className="text-sm text-gray-500 mt-2">
                        Loading payment status...
                      </Text>
                    </View>
                  ) : ridePayment ? (
                    <View>
                      {/* Payment Status Badge */}
                      <View className="flex-row items-center justify-between mb-3">
                        <Text className="text-gray-600 dark:text-gray-400">
                          Status
                        </Text>
                        <View
                          className="px-3 py-1 rounded-full"
                          style={{
                            backgroundColor: `${getPaymentStatusColor(
                              ridePayment.status
                            )}20`,
                          }}
                        >
                          <Text
                            style={{
                              color: getPaymentStatusColor(ridePayment.status),
                            }}
                            className="text-sm font-medium"
                          >
                            {getPaymentStatusLabel(ridePayment.status)}
                          </Text>
                        </View>
                      </View>

                      {/* Payment Method (if selected) */}
                      {ridePayment.paymentMethod && (
                        <View className="flex-row items-center justify-between mb-3">
                          <Text className="text-gray-600 dark:text-gray-400">
                            Method
                          </Text>
                          <Text className="text-gray-900 dark:text-gray-100 font-medium">
                            {ridePayment.paymentMethod === "CASH"
                              ? "Cash"
                              : ridePayment.paymentMethod === "WALLET"
                              ? "Wallet"
                              : "Online"}
                          </Text>
                        </View>
                      )}

                      {typeof ridePayment.discountApplied === "number" &&
                        ridePayment.discountApplied > 0 && (
                          <View className="flex-row items-center justify-between mb-3">
                            <Text className="text-gray-600 dark:text-gray-400">
                              Discount
                            </Text>
                            <Text className="text-base font-medium text-emerald-600 dark:text-emerald-400">
                              -{formatAmount(ridePayment.discountApplied)}
                            </Text>
                          </View>
                        )}

                      {/* Amount */}
                      <View className="flex-row items-center justify-between">
                        <Text className="text-gray-600 dark:text-gray-400">
                          Amount
                        </Text>
                        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {formatAmount(ridePayment.fareAmount)}
                        </Text>
                      </View>

                      {/* Passenger: Pay button if not completed */}
                      {userType === "passenger" &&
                        ridePayment.status !== "COMPLETED" && (
                          <TouchableOpacity
                            onPress={
                              ridePayment.status === "PENDING" &&
                              !ridePayment.paymentMethod
                                ? handlePayRide
                                : handleViewPaymentStatus
                            }
                            className="mt-4 py-3 rounded-xl"
                            style={{ backgroundColor: brandColor }}
                          >
                            <Text className="text-center text-white font-semibold">
                              {ridePayment.status === "PENDING" &&
                              !ridePayment.paymentMethod
                                ? "Pay Now"
                                : "View Payment Status"}
                            </Text>
                          </TouchableOpacity>
                        )}

                      {/* Driver: Confirm cash button */}
                      {userType === "driver" &&
                        ridePayment.paymentMethod === "CASH" &&
                        ridePayment.status === "PENDING" && (
                          <TouchableOpacity
                            onPress={handleConfirmCash}
                            disabled={cashConfirmLoading}
                            className="mt-4 py-3 rounded-xl"
                            style={{ backgroundColor: brandColor }}
                          >
                            {cashConfirmLoading ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Text className="text-center text-white font-semibold">
                                Confirm Cash Received
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}

                      {/* Driver: Prompt to wait for payment */}
                      {userType === "driver" &&
                        ridePayment.status === "PENDING" &&
                        !ridePayment.paymentMethod && (
                          <View className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                            <Text className="text-sm text-amber-700 dark:text-amber-300 text-center">
                              Waiting for passenger to select payment method
                            </Text>
                          </View>
                        )}

                      {/* Payment Completed Message */}
                      {ridePayment.status === "COMPLETED" && (
                        <View className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                          <View className="flex-row items-center justify-center">
                            <Ionicons
                              name="checkmark-circle"
                              size={20}
                              color="#10B981"
                            />
                            <Text className="text-sm text-emerald-700 dark:text-emerald-300 ml-2">
                              Payment completed successfully
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  ) : (
                    // No payment record yet - show pay button for passenger
                    userType === "passenger" && (
                      <TouchableOpacity
                        onPress={handlePayRide}
                        className="py-3 rounded-xl"
                        style={{ backgroundColor: brandColor }}
                      >
                        <Text className="text-center text-white font-semibold">
                          Pay {formatFare(ride.fare)}
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}

              {/* Close Button for completed/cancelled */}
              {!isRideActive(ride.status) && (
                <Button onPress={handleClose} size="lg" className="mt-4">
                  Close
                </Button>
              )}

              {/* Contact Options */}
              {canUseCommunicationRide(ride.status) &&
                ((userType === "passenger" && ride.driver) ||
                  (userType === "driver" && ride.passenger)) && (
                  <View className="mt-4 flex-row justify-center gap-3">
                    <TouchableOpacity
                      className="flex-row items-center px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
                      onPress={() => setChatVisible(true)}
                    >
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={18}
                        color={brandColor}
                      />
                      <Text className="text-gray-900 dark:text-gray-100 font-medium ml-2">
                        Chat
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-row items-center px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
                      onPress={() => callInitiate()}
                      disabled={callLoading}
                    >
                      {callLoading ? (
                        <Text className="text-gray-500 text-sm">
                          Connecting...
                        </Text>
                      ) : (
                        <>
                          <Ionicons name="call" size={18} color={brandColor} />
                          <Text className="text-gray-900 dark:text-gray-100 font-medium ml-2">
                            {userType === "passenger"
                              ? "Call Driver"
                              : "Call Passenger"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
            </ScrollView>

            {canUseCommunicationRide(ride.status) &&
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
                  onNewMessageWhenNotFocused={() => {
                    const name =
                      userType === "passenger"
                        ? ride.driver?.fullName ?? "Driver"
                        : ride.passenger?.fullName ?? "Passenger";
                    toast.chat(`New message from ${name}`, {
                      label: "Open",
                      onPress: () => setChatVisible(true),
                    });
                  }}
                />
              )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}
