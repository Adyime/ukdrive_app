/**
 * Active Car Pool Screen
 * Shows the current active car pool with real-time map tracking
 * For drivers: manage ride, drop off passengers, complete pool
 * For passengers: view ride status, see other passengers
 *
 * Uber-style full-screen map + bottom sheet
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, ActivityIndicator, Platform, StyleSheet, RefreshControl, Image, Linking } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  LocateFixed,
  Clock,
  Users,
  CheckCircle2,
  Navigation,
  XCircle,
  Phone,
  MessageCircle,
  User,
  Star,
  Minus,
  Plus,
  HelpCircle,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { Loading } from "@/components/ui/loading";
import { ChatModal } from "@/components/chat-modal";
import { useToast } from "@/components/ui/toast";
import { useCall } from "@/hooks/use-call";
import { canUseCommunicationCarPool } from "@/lib/utils/communication";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import { VerificationCodeInput } from "@/components/verification-code-input";
import SwipeButton from "@/components/swipe-button";
import { useCurrentLocation, useWatchLocation } from "@/lib/services/location";
import { useEnsureDriverTrackingContinuity } from "@/lib/services/driver-tracking-continuity";
import { useActiveCarPoolTracking } from "@/hooks/use-realtime";
import {
  getActiveCarPool,
  getCarPoolById,
  joinCarPool,
  dropOffPassenger,
  completeCarPool,
  cancelCarPool,
  leaveCarPool,
  acceptJoinRequest,
  rejectJoinRequest,
  confirmCarPool,
  verifyCarPoolMemberPickupOtp,
  markCarPoolMemberNoShow,
  regenerateCarPoolMemberPickupOtp,
  updateCarPoolSeats,
  type CarPoolResponse,
  type CarPoolMemberResponse,
  CarPoolStatus,
  CarPoolMemberStatus,
  isCarPoolActive,
  canDriverCancel,
  canPassengerLeave,
  getMemberStatusLabel,
  getMemberStatusColor,
  formatFare,
  formatDepartureTime,
} from "@/lib/api/carPool";
import { useCarPoolPayment } from "@/hooks/useCarPoolPayment";
import { getRoute } from "@/lib/services/directions";
import {
  dispatchServiceUpdated,
  dispatchServiceCompleted,
  addServiceEventListener,
} from "@/lib/events";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const DRIVER_SURFACE = "#F3EDFC";
const DRIVER_BORDER = "#D8B4FE";
const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * 0.5;
const REFRESH_INTERVAL = 10000;
const LOCATION_UPDATE_INTERVAL = 10000;
const ROUTE_UPDATE_DEBOUNCE_MS = 30000;
const MIN_POOL_SEATS = 1;
const MAX_POOL_SEATS = 6;
const SUPPORT_PHONE_NUMBER = "09520559469";

function DroppedOffPaymentSection({
  member,
  carPoolId,
  userType,
  isCurrentUser,
  onRefresh,
  onPaymentComplete,
}: {
  member: CarPoolMemberResponse;
  carPoolId: string;
  userType: string;
  isCurrentUser: boolean;
  onRefresh: () => void;
  onPaymentComplete?: () => void;
}) {
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
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
            backgroundColor: userType === "driver" ? DRIVER_SURFACE : "#F9FAFB",
            borderRadius: 12,
            borderWidth: userType === "driver" ? 1 : 0,
            borderColor: userType === "driver" ? DRIVER_BORDER : "transparent",
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 13,
              color: userType === "driver" ? BRAND_PURPLE : "#9CA3AF",
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
            backgroundColor: DRIVER_SURFACE,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: DRIVER_BORDER,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: BRAND_PURPLE,
              marginBottom: 8,
            }}
          >
            Cash payment from {member.passenger?.fullName || "Passenger"}
          </Text>
          <SwipeButton
            onSwipeComplete={async () => {
              const success = await confirmCashPayment();
              if (success) {
                toast.success("Cash payment confirmed!");
                await refreshPayment();
                onRefresh();
              }
            }}
            label="Swipe to Confirm Cash"
            disabled={paymentLoading}
            loading={paymentLoading}
            color={brandColor}
          />
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
            backgroundColor: DRIVER_SURFACE,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: DRIVER_BORDER,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <ActivityIndicator size="small" color={BRAND_PURPLE} />
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: BRAND_PURPLE,
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
            backgroundColor: DRIVER_SURFACE,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: DRIVER_BORDER,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: BRAND_PURPLE,
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

export default function ActiveCarPoolScreen() {
  const { userType, user } = useAuth();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const userId = user?.id;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [280, "55%", "90%"], []);
  const { location: currentLocation } = useCurrentLocation();

  const [carPool, setCarPool] = useState<CarPoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [seatUpdateLoading, setSeatUpdateLoading] = useState(false);
  const [addPassengerLoading, setAddPassengerLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [, setRouteLoading] = useState(false);
  const [pickupVerificationError, setPickupVerificationError] = useState<string | null>(null);
  const [currentMemberPaymentDone, setCurrentMemberPaymentDone] =
    useState(false);
  const [pickupVerificationMemberId, setPickupVerificationMemberId] = useState<string | null>(null);
  const [dropOffLoading, setDropOffLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [memberActionLoading, setMemberActionLoading] = useState<
    Record<string, boolean>
  >({});
  const [refreshingCode, setRefreshingCode] = useState(false);
  const [additionalPassengerCount, setAdditionalPassengerCount] = useState(1);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatPassengerId, setChatPassengerId] = useState<string | null>(null);
  const [chatPassengerName, setChatPassengerName] = useState<string>("Passenger");
  const [memberCallLoadingId, setMemberCallLoadingId] = useState<string | null>(
    null
  );
  const routeUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const { initiate: callInitiate, loading: callLoading } = useCall(
    carPool ? { carPoolId: carPool.id } : null
  );
  const toast = useToast();
  const { showAlert } = useAlert();
  const handleCallSupport = useCallback(() => {
    Linking.openURL(`tel:${SUPPORT_PHONE_NUMBER}`).catch((dialError) => {
      console.error("[ActiveCarPool] Failed to open support dialer:", dialError);
      showAlert(
        "Alert",
        `Unable to open phone dialer. Please call ${SUPPORT_PHONE_NUMBER}.`
      );
    });
  }, [showAlert]);

  const driverId = carPool?.driverId || null;
  const carPoolId = carPool?.id || null;
  const currentMember =
    carPool?.members?.find((m) => m.passengerId === userId) || null;

  const { carPoolStatus, carPoolMemberStatus, driverLocation, isSubscribed } =
    useActiveCarPoolTracking({
      carPoolId,
      driverId,
      userType,
      enabled: !!carPool && isCarPoolActive(carPool.status),
    });

  const driverSelfLocation = useWatchLocation({
    enabled:
      userType === "driver" && !!carPool && isCarPoolActive(carPool.status),
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
        ).catch((error) => {
          console.error(
            "[ActiveCarPool] Failed to queue location update:",
            error
          );
        });
      } catch (error) {
        console.warn(
          "[ActiveCarPool] Failed location publish fallback check:",
          error
        );
      }
    },
  });

  useEnsureDriverTrackingContinuity(
    userType === "driver" && !!carPool && isCarPoolActive(carPool.status),
    "ActiveCarPool"
  );

  const hasRedirectedToDetailsRef = useRef(false);

  // Auto-redirect driver to pool details when pool completes (from realtime or polling)
  useEffect(() => {
    if (
      userType !== "driver" ||
      !carPool?.id ||
      carPool.status !== CarPoolStatus.COMPLETED ||
      hasRedirectedToDetailsRef.current
    )
      return;
    hasRedirectedToDetailsRef.current = true;
    router.replace({
      pathname: "/pool-details",
      params: { id: carPool.id },
    });
  }, [userType, carPool?.id, carPool?.status]);

  const fetchActiveCarPool = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await getActiveCarPool();
      if (response.success && response.data) {
        const activePool = response.data;
        const detailsResponse = await getCarPoolById(activePool.id);
        if (detailsResponse.success && detailsResponse.data) {
          setCarPool(detailsResponse.data);
        } else {
          setCarPool(activePool);
        }
      } else {
        setCarPool(null);
      }
    } catch (error) {
      console.error("[ActiveCarPool] Error fetching active Ride Share:", error);
      if (!silent) {
        toast.error(
          "Failed to fetch ride share details.",
          "Please pull down to refresh."
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (carPoolStatus.carPool && carPoolStatus.carPool.id === carPoolId) {
      setCarPool((prev) => {
        if (!prev) return prev;
        const realtimeData = carPoolStatus.carPool!;
        return {
          ...prev,
          status: realtimeData.status as CarPoolStatus,
          currentPassengerCount: realtimeData.current_passenger_count,
          maxPassengers: realtimeData.max_passengers ?? prev.maxPassengers,
          verificationCode:
            realtimeData.verification_code ?? prev.verificationCode ?? null,
          verificationCodeExpiresAt:
            realtimeData.verification_code_expires_at ??
            prev.verificationCodeExpiresAt ??
            null,
        };
      });
      fetchActiveCarPool(true);
    }
  }, [carPoolStatus.carPool, carPoolId, fetchActiveCarPool]);

  useEffect(() => {
    if (!carPoolMemberStatus.member) return;
    if (carPoolMemberStatus.member.car_pool_id !== carPoolId) return;
    fetchActiveCarPool(true);
  }, [carPoolMemberStatus.member, carPoolId, fetchActiveCarPool]);

  useEffect(() => {
    fetchActiveCarPool();
  }, [fetchActiveCarPool]);

  useEffect(() => {
    const cleanup = addServiceEventListener(() => {
      setTimeout(() => fetchActiveCarPool(true), 500);
    });
    return cleanup;
  }, [fetchActiveCarPool]);

  useEffect(() => {
    setRouteCoordinates([]);
  }, [carPool?.id]);

  // Poll when in progress so passenger sees DROPPED_OFF / completion even if realtime is slow
  const CARPOOL_POLL_MS = 5000;
  useEffect(() => {
    if (
      !carPool ||
      (carPool.status !== CarPoolStatus.IN_PROGRESS &&
        carPool.status !== CarPoolStatus.CONFIRMED)
    )
      return;
    const interval = setInterval(
      () => fetchActiveCarPool(true),
      CARPOOL_POLL_MS
    );
    return () => clearInterval(interval);
  }, [carPool?.id, carPool?.status, fetchActiveCarPool]);

  // Passenger-side fast polling while waiting for confirmation/OTP.
  // This shortens delay between driver confirmation and OTP visibility.
  useEffect(() => {
    if (!carPool) return;
    if (userType !== "passenger") return;
    if (!currentMember) return;
    if (
      currentMember.status === CarPoolMemberStatus.OTP_AVAILABLE &&
      currentMember.verificationCode
    ) {
      return;
    }
    if (
      currentMember.status === CarPoolMemberStatus.IN_RIDE ||
      currentMember.status === CarPoolMemberStatus.DROPPED_OFF ||
      currentMember.status === CarPoolMemberStatus.CANCELLED
    ) {
      return;
    }
    if (!isCarPoolActive(carPool.status)) return;

    const interval = setInterval(() => fetchActiveCarPool(true), 2000);
    return () => clearInterval(interval);
  }, [
    carPool?.id,
    carPool?.status,
    currentMember?.id,
    currentMember?.status,
    currentMember?.verificationCode,
    userType,
    fetchActiveCarPool,
  ]);

  // Backup polling when realtime not subscribed (other active statuses)
  useEffect(() => {
    if (
      !carPool ||
      !isCarPoolActive(carPool.status) ||
      carPool.status === CarPoolStatus.IN_PROGRESS
    )
      return;
    if (isSubscribed) return;
    const interval = setInterval(
      () => fetchActiveCarPool(true),
      REFRESH_INTERVAL
    );
    return () => clearInterval(interval);
  }, [carPool?.id, carPool?.status, fetchActiveCarPool, isSubscribed]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActiveCarPool();
    setRefreshing(false);
  };

  const handleSafeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  }, []);

  const handleVerifyMemberPickup = async (memberId: string, code: string) => {
    if (!carPool) return;
    setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
    setPickupVerificationError(null);
    try {
      const response = await verifyCarPoolMemberPickupOtp(carPool.id, memberId, code);
      if (response.success && response.data) {
        setCarPool(response.data);
        dispatchServiceUpdated();
        setPickupVerificationMemberId(null);
        toast.success("Passenger picked up successfully.");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to verify pickup OTP";
        setPickupVerificationError(errorMessage);
      }
    } catch (error) {
      console.error("Error verifying member pickup OTP:", error);
      setPickupVerificationError("Something went wrong. Please try again.");
    } finally {
      setMemberActionLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleMarkNoShow = async (memberId: string) => {
    if (!carPool) return;
    showAlert(
      "Mark No-Show",
      "Mark this passenger as no-show?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark No-Show",
          style: "destructive",
          onPress: async () => {
            setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
            try {
              const response = await markCarPoolMemberNoShow(
                carPool.id,
                memberId,
                "NO_SHOW"
              );
              if (response.success) {
                dispatchServiceUpdated();
                await fetchActiveCarPool(true);
                if (pickupVerificationMemberId === memberId) {
                  setPickupVerificationMemberId(null);
                }
                toast.info("Passenger marked as no-show.");
              } else {
                const errorMessage =
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? String((response.error as { message: string }).message)
                    : "Failed to mark passenger as no-show";
                toast.error(errorMessage);
              }
            } catch (error) {
              console.error("Error marking no-show:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setMemberActionLoading((prev) => ({ ...prev, [memberId]: false }));
            }
          },
        },
      ]
    );
  };

  const handleCallPassenger = useCallback(
    async (passengerId: string, memberId: string) => {
      if (!carPool?.id) return;
      setMemberCallLoadingId(memberId);
      try {
        await callInitiate({ carPoolId: carPool.id, passengerId });
      } finally {
        setMemberCallLoadingId((prev) => (prev === memberId ? null : prev));
      }
    },
    [callInitiate, carPool?.id]
  );

  const handleConfirmPool = async () => {
    if (!carPool) return;
    setActionLoading(true);
    try {
      const response = await confirmCarPool(carPool.id);
      if (response.success && response.data) {
        setCarPool(response.data);
        dispatchServiceUpdated();
        toast.success("Ride share confirmed. Verify each passenger OTP at pickup.");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to confirm ride share";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error confirming ride share:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSeatChange = async (nextSeats: number) => {
    if (!carPool || userType !== "driver") return;
    if (
      carPool.status === CarPoolStatus.CONFIRMED ||
      carPool.status === CarPoolStatus.IN_PROGRESS ||
      carPool.status === CarPoolStatus.COMPLETED ||
      carPool.status === CarPoolStatus.CANCELLED
    ) {
      toast.error("Seat count cannot be modified after the ride share is confirmed.");
      return;
    }

    if (nextSeats < carPool.currentPassengerCount) {
      toast.error(
        `Cannot reduce below ${carPool.currentPassengerCount} booked passenger${
          carPool.currentPassengerCount > 1 ? "s" : ""
        }.`
      );
      return;
    }

    if (nextSeats < MIN_POOL_SEATS || nextSeats > MAX_POOL_SEATS) {
      toast.error(`Seats must be between ${MIN_POOL_SEATS} and ${MAX_POOL_SEATS}.`);
      return;
    }

    if (nextSeats === carPool.maxPassengers) {
      toast.info("Seat count is already up to date.");
      return;
    }

    setSeatUpdateLoading(true);
    try {
      const response = await updateCarPoolSeats(carPool.id, {
        maxPassengers: nextSeats,
      });

      if (response.success && response.data) {
        setCarPool(response.data);
        dispatchServiceUpdated();
        await fetchActiveCarPool(true);
        toast.success(`Seat availability updated to ${nextSeats}.`);
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to update seat availability";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error updating seat availability:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSeatUpdateLoading(false);
    }
  };

  const handleDropOff = async (memberId: string) => {
    if (!carPool) return;
    setDropOffLoading((prev) => ({ ...prev, [memberId]: true }));
    try {
      const response = await dropOffPassenger(carPool.id, memberId);
      if (response.success) {
        dispatchServiceUpdated();
        await fetchActiveCarPool(true);
        toast.success("Passenger dropped off.");
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
      console.error("Error dropping off passenger:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setDropOffLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleAcceptRequest = async (memberId: string) => {
    if (!carPool) return;
    setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
    try {
      const response = await acceptJoinRequest(carPool.id, memberId);
      if (response.success) {
        dispatchServiceUpdated();
        await fetchActiveCarPool(true);
        toast.success("Join request accepted!");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to accept join request";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error accepting join request:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setMemberActionLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleRejectRequest = async (memberId: string) => {
    if (!carPool) return;
    showAlert(
      "Reject Request",
      "Are you sure you want to reject this join request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
            try {
              const response = await rejectJoinRequest(carPool.id, memberId);
              if (response.success) {
                dispatchServiceUpdated();
                await fetchActiveCarPool(true);
                toast.info("Join request rejected.");
              } else {
                const errorMessage =
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? String((response.error as { message: string }).message)
                    : "Failed to reject join request";
                toast.error(errorMessage);
              }
            } catch (error) {
              console.error("Error rejecting join request:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setMemberActionLoading((prev) => ({
                ...prev,
                [memberId]: false,
              }));
            }
          },
        },
      ]
    );
  };

  const handleCompletePool = async () => {
    if (!carPool) return;
    showAlert(
      "Complete Ride Share",
      "Are you sure all passengers have been dropped off?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: async () => {
            setActionLoading(true);
            try {
              const response = await completeCarPool(carPool.id);
              if (response.success && response.data) {
                dispatchServiceCompleted();
                setCarPool(response.data);
                toast.success(
                  `Ride share completed. Earnings: ${formatFare(
                    response.data.totalFareForDriver || 0
                  )}`
                );
                setTimeout(() => {
                  router.replace({
                    pathname: "/pool-details",
                    params: { id: carPool.id },
                  });
                }, 400);
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
              console.error("Error completing ride share:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRefreshVerificationCode = async () => {
    if (!carPool || !currentMember) return;
    setRefreshingCode(true);
    try {
      const response = await regenerateCarPoolMemberPickupOtp(
        carPool.id,
        currentMember.id
      );
      if (response.success && response.data) {
        await fetchActiveCarPool(true);
        toast.info("Verification code refreshed.");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to refresh verification code";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error refreshing verification code:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setRefreshingCode(false);
    }
  };

  const handleLeavePool = async () => {
    if (!carPool || !currentMember) return;
    showAlert(
      "Leave Ride Share",
      "Are you sure you want to leave this ride share?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setCancelLoading(true);
            try {
              const response = await leaveCarPool(
                carPool.id,
                "Left by passenger"
              );
              if (response.success) {
                dispatchServiceCompleted();
                setCarPool(null);
                toast.success("You have left the ride share.");
                router.replace("/(tabs)");
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
              console.error("Error leaving ride share:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setCancelLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleRequestAdditionalPassengers = async () => {
    if (!carPool || !currentMember) return;
    if (!canRequestAdditionalPassengers) return;

    if (
      additionalPassengerCount < 1 ||
      additionalPassengerCount > availableAdditionalSeats
    ) {
      toast.error(
        `Only ${availableAdditionalSeats} seat${
          availableAdditionalSeats !== 1 ? "s are" : " is"
        } available for additional request.`
      );
      return;
    }

    setAddPassengerLoading(true);
    try {
      const response = await joinCarPool(carPool.id, {
        pickupLatitude: currentMember.pickupLatitude,
        pickupLongitude: currentMember.pickupLongitude,
        pickupLocation: currentMember.pickupLocation,
        destinationLatitude: currentMember.destinationLatitude,
        destinationLongitude: currentMember.destinationLongitude,
        destinationLocation: currentMember.destinationLocation,
        passengerCount: additionalPassengerCount,
      });

      if (response.success && response.data) {
        dispatchServiceUpdated();
        await fetchActiveCarPool(true);
        const successText =
          response.data.status === CarPoolMemberStatus.PENDING
            ? "Additional passenger request sent to driver."
            : "Additional passengers added successfully.";
        toast.success(successText);
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to add passengers";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error requesting additional passengers:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setAddPassengerLoading(false);
    }
  };

  const handleCancelPool = async () => {
    if (!carPool || userType !== "driver") return;
    showAlert(
      "Cancel Ride Share",
      "Are you sure you want to cancel this ride share? All members will be notified.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelLoading(true);
            try {
              const response = await cancelCarPool(
                carPool.id,
                "Cancelled by driver"
              );
              if (response.success) {
                dispatchServiceUpdated();
                dispatchServiceCompleted();
                setCarPool(null);
                toast.success("Ride share cancelled.");
                router.replace("/(tabs)");
              } else {
                const errorMessage =
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? String((response.error as { message: string }).message)
                    : "Failed to cancel ride share";
                toast.error(errorMessage);
              }
            } catch (error) {
              console.error("Error cancelling ride share:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setCancelLoading(false);
            }
          },
        },
      ]
    );
  };

  const mapLocations = useMemo(() => {
    if (!carPool)
      return { start: undefined, end: undefined, driver: undefined };
    const start =
      carPool.startLatitude && carPool.startLongitude
        ? {
            latitude: Number(carPool.startLatitude),
            longitude: Number(carPool.startLongitude),
          }
        : undefined;
    const end =
      carPool.endLatitude && carPool.endLongitude
        ? {
            latitude: Number(carPool.endLatitude),
            longitude: Number(carPool.endLongitude),
          }
        : undefined;
    let driver: { latitude: number; longitude: number } | undefined;
    if (userType === "driver" && driverSelfLocation.location) {
      driver = {
        latitude: driverSelfLocation.location.coords.latitude,
        longitude: driverSelfLocation.location.coords.longitude,
      };
    } else if (userType === "passenger" && driverLocation.location) {
      driver = {
        latitude: driverLocation.location.latitude,
        longitude: driverLocation.location.longitude,
      };
    }
    return { start, end, driver };
  }, [carPool, driverSelfLocation.location, driverLocation.location, userType]);

  const getMapRegion = () => {
    if (mapLocations.start && mapLocations.end) {
      const minLat = Math.min(
        mapLocations.start.latitude,
        mapLocations.end.latitude
      );
      const maxLat = Math.max(
        mapLocations.start.latitude,
        mapLocations.end.latitude
      );
      const minLng = Math.min(
        mapLocations.start.longitude,
        mapLocations.end.longitude
      );
      const maxLng = Math.max(
        mapLocations.start.longitude,
        mapLocations.end.longitude
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

  const fetchRoute = useCallback(async () => {
    if (!carPool || !isCarPoolActive(carPool.status)) {
      setRouteCoordinates([]);
      return;
    }
    if (
      carPool.status === CarPoolStatus.CREATED ||
      carPool.status === CarPoolStatus.OPEN ||
      carPool.status === CarPoolStatus.COMPLETED ||
      carPool.status === CarPoolStatus.CANCELLED
    ) {
      setRouteCoordinates([]);
      return;
    }
    if (!mapLocations.start || !mapLocations.end) {
      setRouteCoordinates([]);
      return;
    }
    setRouteLoading(true);
    try {
      const routeInfo = await getRoute(
        mapLocations.start,
        mapLocations.end,
        carPool.vehicleType
      );
      if (routeInfo && routeInfo.coordinates.length > 0) {
        setRouteCoordinates(routeInfo.coordinates);
      } else {
        setRouteCoordinates([mapLocations.start, mapLocations.end]);
      }
    } catch (error) {
      console.error("[ActiveCarPool] Error fetching route:", error);
      if (mapLocations.start && mapLocations.end) {
        setRouteCoordinates([mapLocations.start, mapLocations.end]);
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
    if (!mapLocations.start || !mapLocations.end) return;
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
    mapLocations?.start,
    mapLocations?.end,
    fetchRoute,
  ]);

  useEffect(() => {
    if (mapLocations.start && mapLocations.end && mapRef.current) {
      const coords = [mapLocations.start, mapLocations.end];
      if (mapLocations.driver) coords.push(mapLocations.driver);
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }
  }, [mapLocations.start, mapLocations.end, mapLocations.driver]);

  const pendingMembers =
    carPool?.members?.filter((m) => m.status === CarPoolMemberStatus.PENDING) ||
    [];
  const confirmedMembers =
    carPool?.members?.filter(
      (m) => m.status === CarPoolMemberStatus.CONFIRMED
    ) || [];
  const otpAvailableMembers =
    carPool?.members?.filter(
      (m) => m.status === CarPoolMemberStatus.OTP_AVAILABLE
    ) || [];
  const inRideMembers =
    carPool?.members?.filter((m) => m.status === CarPoolMemberStatus.IN_RIDE) ||
    [];
  const unresolvedMembers = [...pendingMembers, ...confirmedMembers, ...otpAvailableMembers, ...inRideMembers];
  const availableAdditionalSeats =
    carPool && currentMember
      ? Math.max(
          0,
          carPool.maxPassengers -
            carPool.currentPassengerCount -
            currentMember.passengerCount
        )
      : 0;
  const canRequestAdditionalPassengers =
    userType === "passenger" &&
    !!carPool &&
    !!currentMember &&
    carPool.status === CarPoolStatus.OPEN &&
    (currentMember.status === CarPoolMemberStatus.PENDING ||
      currentMember.status === CarPoolMemberStatus.CONFIRMED) &&
    availableAdditionalSeats > 0;
  const canCancel =
    userType === "driver" && carPool
      ? canDriverCancel(carPool.status)
      : false;

  useEffect(() => {
    if (!canRequestAdditionalPassengers) {
      setAdditionalPassengerCount(1);
      return;
    }
    setAdditionalPassengerCount((prev) =>
      Math.min(Math.max(1, prev), availableAdditionalSeats)
    );
  }, [canRequestAdditionalPassengers, availableAdditionalSeats]);

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
        <Loading message="Loading ride share..." />
      </View>
    );
  }

  if (!carPool) {
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
            ? "Create or manage a ride share to get started."
            : "Join a ride share to see your active ride here."}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (userType === "driver")
              router.replace("/(tabs)/create-car-pool");
            else router.replace("/(tabs)/browse-car-pools");
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
            {userType === "driver" ? "Create Ride Share" : "Browse Ride Shares"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const mapRegion = getMapRegion();

  const renderStatusIcon = () => {
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

  const getStatusTitle = () => {
    if (
      userType === "passenger" &&
      currentMember?.status === CarPoolMemberStatus.OTP_AVAILABLE &&
      currentMember?.verificationCode
    ) {
      return "Pickup OTP Ready";
    }
    switch (carPool.status) {
      case CarPoolStatus.CREATED:
        return "Ride Share Created";
      case CarPoolStatus.OPEN:
        return userType === "driver"
          ? "Open for Joining"
          : "Waiting for Confirmation";
      case CarPoolStatus.CONFIRMED:
        return "Pool Confirmed";
      case CarPoolStatus.IN_PROGRESS:
        return "Ride In Progress";
      case CarPoolStatus.COMPLETED:
        return "Ride Completed";
      case CarPoolStatus.CANCELLED:
        return "Ride Share Cancelled";
      default:
        return "Ride Share";
    }
  };

  const getStatusSubtitle = () => {
    if (
      userType === "passenger" &&
      currentMember?.status === CarPoolMemberStatus.OTP_AVAILABLE &&
      currentMember?.verificationCode
    ) {
      return "Share this OTP with the driver to start your ride.";
    }
    switch (carPool.status) {
      case CarPoolStatus.CREATED:
        return "Open the ride share to allow passengers to join.";
      case CarPoolStatus.OPEN:
        return userType === "driver"
          ? "Passengers can join. Confirm when ready."
          : "The driver will confirm the ride share soon.";
      case CarPoolStatus.CONFIRMED:
        return userType === "driver"
          ? "Verify each passenger OTP at pickup points."
          : "The ride will start soon.";
      case CarPoolStatus.IN_PROGRESS:
        return userType === "driver"
          ? "Drop off passengers as you reach their destinations."
          : "Enjoy your ride!";
      case CarPoolStatus.COMPLETED:
        return "Thank you for using our service!";
      case CarPoolStatus.CANCELLED:
        return carPool.cancellationReason
          ? `Reason: ${carPool.cancellationReason}`
          : "";
      default:
        return "";
    }
  };

  const statusIconBgColor = () => {
    const lightBg = userType === "driver" ? "#F3E8FF" : "#FFF7ED";
    switch (carPool.status) {
      case CarPoolStatus.CREATED:
        return "#F3F4F6";
      case CarPoolStatus.OPEN:
        return lightBg;
      case CarPoolStatus.CONFIRMED:
        return lightBg;
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

  const nonPendingMembers =
    carPool.members?.filter((m) => m.status !== CarPoolMemberStatus.PENDING) ||
    [];
  const visibleMembers =
    userType === "passenger"
      ? nonPendingMembers.filter((m) => m.passengerId === userId)
      : nonPendingMembers;

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e" }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
        initialRegion={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {mapLocations.start && (
          <Marker
            coordinate={mapLocations.start}
            title="Start"
            pinColor="#16A34A"
          />
        )}
        {mapLocations.end && (
          <Marker
            coordinate={mapLocations.end}
            title="End"
            pinColor="#EF4444"
          />
        )}
        {mapLocations.driver && (
          <Marker
            coordinate={mapLocations.driver}
            title={userType === "driver" ? "You" : "Driver"}
            pinColor={brandColor}
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
          />
        )}
      </MapView>

      {/* Back button */}
      <TouchableOpacity
        onPress={handleSafeBack}
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

      {/* Locate button */}
      <TouchableOpacity
        onPress={() => {
          if (mapLocations.start && mapLocations.end && mapRef.current) {
            const coords = [mapLocations.start, mapLocations.end];
            if (mapLocations.driver) coords.push(mapLocations.driver);
            mapRef.current.fitToCoordinates(coords, {
              edgePadding: { top: 80, right: 50, bottom: 300, left: 50 },
              animated: true,
            });
          }
        }}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          top: insets.top + 10,
          right: 16,
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
        <LocateFixed size={20} color={brandColor} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <BottomSheet
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture={true}
        android_keyboardInputMode="adjustResize"
        ref={bottomSheetRef}
        index={1}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={brandColor}
            />
          }
        >
          {/* Status Header */}
          <View
            style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
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
                  {getStatusSubtitle()}
                </Text>
              </View>
            </View>

            {/* Fare display */}
            {carPool.status === CarPoolStatus.COMPLETED && (
              <View style={{ alignItems: "center", marginBottom: 8 }}>
                {userType === "driver" && carPool.totalFareForDriver ? (
                  <Text
                    style={{
                      fontFamily: "Figtree_700Bold",
                      fontSize: 28,
                      color: brandColor,
                    }}
                  >
                    {formatFare(carPool.totalFareForDriver)}
                  </Text>
                ) : null}
                {currentMember && currentMember.fare ? (
                  <Text
                    style={{
                      fontFamily: "Figtree_700Bold",
                      fontSize: 28,
                      color: brandColor,
                    }}
                  >
                    Paid: {formatFare(currentMember.fare)}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          {/* Route + Details Card */}
          <View
            style={{
              marginHorizontal: 16,
              backgroundColor: "#FFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 16,
              marginBottom: 12,
            }}
          >
            {/* Route */}
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
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#111827",
                  }}
                >
                  {carPool.startLocation}
                </Text>
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
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#111827",
                  }}
                >
                  {carPool.endLocation}
                </Text>
              </View>
            </View>

            <View
              style={{
                height: 1,
                backgroundColor: "#F3F4F6",
                marginBottom: 12,
              }}
            />

            {/* Details row */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Clock size={14} color="#6B7280" />
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 12,
                    color: "#6B7280",
                    marginLeft: 4,
                  }}
                >
                  {formatDepartureTime(carPool.departureTime)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Users size={14} color="#6B7280" />
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 12,
                    color: "#6B7280",
                    marginLeft: 4,
                  }}
                >
                  {carPool.currentPassengerCount}/{carPool.maxPassengers}{" "}
                  passengers
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 16,
                    color: brandColor,
                  }}
                >
                  {formatFare(
                    userType === "driver"
                      ? carPool.totalFareForDriver ||
                          carPool.baseFare * carPool.currentPassengerCount
                      : currentMember?.fare ||
                          carPool.calculatedFarePerPerson ||
                          carPool.baseFare
                  )}
                </Text>
              </View>
            </View>

            {userType === "driver" &&
              (carPool.status === CarPoolStatus.CREATED ||
                carPool.status === CarPoolStatus.OPEN) && (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 13,
                    color: "#111827",
                    marginBottom: 8,
                  }}
                >
                  Manage Seats
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: DRIVER_SURFACE,
                    borderWidth: 1,
                    borderColor: DRIVER_BORDER,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => handleSeatChange(carPool.maxPassengers - 1)}
                    disabled={
                      seatUpdateLoading ||
                      carPool.maxPassengers <=
                        Math.max(MIN_POOL_SEATS, carPool.currentPassengerCount)
                    }
                    activeOpacity={0.85}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      opacity:
                        seatUpdateLoading ||
                        carPool.maxPassengers <=
                          Math.max(
                            MIN_POOL_SEATS,
                            carPool.currentPassengerCount
                          )
                          ? 0.45
                          : 1,
                    }}
                  >
                    <Minus size={16} color="#111827" />
                  </TouchableOpacity>

                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontFamily: "Figtree_700Bold",
                        fontSize: 20,
                        color: "#111827",
                      }}
                    >
                      {carPool.maxPassengers}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 11,
                        color: "#6B7280",
                      }}
                    >
                      Seats • {carPool.currentPassengerCount} booked
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleSeatChange(carPool.maxPassengers + 1)}
                    disabled={
                      seatUpdateLoading ||
                      carPool.maxPassengers >= MAX_POOL_SEATS
                    }
                    activeOpacity={0.85}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      opacity:
                        seatUpdateLoading ||
                        carPool.maxPassengers >= MAX_POOL_SEATS
                          ? 0.45
                          : 1,
                    }}
                  >
                    {seatUpdateLoading ? (
                      <ActivityIndicator size="small" color={BRAND_PURPLE} />
                    ) : (
                      <Plus size={16} color="#111827" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

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
                </View>
              </View>
            )}

            {canRequestAdditionalPassengers && currentMember && (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  Add More Passengers
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 12,
                    color: "#6B7280",
                    marginTop: 4,
                    lineHeight: 18,
                  }}
                >
                  Requested: {currentMember.passengerCount} seat
                  {currentMember.passengerCount > 1 ? "s" : ""}. Add more seats
                  to this booking if available.
                </Text>

                <View
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#FFFBF5",
                    borderWidth: 1,
                    borderColor: "#FCD9BD",
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  <TouchableOpacity
                    onPress={() =>
                      setAdditionalPassengerCount((prev) =>
                        Math.max(1, prev - 1)
                      )
                    }
                    disabled={addPassengerLoading || additionalPassengerCount <= 1}
                    activeOpacity={0.85}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      opacity:
                        addPassengerLoading || additionalPassengerCount <= 1
                          ? 0.45
                          : 1,
                    }}
                  >
                    <Minus size={16} color="#111827" />
                  </TouchableOpacity>

                  <View style={{ alignItems: "center", flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Figtree_700Bold",
                        fontSize: 20,
                        color: "#111827",
                      }}
                    >
                      {additionalPassengerCount}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 11,
                        color: "#6B7280",
                      }}
                    >
                      Extra seat{additionalPassengerCount > 1 ? "s" : ""}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      setAdditionalPassengerCount((prev) =>
                        Math.min(availableAdditionalSeats, prev + 1)
                      )
                    }
                    disabled={
                      addPassengerLoading ||
                      additionalPassengerCount >= availableAdditionalSeats
                    }
                    activeOpacity={0.85}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#FFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      opacity:
                        addPassengerLoading ||
                        additionalPassengerCount >= availableAdditionalSeats
                          ? 0.45
                          : 1,
                    }}
                  >
                    <Plus size={16} color="#111827" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleRequestAdditionalPassengers}
                  disabled={addPassengerLoading}
                  activeOpacity={0.9}
                  style={{
                    marginTop: 10,
                    backgroundColor: brandColor,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 44,
                    opacity: addPassengerLoading ? 0.65 : 1,
                  }}
                >
                  {addPassengerLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 14,
                        color: "#FFFFFF",
                      }}
                    >
                      Request {additionalPassengerCount} more seat
                      {additionalPassengerCount > 1 ? "s" : ""}
                    </Text>
                  )}
                </TouchableOpacity>

                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 11,
                    color: "#6B7280",
                    marginTop: 6,
                  }}
                >
                  {availableAdditionalSeats} seat
                  {availableAdditionalSeats > 1 ? "s" : ""} available in this
                  ride share.
                </Text>
              </View>
            )}
          </View>

          {/* Payment Complete banner */}
          {userType === "passenger" &&
            currentMember?.status === CarPoolMemberStatus.DROPPED_OFF &&
            currentMemberPaymentDone && (
              <View
                style={{
                  marginHorizontal: 16,
                  marginBottom: 12,
                  backgroundColor: "#F0FDF4",
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#BBF7D0",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <CheckCircle2 size={24} color="#16A34A" />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 15,
                      color: "#16A34A",
                    }}
                  >
                    Payment Complete
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 13,
                      color: "#6B7280",
                    }}
                  >
                    Thank you! Your fare of {formatFare(currentMember.fare!)}{" "}
                    has been paid.
                  </Text>
                </View>
              </View>
            )}

          {/* Verification Code Display (Passengers) */}
          {userType === "passenger" &&
            currentMember?.status === CarPoolMemberStatus.OTP_AVAILABLE &&
            currentMember.verificationCode && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <VerificationCodeDisplay
                  code={currentMember.verificationCode}
                  expiresAt={null}
                  serviceType="carpool"
                  onRefresh={handleRefreshVerificationCode}
                  refreshing={refreshingCode}
                />
              </View>
            )}

          {/* Pending Join Requests */}
          {userType === "driver" &&
            pendingMembers.length > 0 &&
            carPool.status === CarPoolStatus.OPEN && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
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
                        {/* Passenger phone intentionally hidden for driver privacy/masking */}
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
                    <View style={{ marginBottom: 12 }}>
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
                        style={{ flexDirection: "row", alignItems: "center" }}
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
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => handleAcceptRequest(member.id)}
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
                        onPress={() => handleRejectRequest(member.id)}
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
          {visibleMembers.length > 0 && (
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 16,
                  color: "#111827",
                  marginBottom: 12,
                }}
              >
                {userType === "passenger"
                  ? "Your Ride Share Booking"
                  : `Passengers (${visibleMembers.length})`}
              </Text>
              {visibleMembers.map((member) => (
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
                          <Text style={{ color: brandColor }}> (You)</Text>
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
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {userType === "driver" &&
                        canUseCommunicationCarPool(carPool.status) &&
                        member.status !== CarPoolMemberStatus.CANCELLED &&
                        member.status !== CarPoolMemberStatus.NO_SHOW && (
                          <>
                            <TouchableOpacity
                              onPress={() => {
                                setChatPassengerId(member.passengerId);
                                setChatPassengerName(
                                  member.passenger?.fullName || "Passenger"
                                );
                                setChatVisible(true);
                              }}
                              activeOpacity={0.8}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <MessageCircle size={18} color={brandColor} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                handleCallPassenger(member.passengerId, member.id)
                              }
                              disabled={
                                callLoading || memberCallLoadingId === member.id
                              }
                              activeOpacity={0.8}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              {memberCallLoadingId === member.id ? (
                                <ActivityIndicator size="small" color={brandColor} />
                              ) : (
                                <Phone size={18} color={brandColor} />
                              )}
                            </TouchableOpacity>
                          </>
                        )}
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
                  </View>
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
                      style={{ flexDirection: "row", alignItems: "center" }}
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

                  {/* Driver member-level pickup verification */}
                  {userType === "driver" &&
                    member.status === CarPoolMemberStatus.OTP_AVAILABLE && (
                      <View style={{ marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setPickupVerificationError(null);
                            setPickupVerificationMemberId((prev) =>
                              prev === member.id ? null : member.id
                            );
                          }}
                          activeOpacity={0.85}
                          style={{
                            borderRadius: 12,
                            paddingVertical: 10,
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: brandColor,
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 14,
                              color: brandColor,
                            }}
                          >
                            {pickupVerificationMemberId === member.id
                              ? "Close OTP Verify"
                              : "Verify Pickup OTP"}
                          </Text>
                        </TouchableOpacity>

                        {pickupVerificationMemberId === member.id && (
                          <View style={{ marginBottom: 8 }}>
                            <VerificationCodeInput
                              onVerify={(code) =>
                                handleVerifyMemberPickup(member.id, code)
                              }
                              serviceType="carpool"
                              error={pickupVerificationError}
                              loading={!!memberActionLoading[member.id]}
                            />
                          </View>
                        )}

                        <TouchableOpacity
                          onPress={() => handleMarkNoShow(member.id)}
                          disabled={!!memberActionLoading[member.id]}
                          activeOpacity={0.85}
                          style={{
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
                              fontSize: 13,
                              color: "#EF4444",
                            }}
                          >
                            Mark No-Show
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                  {/* Drop Off Button */}
                  {userType === "driver" &&
                    member.status === CarPoolMemberStatus.IN_RIDE && (
                      <TouchableOpacity
                        onPress={() => handleDropOff(member.id)}
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
                          <ActivityIndicator size="small" color={brandColor} />
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
          <View style={{ marginHorizontal: 16 }}>
            {userType === "driver" && carPool.status === CarPoolStatus.OPEN && (
              <TouchableOpacity
                onPress={handleConfirmPool}
                disabled={actionLoading || pendingMembers.length > 0}
                activeOpacity={0.85}
                style={{
                  backgroundColor:
                    actionLoading || pendingMembers.length > 0
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
                    {pendingMembers.length > 0
                      ? `Accept/Reject ${pendingMembers.length} Request${
                          pendingMembers.length > 1 ? "s" : ""
                        } First`
                      : "Confirm Ride Share"}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {userType === "driver" &&
              carPool.status === CarPoolStatus.IN_PROGRESS &&
              unresolvedMembers.length === 0 && (
                <TouchableOpacity
                  onPress={handleCompletePool}
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
                      Complete Ride
                    </Text>
                  )}
                </TouchableOpacity>
              )}

            {canCancel && (
              <TouchableOpacity
                onPress={handleCancelPool}
                disabled={cancelLoading || actionLoading}
                activeOpacity={0.85}
                style={{
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#EF4444",
                  marginBottom: 10,
                  opacity: cancelLoading || actionLoading ? 0.6 : 1,
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
                    Cancel Ride Share
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Passenger Leave */}
            {userType === "passenger" &&
              currentMember &&
              canPassengerLeave(carPool.status, currentMember.status) && (
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
                    marginBottom: 10,
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

            {/* Contact Options */}
            {isCarPoolActive(carPool.status) && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 12,
                    marginTop: 8,
                    marginBottom: 10,
                  }}
                >
                  {canUseCommunicationCarPool(carPool.status) &&
                    (userType === "passenger"
                      ? !!carPool.driver && !!currentMember
                      : true) && (
                      <>
                        {userType === "passenger" && (
                          <TouchableOpacity
                            onPress={() => {
                              setChatPassengerId(currentMember!.passengerId);
                              setChatPassengerName(carPool.driver?.fullName ?? "Driver");
                              setChatVisible(true);
                            }}
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
                        )}
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
                      </>
                    )}
                  <TouchableOpacity
                    onPress={handleCallSupport}
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
                    <HelpCircle size={18} color={brandColor} />
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 14,
                        color: "#111827",
                        marginLeft: 6,
                      }}
                    >
                      Call Support
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Chat Modal — per-passenger conversation */}
      {carPool &&
        canUseCommunicationCarPool(carPool.status) &&
        chatPassengerId && (
          <ChatModal
            visible={chatVisible}
            onClose={() => {
              setChatVisible(false);
              setChatPassengerId(null);
            }}
            carPoolId={carPool.id}
            passengerId={chatPassengerId}
            otherPartyName={
              userType === "passenger"
                ? carPool.driver?.fullName ?? "Driver"
                : chatPassengerName
            }
            userType={userType as "passenger" | "driver"}
            brandColor={brandColor}
            enabled={canUseCommunicationCarPool(carPool.status)}
            onNewMessageWhenNotFocused={(msg) => {
              const name =
                userType === "passenger"
                  ? carPool.driver?.fullName ?? "Driver"
                  : chatPassengerName;
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
