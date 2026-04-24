/**
 * Home Screen
 * Context-aware main dashboard that shows active services when they exist,
 * or service selection when none exist
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Image,
  ImageSourcePropType,
  ActivityIndicator,
  Dimensions,
  AppState,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { OneSignal } from "react-native-onesignal";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { MAP_STYLE } from "@/constants/map-style";
import { DriverMarker } from "@/components/map-markers";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { useToast } from "@/components/ui/toast";
import { useActiveServices } from "@/hooks/use-active-services";
import { useDriverRewards } from "@/hooks/use-driver-rewards";
import { ActiveServiceCard } from "@/components/active-service-card";
import { Loading } from "@/components/ui/loading";
import {
  getDriverLocation,
  setAvailability,
  updateDriverLocation,
} from "@/lib/api/driver";
import { getWalletBalance } from "@/lib/api/wallet";
import { getRidePayment } from "@/lib/api/payment";
import {
  getPendingRides,
  acceptRide,
  getNearbyDrivers,
  type RideResponse,
} from "@/lib/api/ride";
import {
  getPendingPorterServices,
  acceptPorterService,
  getNearbyDriversForPorter,
  type PorterServiceResponse,
} from "@/lib/api/porter";
import {
  RideStatusCardCompact,
  NoRidesCard,
} from "@/components/ride-status-card";
import {
  PorterStatusCardCompact,
  NoPorterServicesCard,
} from "@/components/porter-status-card";
import {
  getCurrentPositionWithAddress,
  type LocationWithAddress,
} from "@/lib/services/location";
import {
  addNotificationEventListener,
  addServiceEventListener,
  addWalletUpdatedListener,
  dispatchServiceCreated,
} from "@/lib/events";
import { getRecentLocations, type RecentLocation } from "@/lib/recent-locations";
import {
  isIncomingRideRecentlyShown,
  setActiveRideId,
  setHandledRide,
  setPendingIncomingRideId,
  shouldIgnoreIncomingRideNotification,
  toIncomingRideRouteParams,
} from "@/lib/incoming-ride-request";
import {
  subscribeToRideAvailability,
  type RideAvailabilityUpdate,
  unsubscribeChannel,
} from "@/lib/supabase";
import {
  startDriverService,
  stopDriverService,
  getDriverServiceStatus,
  requestBackgroundLocationPermissions,
} from "@/lib/services/driver-foreground-service";
import sedanImage from "@/assets/images/sedan.png";
import autoImage from "@/assets/images/auto.png";
import bikeImage from "@/assets/images/bike.png";
import suvImage from "@/assets/images/suv.png";
import { MapPinCheckInside } from "lucide-react-native";
import { calculateHeadingBetweenCoordinates } from "@/lib/utils/vehicle-marker-assets";

// Note: Active services now navigate directly to full-screen views instead of modals

const BRAND_ORANGE = "#F36D14"; // Passenger login primary (welcome, send-otp, verify-otp)
const BRAND_PURPLE = "#843FE3"; // Passenger login secondary (e.g. driver link)
const RUPEE = "\u20B9";
const BULLET = "\u2022";
const DRIVER_WALLET_NEGATIVE_MESSAGE =
  "Your wallet balance is below 0. Please recharge your wallet to continue getting rides.";
const PASSENGER_MAP_DEFAULT_REGION = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
};
const MAX_PASSENGER_MAP_ZOOM_OUT_KM = 40;
const KM_PER_DEGREE_LATITUDE = 111.32;
const MAX_PASSENGER_LAT_DELTA =
  MAX_PASSENGER_MAP_ZOOM_OUT_KM / KM_PER_DEGREE_LATITUDE;
const PENDING_RIDE_REFRESH_DEBOUNCE_MS = 350;
const DRIVER_STATUS_REFRESH_INTERVAL_MS = 10000;
const PASSENGER_NEARBY_VEHICLE_POLL_INTERVAL_MS = 7000;
const PASSENGER_NEARBY_VEHICLE_RADIUS_KM = 3;

type NearbyVehicleMarker = {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string | null;
  heading?: number | null;
};

function getMaxLongitudeDeltaAtLatitude(latitude: number): number {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const cosine = Math.max(0.15, Math.abs(Math.cos(latitudeRadians)));
  return MAX_PASSENGER_MAP_ZOOM_OUT_KM / (KM_PER_DEGREE_LATITUDE * cosine);
}

function getLatitudeDeltaForDistanceKm(distanceKm: number): number {
  return distanceKm / KM_PER_DEGREE_LATITUDE;
}

function getLongitudeDeltaForDistanceKm(
  distanceKm: number,
  latitude: number
): number {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const cosine = Math.max(0.15, Math.abs(Math.cos(latitudeRadians)));
  return distanceKm / (KM_PER_DEGREE_LATITUDE * cosine);
}

function clampPassengerMapRegion(
  region: Region,
  anchor: { latitude: number; longitude: number }
): Region {
  let latitudeDelta = region.latitudeDelta;
  let longitudeDelta = region.longitudeDelta;
  let latitude = region.latitude;
  let longitude = region.longitude;

  if (latitudeDelta > MAX_PASSENGER_LAT_DELTA) {
    const scale = MAX_PASSENGER_LAT_DELTA / latitudeDelta;
    latitudeDelta = MAX_PASSENGER_LAT_DELTA;
    longitudeDelta *= scale;
  }

  const maxLongitudeDelta = getMaxLongitudeDeltaAtLatitude(region.latitude);
  if (longitudeDelta > maxLongitudeDelta) {
    const scale = maxLongitudeDelta / longitudeDelta;
    longitudeDelta = maxLongitudeDelta;
    latitudeDelta = Math.min(latitudeDelta * scale, MAX_PASSENGER_LAT_DELTA);
  }

  const maxLatitudeOffset = getLatitudeDeltaForDistanceKm(
    MAX_PASSENGER_MAP_ZOOM_OUT_KM
  );
  const maxLongitudeOffset = getLongitudeDeltaForDistanceKm(
    MAX_PASSENGER_MAP_ZOOM_OUT_KM,
    anchor.latitude
  );

  latitude = Math.min(
    anchor.latitude + maxLatitudeOffset,
    Math.max(anchor.latitude - maxLatitudeOffset, latitude)
  );
  longitude = Math.min(
    anchor.longitude + maxLongitudeOffset,
    Math.max(anchor.longitude - maxLongitudeOffset, longitude)
  );

  return {
    ...region,
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

function getMinZoomLevelForDistanceKm(
  distanceKm: number,
  latitude: number
): number {
  const screenWidthPx = Math.max(1, Dimensions.get("window").width);
  const visibleWidthMeters = Math.max(1, distanceKm * 1000);
  const metersPerPixel = visibleWidthMeters / screenWidthPx;
  const latitudeRadians = (latitude * Math.PI) / 180;
  const cosine = Math.max(0.15, Math.abs(Math.cos(latitudeRadians)));
  const zoom = Math.log2((156543.03392 * cosine) / metersPerPixel);
  return Math.max(2, Math.min(20, zoom));
}

function missionTypeLabel(type: string): string {
  switch (type) {
    case "RIDE_COUNT":
      return "Ride Count";
    case "TIME_BASED":
      return "Online Time";
    case "RATING":
      return "Rating";
    case "SPECIAL_EVENT":
      return "Special Event";
    default:
      return type;
  }
}

function periodLabel(period: string): string {
  switch (period) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "ONE_TIME":
      return "One-Time";
    default:
      return period;
  }
}

function normalizeRideStatus(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase() : "";
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

function getRideDispatchWaveKey(ride: RideResponse): string {
  if (typeof ride.expiresAt === "string" && ride.expiresAt.trim().length > 0) {
    return ride.expiresAt;
  }
  if (ride.expiresAt instanceof Date) {
    return ride.expiresAt.toISOString();
  }
  return ride.requestedAt;
}

function shouldRefreshPendingRideAvailability(
  update: RideAvailabilityUpdate
): boolean {
  const currentStatus = normalizeRideStatus(update.current.status);
  const previousStatus = normalizeRideStatus(update.previous?.status);

  if (update.eventType === "INSERT") {
    return currentStatus === "REQUESTED";
  }

  const wasRequested = previousStatus === "REQUESTED";
  const isRequested = currentStatus === "REQUESTED";
  if (!wasRequested && !isRequested) return false;

  return (
    currentStatus !== previousStatus ||
    update.current.driver_id !== (update.previous?.driver_id ?? null) ||
    update.current.requested_driver_id !==
      (update.previous?.requested_driver_id ?? null) ||
    update.current.expires_at !== (update.previous?.expires_at ?? null)
  );
}

export default function HomeScreen() {
  const { user, userType } = useAuth();
  const toast = useToast();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [isTogglingAvailability, setIsTogglingAvailability] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(
    null
  );
  const [walletBalance, setWalletBalance] = useState(0);
  const [isWalletNegative, setIsWalletNegative] = useState(false);
  const [canGoOnline, setCanGoOnline] = useState(true);

  // Track previous active ride to detect completion
  const previousRideIdRef = useRef<string | null>(null);
  // Guard to prevent duplicate navigation to payment screen
  const navigationToPaymentRef = useRef<Set<string>>(new Set());
  // Guard to prevent repeated auto-navigation to car-pool OTP screen
  const carPoolOtpNavKeyRef = useRef<string | null>(null);

  // Fetch active services
  const activeServices = useActiveServices(refreshTrigger);
  const hasDriverActiveService = activeServices.hasAny;
  const driverRewards = useDriverRewards({ autoFetchOffers: true });
  const clearDeliveredNotifications = useCallback(() => {
    try {
      OneSignal.Notifications.clearAll();
    } catch {
      // best-effort cleanup
    }
  }, []);

  // Refetch active services when screen mounts/user type changes.
  useEffect(() => {
    activeServices.refresh();
    if (userType === "driver") {
      driverRewards.refreshOffers();
    }
  }, [activeServices.refresh, userType, driverRewards.refreshOffers]);

  // Lightweight polling for driver rewards.
  useEffect(() => {
    if (userType !== "driver") return;

    const interval = setInterval(() => {
      driverRewards.refreshOffers();
    }, 25000);

    return () => clearInterval(interval);
  }, [userType, driverRewards.refreshOffers]);

  // Suppress stale incoming prompts when driver already has an active ride.
  useEffect(() => {
    if (userType !== "driver") return;
    const activeRideId = activeServices.ride?.id;
    if (!activeRideId) return;
    void Promise.allSettled([setHandledRide(activeRideId), setActiveRideId(activeRideId)]);
    clearDeliveredNotifications();
  }, [userType, activeServices.ride?.id, clearDeliveredNotifications]);

  // Keep background tracking alive for drivers during active services,
  // even if they are marked unavailable for new requests.
  useEffect(() => {
    if (userType !== "driver" || !hasDriverActiveService) return;

    let cancelled = false;
    (async () => {
      try {
        const status = await getDriverServiceStatus();
        if (!cancelled && !status.isRunning) {
          await startDriverService();
        }
      } catch (error) {
        console.warn(
          "[HomeScreen] Failed to enforce background tracking for active service:",
          error
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userType, hasDriverActiveService]);

  // Authoritative service policy enforcement after state hydration and on transitions:
  // keep running when available OR active service exists; otherwise stop.
  useEffect(() => {
    if (userType !== "driver") return;
    if (activeServices.loading || isTogglingAvailability) return;

    let cancelled = false;

    (async () => {
      try {
        const status = await getDriverServiceStatus();
        if (cancelled) return;

        const mustRun = hasDriverActiveService || isAvailable;
        if (mustRun && !status.isRunning) {
          await startDriverService();
        } else if (!mustRun && status.isRunning) {
          await stopDriverService();
        }
      } catch (error) {
        console.warn("[HomeScreen] Failed to enforce driver service policy:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userType,
    hasDriverActiveService,
    isAvailable,
    activeServices.loading,
    isTogglingAvailability,
  ]);

  // Re-check service policy when app returns to foreground.
  useEffect(() => {
    if (userType !== "driver") return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      if (activeServices.loading || isTogglingAvailability) return;

      (async () => {
        try {
          const status = await getDriverServiceStatus();
          const mustRun = hasDriverActiveService || isAvailable;
          if (mustRun && !status.isRunning) {
            await startDriverService();
          } else if (!mustRun && status.isRunning) {
            await stopDriverService();
          }
        } catch (error) {
          console.warn(
            "[HomeScreen] Failed to enforce service policy on foreground:",
            error
          );
        }
      })();
    });

    return () => {
      subscription.remove();
    };
  }, [
    userType,
    hasDriverActiveService,
    isAvailable,
    activeServices.loading,
    isTogglingAvailability,
  ]);

  // Detect ride completion and navigate to payment (for passengers)
  useEffect(() => {
    if (userType === "passenger") {
      const hadActiveRide =
        previousRideIdRef.current !== null &&
        previousRideIdRef.current !== undefined;
      const hasActiveRide = activeServices.ride !== null;
      const currentRideId = activeServices.ride?.id || null;

      // If we had an active ride but now don't, it might have completed
      // Check for actual null, not string 'null'
      if (
        hadActiveRide &&
        !hasActiveRide &&
        previousRideIdRef.current &&
        previousRideIdRef.current !== null &&
        previousRideIdRef.current !== "null" &&
        previousRideIdRef.current.trim() !== ""
      ) {
        const completedRideId = previousRideIdRef.current;

        // Prevent duplicate navigation attempts
        if (navigationToPaymentRef.current.has(completedRideId)) {
          // Already navigating or navigated for this ride
          return;
        }

        navigationToPaymentRef.current.add(completedRideId);

        // Check if payment is needed for the completed ride
        const checkAndNavigateToPayment = async () => {
          try {
            // Retry logic to fetch payment status
            let paymentResponse = null;
            for (let attempt = 0; attempt < 3; attempt++) {
              paymentResponse = await getRidePayment(completedRideId);
              if (paymentResponse.success && paymentResponse.data?.payment) {
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
              // Navigate to payment screen if payment is pending
              // Only navigate if not already on payment screen
              if (payment.status === "PENDING" && !payment.paymentMethod) {
                router.replace({
                  pathname: "/ride-payment",
                  params: { rideId: completedRideId },
                });
              }
            }
          } catch (error) {
            console.error("[HomeScreen] Error checking payment status:", error);
          }
        };

        // Small delay to ensure backend has created payment record
        setTimeout(checkAndNavigateToPayment, 1500);
      }

      // Update previous ride ID only if current ride ID is valid
      // Check for actual null and empty strings, not string 'null'
      if (
        currentRideId &&
        currentRideId !== null &&
        currentRideId !== "null" &&
        currentRideId.trim() !== ""
      ) {
        previousRideIdRef.current = currentRideId;
      } else if (!hasActiveRide) {
        // Only clear if there's truly no active ride
        previousRideIdRef.current = null;
      }
    }
  }, [activeServices.ride, userType]);

  // Auto-open passenger active car-pool OTP view when verification code becomes available.
  useEffect(() => {
    if (userType !== "passenger") return;
    const pool = activeServices.carPool;
    if (!pool) return;
    const currentMember = pool.members?.find((m) => m.passengerId === user?.id);
    if (!currentMember) return;
    if (currentMember.status !== "OTP_AVAILABLE" || !currentMember.verificationCode) return;

    const navKey = `${pool.id}:${currentMember.id}:${currentMember.verificationCode}`;
    if (carPoolOtpNavKeyRef.current === navKey) return;
    carPoolOtpNavKeyRef.current = navKey;

    try {
      router.replace("/(tabs)/active-car-pool");
    } catch (error) {
      console.error("[HomeScreen] Failed to auto-navigate to car-pool OTP:", error);
      toast.info(
        "OTP is ready. Open your active ride share screen to continue."
      );
    }
  }, [
    userType,
    user?.id,
    activeServices.carPool?.id,
    activeServices.carPool?.members,
    toast,
  ]);

  const fetchDriverStatus = useCallback(async () => {
    // Guard: Only drivers should call this function
    if (userType !== "driver") {
      console.warn(
        "[HomeScreen] fetchDriverStatus called for non-driver user, skipping"
      );
      return;
    }

    try {
      setIsLoadingAvailability(true);
      const response = await getDriverLocation();
      if (response.success && response.data) {
        const normalizedWalletBalance = Number(response.data.walletBalance ?? 0);
        const walletBalanceResponse = await getWalletBalance();
        const walletBalanceFromWalletApi =
          walletBalanceResponse.success && walletBalanceResponse.data
            ? Number(walletBalanceResponse.data.balance ?? normalizedWalletBalance)
            : normalizedWalletBalance;
        const walletIsNegative = walletBalanceFromWalletApi < 0;
        const walletEligible = !walletIsNegative;

        setWalletBalance(walletBalanceFromWalletApi);
        setIsWalletNegative(walletIsNegative);
        setCanGoOnline(walletEligible);
        setIsAvailable(response.data.isAvailable && walletEligible);
        setVerificationStatus(response.data.verificationStatus ?? null);

        // Sync foreground service state with availability
        // If driver is available, ensure service is running
        // If driver is unavailable, ensure service is stopped
        const serviceStatus = await getDriverServiceStatus();
        if (response.data.isAvailable && walletEligible && !serviceStatus.isRunning) {
          // Service should be running but isn't - try to start it
          const started = await startDriverService();
          if (!started) {
            console.warn(
              "[HomeScreen] Driver is online but background tracking is not running."
            );
          }
        } else if (
          (!response.data.isAvailable || !walletEligible) &&
          serviceStatus.isRunning &&
          !activeServices.loading &&
          !hasDriverActiveService
        ) {
          // Service is running but driver is unavailable - stop it
          await stopDriverService();
        }
      }
    } catch (error) {
      console.error("Error fetching driver status:", error);
    } finally {
      setIsLoadingAvailability(false);
    }
  }, [activeServices.loading, hasDriverActiveService, userType]);

  // Fetch driver availability status on mount (for drivers only)
  // Also ensure background service is stopped for passengers
  useEffect(() => {
    // Only fetch driver status if explicitly a driver (not null/undefined)
    if (userType === "driver") {
      fetchDriverStatus();
    }
    // Reset availability state and stop any running driver service if user is a passenger
    if (userType === "passenger") {
      setIsAvailable(false);
      setIsLoadingAvailability(false);
      setWalletBalance(0);
      setIsWalletNegative(false);
      setCanGoOnline(true);
      // Stop driver service if it's somehow running for a passenger
      stopDriverService().catch(() => {
        // Ignore errors - service might not be running
      });
    }
  }, [fetchDriverStatus, userType]);

  useFocusEffect(
    useCallback(() => {
      if (userType === "driver") {
        fetchDriverStatus();
      }
    }, [fetchDriverStatus, userType])
  );

  // Keep driver availability state synced with admin actions while this screen stays open.
  useEffect(() => {
    if (userType !== "driver") return;
    const interval = setInterval(() => {
      fetchDriverStatus();
    }, DRIVER_STATUS_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDriverStatus, userType]);

  useEffect(() => {
    if (userType !== "driver") return;

    const cleanup = addWalletUpdatedListener(() => {
      fetchDriverStatus();
    });

    return cleanup;
  }, [fetchDriverStatus, userType]);

  const handleAvailabilityToggle = async (value: boolean) => {
    const previousAvailability = isAvailable;
    if (value === previousAvailability) return;
    if (value && isWalletRestricted) {
      setIsAvailable(false);
      toast.error(DRIVER_WALLET_NEGATIVE_MESSAGE);
      return;
    }

    try {
      setIsTogglingAvailability(true);
      // Optimistic UI update so toggle feels instant.
      setIsAvailable(value);

      if (value) {
        // Going available - start foreground service first
        // Request permissions if needed
        const hasPermission = await requestBackgroundLocationPermissions();
        if (!hasPermission) {
          setIsAvailable(previousAvailability);
          toast.warning(
            Platform.OS === "ios"
              ? "Allow Always Location in iPhone Settings to stay online for ride requests in the background."
              : "UK Drive needs background location access to keep you available for rides while the app is minimized."
          );
          setIsTogglingAvailability(false);
          return;
        }

        // Start the foreground service
        const serviceStarted = await startDriverService();
        if (!serviceStarted) {
          setIsAvailable(previousAvailability);
          toast.error(
            "Failed to start location tracking.",
            Platform.OS === "ios"
              ? "Please verify Location is set to Always and Background App Refresh is enabled."
              : "Please ensure location services are enabled and try again."
          );
          setIsTogglingAvailability(false);
          return;
        }

        // Update driver coordinates on server immediately so passengers see them on the map
        try {
          const position = await getCurrentPositionWithAddress();
          await updateDriverLocation(position.latitude, position.longitude);
        } catch (e) {
          console.warn(
            "[Home] Could not send current location when going available:",
            e
          );
          // Continue anyway; foreground service will send location when it gets a fix
        }

        // Now update availability on server
        const response = await setAvailability(true);
        if (response.success && response.data) {
          setIsAvailable(response.data.isAvailable);
        } else {
          setIsAvailable(previousAvailability);
          // Server update failed - stop the service
          await stopDriverService();
          toast.error(
            response.error?.message ||
              response.message ||
              "Failed to update availability. Please try again."
          );
        }
      } else {
        // Going unavailable - update server first, then stop service
        const response = await setAvailability(false);
        if (response.success && response.data) {
          setIsAvailable(response.data.isAvailable);
          // Keep tracking running if driver still has an active service.
          if (!hasDriverActiveService && !activeServices.loading) {
            await stopDriverService();
          }
        } else {
          setIsAvailable(previousAvailability);
          toast.error(
            response.error?.message ||
              response.message ||
              "Failed to update availability. Please try again."
          );
        }
      }
    } catch (error: any) {
      setIsAvailable(previousAvailability);
      console.error("Error updating availability:", error);
      toast.error(
        error?.message || "Failed to update availability. Please try again."
      );
      // Try to stop service if something went wrong while going online
      if (value) {
        await stopDriverService();
      }
    } finally {
      setIsTogglingAvailability(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Refresh active services
    if (activeServices.refresh) {
      await activeServices.refresh();
    }
    // Refresh driver status if driver
    if (userType === "driver") {
      await fetchDriverStatus();
      await driverRewards.refreshOffers();
      if (driverLocation) {
        if (selectedMode === "ride") await fetchPendingRides(true);
        else if (selectedMode === "porter") await fetchPendingPorter(true);
      }
    } else if (userType === "passenger") {
      await refreshPassengerLocation();
      await refreshPassengerRecentLocations();
    }
    setRefreshTrigger((prev) => prev + 1);
    setRefreshing(false);
  };

  const handleServiceComplete = () => {
    // Refresh the active services when a service completes
    setRefreshTrigger((prev) => prev + 1);
    if (activeServices.refresh) {
      activeServices.refresh();
    }
  };

  const isDriver = userType === "driver";
  const isPassenger = userType === "passenger";
  const isDriverApproved = verificationStatus === "approved";
  const isWalletRestricted = isWalletNegative || !canGoOnline;

  const [selectedMode, setSelectedMode] = useState<
    "ride" | "porter" | "carPool"
  >("ride");
  const passengerMapRef = useRef<MapView | null>(null);
  const isPassengerMapRegionClamping = useRef(false);
  const passengerSheetSnapPoints = useMemo(() => ["50%", "84%"], []);
  const [passengerLocation, setPassengerLocation] =
    useState<LocationWithAddress | null>(null);
  const [passengerMapCenter, setPassengerMapCenter] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [passengerRecentLocations, setPassengerRecentLocations] = useState<
    RecentLocation[]
  >([]);
  const [passengerNearbyVehicles, setPassengerNearbyVehicles] = useState<
    NearbyVehicleMarker[]
  >([]);
  const passengerNearbyVehiclePrevRef = useRef<
    Map<string, { latitude: number; longitude: number }>
  >(new Map());
  const passengerMapRegion = useMemo(
    () => ({
      latitude:
        passengerLocation?.latitude ?? PASSENGER_MAP_DEFAULT_REGION.latitude,
      longitude:
        passengerLocation?.longitude ?? PASSENGER_MAP_DEFAULT_REGION.longitude,
      latitudeDelta: PASSENGER_MAP_DEFAULT_REGION.latitudeDelta,
      longitudeDelta: PASSENGER_MAP_DEFAULT_REGION.longitudeDelta,
    }),
    [passengerLocation?.latitude, passengerLocation?.longitude]
  );
  const passengerMinZoomLevel = useMemo(
    () =>
      getMinZoomLevelForDistanceKm(
        MAX_PASSENGER_MAP_ZOOM_OUT_KM,
        passengerMapRegion.latitude
      ),
    [passengerMapRegion.latitude]
  );
  const displayedPassengerRecentLocations = useMemo(
    () => passengerRecentLocations.slice(0, 2),
    [passengerRecentLocations]
  );
  const primarySearchLabel =
    selectedMode === "ride"
      ? "Where are you going?"
      : selectedMode === "porter"
        ? "Where do you want to send a parcel?"
        : "Where do you want to ride share?";

  // Driver: pending rides & porter state
  const [pendingRides, setPendingRides] = useState<RideResponse[]>([]);
  const [pendingPorter, setPendingPorter] = useState<PorterServiceResponse[]>(
    []
  );
  const [driverLocation, setDriverLocation] =
    useState<LocationWithAddress | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [acceptingRideId, setAcceptingRideId] = useState<string | null>(null);
  const [acceptingPorterId, setAcceptingPorterId] = useState<string | null>(
    null
  );
  const pendingRideRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingRideDispatchWaveRef = useRef<Map<string, string>>(new Map());
  const refreshPassengerLocation = useCallback(async () => {
    if (!isPassenger) return;
    try {
      const loc = await getCurrentPositionWithAddress();
      setPassengerLocation(loc);
      setPassengerMapCenter({
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
      passengerMapRef.current?.animateToRegion(
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: PASSENGER_MAP_DEFAULT_REGION.latitudeDelta,
          longitudeDelta: PASSENGER_MAP_DEFAULT_REGION.longitudeDelta,
        },
        450
      );
    } catch (error) {
      console.warn("[Home] Failed to fetch passenger location:", error);
    }
  }, [isPassenger]);
  const refreshPassengerRecentLocations = useCallback(async () => {
    if (!isPassenger) return;
    try {
      const locations = await getRecentLocations();
      setPassengerRecentLocations(locations);
    } catch (error) {
      console.warn("[Home] Failed to fetch recent locations:", error);
    }
  }, [isPassenger]);

  const handlePassengerMapRegionChangeComplete = useCallback((region: Region) => {
    if (isPassengerMapRegionClamping.current) {
      isPassengerMapRegionClamping.current = false;
      return;
    }

    const anchor = {
      latitude:
        passengerLocation?.latitude ?? PASSENGER_MAP_DEFAULT_REGION.latitude,
      longitude:
        passengerLocation?.longitude ?? PASSENGER_MAP_DEFAULT_REGION.longitude,
    };
    const clampedRegion = clampPassengerMapRegion(region, anchor);
    const hasExceededZoomOutLimit =
      Math.abs(clampedRegion.latitude - region.latitude) > 0.0001 ||
      Math.abs(clampedRegion.longitude - region.longitude) > 0.0001 ||
      Math.abs(clampedRegion.latitudeDelta - region.latitudeDelta) > 0.0001 ||
      Math.abs(clampedRegion.longitudeDelta - region.longitudeDelta) > 0.0001;

    if (hasExceededZoomOutLimit) {
      isPassengerMapRegionClamping.current = true;
      passengerMapRef.current?.animateToRegion(clampedRegion, 140);
    }

    setPassengerMapCenter((previous) => {
      if (
        previous &&
        Math.abs(previous.latitude - clampedRegion.latitude) < 0.0001 &&
        Math.abs(previous.longitude - clampedRegion.longitude) < 0.0001
      ) {
        return previous;
      }
      return {
        latitude: clampedRegion.latitude,
        longitude: clampedRegion.longitude,
      };
    });
  }, [passengerLocation?.latitude, passengerLocation?.longitude]);

  useEffect(() => {
    // `setMapBoundaries` is only available on the Android/Google Maps native view.
    // On iOS the app uses Apple Maps, so we rely on region clamping instead.
    if (Platform.OS !== "android" || !isPassenger || !passengerMapRef.current) {
      return;
    }
    const center = {
      latitude:
        passengerLocation?.latitude ?? PASSENGER_MAP_DEFAULT_REGION.latitude,
      longitude:
        passengerLocation?.longitude ?? PASSENGER_MAP_DEFAULT_REGION.longitude,
    };
    const boundsDistanceKm = MAX_PASSENGER_MAP_ZOOM_OUT_KM;
    const latitudeOffset = getLatitudeDeltaForDistanceKm(boundsDistanceKm);
    const longitudeOffset = getLongitudeDeltaForDistanceKm(
      boundsDistanceKm,
      center.latitude
    );
    const northEast = {
      latitude: center.latitude + latitudeOffset,
      longitude: center.longitude + longitudeOffset,
    };
    const southWest = {
      latitude: center.latitude - latitudeOffset,
      longitude: center.longitude - longitudeOffset,
    };

    const mapRef = passengerMapRef.current as unknown as {
      setMapBoundaries?: (
        northEast: { latitude: number; longitude: number },
        southWest: { latitude: number; longitude: number }
      ) => void;
    };

    mapRef.setMapBoundaries?.(northEast, southWest);
  }, [isPassenger, passengerLocation?.latitude, passengerLocation?.longitude]);

  useEffect(() => {
    if (!isPassenger) return;
    void refreshPassengerLocation();
    void refreshPassengerRecentLocations();
  }, [isPassenger, refreshPassengerLocation, refreshPassengerRecentLocations]);

  useFocusEffect(
    useCallback(() => {
      if (userType !== "passenger") return;
      void refreshPassengerLocation();
      void refreshPassengerRecentLocations();
    }, [
      userType,
      refreshPassengerLocation,
      refreshPassengerRecentLocations,
    ])
  );

  useEffect(() => {
    if (!isPassenger || selectedMode === "carPool") {
      passengerNearbyVehiclePrevRef.current = new Map();
      setPassengerNearbyVehicles([]);
      return;
    }

    const anchor =
      passengerMapCenter ??
      (passengerLocation
        ? {
            latitude: passengerLocation.latitude,
            longitude: passengerLocation.longitude,
          }
        : {
            latitude: passengerMapRegion.latitude,
            longitude: passengerMapRegion.longitude,
          });

    let cancelled = false;

    const fetchPassengerNearbyVehicles = async () => {
      try {
        const toNum = (
          value: number | string | null | undefined
        ): number => {
          if (typeof value === "number" && !Number.isNaN(value)) return value;
          if (typeof value === "string") return parseFloat(value);
          return Number.NaN;
        };

        const response =
          selectedMode === "porter"
            ? await getNearbyDriversForPorter(
                anchor.latitude,
                anchor.longitude,
                undefined,
                PASSENGER_NEARBY_VEHICLE_RADIUS_KM
              )
            : await getNearbyDrivers(
                anchor.latitude,
                anchor.longitude,
                undefined,
                PASSENGER_NEARBY_VEHICLE_RADIUS_KM
              );

        if (cancelled || !response.success) return;

        const extractDrivers = (res: {
          success?: boolean;
          data?: unknown;
        }): unknown[] => {
          if (!res?.success) return [];
          const payload = res.data as Record<string, unknown> | undefined;
          if (!payload) return [];
          const direct = payload.drivers;
          const nested = (payload.data as Record<string, unknown> | undefined)
            ?.drivers;
          const list = nested ?? direct ?? [];
          return Array.isArray(list) ? list : [];
        };

        const rawDrivers = extractDrivers(response);

        const previousPositions = passengerNearbyVehiclePrevRef.current;
        const nextPositions = new Map<
          string,
          { latitude: number; longitude: number }
        >();

        const markers: NearbyVehicleMarker[] = [];
        for (const rawDriver of rawDrivers) {
          const driver = rawDriver as {
            id?: unknown;
            latitude?: unknown;
            longitude?: unknown;
            lat?: unknown;
            lng?: unknown;
            location?: {
              latitude?: unknown;
              longitude?: unknown;
              lat?: unknown;
              lng?: unknown;
            } | null;
            coordinate?: {
              latitude?: unknown;
              longitude?: unknown;
              lat?: unknown;
              lng?: unknown;
            } | null;
            heading?: unknown;
            vehicleType?: unknown;
            vehicle_type?: unknown;
            vehicleSubcategorySlug?: unknown;
            vehicle_subcategory_slug?: unknown;
            vehicleCategorySlug?: unknown;
            vehicle_category_slug?: unknown;
            vehicleCategoryName?: unknown;
            vehicle_category_name?: unknown;
            vehicleSubcategory?: { slug?: unknown } | null;
            vehicle_subcategory?: { slug?: unknown } | null;
            vehicleCategory?: { slug?: unknown; name?: unknown } | null;
            vehicle_category?: { slug?: unknown; name?: unknown } | null;
            slug?: unknown;
          };

          const latCandidates = [
            driver.latitude,
            driver.lat,
            driver.location?.latitude,
            driver.location?.lat,
            driver.coordinate?.latitude,
            driver.coordinate?.lat,
          ];

          const lngCandidates = [
            driver.longitude,
            driver.lng,
            driver.location?.longitude,
            driver.location?.lng,
            driver.coordinate?.longitude,
            driver.coordinate?.lng,
          ];

          const latitude =
            latCandidates
              .map((value) =>
                toNum(value as number | string | null | undefined)
              )
              .find((value) => Number.isFinite(value)) ?? Number.NaN;
          const longitude =
            lngCandidates
              .map((value) =>
                toNum(value as number | string | null | undefined)
              )
              .find((value) => Number.isFinite(value)) ?? Number.NaN;

          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            continue;
          }

          const idRaw = driver.id;
          const id =
            typeof idRaw === "string" && idRaw.trim().length > 0
              ? idRaw
              : `${latitude}:${longitude}`;

          const previous = previousPositions.get(id);
          const rawHeading = toNum(
            driver.heading as number | string | null | undefined
          );
          const heading =
            Number.isFinite(rawHeading) && rawHeading >= 0
              ? rawHeading
              : previous
              ? calculateHeadingBetweenCoordinates(previous, {
                  latitude,
                  longitude,
                })
              : null;

          nextPositions.set(id, { latitude, longitude });

          const resolvedVehicleType = [
            driver.vehicleCategorySlug,
            driver.vehicle_category_slug,
            driver.vehicleCategory?.slug,
            driver.vehicle_category?.slug,
            driver.vehicleCategoryName,
            driver.vehicle_category_name,
            driver.vehicleCategory?.name,
            driver.vehicle_category?.name,
            driver.vehicleType,
            driver.vehicle_type,
            driver.vehicleSubcategorySlug,
            driver.vehicle_subcategory_slug,
            driver.vehicleSubcategory?.slug,
            driver.vehicle_subcategory?.slug,
            driver.slug,
          ].find(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          );

          markers.push({
            id,
            latitude,
            longitude,
            heading,
            vehicleType: resolvedVehicleType ?? null,
          });
        }

        passengerNearbyVehiclePrevRef.current = nextPositions;
        setPassengerNearbyVehicles(markers);
      } catch (error) {
        if (!cancelled) {
          console.warn("[Home] Failed to fetch nearby vehicles:", error);
        }
      }
    };

    void fetchPassengerNearbyVehicles();
    const interval = setInterval(
      fetchPassengerNearbyVehicles,
      PASSENGER_NEARBY_VEHICLE_POLL_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    isPassenger,
    selectedMode,
    passengerLocation?.latitude,
    passengerLocation?.longitude,
    passengerMapCenter?.latitude,
    passengerMapCenter?.longitude,
    passengerMapRegion.latitude,
    passengerMapRegion.longitude,
  ]);

  const clearPendingRideRefreshTimeout = useCallback(() => {
    if (pendingRideRefreshTimeoutRef.current) {
      clearTimeout(pendingRideRefreshTimeoutRef.current);
      pendingRideRefreshTimeoutRef.current = null;
    }
  }, []);

  const presentIncomingRideFromPending = useCallback(
    async (ride: RideResponse) => {
      const dispatchWaveKey = getRideDispatchWaveKey(ride);
      const gate = await shouldIgnoreIncomingRideNotification({
        rideId: ride.id,
        sentAt: dispatchWaveKey,
        maxAgeMs: Number.MAX_SAFE_INTEGER,
      });
      if (gate.ignore) return;
      if (isIncomingRideRecentlyShown(ride.id, dispatchWaveKey)) return;

      const queued = await setPendingIncomingRideId(ride.id, dispatchWaveKey, {
        pickupLocation: ride.pickupLocation,
        destination: ride.destination,
        fare: ride.fare.toFixed(2),
        distance: ride.distance != null ? String(Number(ride.distance)) : undefined,
        sentAt: dispatchWaveKey,
      });
      if (!queued.shouldPresentNow || !queued.request) return;

      router.replace({
        pathname: "/ride-incoming",
        params: toIncomingRideRouteParams(queued.request),
      } as never);
    },
    []
  );

  const fetchPendingRides = useCallback(async (silent = false) => {
    if (!driverLocation || hasDriverActiveService) {
      pendingRideDispatchWaveRef.current = new Map();
      if (hasDriverActiveService) {
        setPendingRides([]);
      }
      return;
    }
    if (!silent) setLoadingRequests(true);
    try {
      const res = await getPendingRides(
        driverLocation.latitude,
        driverLocation.longitude
      );
      if (res.success && res.data) {
        const rides = res.data.rides;
        const previousDispatchWaves = pendingRideDispatchWaveRef.current;
        const nextDispatchWaves = new Map<string, string>();
        const candidateRidesToPresent: RideResponse[] = [];

        for (const ride of rides) {
          const dispatchWaveKey = getRideDispatchWaveKey(ride);
          nextDispatchWaves.set(ride.id, dispatchWaveKey);

          if (
            silent &&
            previousDispatchWaves.get(ride.id) !== dispatchWaveKey
          ) {
            candidateRidesToPresent.push(ride);
          }
        }

        pendingRideDispatchWaveRef.current = nextDispatchWaves;
        setPendingRides(rides);

        if (candidateRidesToPresent.length > 0) {
          for (const candidateRide of candidateRidesToPresent) {
            await presentIncomingRideFromPending(candidateRide);
          }
        }
      }
    } catch (e) {
      if (!silent) console.error("[Home] fetchPendingRides error:", e);
    } finally {
      if (!silent) setLoadingRequests(false);
    }
  }, [driverLocation, hasDriverActiveService, presentIncomingRideFromPending]);

  const fetchPendingPorter = useCallback(async (silent = false) => {
    if (!driverLocation || hasDriverActiveService) {
      if (hasDriverActiveService) {
        setPendingPorter([]);
      }
      return;
    }
    if (!silent) setLoadingRequests(true);
    try {
      const res = await getPendingPorterServices(
        driverLocation.latitude,
        driverLocation.longitude
      );
      if (res.success && res.data) setPendingPorter(res.data.services);
    } catch (e) {
      if (!silent) console.error("[Home] fetchPendingPorter error:", e);
    } finally {
      if (!silent) setLoadingRequests(false);
    }
  }, [driverLocation, hasDriverActiveService]);

  const schedulePendingRideRefresh = useCallback(
    (delayMs = PENDING_RIDE_REFRESH_DEBOUNCE_MS) => {
      if (
        userType !== "driver" ||
        selectedMode !== "ride" ||
        !driverLocation ||
        hasDriverActiveService
      ) {
        clearPendingRideRefreshTimeout();
        return;
      }

      clearPendingRideRefreshTimeout();
      pendingRideRefreshTimeoutRef.current = setTimeout(() => {
        pendingRideRefreshTimeoutRef.current = null;
        void fetchPendingRides(true);
      }, delayMs);
    },
    [
      clearPendingRideRefreshTimeout,
      driverLocation,
      fetchPendingRides,
      hasDriverActiveService,
      selectedMode,
      userType,
    ]
  );

  // Fetch driver location once, then load pending rides/porter
  useEffect(() => {
    if (userType !== "driver") return;
    (async () => {
      try {
        const loc = await getCurrentPositionWithAddress();
        setDriverLocation(loc);
      } catch (e) {
        console.error("[Home] Failed to get driver location:", e);
      }
    })();
  }, [userType]);

  // Load pending data whenever tab changes or location is available
  useEffect(() => {
    if (userType !== "driver" || !driverLocation) return;
    if (selectedMode === "ride") void fetchPendingRides();
    else if (selectedMode === "porter") void fetchPendingPorter();
  }, [driverLocation, fetchPendingPorter, fetchPendingRides, selectedMode, userType]);

  // Auto-refresh pending requests every 10s
  useEffect(() => {
    if (userType !== "driver" || !driverLocation) return;
    const interval = setInterval(() => {
      if (selectedMode === "ride") void fetchPendingRides(true);
      else if (selectedMode === "porter") void fetchPendingPorter(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [driverLocation, fetchPendingPorter, fetchPendingRides, selectedMode, userType]);

  useEffect(() => {
    if (userType !== "driver" || selectedMode !== "ride") return;

    const cleanupServiceEvents = addServiceEventListener(() => {
      schedulePendingRideRefresh(0);
    });
    const cleanupNotificationEvents = addNotificationEventListener(() => {
      schedulePendingRideRefresh(0);
    });

    return () => {
      cleanupServiceEvents();
      cleanupNotificationEvents();
    };
  }, [schedulePendingRideRefresh, selectedMode, userType]);

  useEffect(() => {
    if (
      userType !== "driver" ||
      selectedMode !== "ride" ||
      !driverLocation ||
      hasDriverActiveService
    ) {
      return;
    }

    const channel = subscribeToRideAvailability((update) => {
      if (!shouldRefreshPendingRideAvailability(update)) return;
      schedulePendingRideRefresh();
    });

    return () => {
      void unsubscribeChannel(channel);
    };
  }, [
    driverLocation,
    hasDriverActiveService,
    schedulePendingRideRefresh,
    selectedMode,
    userType,
  ]);

  useEffect(() => clearPendingRideRefreshTimeout, [clearPendingRideRefreshTimeout]);

  const handleAcceptRide = async (rideId: string) => {
    setAcceptingRideId(rideId);
    try {
      const res = await acceptRide(rideId);
      if (res.success && res.data) {
        await setHandledRide(rideId);
        await setActiveRideId(rideId);
        clearDeliveredNotifications();
        dispatchServiceCreated();
        router.replace("/(tabs)/active-ride");
      } else {
        const msg = getApiErrorMessage(res.error, "Failed to accept ride");
        if (isRideNoLongerAvailable(res.error)) {
          await setHandledRide(rideId);
          clearDeliveredNotifications();
          toast.info(msg || "Ride is no longer available.");
          await fetchPendingRides(true);
          return;
        }
        toast.error(msg);
        await fetchPendingRides(true);
      }
    } catch (error) {
      if (isRideNoLongerAvailable(error)) {
        await setHandledRide(rideId);
        clearDeliveredNotifications();
        toast.info(getApiErrorMessage(error, "Ride is no longer available."));
        await fetchPendingRides(true);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    } finally {
      setAcceptingRideId(null);
    }
  };

  const handleAcceptPorter = async (porterId: string) => {
    setAcceptingPorterId(porterId);
    try {
      const res = await acceptPorterService(porterId);
      if (res.success && res.data) {
        dispatchServiceCreated();
        router.replace("/(tabs)/active-porter");
      } else {
        const msg =
          typeof res.error === "object" &&
          res.error !== null &&
          "message" in res.error
            ? String((res.error as { message: string }).message)
            : "Failed to accept Parcel service";
        toast.error(msg);
        fetchPendingPorter();
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setAcceptingPorterId(null);
    }
  };

  type VehicleSuggestion = {
    id: string;
    label: string;
    badge?: string;
    image?: ImageSourcePropType;
  };

  const VEHICLE_SUGGESTIONS: VehicleSuggestion[] = [
    { id: "Car", label: "Car", image: sedanImage },
    { id: "auto", label: "Auto", image: autoImage },
    { id: "bike", label: "Bike", image: bikeImage },
    { id: "SUV", label: "SUV", image: suvImage },
  ];

  const handlePrimarySearchPress = () => {
    if (selectedMode === "ride") {
      router.push("/(tabs)/create-ride");
    } else if (selectedMode === "porter") {
      router.push("/(tabs)/create-porter");
    } else {
      router.push("/(tabs)/browse-car-pools");
    }
  };

  const handleRecentLocationPress = (location: RecentLocation) => {
    if (selectedMode === "ride") {
      router.push({
        pathname: "/(tabs)/create-ride",
        params: {
          destinationLat: String(location.latitude),
          destinationLng: String(location.longitude),
          destinationAddress: location.address ?? "",
          prefillTs: String(Date.now()),
        },
      });
      return;
    }
    handlePrimarySearchPress();
  };

  const handlePassengerModePress = (mode: "ride" | "porter" | "carPool") => {
    setSelectedMode(mode);
    if (mode === "ride") return;
    if (mode === "porter") {
      router.push("/(tabs)/create-porter");
      return;
    }
    router.push("/(tabs)/browse-car-pools");
  };

  // Determine which active services exist
  const hasActiveServices = activeServices.hasAny;
  const activeServicesList = [
    activeServices.ride && {
      type: "ride" as const,
      service: activeServices.ride,
    },
    activeServices.porter && {
      type: "porter" as const,
      service: activeServices.porter,
    },
    activeServices.carPool && {
      type: "carpool" as const,
      service: activeServices.carPool,
    },
  ].filter(
    (item): item is { type: "ride" | "porter" | "carpool"; service: any } =>
      Boolean(item)
  );
  const rewardOffersPreview = driverRewards.offers.slice(0, 3);
  const runtimeGoogleMapsApiKey = (
    Constants.expoConfig?.extra?.googleMapsApiKey ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
  const hasRuntimeGoogleMapsApiKey =
    runtimeGoogleMapsApiKey.length > 0 &&
    runtimeGoogleMapsApiKey !== "SET_IN_EAS_ENV";
  const canRenderAndroidMap =
    Platform.OS !== "android" || hasRuntimeGoogleMapsApiKey;

  // Passenger home - map-first layout with bottom sheet search/action panel
  if (isPassenger) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          {canRenderAndroidMap ? (
            <MapView
              ref={passengerMapRef}
              provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
              customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
              initialRegion={passengerMapRegion}
              onRegionChangeComplete={handlePassengerMapRegionChangeComplete}
              minZoomLevel={passengerMinZoomLevel}
              showsUserLocation={false}
              showsCompass={false}
              showsMyLocationButton={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: passengerMapRegion.latitude,
                  longitude: passengerMapRegion.longitude,
                }}
              >
                <Ionicons name="location" size={30} color={BRAND_ORANGE} />
              </Marker>
              {passengerNearbyVehicles.map((vehicle) => (
                <DriverMarker
                  key={`home-nearby-${vehicle.id}`}
                  coordinate={{
                    latitude: vehicle.latitude,
                    longitude: vehicle.longitude,
                  }}
                  title="Nearby vehicle"
                  vehicleType={vehicle.vehicleType ?? undefined}
                  heading={vehicle.heading ?? null}
                />
              ))}
            </MapView>
          ) : (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: "#F3F4F6",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 24,
              }}
            >
              <Ionicons name="map-outline" size={34} color="#9CA3AF" />
              <Text
                style={{
                  marginTop: 10,
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#374151",
                  textAlign: "center",
                }}
              >
                Google Maps key missing. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild Android.
              </Text>
            </View>
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => void refreshPassengerLocation()}
            style={{
              position: "absolute",
              top: insets.top + 12,
              right: 16,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.14,
              shadowRadius: 5,
              elevation: 4,
            }}
          >
            <Ionicons name="locate-outline" size={22} color={BRAND_ORANGE} />
          </TouchableOpacity>

          <BottomSheet

            keyboardBehavior="interactive"

            keyboardBlurBehavior="restore"

            enableBlurKeyboardOnGesture={true}

            android_keyboardInputMode="adjustResize"
            index={0}
            snapPoints={passengerSheetSnapPoints}
            enablePanDownToClose={false}
            enableDynamicSizing={false}
            enableOverDrag={false}
            topInset={insets.top}
            bottomInset={0}
            handleIndicatorStyle={{
              backgroundColor: "#D1D5DB",
              width: 44,
              height: 4,
            }}
            backgroundStyle={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            <BottomSheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 24 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing || activeServices.loading}
                  onRefresh={onRefresh}
                />
              }
            >
              <View className="px-5 pt-2">
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: "#FFF4ED",
                    borderRadius: 14,
                    padding: 4,
                    marginBottom: 12,
                  }}
                >
                  {(["ride", "porter", "carPool"] as const).map((mode) => (
                    <TouchableOpacity
                      key={mode}
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: "center",
                        backgroundColor:
                          selectedMode === mode ? BRAND_ORANGE : "transparent",
                      }}
                      activeOpacity={0.85}
                      onPress={() => handlePassengerModePress(mode)}
                    >
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 13,
                          color: selectedMode === mode ? "#FFFFFF" : "#6B7280",
                        }}
                      >
                        {mode === "ride"
                          ? "Ride"
                          : mode === "porter"
                            ? "Parcel"
                            : "Ride Share"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handlePrimarySearchPress}
                  style={{
                    backgroundColor: BRAND_ORANGE,
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#EA580C",
                  }}
                >
                  <Ionicons name="search" size={18} color="#FFFFFF" />
                  <Text
                    style={{
                      flex: 1,
                      marginLeft: 10,
                      color: "#FFFFFF",
                      fontFamily: "Figtree_700Bold",
                      fontSize: 15,
                    }}
                    numberOfLines={1}
                  >
                    {primarySearchLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <View className="px-5 mt-4">
                <View className="bg-white rounded-2xl px-4 py-3 border border-gray-100">
                  <View className="flex-row items-center mb-3">
                    <MapPinCheckInside size={16} />
                    <Text className="text-sm text-gray-700 font-medium ml-1">
                      Recent
                    </Text>
                  </View>

                  {displayedPassengerRecentLocations.length > 0 ? (
                    displayedPassengerRecentLocations.map((location, index) => (
                      <TouchableOpacity
                        key={location.id}
                        activeOpacity={0.8}
                        onPress={() => handleRecentLocationPress(location)}
                        className="flex-row items-center"
                        style={{
                          paddingVertical: 10,
                          borderBottomWidth:
                            index < displayedPassengerRecentLocations.length - 1
                              ? 1
                              : 0,
                          borderBottomColor: "#F3F4F6",
                        }}
                      >
                        <View className="flex-1">
                          <Text
                            className="text-sm text-gray-900"
                            numberOfLines={1}
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              color: BRAND_ORANGE,
                            }}
                          >
                            {location.address || "Pinned Location"}
                          </Text>
                          <Text
                            className="text-xs text-gray-500"
                            numberOfLines={1}
                            style={{ fontFamily: "Figtree_400Regular" }}
                          >
                            Recent location
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={handlePrimarySearchPress}
                      className="flex-row items-center"
                    >
                      <View className="flex-1">
                        <Text
                          className="text-sm text-gray-900"
                          style={{
                            fontFamily: "Figtree_600SemiBold",
                            color: BRAND_ORANGE,
                          }}
                        >
                          No recent locations yet
                        </Text>
                        <Text
                          className="text-xs text-gray-500"
                          numberOfLines={1}
                          style={{ fontFamily: "Figtree_400Regular" }}
                        >
                          Start a ride to build your recent list
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View className="px-4 mt-5">
                <Text className="text-sm text-gray-900 font-semibold mb-3">
                  Suggestions
                </Text>
                <View className="flex-row flex-wrap justify-between">
                  {VEHICLE_SUGGESTIONS.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={handlePrimarySearchPress}
                      style={{ flexBasis: "22%", maxWidth: "22%" }}
                      className="mb-3 rounded-xl bg-white py-2 border border-gray-100"
                    >
                      <View className="items-center">
                        <View className="w-full h-16 items-center justify-center">
                          {item.image ? (
                            <Image
                              source={item.image}
                              style={{
                                width: "130%",
                                height: "130%",
                                resizeMode: "contain",
                              }}
                            />
                          ) : (
                            <Ionicons name="car" size={26} color={BRAND_ORANGE} />
                          )}
                        </View>
                        <Text
                          className="text-xs font-medium text-gray-900 mt-1 text-center"
                          style={{ fontFamily: "Figtree_600SemiBold" }}
                        >
                          {item.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {hasActiveServices && (
                <View className="px-5 mt-5">
                  <Text className="text-sm text-gray-700 font-semibold mb-3">
                    Active services
                  </Text>
                  <View className="space-y-3">
                    {activeServicesList.length === 1 ? (
                      <ActiveServiceCard
                        serviceType={activeServicesList[0].type}
                        service={activeServicesList[0].service}
                        compact={false}
                      />
                    ) : (
                      <>
                        {activeServicesList.map((item) => (
                          <ActiveServiceCard
                            key={`${item.type}-${item.service.id}`}
                            serviceType={item.type}
                            service={item.service}
                            compact={true}
                          />
                        ))}
                      </>
                    )}
                  </View>
                </View>
              )}
            </BottomSheetScrollView>
          </BottomSheet>
        </View>
      </View>
    );
  }

  // Driver dashboard - mirrors passenger home layout with driver brand purple
  if (activeServices.loading) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{ flex: 1, backgroundColor: BRAND_PURPLE }}
      >
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Loading message="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: BRAND_PURPLE }}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl
            refreshing={refreshing || activeServices.loading}
            onRefresh={onRefresh}
          />
        }
      >
        {/* Purple header with availability only */}
        <View
          style={{
            backgroundColor: BRAND_PURPLE,
            paddingTop: 14,
            paddingBottom: 14,
            paddingHorizontal: 20,
          }}
        >
          {/* Availability toggle */}
          {isDriverApproved && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "rgba(255,255,255,0.15)",
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 16,
                    color: "#FFFFFF",
                    marginRight: 10,
                  }}
                >
                  {isAvailable && !isWalletRestricted ? "Online" : "Offline"}
                </Text>
                {(isTogglingAvailability || isLoadingAvailability) && (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                )}
              </View>
              <Switch
                value={isAvailable && !isWalletRestricted}
                onValueChange={handleAvailabilityToggle}
                disabled={
                  isTogglingAvailability ||
                  isLoadingAvailability ||
                  isWalletRestricted
                }
                trackColor={{
                  false: "rgba(255,255,255,0.3)",
                  true: "#4ADE80",
                }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="rgba(255,255,255,0.3)"
              />
            </View>
          )}

        </View>

        {isDriverApproved && isWalletRestricted && (
          <View className="px-5 mt-4">
            <View
              style={{
                backgroundColor: "#FEE2E2",
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor: "#FCA5A5",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 14,
                  color: "#991B1B",
                }}
              >
                {DRIVER_WALLET_NEGATIVE_MESSAGE}
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 12,
                  color: "#B91C1C",
                  marginTop: 8,
                }}
              >
                Current wallet balance: {walletBalance.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Verification status banner (if not approved) */}
        {!isDriverApproved && (
          <View className="px-5 mt-4">
            <View
              style={{
                backgroundColor:
                  verificationStatus === "rejected" ? "#FEF2F2" : "#FFFBEB",
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor:
                  verificationStatus === "rejected" ? "#FECACA" : "#FDE68A",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor:
                      verificationStatus === "rejected" ? "#EF4444" : "#F59E0B",
                    marginRight: 10,
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 15,
                    color: "#111827",
                  }}
                >
                  {verificationStatus === "rejected"
                    ? "Verification Rejected"
                    : "Verification Pending"}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#6B7280",
                  marginLeft: 20,
                }}
              >
                {verificationStatus === "rejected"
                  ? "Your documents were rejected. Please re-upload the required documents to get approved."
                  : "Your documents are under review. You will be able to go online and accept rides once approved by an admin."}
              </Text>
              {verificationStatus === "rejected" && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push("/(tabs)/driver-documents")}
                  style={{
                    marginTop: 12,
                    marginLeft: 20,
                    alignSelf: "flex-start",
                    backgroundColor: "#FFFFFF",
                    borderColor: "#FCA5A5",
                    borderWidth: 1,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      color: "#B42318",
                      fontSize: 12,
                    }}
                  >
                    Re-upload Documents
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {isDriverApproved && (
          <View className="px-5 mt-4">
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#FFFFFF",
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#F3F4F6",
                padding: 4,
              }}
            >
              {(["ride", "porter", "carPool"] as const).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 9,
                    borderRadius: 10,
                    backgroundColor:
                      selectedMode === mode ? "#EDE4FB" : "transparent",
                  }}
                  activeOpacity={0.8}
                  onPress={() => setSelectedMode(mode)}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 13,
                      color: selectedMode === mode ? BRAND_PURPLE : "#6B7280",
                    }}
                  >
                    {mode === "ride"
                      ? "Rides"
                      : mode === "porter"
                      ? "Parcel"
                      : "Ride Share"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Active Reward Offers (Driver only) */}
        <View className="px-5 mt-4">
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <Text
              style={{ fontFamily: "Figtree_600SemiBold" }}
              className="text-sm text-gray-700"
            >
              Active Reward Offers
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push("/driver-rewards-history")}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  color: BRAND_PURPLE,
                  fontSize: 13,
                }}
              >
                View all
              </Text>
            </TouchableOpacity>
          </View>

          {driverRewards.offersLoading ? (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#F3F4F6",
                padding: 16,
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="small" color={BRAND_PURPLE} />
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  color: "#6B7280",
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                Loading reward offers...
              </Text>
            </View>
          ) : driverRewards.offersError ? (
            <View
              style={{
                backgroundColor: "#FEF2F2",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#FECACA",
                padding: 14,
              }}
            >
              <Text
                style={{
                  color: "#991B1B",
                  fontFamily: "Figtree_400Regular",
                  fontSize: 12,
                }}
              >
                {driverRewards.offersError}
              </Text>
            </View>
          ) : rewardOffersPreview.length === 0 ? (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#F3F4F6",
                padding: 16,
              }}
            >
              <Text
                style={{
                  color: "#6B7280",
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                }}
              >
                No active reward offers available right now.
              </Text>
            </View>
          ) : (
            rewardOffersPreview.map((offer) => {
              const progressPercent = offer.progress.progressPercent;
              const progressWidth = `${Math.max(
                0,
                Math.min(100, progressPercent ?? 0)
              )}%`;

              const progressText =
                offer.progress.unit === "event"
                  ? offer.trackingNote || "Auto-tracked"
                  : offer.progress.minimumRating != null
                  ? `${(offer.progress.currentValue ?? 0).toFixed(1)} / ${offer.progress.minimumRating.toFixed(1)}`
                  : offer.progress.targetValue != null
                  ? `${offer.progress.currentValue ?? 0} / ${offer.progress.targetValue}`
                  : `${offer.progress.currentValue ?? 0}`;

              const badgeText = offer.progress.alreadyRewardedInPeriod
                ? "Earned"
                : offer.progress.isEarnableNow
                ? "Ready"
                : "In Progress";
              const badgeBg = offer.progress.alreadyRewardedInPeriod
                ? "#DCFCE7"
                : offer.progress.isEarnableNow
                ? "#EDE4FB"
                : "#F3F4F6";
              const badgeColor = offer.progress.alreadyRewardedInPeriod
                ? "#166534"
                : offer.progress.isEarnableNow
                ? BRAND_PURPLE
                : "#6B7280";

              return (
                <View
                  key={offer.missionId}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#F3F4F6",
                    padding: 14,
                    marginBottom: 10,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                    elevation: 1,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 14,
                          color: "#111827",
                        }}
                        numberOfLines={1}
                      >
                        {offer.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 12,
                          color: "#6B7280",
                          marginTop: 2,
                        }}
                        numberOfLines={1}
                      >
                        {missionTypeLabel(offer.type)} {BULLET} {periodLabel(offer.timePeriod)}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_700Bold",
                          color: BRAND_PURPLE,
                          fontSize: 15,
                        }}
                      >
                        {RUPEE}{offer.rewardAmount.toFixed(0)}
                      </Text>
                      <View
                        style={{
                          marginTop: 4,
                          backgroundColor: badgeBg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text
                          style={{
                            color: badgeColor,
                            fontFamily: "Figtree_600SemiBold",
                            fontSize: 10,
                            textTransform: "uppercase",
                          }}
                        >
                          {badgeText}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 12,
                        color: "#4B5563",
                        marginBottom: 6,
                      }}
                    >
                      {progressText}
                    </Text>

                    {progressPercent == null ? (
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 11,
                          color: "#6B7280",
                        }}
                      >
                        {offer.trackingNote || "Auto-tracked"}
                      </Text>
                    ) : (
                      <View
                        style={{
                          height: 6,
                          backgroundColor: "#E5E7EB",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            width: progressWidth,
                            height: "100%",
                            borderRadius: 999,
                            backgroundColor: BRAND_PURPLE,
                          }}
                        />
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Tab-specific content - inline lists */}
        {selectedMode === "ride" && (
          <View className="px-4 mt-3">
            {loadingRequests && pendingRides.length === 0 ? (
              <View
                style={{
                  paddingVertical: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator size="small" color={BRAND_PURPLE} />
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#9CA3AF",
                    marginTop: 10,
                  }}
                >
                  Finding nearby rides...
                </Text>
              </View>
            ) : pendingRides.length === 0 ? (
              <NoRidesCard message="No ride requests nearby. Pull down to refresh." />
            ) : (
              pendingRides.map((ride) => (
                <View key={ride.id} style={{ marginBottom: 8 }}>
                  <RideStatusCardCompact
                    ride={ride}
                    onPress={() =>
                      showAlert(
                        "Ride Details",
                        `Pickup: ${ride.pickupLocation}\nDrop-off: ${
                          ride.destination
                        }\nFare: ${RUPEE}${ride.fare.toFixed(2)}`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Accept",
                            onPress: () => handleAcceptRide(ride.id),
                          },
                        ]
                      )
                    }
                    onAccept={() => handleAcceptRide(ride.id)}
                    acceptLoading={acceptingRideId === ride.id}
                  />
                </View>
              ))
            )}
          </View>
        )}

        {selectedMode === "porter" && (
          <View className="px-4 mt-3">
            {loadingRequests && pendingPorter.length === 0 ? (
              <View
                style={{
                  paddingVertical: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator size="small" color={BRAND_PURPLE} />
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#9CA3AF",
                    marginTop: 10,
                  }}
                >
                  Finding nearby Parcel requests...
                </Text>
              </View>
            ) : pendingPorter.length === 0 ? (
              <NoPorterServicesCard message="No Parcel requests nearby. Pull down to refresh." />
            ) : (
              pendingPorter.map((porter) => (
                <View key={porter.id} style={{ marginBottom: 8 }}>
                  <PorterStatusCardCompact
                    porterService={porter}
                    onPress={() =>
                      showAlert(
                        "Parcel Details",
                        `Pickup: ${porter.pickupLocation}\nDelivery: ${
                          porter.deliveryLocation
                        }\nFare: ${RUPEE}${porter.fare.toFixed(2)}`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Accept",
                            onPress: () => handleAcceptPorter(porter.id),
                          },
                        ]
                      )
                    }
                    onAccept={() => handleAcceptPorter(porter.id)}
                    acceptLoading={acceptingPorterId === porter.id}
                  />
                </View>
              ))
            )}
          </View>
        )}

        {selectedMode === "carPool" && (
          <View className="px-5 mt-3">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push("/(tabs)/create-car-pool")}
              className="flex-row items-center bg-white rounded-2xl px-4 py-3 shadow-md border border-gray-100 mb-3"
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#EDE4FB" }}
              >
                <Ionicons name="add-circle" size={18} color={BRAND_PURPLE} />
              </View>
              <View className="flex-1">
                <Text
                  style={{ fontFamily: "Figtree_600SemiBold" }}
                  className="text-base text-gray-900"
                >
                  Create Ride Share
                </Text>
                <Text
                  style={{ fontFamily: "Figtree_400Regular" }}
                  className="text-xs text-gray-500"
                >
                  Start a shared ride route
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push("/(tabs)/manage-car-pool")}
              className="flex-row items-center bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-100"
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: "#EDE4FB" }}
              >
                <Ionicons name="people" size={18} color={BRAND_PURPLE} />
              </View>
              <View className="flex-1">
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    color: BRAND_PURPLE,
                  }}
                  className="text-sm"
                >
                  Manage Ride Share
                </Text>
                <Text
                  className="text-xs text-gray-500"
                  style={{ fontFamily: "Figtree_400Regular" }}
                >
                  View and manage your active ride shares
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Active services */}
        {hasActiveServices && (
          <View className="px-5 mt-5">
            <Text
              style={{ fontFamily: "Figtree_600SemiBold" }}
              className="text-sm text-gray-700 mb-3"
            >
              Active Services
            </Text>
            <View className="space-y-3">
              {activeServicesList.length === 1 ? (
                <ActiveServiceCard
                  serviceType={activeServicesList[0].type}
                  service={activeServicesList[0].service}
                  compact={false}
                />
              ) : (
                <>
                  {activeServicesList.map((item) => (
                    <ActiveServiceCard
                      key={`${item.type}-${item.service.id}`}
                      serviceType={item.type}
                      service={item.service}
                      compact={true}
                    />
                  ))}
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
