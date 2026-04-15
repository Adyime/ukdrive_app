/**
 * Active Porter Service Screen
 * Uber-style full-screen map + draggable bottom sheet
 * Uses Supabase Realtime for driver location and service status updates
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, Dimensions, InteractionManager, StyleSheet, Platform, ActivityIndicator, Image, Linking, Modal } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  Search,
  Car,
  CheckCircle2,
  Navigation,
  Package,
  XCircle,
  Phone,
  MessageCircle,
  Box,
  Scale,
  Ruler,
  AlertTriangle,
  HelpCircle,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { ChatModal } from "@/components/chat-modal";
import { useToast } from "@/components/ui/toast";
import { useCall } from "@/hooks/use-call";
import { canUseCommunicationPorter } from "@/lib/utils/communication";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import { VerificationCodeInput } from "@/components/verification-code-input";
import { useWatchLocation } from "@/lib/services/location";
import { useEnsureDriverTrackingContinuity } from "@/lib/services/driver-tracking-continuity";
import { useActivePorterTracking } from "@/hooks/use-realtime";
import { DriverMarker, PickupMarker, DestinationMarker } from "@/components/map-markers";
import {
  getActivePorterService,
  getPorterPayment,
  updatePorterStatus,
  cancelPorterService,
  type PorterServiceResponse,
  type PorterPayment,
  PorterStatus,
  isPorterServiceActive,
  canCustomerCancel,
  canDriverCancel,
  getNextDriverStatus,
  getDriverActionLabel,
  formatFare,
  formatPackageType,
  formatWeight,
} from "@/lib/api/porter";
import { getRoute } from "@/lib/services/directions";
import {
  dispatchServiceCompleted,
  addServiceEventListener,
} from "@/lib/events";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const REFRESH_INTERVAL = 10000;
const LOCATION_UPDATE_INTERVAL = 10000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const ROUTE_UPDATE_DEBOUNCE_MS = 10000;
const SUPPORT_PHONE_NUMBER = "09520559469";
const PASSENGER_CANCEL_REASONS = [
  "Driver is taking too long",
  "Changed my plan",
  "Booked by mistake",
  "Pickup location issue",
  "Fare is too high",
  "Other",
] as const;

export default function ActivePorterScreen() {
  const { userType } = useAuth();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => [260, "50%", "85%"], []);

  const [porterService, setPorterService] =
    useState<PorterServiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string>(
    PASSENGER_CANCEL_REASONS[0]
  );
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [porterPaymentMethod, setPorterPaymentMethod] =
    useState<PorterPayment["paymentMethod"]>(null);
  const [porterPaymentStatus, setPorterPaymentStatus] =
    useState<PorterPayment["status"] | null>(null);
  const routeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const hasNavigatedToDetailsRef = useRef<string | null>(null);
  const passengerPaymentRedirectRef = useRef<string | null>(null);

  const { initiate: callInitiate, loading: callLoading } = useCall(
    porterService ? { porterServiceId: porterService.id } : null
  );
  const toast = useToast();
  const { showAlert } = useAlert();
  const handleCallSupport = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE_NUMBER}`).catch((dialError) => {
      console.error("[ActivePorter] Failed to open support dialer:", dialError);
      showAlert(
        "Alert",
        `Unable to open phone dialer. Please call ${SUPPORT_PHONE_NUMBER}.`
      );
    });
  }, [showAlert]);

  const driverId = porterService?.driver?.id || porterService?.driverId || null;
  const porterServiceId = porterService?.id || null;

  const { porterStatus, driverLocation, isSubscribed } =
    useActivePorterTracking({
      porterServiceId,
      driverId,
      userType: userType as "passenger" | "driver" | null,
      enabled: !!porterService && isPorterServiceActive(porterService.status),
    });

  const driverSelfLocation = useWatchLocation({
    enabled:
      userType === "driver" &&
      !!porterService &&
      isPorterServiceActive(porterService.status),
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
        ).catch(() => {});
      } catch (error) {
        console.warn("[ActivePorter] Failed location publish fallback check:", error);
      }
    },
  });

  useEnsureDriverTrackingContinuity(
    userType === "driver" &&
      !!porterService &&
      isPorterServiceActive(porterService.status),
    "ActivePorter"
  );

  const fetchActivePorterService = useCallback(
    async (silent: boolean = false, retryCount: number = 0) => {
      if (!silent) setLoading(true);
      try {
        const response = await getActivePorterService();
        if (response.success) {
          const serviceData = response.data?.porterService || null;
          if (!serviceData && retryCount < MAX_RETRY_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            return fetchActivePorterService(silent, retryCount + 1);
          }
          setPorterService(serviceData);
        } else {
          if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            return fetchActivePorterService(silent, retryCount + 1);
          }
          if (!silent) toast.error("Failed to fetch Parcel service details.");
        }
      } catch (error) {
        console.error(
          "[ActivePorter] Error fetching active Parcel service:",
          error
        );
        if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          return fetchActivePorterService(silent, retryCount + 1);
        }
        if (!silent) toast.error("Failed to fetch Parcel service details.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchActivePorterService();
  }, [fetchActivePorterService]);

  useEffect(() => {
    if (
      userType !== "driver" ||
      !porterService ||
      porterService.status !== PorterStatus.DELIVERED
    )
      return;
    const serviceId = porterService.id;
    if (hasNavigatedToDetailsRef.current === serviceId) return;
    hasNavigatedToDetailsRef.current = serviceId;
    porterStatus.unsubscribe?.();
    router.replace({
      pathname: "/porter-payment-status",
      params: { porterServiceId: serviceId },
    });
  }, [
    porterService?.id,
    porterService?.status,
    porterStatus.unsubscribe,
    userType,
  ]);

  // Passenger: when delivered, route to payment flow for all methods.
  useEffect(() => {
    if (
      userType !== "passenger" ||
      !porterService?.id ||
      porterService.status !== PorterStatus.DELIVERED ||
      passengerPaymentRedirectRef.current === porterService.id
    ) {
      return;
    }

    let cancelled = false;

    const checkPaymentAndRedirect = async () => {
      try {
        const response = await getPorterPayment(porterService.id);
        if (!response.success || !response.data?.payment || cancelled) return;

        const payment = response.data.payment;
        setPorterPaymentMethod(payment.paymentMethod);
        setPorterPaymentStatus(payment.status);

        if (payment.status === "PENDING" && !payment.paymentMethod) {
          passengerPaymentRedirectRef.current = porterService.id;
          router.replace({
            pathname: "/porter-payment",
            params: { porterServiceId: porterService.id },
          });
          return;
        }

        if (payment.status === "PENDING" || payment.status === "COMPLETED") {
          passengerPaymentRedirectRef.current = porterService.id;
          router.replace({
            pathname: "/porter-payment-status",
            params: { porterServiceId: porterService.id },
          });
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
  }, [userType, porterService?.id, porterService?.status]);

  useEffect(() => {
    const cleanup = addServiceEventListener(() => {
      setTimeout(() => {
        fetchActivePorterService(true);
      }, 500);
    });
    return cleanup;
  }, [fetchActivePorterService]);

  useEffect(() => {
    if (porterStatus.porter) {
      const newStatus = porterStatus.porter.status as any;
      const porterId = porterStatus.porter.id;
      if (newStatus === PorterStatus.DELIVERED && porterId) {
        if (hasNavigatedToDetailsRef.current === porterId) return;
        setPorterService((prev) =>
          prev && prev.id === porterId
            ? {
                ...prev,
                status: PorterStatus.DELIVERED,
                deliveredAt:
                  porterStatus.porter!.delivered_at || prev.deliveredAt,
              }
            : prev
        );
        return;
      }
      setPorterService((prev) => {
        if (!prev) return prev;
        if (
          prev.status === PorterStatus.ACCEPTED &&
          newStatus !== PorterStatus.ACCEPTED
        ) {
          setShowVerificationInput(false);
        }
        return {
          ...prev,
          status: newStatus,
          acceptedAt: porterStatus.porter!.accepted_at || prev.acceptedAt,
          pickedUpAt: porterStatus.porter!.picked_up_at || prev.pickedUpAt,
          inTransitAt: porterStatus.porter!.in_transit_at || prev.inTransitAt,
          deliveredAt: porterStatus.porter!.delivered_at || prev.deliveredAt,
          cancelledAt: porterStatus.porter!.cancelled_at || prev.cancelledAt,
          cancellationReason:
            porterStatus.porter!.cancellation_reason || prev.cancellationReason,
        };
      });
    }
  }, [porterStatus.porter]);

  // Poll when in transit so both sides see DELIVERED even if realtime is slow
  const PORTER_POLL_MS = 5000;
  useEffect(() => {
    if (!porterService) return;
    const activeNotDelivered =
      porterService.status === PorterStatus.PICKED_UP ||
      porterService.status === PorterStatus.IN_TRANSIT;
    if (!activeNotDelivered) return;
    const interval = setInterval(() => {
      fetchActivePorterService(true);
    }, PORTER_POLL_MS);
    return () => clearInterval(interval);
  }, [porterService?.id, porterService?.status, fetchActivePorterService]);

  // Backup polling when realtime not subscribed (other active statuses)
  useEffect(() => {
    if (!porterService || !isPorterServiceActive(porterService.status)) return;
    if (
      porterService.status === PorterStatus.PICKED_UP ||
      porterService.status === PorterStatus.IN_TRANSIT
    )
      return;
    if (isSubscribed) return;
    const interval = setInterval(() => {
      fetchActivePorterService(true);
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [
    porterService?.id,
    porterService?.status,
    isSubscribed,
    fetchActivePorterService,
  ]);

  const handleUpdateStatus = async (verificationCode?: string) => {
    if (!porterService) return;
    const nextStat = getNextDriverStatus(porterService.status);
    if (!nextStat) return;
    if (nextStat === PorterStatus.PICKED_UP && !verificationCode) {
      setShowVerificationInput(true);
      return;
    }
    setActionLoading(true);
    setVerificationError(null);
    try {
      const response = await updatePorterStatus(
        porterService.id,
        nextStat,
        verificationCode
      );
      if (response.success && response.data) {
        const updatedData = response.data;
        setShowVerificationInput(false);
        setVerificationError(null);
        if (nextStat === PorterStatus.DELIVERED) {
          dispatchServiceCompleted();
          InteractionManager.runAfterInteractions(() => {
            router.replace({
              pathname: "/porter-payment-status",
              params: { porterServiceId: updatedData.id },
            });
            toast.success(
              `Package delivered. Fare: ${formatFare(updatedData.fare)}`
            );
          });
        } else {
          setPorterService(updatedData);
        }
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to update status";
        const errorCode =
          typeof response.error === "object" &&
          response.error !== null &&
          "code" in response.error
            ? String((response.error as { code: string }).code)
            : "";
        if (errorCode.includes("VERIFICATION"))
          setVerificationError(errorMessage);
        else toast.error(errorMessage);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyCode = async (code: string) => {
    await handleUpdateStatus(code);
  };

  const submitCancellation = useCallback(
    async (reason: string) => {
      if (!porterService) return;

      setCancelLoading(true);
      try {
        const response = await cancelPorterService(porterService.id, reason);
        if (response.success) {
          dispatchServiceCompleted();
          setPorterService(null);
          setShowCancelReasonModal(false);
          toast.success("Service cancelled.");
          router.replace("/(tabs)");
        } else {
          const errorMessage =
            typeof response.error === "object" &&
            response.error !== null &&
            "message" in response.error
              ? String((response.error as { message: string }).message)
              : "Failed to cancel Parcel service";
          toast.error(errorMessage);
        }
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setCancelLoading(false);
      }
    },
    [porterService, toast]
  );

  const handleCancelService = async () => {
    if (!porterService) return;

    if (userType === "passenger") {
      setSelectedCancelReason(PASSENGER_CANCEL_REASONS[0]);
      setShowCancelReasonModal(true);
      return;
    }

    showAlert(
      "Cancel Parcel Service",
      "Are you sure you want to cancel this service?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => {
            void submitCancellation("Cancelled by driver");
          },
        },
      ]
    );
  };

  const mapLocations = useMemo(() => {
    if (!porterService)
      return { pickup: undefined, delivery: undefined, driver: undefined };
    const pickup =
      porterService.pickupLatitude && porterService.pickupLongitude
        ? {
            latitude: Number(porterService.pickupLatitude),
            longitude: Number(porterService.pickupLongitude),
            title: porterService.pickupLocation || "Pickup",
          }
        : undefined;
    const delivery =
      porterService.deliveryLatitude && porterService.deliveryLongitude
        ? {
            latitude: Number(porterService.deliveryLatitude),
            longitude: Number(porterService.deliveryLongitude),
            title: porterService.deliveryLocation || "Delivery",
          }
        : undefined;
    let driver:
      | { latitude: number; longitude: number; title: string }
      | undefined;
    if (userType === "passenger" && driverLocation.location) {
      driver = {
        latitude: driverLocation.location.latitude,
        longitude: driverLocation.location.longitude,
        title: "Driver",
      };
    } else if (userType === "driver" && driverSelfLocation.location) {
      driver = {
        latitude: driverSelfLocation.location.coords.latitude,
        longitude: driverSelfLocation.location.coords.longitude,
        title: "You",
      };
    }
    return { pickup, delivery, driver };
  }, [
    porterService,
    driverSelfLocation.location,
    driverLocation.location,
    userType,
  ]);

  const fetchRoute = useCallback(async () => {
    if (!porterService || !isPorterServiceActive(porterService.status)) {
      setRouteCoordinates([]);
      return;
    }
    if (
      porterService.status === PorterStatus.REQUESTED ||
      porterService.status === PorterStatus.DELIVERED ||
      porterService.status === PorterStatus.CANCELLED
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
      const pickupLoc = mapLocations.pickup;
      const deliveryLoc = mapLocations.delivery;
      const driverLoc = mapLocations.driver;

      let origin: { latitude: number; longitude: number } | null = null;
      let destination: { latitude: number; longitude: number } | null = null;

      if (porterService.status === PorterStatus.ACCEPTED) {
        // Preferred: driver -> pickup. Fallback: pickup -> delivery (same as booking style route visibility).
        if (driverLoc && pickupLoc) {
          origin = driverLoc;
          destination = pickupLoc;
        } else if (pickupLoc && deliveryLoc) {
          origin = pickupLoc;
          destination = deliveryLoc;
        }
      } else if (
        porterService.status === PorterStatus.PICKED_UP ||
        porterService.status === PorterStatus.IN_TRANSIT
      ) {
        // Preferred: driver -> delivery. Fallback: pickup -> delivery.
        if (deliveryLoc && (driverLoc || pickupLoc)) {
          origin = driverLoc ?? pickupLoc ?? null;
          destination = deliveryLoc;
        } else if (pickupLoc && deliveryLoc) {
          origin = pickupLoc;
          destination = deliveryLoc;
        }
      }
      if (!origin || !destination) {
        setRouteCoordinates([]);
        setRouteLoading(false);
        return;
      }
      const routeInfo = await getRoute(origin, destination, porterService.vehicleType);
      if (routeInfo && routeInfo.coordinates.length > 0)
        setRouteCoordinates(routeInfo.coordinates);
      else setRouteCoordinates([origin, destination]);
    } catch {
      if (mapLocations?.pickup && mapLocations?.delivery) {
        setRouteCoordinates([mapLocations.pickup, mapLocations.delivery]);
      } else setRouteCoordinates([]);
    } finally {
      setRouteLoading(false);
    }
  }, [porterService, mapLocations]);

  useEffect(() => {
    if (!porterService || !isPorterServiceActive(porterService.status)) {
      setRouteCoordinates([]);
      return;
    }
    if (!mapLocations) return;
    if (routeUpdateTimeoutRef.current) {
      clearTimeout(routeUpdateTimeoutRef.current);
      routeUpdateTimeoutRef.current = null;
    }
    if (
      porterService.status === PorterStatus.ACCEPTED ||
      porterService.status === PorterStatus.PICKED_UP
    ) {
      if (routeCoordinates.length === 0) {
        fetchRoute();
      } else {
        routeUpdateTimeoutRef.current = setTimeout(() => {
          fetchRoute();
        }, ROUTE_UPDATE_DEBOUNCE_MS);
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
    porterService?.status,
    porterService?.id,
    mapLocations?.pickup,
    mapLocations?.delivery,
    mapLocations?.driver,
    routeCoordinates.length,
    fetchRoute,
  ]);

  useEffect(() => {
    const allCoords: { latitude: number; longitude: number }[] = [];
    if (mapLocations?.pickup) allCoords.push(mapLocations.pickup);
    if (mapLocations?.delivery) allCoords.push(mapLocations.delivery);
    if (mapLocations?.driver) allCoords.push(mapLocations.driver);
    if (allCoords.length >= 2 && mapRef.current) {
      mapRef.current.fitToCoordinates(allCoords, {
        edgePadding: { top: 80, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }
  }, [mapLocations?.pickup, mapLocations?.delivery, mapLocations?.driver]);

  const canCancel =
    porterService &&
    ((userType === "passenger" && canCustomerCancel(porterService.status)) ||
      (userType === "driver" && canDriverCancel(porterService.status)));
  const driverActionLabel =
    porterService && userType === "driver"
      ? getDriverActionLabel(porterService.status)
      : null;
  const nextStatus = porterService
    ? getNextDriverStatus(porterService.status)
    : null;

  const getMapRegion = () => {
    if (mapLocations?.pickup && mapLocations?.delivery) {
      const minLat = Math.min(
        mapLocations.pickup.latitude,
        mapLocations.delivery.latitude
      );
      const maxLat = Math.max(
        mapLocations.pickup.latitude,
        mapLocations.delivery.latitude
      );
      const minLng = Math.min(
        mapLocations.pickup.longitude,
        mapLocations.delivery.longitude
      );
      const maxLng = Math.max(
        mapLocations.pickup.longitude,
        mapLocations.delivery.longitude
      );
      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * 1.5, LATITUDE_DELTA),
        longitudeDelta: Math.max((maxLng - minLng) * 1.5, LONGITUDE_DELTA),
      };
    }
    if (mapLocations?.pickup)
      return {
        ...mapLocations.pickup,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    return {
      latitude: 28.6139,
      longitude: 77.209,
      latitudeDelta: LATITUDE_DELTA,
      longitudeDelta: LONGITUDE_DELTA,
    };
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F9FAFB",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={brandColor} />
        <Text
          style={{
            fontFamily: "Figtree_500Medium",
            fontSize: 14,
            color: "#9CA3AF",
            marginTop: 12,
          }}
        >
          Loading Parcel service...
        </Text>
      </View>
    );
  }

  if (!porterService) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F9FAFB",
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
            backgroundColor: "#F3F4F6",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Package size={40} color="#6B7280" />
        </View>
        <Text
          style={{
            fontFamily: "Figtree_600SemiBold",
            fontSize: 20,
            color: "#111827",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          No Active Service
        </Text>
        <Text
          style={{
            fontFamily: "Figtree_400Regular",
            fontSize: 14,
            color: "#6B7280",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {userType === "driver"
            ? "Accept a Parcel service from the Rides tab to get started."
            : "Create a Parcel service request to see your active service here."}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (userType === "driver") router.replace("/(tabs)");
            else router.replace("/(tabs)/create-porter");
          }}
          activeOpacity={0.85}
          style={{
            backgroundColor: brandColor,
            borderRadius: 16,
            paddingVertical: 16,
            paddingHorizontal: 32,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 16,
              color: "#FFF",
            }}
          >
            {userType === "driver"
              ? "View Available Services"
              : "Send a Package"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getStatusIcon = () => {
    switch (porterService.status) {
      case PorterStatus.REQUESTED:
        return <Search size={28} color="#D97706" />;
      case PorterStatus.ACCEPTED:
        return <Car size={28} color={brandColor} />;
      case PorterStatus.PICKED_UP:
        return <CheckCircle2 size={28} color={brandColor} />;
      case PorterStatus.IN_TRANSIT:
        return <Navigation size={28} color={brandColor} />;
      case PorterStatus.DELIVERED:
        return <CheckCircle2 size={28} color="#16A34A" />;
      case PorterStatus.CANCELLED:
        return <XCircle size={28} color="#EF4444" />;
      default:
        return <Package size={28} color="#6B7280" />;
    }
  };

  const getStatusTitle = () => {
    switch (porterService.status) {
      case PorterStatus.REQUESTED:
        return "Finding Your Driver";
      case PorterStatus.ACCEPTED:
        return userType === "passenger"
          ? "Driver On The Way"
          : "Head to Pickup";
      case PorterStatus.PICKED_UP:
        return "Package Picked Up";
      case PorterStatus.IN_TRANSIT:
        return "Package In Transit";
      case PorterStatus.DELIVERED:
        return "Package Delivered";
      case PorterStatus.CANCELLED:
        return "Service Cancelled";
      default:
        return "Active Service";
    }
  };

  const getStatusDesc = () => {
    switch (porterService.status) {
      case PorterStatus.REQUESTED:
        return "We're looking for nearby drivers...";
      case PorterStatus.ACCEPTED:
        return userType === "passenger"
          ? "Your driver is heading to your pickup location."
          : "Navigate to the pickup location.";
      case PorterStatus.PICKED_UP:
        return userType === "passenger"
          ? "Your package has been picked up and is on the way."
          : "Package collected. Proceed to delivery location.";
      case PorterStatus.IN_TRANSIT:
        return userType === "passenger"
          ? "Your package is on the way to the delivery location."
          : "Navigate to the delivery location safely.";
      case PorterStatus.DELIVERED:
        return userType === "passenger"
          ? "Please complete payment or view details."
          : "Select payment method and confirm payment.";
      case PorterStatus.CANCELLED:
        return porterService.cancellationReason
          ? `Reason: ${porterService.cancellationReason}`
          : "This service has been cancelled.";
      default:
        return "";
    }
  };

  const getStatusBgColor = () => {
    switch (porterService.status) {
      case PorterStatus.REQUESTED:
        return "#FEF3C7";
      case PorterStatus.ACCEPTED:
      case PorterStatus.PICKED_UP:
      case PorterStatus.IN_TRANSIT:
        return userType === "driver" ? "#EDE4FB" : "#FFF0E8";
      case PorterStatus.DELIVERED:
        return "#DCFCE7";
      case PorterStatus.CANCELLED:
        return "#FEE2E2";
      default:
        return "#F3F4F6";
    }
  };

  const showMap =
    isPorterServiceActive(porterService.status) &&
    porterService.status !== PorterStatus.REQUESTED;
  const showComms =
    canUseCommunicationPorter(porterService.status) &&
    (userType === "passenger" ? !!porterService.driver : true);
  const showSupportAction = isPorterServiceActive(porterService.status);

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e" }}>
      {/* Full-screen map */}
      {showMap ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
          initialRegion={getMapRegion()}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {mapLocations.pickup && (
            <PickupMarker
              coordinate={mapLocations.pickup}
              title="Pickup"
            />
          )}
          {mapLocations.delivery && (
            <DestinationMarker
              coordinate={mapLocations.delivery}
              title="Delivery"
            />
          )}
          {mapLocations.driver && (
            <DriverMarker
              coordinate={mapLocations.driver}
              title={mapLocations.driver.title}
              vehicleType={porterService.driver?.vehicleType ?? null}
              heading={null}
            />
          )}
          {/* Route */}
          {routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={ROUTE_COLORS.primary}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={routeLoading ? [5, 5] : undefined}
            />
          )}
        </MapView>
      ) : (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: "#F9FAFB",
          }}
        />
      )}

      {routeLoading && showMap && (
        <View
          style={{
            position: "absolute",
            top: insets.top + 60,
            right: 16,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#FFF",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 20,
            gap: 8,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 6,
              },
              android: { elevation: 3 },
            }),
          }}
        >
          <ActivityIndicator size="small" color={brandColor} />
          <Text style={{ fontSize: 12, fontWeight: "500", color: "#374151" }}>
            Loading route
          </Text>
        </View>
      )}

      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          top: insets.top + 10,
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
            },
            android: { elevation: 4 },
          }),
        }}
      >
        <ArrowLeft size={22} color="#111827" />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <BottomSheet
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture={true}
        android_keyboardInputMode="adjustResize"
        ref={bottomSheetRef}
        index={showMap ? 1 : 2}
        snapPoints={snapPoints}
        backgroundStyle={{
          backgroundColor: "#FFF",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
        handleIndicatorStyle={{ backgroundColor: "#D1D5DB", width: 40 }}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status Header */}
          <View
            style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: getStatusBgColor(),
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                {getStatusIcon()}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 18,
                    color: "#111827",
                  }}
                >
                  {getStatusTitle()}
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                    marginTop: 2,
                  }}
                >
                  {getStatusDesc()}
                </Text>
              </View>
            </View>
            {porterService.status === PorterStatus.REQUESTED && (
              <View style={{ marginTop: 12, alignItems: "center" }}>
                <ActivityIndicator size="small" color={brandColor} />
              </View>
            )}
          </View>

          {/* Route Summary */}
          {isPorterServiceActive(porterService.status) && (
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
                      numberOfLines={1}
                      style={{
                        fontSize: 13,
                        color: "#111827",
                        fontFamily: "Figtree_500Medium",
                      }}
                    >
                      {porterService.pickupLocation}
                    </Text>
                    <View style={{ height: 6 }} />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 13,
                        color: "#111827",
                        fontFamily: "Figtree_500Medium",
                      }}
                    >
                      {porterService.deliveryLocation}
                    </Text>
                  </View>
                </View>
                {porterService.fare > 0 && (
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
                    <Text
                      style={{
                        fontFamily: "Figtree_700Bold",
                        fontSize: 16,
                        color: brandColor,
                      }}
                    >
                      {formatFare(porterService.fare)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Package Details */}
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <View
              style={{
                backgroundColor: "#FFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 13,
                  color: "#9CA3AF",
                  marginBottom: 8,
                }}
              >
                Package Details
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <Box size={16} color="#6B7280" />
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                    marginLeft: 8,
                  }}
                >
                  {formatPackageType(porterService.packageType)}
                </Text>
              </View>
              {porterService.packageWeight ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Scale size={16} color="#6B7280" />
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      color: "#111827",
                      marginLeft: 8,
                    }}
                  >
                    {formatWeight(porterService.packageWeight)}
                  </Text>
                </View>
              ) : null}
              {porterService.packageDimensions ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Ruler size={16} color="#6B7280" />
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      color: "#111827",
                      marginLeft: 8,
                    }}
                  >
                    {porterService.packageDimensions} cm
                  </Text>
                </View>
              ) : null}
              {porterService.isFragile && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <AlertTriangle size={16} color="#D97706" />
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      color: "#D97706",
                      marginLeft: 8,
                    }}
                  >
                    Fragile - Handle with care
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Contact Information */}
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <View
              style={{
                backgroundColor: "#FFF",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 12,
              }}
            >
              {userType === "passenger" && porterService.driver && (
                <View>
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 11,
                      color: "#9CA3AF",
                      marginBottom: 4,
                    }}
                  >
                    Driver
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 10,
                        overflow: "hidden",
                      }}
                    >
                      {porterService.driver.profileImageUrl?.trim() ? (
                        <Image
                          source={{ uri: porterService.driver.profileImageUrl }}
                          style={{ width: 40, height: 40, borderRadius: 20 }}
                        />
                      ) : (
                        <Text
                          style={{
                            fontSize: 16,
                            color: "#6B7280",
                            fontFamily: "Figtree_700Bold",
                          }}
                        >
                          {porterService.driver.fullName?.charAt(0)?.toUpperCase() || "D"}
                        </Text>
                      )}
                    </View>
                    <View>
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 15,
                          color: "#111827",
                        }}
                      >
                        {porterService.driver.fullName}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              {userType === "driver" && (
                <>
                  <View style={{ marginBottom: 12 }}>
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 11,
                        color: "#9CA3AF",
                        marginBottom: 4,
                      }}
                    >
                      Pickup Contact
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 15,
                        color: "#111827",
                      }}
                    >
                      {porterService.pickupContactName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 13,
                        color: "#6B7280",
                        marginTop: 2,
                      }}
                    >
                      {porterService.pickupContactPhone}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: "#F3F4F6",
                      paddingTop: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 11,
                        color: "#9CA3AF",
                        marginBottom: 4,
                      }}
                    >
                      Delivery Contact
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 15,
                        color: "#111827",
                      }}
                    >
                      {porterService.deliveryContactName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 13,
                        color: "#6B7280",
                        marginTop: 2,
                      }}
                    >
                      {porterService.deliveryContactPhone}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Verification Code Display (Passenger) */}
          {userType === "passenger" &&
            porterService.status === PorterStatus.ACCEPTED &&
            porterService.verificationCode && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <VerificationCodeDisplay
                  code={porterService.verificationCode}
                  expiresAt={porterService.verificationCodeExpiresAt}
                  serviceType="porter"
                />
              </View>
            )}

          {/* Verification Code Input (Driver) */}
          {userType === "driver" &&
            showVerificationInput &&
            porterService.status === PorterStatus.ACCEPTED &&
            nextStatus === PorterStatus.PICKED_UP && (
              <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
                <VerificationCodeInput
                  onVerify={handleVerifyCode}
                  serviceType="porter"
                  error={verificationError}
                  loading={actionLoading}
                />
              </View>
            )}

          {/* Driver Action Button */}
          {userType === "driver" &&
            driverActionLabel &&
            nextStatus &&
            !showVerificationInput && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => handleUpdateStatus()}
                  disabled={actionLoading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: actionLoading ? "#D1D5DB" : brandColor,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 16,
                        color: "#FFF",
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
                onPress={handleCancelService}
                disabled={cancelLoading || actionLoading}
                activeOpacity={0.85}
                style={{
                  borderRadius: 16,
                  paddingVertical: 16,
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
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#EF4444",
                    }}
                  >
                    Cancel Service
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Payment CTA for passenger after delivery */}
          {userType === "passenger" &&
            porterService.status === PorterStatus.DELIVERED && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (
                      porterPaymentStatus === "PENDING" &&
                      !porterPaymentMethod
                    ) {
                      router.replace({
                        pathname: "/porter-payment",
                        params: { porterServiceId: porterService.id },
                      });
                      return;
                    }
                    router.replace({
                      pathname: "/porter-payment-status",
                      params: { porterServiceId: porterService.id },
                    });
                  }}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: brandColor,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#FFF",
                    }}
                  >
                    {!porterPaymentMethod && porterPaymentStatus === "PENDING"
                      ? "Pay Now"
                      : "View Payment Status"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          {/* Contact Options */}
          {showSupportAction && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 12,
                marginHorizontal: 16,
                marginTop: 4,
              }}
            >
              {showComms && (
                <>
                  <TouchableOpacity
                    onPress={() => setChatVisible(true)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      backgroundColor: "#FFF",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      ...Platform.select({
                        ios: {
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.08,
                          shadowRadius: 2,
                        },
                        android: { elevation: 2 },
                      }),
                    }}
                  >
                    <MessageCircle size={18} color={brandColor} />
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 14,
                        color: "#111827",
                        marginLeft: 8,
                      }}
                    >
                      Chat
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => callInitiate()}
                    disabled={callLoading}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      backgroundColor: "#FFF",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      ...Platform.select({
                        ios: {
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.08,
                          shadowRadius: 2,
                        },
                        android: { elevation: 2 },
                      }),
                    }}
                  >
                    {callLoading ? (
                      <Text
                        style={{
                          fontFamily: "Figtree_500Medium",
                          fontSize: 13,
                          color: "#9CA3AF",
                        }}
                      >
                        Connecting...
                      </Text>
                    ) : (
                      <>
                        <Phone size={18} color={brandColor} />
                        <Text
                          style={{
                            fontFamily: "Figtree_600SemiBold",
                            fontSize: 14,
                            color: "#111827",
                            marginLeft: 8,
                          }}
                        >
                          {userType === "passenger"
                            ? "Call Driver"
                            : "Call Contact"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                onPress={handleCallSupport}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  ...Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.08,
                      shadowRadius: 2,
                    },
                    android: { elevation: 2 },
                  }),
                }}
              >
                <HelpCircle size={18} color={brandColor} />
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: "#111827",
                    marginLeft: 8,
                  }}
                >
                  Call Support
                </Text>
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
              Cancel Parcel Service
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
                      borderColor: isSelected ? BRAND_ORANGE : "#E5E7EB",
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
                        color: isSelected ? BRAND_ORANGE : "#111827",
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
      {porterService && showComms && (
        <ChatModal
          visible={chatVisible}
          onClose={() => setChatVisible(false)}
          porterServiceId={porterService.id}
          otherPartyName={
            userType === "passenger"
              ? porterService.driver?.fullName ?? "Driver"
              : porterService.pickupContactName ?? "Customer"
          }
          userType={userType as "passenger" | "driver"}
          brandColor={brandColor}
          enabled={canUseCommunicationPorter(porterService.status)}
          onNewMessageWhenNotFocused={() => {
            const name =
              userType === "passenger"
                ? porterService.driver?.fullName ?? "Driver"
                : porterService.pickupContactName ?? "Customer";
            toast.chat(`New message from ${name}`, {
              label: "Open",
              onPress: () => setChatVisible(true),
            });
          }}
        />
      )}
    </View>
  );
}
