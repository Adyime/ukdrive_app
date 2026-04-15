/**
 * Active Ride Share Modal
 * Displays the active car pool screen as a modal overlay
 * For drivers: manage ride, drop off passengers, complete pool
 * For passengers: view ride status, see other passengers
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ScrollView, RefreshControl, TouchableOpacity, Dimensions, Modal, Platform, StyleSheet, ActivityIndicator, Image, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import {
  X,
  Clock,
  Users,
  CheckCircle2,
  Navigation,
  XCircle,
  Phone,
  MessageCircle,
  User,
  Star,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { Loading } from "@/components/ui/loading";
import { ChatModal } from "@/components/chat-modal";
import { useToast } from "@/components/ui/toast";
import { useCall } from "@/hooks/use-call";
import { canUseCommunicationCarPool } from "@/lib/utils/communication";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import { useWatchLocation, useCurrentLocation } from "@/lib/services/location";
import { useActiveCarPoolTracking } from "@/hooks/use-realtime";
import { useCarPoolPayment } from "@/hooks/useCarPoolPayment";
import {
  getMyCarPools,
  getCarPoolById,
  startCarPool,
  dropOffPassenger,
  completeCarPool,
  leaveCarPool,
  acceptJoinRequest,
  rejectJoinRequest,
  type CarPoolResponse,
  type CarPoolMemberResponse,
  CarPoolStatus,
  CarPoolMemberStatus,
  isCarPoolActive,
  canPassengerLeave,
  getStatusLabel,
  getMemberStatusLabel,
  getMemberStatusColor,
  formatFare,
  formatDepartureTime,
} from "@/lib/api/carPool";
import { getRoute } from "@/lib/services/directions";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_HEIGHT = SCREEN_HEIGHT * 0.3;
const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * 0.5;
const REFRESH_INTERVAL = 10000;
const LOCATION_UPDATE_INTERVAL = 10000;
const ROUTE_UPDATE_DEBOUNCE_MS = 30000;

function DroppedOffPaymentSection({
  member,
  carPoolId,
  userType,
  isCurrentUser,
  brandColor,
  onRefresh,
  onPaymentComplete,
}: {
  member: CarPoolMemberResponse;
  carPoolId: string;
  userType: string;
  isCurrentUser: boolean;
  brandColor: string;
  onRefresh: () => void;
  onPaymentComplete?: () => void;
}) {
  const toast = useToast();
  const {
    payment,
    loading: paymentLoading,
    isPaymentComplete,
    confirmCashPayment,
    refresh: refreshPayment,
  } = useCarPoolPayment({
    carPoolId,
    memberId: member.id,
    autoFetch: true,
  });

  useEffect(() => {
    if (isPaymentComplete && onPaymentComplete) onPaymentComplete();
  }, [isPaymentComplete, onPaymentComplete]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const passengerPaymentRedirectRef = useRef(false);
  useEffect(() => {
    const shouldPoll =
      (userType === "driver" && !isPaymentComplete) ||
      (isCurrentUser &&
        userType === "passenger" &&
        payment?.status === "AWAITING_ONLINE");
    if (shouldPoll) {
      pollRef.current = setInterval(() => refreshPayment(), 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [
    userType,
    isCurrentUser,
    isPaymentComplete,
    payment?.status,
    refreshPayment,
  ]);

  useEffect(() => {
    if (!isCurrentUser || userType !== "passenger") return;
    if (passengerPaymentRedirectRef.current || !payment) return;

    if (payment.status === "PENDING" && !payment.paymentMethod) {
      passengerPaymentRedirectRef.current = true;
      router.replace({
        pathname: "/carpool-payment",
        params: { carPoolId, memberId: member.id },
      });
      return;
    }

    if (payment.status === "PENDING" || payment.status === "COMPLETED") {
      passengerPaymentRedirectRef.current = true;
      router.replace({
        pathname: "/carpool-payment-status",
        params: { carPoolId, memberId: member.id },
      });
    }
  }, [isCurrentUser, userType, payment, payment?.paymentMethod, payment?.status, carPoolId, member.id]);

  if (paymentLoading && !payment) {
    return (
      <View
        style={{
          marginTop: 8,
          padding: 12,
          backgroundColor: "#F9FAFB",
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="small" color={brandColor} />
        <Text
          style={{
            fontFamily: "Figtree_400Regular",
            fontSize: 12,
            color: "#9CA3AF",
            marginTop: 4,
          }}
        >
          Loading payment...
        </Text>
      </View>
    );
  }

  if (isPaymentComplete) {
    return (
      <View
        style={{
          marginTop: 8,
          padding: 12,
          backgroundColor: "#F0FDF4",
          borderRadius: 12,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <CheckCircle2 size={18} color="#16A34A" />
        <Text
          style={{
            fontFamily: "Figtree_500Medium",
            fontSize: 13,
            color: "#16A34A",
            marginLeft: 8,
          }}
        >
          Payment Complete{" "}
          {payment?.paymentMethod === "CASH"
            ? "(Cash)"
            : payment?.paymentMethod === "WALLET"
            ? "(Wallet)"
            : "(Online)"}
        </Text>
      </View>
    );
  }

  if (isCurrentUser && userType === "passenger") {
    if (payment?.paymentMethod === "CASH" && payment.status === "PENDING") {
      return (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: "#FFFBEB",
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#B45309",
            }}
          >
            Cash selected by driver. Opening payment status...
          </Text>
        </View>
      );
    }
    if (
      payment?.paymentMethod === "ONLINE" &&
      payment.status === "AWAITING_ONLINE"
    ) {
      return (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: "#EFF6FF",
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#1D4ED8",
            }}
          >
            Processing online payment...
          </Text>
        </View>
      );
    }
    return (
      <TouchableOpacity
        onPress={() => {
          if (payment?.status === "PENDING" && !payment.paymentMethod) {
            router.replace({
              pathname: "/carpool-payment",
              params: { carPoolId, memberId: member.id },
            });
            return;
          }
          router.replace({
            pathname: "/carpool-payment-status",
            params: { carPoolId, memberId: member.id },
          });
        }}
        activeOpacity={0.85}
        style={{
          marginTop: 8,
          backgroundColor: brandColor,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Figtree_600SemiBold",
            fontSize: 14,
            color: "#FFF",
          }}
        >
          {payment?.status === "PENDING" && !payment.paymentMethod
            ? `Pay Now ${member.fare ? `- ${formatFare(member.fare)}` : ""}`
            : "View Payment Status"}
        </Text>
      </TouchableOpacity>
    );
  }

  if (userType === "driver") {
    if (!payment || !payment.paymentMethod) {
      return (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: "#F9FAFB",
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 13,
              color: "#9CA3AF",
            }}
          >
            Waiting for passenger to select payment method
          </Text>
        </View>
      );
    }

    if (payment.paymentMethod === "CASH" && payment.status === "PENDING") {
      return (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: "#FFFBEB",
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#B45309",
              marginBottom: 8,
            }}
          >
            Cash payment from {member.passenger?.fullName || "Passenger"}
          </Text>
          <TouchableOpacity
            onPress={async () => {
              const success = await confirmCashPayment();
              if (success) {
                toast.success("Cash payment confirmed!");
                await refreshPayment();
                onRefresh();
              }
            }}
            disabled={paymentLoading}
            activeOpacity={0.85}
            style={{
              backgroundColor: brandColor,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            {paymentLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#FFF",
                }}
              >
                Confirm Cash Received
              </Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    if (
      payment.paymentMethod === "ONLINE" &&
      payment.status === "AWAITING_ONLINE"
    ) {
      return (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: "#EFF6FF",
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#1D4ED8",
              marginLeft: 8,
            }}
          >
            Waiting for online payment
          </Text>
        </View>
      );
    }

    if (payment.paymentMethod === "WALLET" && payment.status === "PENDING") {
      return (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: "#EFF6FF",
            borderRadius: 12,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#1D4ED8",
            }}
          >
            Processing wallet payment...
          </Text>
        </View>
      );
    }

    return null;
  }

  return null;
}

export interface ActiveCarPoolModalProps {
  visible: boolean;
  onClose: () => void;
  onServiceComplete?: () => void;
  carPoolId?: string;
}

export function ActiveCarPoolModal({
  visible,
  onClose,
  onServiceComplete,
  carPoolId: propCarPoolId,
}: ActiveCarPoolModalProps) {
  const { userType, user } = useAuth();
  const userId = user?.id;
  const brandColor = userType === "driver" ? "#843FE3" : "#F36D14";
  const mapRef = useRef<MapView>(null);
  const { location: currentLocation } = useCurrentLocation();

  // State
  const [carPool, setCarPool] = useState<CarPoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [, setRouteLoading] = useState(false);
  const [dropOffLoading, setDropOffLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [memberActionLoading, setMemberActionLoading] = useState<
    Record<string, boolean>
  >({});
  const [chatVisible, setChatVisible] = useState(false);
  const [currentMemberPaymentDone, setCurrentMemberPaymentDone] =
    useState(false);
  const routeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const { initiate: callInitiate, loading: callLoading } = useCall(
    carPool ? { carPoolId: carPool.id } : null
  );
  const toast = useToast();
  const { showAlert } = useAlert();

  // Get driver ID and current user's member info
  const driverId = carPool?.driverId || null;
  const carPoolId = carPool?.id || null;
  const currentMember =
    carPool?.members?.find((m) => m.passengerId === userId) || null;

  // Real-time tracking
  const { carPoolStatus, driverLocation, isSubscribed } =
    useActiveCarPoolTracking({
      carPoolId,
      driverId,
      userType,
      enabled: visible && !!carPool && isCarPoolActive(carPool.status),
    });

  // Update car pool from real-time updates
  useEffect(() => {
    if (carPoolStatus.carPool && carPoolStatus.carPool.id === carPoolId) {
      setCarPool((prev) => {
        if (!prev) return prev;
        const realtimeData = carPoolStatus.carPool!;
        return {
          ...prev,
          status: realtimeData.status as CarPoolStatus,
          members: realtimeData.members || prev.members,
        };
      });
    }
  }, [carPoolStatus.carPool, carPoolId]);

  // Watch driver's location (for drivers only)
  const driverSelfLocation = useWatchLocation({
    enabled:
      visible &&
      userType === "driver" &&
      !!carPool &&
      isCarPoolActive(carPool.status),
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
        console.warn(
          "[ActiveCarPoolModal] Failed location publish fallback check:",
          error
        );
      }
    },
  });

  // Fetch car pool on mount
  useEffect(() => {
    if (visible) {
      fetchActiveCarPool();
    }
  }, [visible]);

  // Clear route coordinates when car pool ID changes
  useEffect(() => {
    setRouteCoordinates([]);
  }, [carPool?.id]);

  // Backup polling
  useEffect(() => {
    if (!visible || !carPool || !isCarPoolActive(carPool.status)) return;

    const interval = setInterval(() => {
      if (!isSubscribed) {
        fetchActiveCarPool(true);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [visible, carPool, isSubscribed]);

  const fetchActiveCarPool = async (silent: boolean = false) => {
    if (!silent) setLoading(true);

    try {
      const response = await getMyCarPools(1, 10);

      if (response.success && response.data) {
        const activePool = response.data.find((pool) =>
          isCarPoolActive(pool.status)
        );

        if (activePool) {
          const detailsResponse = await getCarPoolById(activePool.id);
          if (detailsResponse.success && detailsResponse.data) {
            setCarPool(detailsResponse.data);
          } else {
            setCarPool(activePool);
          }
        } else {
          setCarPool(null);
        }
      } else {
        if (!silent) {
          toast.error("Failed to fetch ride share details.");
        }
      }
    } catch (error) {
      if (!silent) {
        toast.error("Failed to fetch ride share details.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActiveCarPool();
    setRefreshing(false);
  };

  const handleStartPool = async () => {
    if (!carPool) return;

    setActionLoading(true);
    try {
      const response = await startCarPool(carPool.id);

      if (response.success && response.data) {
        setCarPool(response.data);
        toast.success("Ride share started!");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to start ride share";
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompletePool = async () => {
    if (!carPool) return;

    setActionLoading(true);
    try {
      const response = await completeCarPool(carPool.id);

      if (response.success && response.data) {
        setCarPool(response.data);
        toast.success("Ride share completed!");
        onServiceComplete?.();
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to complete ride share";
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDropOffPassenger = async (
    memberId: string,
    verificationCode?: string
  ) => {
    if (!carPool) return;

    if (!verificationCode) {
      Alert.prompt(
        "Enter Verification Code",
        "Ask the passenger for their verification code",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async (code) => {
              if (code) {
                await handleDropOffPassenger(memberId, code);
              }
            },
          },
        ],
        "plain-text"
      );
      return;
    }

    setDropOffLoading((prev) => ({ ...prev, [memberId]: true }));
    try {
      const response = await dropOffPassenger(
        carPool.id,
        memberId,
        verificationCode
      );

      if (response.success && response.data) {
        setCarPool(response.data);
        toast.success("Passenger dropped off!");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to drop off passenger";
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setDropOffLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleLeavePool = async () => {
    if (!carPool) return;

    showAlert(
      "Leave Ride Share",
      "Are you sure you want to leave this ride share?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Leave",
          style: "destructive",
          onPress: async () => {
            setCancelLoading(true);

            try {
              const response = await leaveCarPool(carPool.id);

              if (response.success) {
                setCarPool(null);
                toast.success("You have left the ride share.");
                onClose();
                onServiceComplete?.();
              } else {
                const errorMessage =
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? String((response.error as { message: string }).message)
                    : "Failed to leave ride share";
                toast.error(errorMessage);
              }
            } catch (error) {
              toast.error("Something went wrong. Please try again.");
            } finally {
              setCancelLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAcceptMember = async (memberId: string) => {
    if (!carPool) return;

    setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
    try {
      const response = await acceptJoinRequest(carPool.id, memberId);

      if (response.success && response.data) {
        setCarPool(response.data);
        toast.success("Join request accepted!");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to accept request";
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setMemberActionLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleRejectMember = async (memberId: string) => {
    if (!carPool) return;

    setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
    try {
      const response = await rejectJoinRequest(carPool.id, memberId);

      if (response.success && response.data) {
        setCarPool(response.data);
        toast.info("Join request rejected.");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to reject request";
        toast.error(errorMessage);
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setMemberActionLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  // Map locations
  const mapLocations = useMemo(() => {
    if (!carPool)
      return { pickup: undefined, destination: undefined, driver: undefined };

    const pickup =
      carPool.startLatitude && carPool.startLongitude
        ? {
            latitude: Number(carPool.startLatitude),
            longitude: Number(carPool.startLongitude),
            title: carPool.startLocation || "Start",
          }
        : undefined;

    const destination =
      carPool.endLatitude && carPool.endLongitude
        ? {
            latitude: Number(carPool.endLatitude),
            longitude: Number(carPool.endLongitude),
            title: carPool.endLocation || "End",
          }
        : undefined;

    let driver:
      | { latitude: number; longitude: number; title: string }
      | undefined;
    if (driverLocation.location) {
      driver = {
        latitude: driverLocation.location.latitude,
        longitude: driverLocation.location.longitude,
        title: carPool.driver?.fullName || "Driver",
      };
    } else if (userType === "driver" && driverSelfLocation.location) {
      driver = {
        latitude: driverSelfLocation.location.coords.latitude,
        longitude: driverSelfLocation.location.coords.longitude,
        title: "You",
      };
    }

    return { pickup, destination, driver };
  }, [carPool, driverLocation.location, driverSelfLocation.location, userType]);

  const getMapRegion = () => {
    if (mapLocations.pickup && mapLocations.destination) {
      const minLat = Math.min(
        mapLocations.pickup.latitude,
        mapLocations.destination.latitude
      );
      const maxLat = Math.max(
        mapLocations.pickup.latitude,
        mapLocations.destination.latitude
      );
      const minLng = Math.min(
        mapLocations.pickup.longitude,
        mapLocations.destination.longitude
      );
      const maxLng = Math.max(
        mapLocations.pickup.longitude,
        mapLocations.destination.longitude
      );
      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * 1.5, LATITUDE_DELTA),
        longitudeDelta: Math.max((maxLng - minLng) * 1.5, LONGITUDE_DELTA),
      };
    }
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    }
    return {
      latitude: 28.6139,
      longitude: 77.209,
      latitudeDelta: LATITUDE_DELTA,
      longitudeDelta: LONGITUDE_DELTA,
    };
  };

  // Route fetching
  const fetchRoute = useCallback(async () => {
    if (!carPool || !isCarPoolActive(carPool.status)) {
      setRouteCoordinates([]);
      return;
    }
    if (!mapLocations.pickup || !mapLocations.destination) {
      setRouteCoordinates([]);
      return;
    }
    setRouteLoading(true);
    try {
      const origin = {
        latitude: mapLocations.pickup.latitude,
        longitude: mapLocations.pickup.longitude,
      };
      const dest = {
        latitude: mapLocations.destination.latitude,
        longitude: mapLocations.destination.longitude,
      };
      const routeInfo = await getRoute(origin, dest, carPool.vehicleType);
      if (routeInfo && routeInfo.coordinates.length > 0) {
        setRouteCoordinates(routeInfo.coordinates);
      } else {
        setRouteCoordinates([origin, dest]);
      }
    } catch (error) {
      if (mapLocations.pickup && mapLocations.destination) {
        setRouteCoordinates([
          {
            latitude: mapLocations.pickup.latitude,
            longitude: mapLocations.pickup.longitude,
          },
          {
            latitude: mapLocations.destination.latitude,
            longitude: mapLocations.destination.longitude,
          },
        ]);
      } else {
        setRouteCoordinates([]);
      }
    } finally {
      setRouteLoading(false);
    }
  }, [carPool, mapLocations]);

  useEffect(() => {
    if (!carPool || !isCarPoolActive(carPool.status)) {
      setRouteCoordinates([]);
      return;
    }
    if (!mapLocations.pickup || !mapLocations.destination) return;
    if (routeUpdateTimeoutRef.current) {
      clearTimeout(routeUpdateTimeoutRef.current);
      routeUpdateTimeoutRef.current = null;
    }
    if (carPool.status === CarPoolStatus.IN_PROGRESS) {
      routeUpdateTimeoutRef.current = setTimeout(
        () => fetchRoute(),
        ROUTE_UPDATE_DEBOUNCE_MS
      );
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
    carPool?.status,
    carPool?.id,
    mapLocations?.pickup,
    mapLocations?.destination,
    fetchRoute,
  ]);

  // Fit map to coordinates
  useEffect(() => {
    if (mapLocations.pickup && mapLocations.destination && mapRef.current) {
      const coords = [mapLocations.pickup, mapLocations.destination];
      if (mapLocations.driver) coords.push(mapLocations.driver);
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [mapLocations.pickup, mapLocations.destination, mapLocations.driver]);

  const isDriver = userType === "driver" && carPool?.driverId === userId;
  const canLeave =
    userType === "passenger" &&
    currentMember &&
    carPool &&
    canPassengerLeave(carPool.status, currentMember.status);

  // Filter members by status
  const pendingMembers =
    carPool?.members?.filter((m) => m.status === CarPoolMemberStatus.PENDING) ||
    [];
  const acceptedMembers =
    carPool?.members?.filter(
      (m) =>
        m.status === CarPoolMemberStatus.CONFIRMED ||
        m.status === CarPoolMemberStatus.IN_RIDE
    ) || [];
  const nonPendingMembers =
    carPool?.members?.filter((m) => m.status !== CarPoolMemberStatus.PENDING) ||
    [];

  const handleClose = () => {
    if (carPool && !isCarPoolActive(carPool.status)) {
      onServiceComplete?.();
    }
    onClose();
  };

  const renderStatusIcon = () => {
    if (!carPool) return <Clock size={28} color="#6B7280" />;
    switch (carPool.status) {
      case CarPoolStatus.CREATED:
        return <Clock size={28} color="#6B7280" />;
      case CarPoolStatus.OPEN:
        return <Users size={28} color={brandColor} />;
      case CarPoolStatus.CONFIRMED:
        return <CheckCircle2 size={28} color={brandColor} />;
      case CarPoolStatus.IN_PROGRESS:
        return <Navigation size={28} color="#16A34A" />;
      case CarPoolStatus.COMPLETED:
        return <CheckCircle2 size={28} color="#16A34A" />;
      case CarPoolStatus.CANCELLED:
        return <XCircle size={28} color="#EF4444" />;
      default:
        return <Clock size={28} color="#6B7280" />;
    }
  };

  const statusIconBgColor = () => {
    if (!carPool) return "#F3F4F6";
    switch (carPool.status) {
      case CarPoolStatus.CREATED:
        return "#F3F4F6";
      case CarPoolStatus.OPEN:
        return userType === "driver" ? "#F5F3FF" : "#FFF7ED";
      case CarPoolStatus.CONFIRMED:
        return userType === "driver" ? "#F5F3FF" : "#FFF7ED";
      case CarPoolStatus.IN_PROGRESS:
        return "#F0FDF4";
      case CarPoolStatus.COMPLETED:
        return "#F0FDF4";
      case CarPoolStatus.CANCELLED:
        return "#FEF2F2";
      default:
        return "#F3F4F6";
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
        edges={["top"]}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: "#FFF",
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.7}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#F3F4F6",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} color="#6B7280" />
          </TouchableOpacity>
          <Text
            style={{
              fontFamily: "Figtree_700Bold",
              fontSize: 17,
              color: "#111827",
            }}
          >
            Active Ride Share
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Loading message="Loading ride share..." />
          </View>
        ) : !carPool ? (
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
                backgroundColor: "#F3F4F6",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Users size={40} color="#9CA3AF" />
            </View>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 20,
                color: "#111827",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              No Active Ride Share
            </Text>
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 14,
                color: "#9CA3AF",
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              {userType === "driver"
                ? "Create a ride share to get started."
                : "Join a ride share to see your trip here."}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
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
                Close
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Map */}
            {isCarPoolActive(carPool.status) && (
              <View
                style={{
                  height: MAP_HEIGHT,
                  marginHorizontal: 16,
                  marginTop: 16,
                  borderRadius: 16,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
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
                    <Marker
                      coordinate={mapLocations.pickup}
                      title={mapLocations.pickup.title}
                      pinColor="#16A34A"
                    />
                  )}
                  {mapLocations.destination && (
                    <Marker
                      coordinate={mapLocations.destination}
                      title={mapLocations.destination.title}
                      pinColor="#EF4444"
                    />
                  )}
                  {mapLocations.driver && (
                    <Marker
                      coordinate={mapLocations.driver}
                      title={mapLocations.driver.title}
                      pinColor={brandColor}
                    />
                  )}
                  {routeCoordinates.length > 0 && (
                    <Polyline
                      coordinates={routeCoordinates}
                      strokeColor={ROUTE_COLORS.primary}
                      strokeWidth={5}
                      lineCap="round"
                      lineJoin="round"
                    />
                  )}
                </MapView>
              </View>
            )}

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  tintColor={brandColor}
                />
              }
            >
              {/* Status Card */}
              <View
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: statusIconBgColor(),
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    {renderStatusIcon()}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Figtree_700Bold",
                        fontSize: 18,
                        color: "#111827",
                      }}
                    >
                      {getStatusLabel(carPool.status)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 13,
                        color: "#6B7280",
                        marginTop: 2,
                      }}
                    >
                      {formatDepartureTime(carPool.departureTime)}
                    </Text>
                  </View>
                </View>
                {carPool.status === CarPoolStatus.COMPLETED && (
                  <Text
                    style={{
                      fontFamily: "Figtree_700Bold",
                      fontSize: 28,
                      color: brandColor,
                      textAlign: "center",
                      marginTop: 12,
                    }}
                  >
                    {formatFare(carPool.calculatedFarePerPerson)}/person
                  </Text>
                )}
                {isSubscribed && isCarPoolActive(carPool.status) && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: "#16A34A",
                        marginRight: 6,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 12,
                        color: "#16A34A",
                      }}
                    >
                      Live tracking
                    </Text>
                  </View>
                )}
              </View>

              {/* Route Info Card */}
              <View
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <View style={{ marginBottom: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: "#16A34A",
                        marginRight: 10,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 11,
                          color: "#9CA3AF",
                        }}
                      >
                        Start
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: "Figtree_500Medium",
                          fontSize: 13,
                          color: "#111827",
                        }}
                      >
                        {carPool.startLocation}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 1.5,
                        backgroundColor: "#EF4444",
                        marginRight: 10,
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 11,
                          color: "#9CA3AF",
                        }}
                      >
                        End
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: "Figtree_500Medium",
                          fontSize: 13,
                          color: "#111827",
                        }}
                      >
                        {carPool.endLocation}
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    height: 1,
                    backgroundColor: "#F3F4F6",
                    marginBottom: 12,
                  }}
                />

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 11,
                        color: "#9CA3AF",
                      }}
                    >
                      Price per passenger
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_700Bold",
                        fontSize: 16,
                        color: brandColor,
                      }}
                    >
                      {formatFare(carPool.baseFare)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 11,
                        color: "#9CA3AF",
                      }}
                    >
                      Total fare for driver:{" "}
                      {formatFare(carPool.totalFareForDriver ?? 0)}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 11,
                        color: "#9CA3AF",
                      }}
                    >
                      Calculated fare per person:{" "}
                      {formatFare(carPool.calculatedFarePerPerson)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 11,
                        color: "#9CA3AF",
                      }}
                    >
                      Passengers
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_700Bold",
                        fontSize: 16,
                        color: "#111827",
                      }}
                    >
                      {acceptedMembers.length}/{carPool.maxPassengers}
                    </Text>
                  </View>
                </View>

                {/* Driver info (passenger view) */}
                {userType === "passenger" && carPool.driver && (
                  <View
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "#F3F4F6",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 10,
                        overflow: "hidden",
                      }}
                    >
                      {carPool.driver.profileImageUrl?.trim() ? (
                        <Image
                          source={{ uri: carPool.driver.profileImageUrl }}
                          style={{ width: 36, height: 36, borderRadius: 18 }}
                        />
                      ) : (
                        <User size={18} color="#6B7280" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 14,
                          color: "#111827",
                        }}
                      >
                        {carPool.driver.fullName}
                      </Text>
                      {carPool.driver.rating != null && (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: 2,
                          }}
                        >
                          <Star size={12} color="#FBBF24" />
                          <Text
                            style={{
                              fontFamily: "Figtree_400Regular",
                              fontSize: 12,
                              color: "#6B7280",
                              marginLeft: 4,
                            }}
                          >
                            {carPool.driver.rating.toFixed(1)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {/* Passenger Verification Code (for passengers only) */}
              {userType === "passenger" &&
                carPool.status === CarPoolStatus.CONFIRMED &&
                carPool.verificationCode && (
                  <View style={{ marginBottom: 12 }}>
                    <VerificationCodeDisplay
                      code={carPool.verificationCode}
                      expiresAt={carPool.verificationCodeExpiresAt}
                      serviceType="carpool"
                    />
                  </View>
                )}

              {/* Pending Join Requests (Driver only) */}
              {isDriver && pendingMembers.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#111827",
                      marginBottom: 12,
                    }}
                  >
                    Pending Requests ({pendingMembers.length})
                  </Text>
                  {pendingMembers.map((member) => (
                    <View
                      key={member.id}
                      style={{
                        backgroundColor: "#FFF",
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 14,
                              color: "#111827",
                            }}
                          >
                            {member.passenger?.fullName || "Passenger"}
                          </Text>
                        </View>
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 10,
                            backgroundColor: `${getMemberStatusColor(
                              member.status
                            )}20`,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 11,
                              color: getMemberStatusColor(member.status),
                            }}
                          >
                            {getMemberStatusLabel(member.status)}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleAcceptMember(member.id)}
                          disabled={memberActionLoading[member.id]}
                          activeOpacity={0.85}
                          style={{
                            flex: 1,
                            backgroundColor: brandColor,
                            borderRadius: 12,
                            paddingVertical: 10,
                            alignItems: "center",
                          }}
                        >
                          {memberActionLoading[member.id] ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <Text
                              style={{
                                fontFamily: "Figtree_600SemiBold",
                                fontSize: 14,
                                color: "#FFF",
                              }}
                            >
                              Accept
                            </Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRejectMember(member.id)}
                          disabled={memberActionLoading[member.id]}
                          activeOpacity={0.85}
                          style={{
                            flex: 1,
                            borderRadius: 12,
                            paddingVertical: 10,
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: "#EF4444",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 14,
                              color: "#EF4444",
                            }}
                          >
                            Reject
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Passengers List */}
              {nonPendingMembers.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#111827",
                      marginBottom: 12,
                    }}
                  >
                    Passengers ({nonPendingMembers.length})
                  </Text>
                  {nonPendingMembers.map((member) => (
                    <View
                      key={member.id}
                      style={{
                        backgroundColor: "#FFF",
                        borderRadius: 16,
                        padding: 16,
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                      }}
                    >
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
                            flexDirection: "row",
                            alignItems: "center",
                            flex: 1,
                          }}
                        >
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: "#F3F4F6",
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: 10,
                            }}
                          >
                            <User size={18} color="#6B7280" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontFamily: "Figtree_600SemiBold",
                                fontSize: 14,
                                color: "#111827",
                              }}
                            >
                              {member.passenger?.fullName || "Passenger"}
                              {member.passengerId === userId && (
                                <Text style={{ color: brandColor }}>
                                  {" "}
                                  (You)
                                </Text>
                              )}
                            </Text>
                            {userType === "passenger" &&
                              member.passengerId === userId && (
                                <Text
                                  style={{
                                    fontFamily: "Figtree_400Regular",
                                    fontSize: 12,
                                    color: "#9CA3AF",
                                  }}
                                >
                                  {member.passenger?.phone || ""}
                                </Text>
                              )}
                          </View>
                        </View>
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 10,
                            backgroundColor: `${getMemberStatusColor(
                              member.status
                            )}20`,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 11,
                              color: getMemberStatusColor(member.status),
                            }}
                          >
                            {getMemberStatusLabel(member.status)}
                          </Text>
                        </View>
                      </View>

                      {/* Route indicators */}
                      <View style={{ marginBottom: 8 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 4,
                              backgroundColor: "#16A34A",
                              marginRight: 8,
                            }}
                          />
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontFamily: "Figtree_400Regular",
                              fontSize: 12,
                              color: "#6B7280",
                            }}
                          >
                            {member.pickupLocation}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <View
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 1.5,
                              backgroundColor: "#EF4444",
                              marginRight: 8,
                            }}
                          />
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              fontFamily: "Figtree_400Regular",
                              fontSize: 12,
                              color: "#6B7280",
                            }}
                          >
                            {member.destinationLocation}
                          </Text>
                        </View>
                      </View>

                      {member.fare && (
                        <Text
                          style={{
                            fontFamily: "Figtree_600SemiBold",
                            fontSize: 14,
                            color: brandColor,
                            marginBottom: 4,
                          }}
                        >
                          Fare: {formatFare(member.fare)}
                        </Text>
                      )}

                      {/* Drop Off Button */}
                      {isDriver &&
                        member.status === CarPoolMemberStatus.PICKED_UP && (
                          <TouchableOpacity
                            onPress={() => handleDropOffPassenger(member.id)}
                            disabled={dropOffLoading[member.id]}
                            activeOpacity={0.85}
                            style={{
                              marginTop: 8,
                              borderRadius: 12,
                              paddingVertical: 10,
                              alignItems: "center",
                              borderWidth: 1,
                              borderColor: brandColor,
                            }}
                          >
                            {dropOffLoading[member.id] ? (
                              <ActivityIndicator
                                size="small"
                                color={brandColor}
                              />
                            ) : (
                              <Text
                                style={{
                                  fontFamily: "Figtree_600SemiBold",
                                  fontSize: 14,
                                  color: brandColor,
                                }}
                              >
                                Drop Off
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}

                      {/* Payment UI for DROPPED_OFF members */}
                      {member.status === CarPoolMemberStatus.DROPPED_OFF &&
                        member.fare &&
                        carPool.id && (
                          <DroppedOffPaymentSection
                            member={member}
                            carPoolId={carPool.id}
                            userType={userType || ""}
                            isCurrentUser={member.passengerId === userId}
                            brandColor={brandColor}
                            onRefresh={() => fetchActiveCarPool(true)}
                            onPaymentComplete={
                              member.passengerId === userId
                                ? () => setCurrentMemberPaymentDone(true)
                                : undefined
                            }
                          />
                        )}
                    </View>
                  ))}
                </View>
              )}

              {/* Driver Actions */}
              {isDriver && (
                <View style={{ marginBottom: 12 }}>
                  {carPool.status === CarPoolStatus.CONFIRMED && (
                    <TouchableOpacity
                      onPress={handleStartPool}
                      disabled={actionLoading}
                      activeOpacity={0.85}
                      style={{
                        backgroundColor: actionLoading ? "#D1D5DB" : brandColor,
                        borderRadius: 16,
                        paddingVertical: 16,
                        alignItems: "center",
                        marginBottom: 10,
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
                          Start Ride Share
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {carPool.status === CarPoolStatus.IN_PROGRESS && (
                    <TouchableOpacity
                      onPress={handleCompletePool}
                      disabled={
                        actionLoading ||
                        acceptedMembers.some(
                          (m) => m.status === CarPoolMemberStatus.PICKED_UP
                        )
                      }
                      activeOpacity={0.85}
                      style={{
                        backgroundColor:
                          actionLoading ||
                          acceptedMembers.some(
                            (m) => m.status === CarPoolMemberStatus.PICKED_UP
                          )
                            ? "#D1D5DB"
                            : brandColor,
                        borderRadius: 16,
                        paddingVertical: 16,
                        alignItems: "center",
                        marginBottom: 10,
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
                          Complete Ride Share
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Leave Button (Passenger) */}
              {canLeave && (
                <TouchableOpacity
                  onPress={handleLeavePool}
                  disabled={cancelLoading}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#EF4444",
                    marginBottom: 12,
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
                      Leave Ride Share
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Close Button for completed/cancelled */}
              {!isCarPoolActive(carPool.status) && (
                <TouchableOpacity
                  onPress={handleClose}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: brandColor,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#FFF",
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              )}

              {/* Contact Options */}
              {canUseCommunicationCarPool(carPool.status) &&
                (userType === "passenger" ? !!carPool.driver : true) && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 12,
                      marginTop: 16,
                      marginBottom: 10,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => setChatVisible(true)}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                        backgroundColor: "#FFF",
                        borderRadius: 24,
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
                          marginLeft: 6,
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
                        paddingVertical: 10,
                        backgroundColor: "#FFF",
                        borderRadius: 24,
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
                        <ActivityIndicator size="small" color={brandColor} />
                      ) : (
                        <>
                          <Phone size={18} color={brandColor} />
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 14,
                              color: "#111827",
                              marginLeft: 6,
                            }}
                          >
                            {userType === "passenger" ? "Call Driver" : "Call"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
            </ScrollView>
          </>
        )}

        {carPool &&
          canUseCommunicationCarPool(carPool.status) &&
          (userType === "passenger" ? !!carPool.driver : true) && (
            <ChatModal
              visible={chatVisible}
              onClose={() => setChatVisible(false)}
              carPoolId={carPool.id}
              otherPartyName={
                userType === "passenger"
                  ? carPool.driver?.fullName ?? "Driver"
                  : "Ride Share"
              }
              userType={userType as "passenger" | "driver"}
              brandColor={brandColor}
              enabled={canUseCommunicationCarPool(carPool.status)}
              onNewMessageWhenNotFocused={(msg) => {
                const name =
                  userType === "passenger"
                    ? carPool.driver?.fullName ?? "Driver"
                    : "Ride Share";
                toast.chat(`New message from ${name}`, {
                  label: "Open",
                  onPress: () => setChatVisible(true),
                });
              }}
            />
          )}
      </SafeAreaView>
    </Modal>
  );
}
