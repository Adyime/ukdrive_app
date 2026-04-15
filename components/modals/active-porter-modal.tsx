/**
 * Active Porter Modal
 * Displays the active porter service screen as a modal overlay
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ScrollView, RefreshControl, TouchableOpacity, Dimensions, Modal, Platform, InteractionManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { Loading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { ChatModal } from "@/components/chat-modal";
import { useToast } from "@/components/ui/toast";
import { useCall } from "@/hooks/use-call";
import { canUseCommunicationPorter } from "@/lib/utils/communication";
import { ServiceMap, type MapLocation } from "@/components/service-map";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import { VerificationCodeInput } from "@/components/verification-code-input";
import { useWatchLocation } from "@/lib/services/location";
import { useActivePorterTracking } from "@/hooks/use-realtime";
import {
  getActivePorterService,
  getPorterPayment,
  updatePorterStatus,
  cancelPorterService,
  type PorterServiceResponse,
  PorterStatus,
  isPorterServiceActive,
  canCustomerCancel,
  canDriverCancel,
  getNextDriverStatus,
  getDriverActionLabel,
  getStatusLabel,
  getStatusColor,
  formatFare,
  formatPackageType,
} from "@/lib/api/porter";
import { router } from "expo-router";
import { dispatchServiceCompleted } from "@/lib/events";

// Constants
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_HEIGHT = SCREEN_HEIGHT * 0.3;
const REFRESH_INTERVAL = 10000;
const LOCATION_UPDATE_INTERVAL = 10000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const PASSENGER_CANCEL_REASONS = [
  "Driver is taking too long",
  "Changed my plan",
  "Booked by mistake",
  "Pickup location issue",
  "Fare is too high",
  "Other",
] as const;

export interface ActivePorterModalProps {
  visible: boolean;
  onClose: () => void;
  onServiceComplete?: () => void;
  porterServiceId?: string;
}

export function ActivePorterModal({
  visible,
  onClose,
  onServiceComplete,
  porterServiceId,
}: ActivePorterModalProps) {
  const { userType } = useAuth();
  const brandColor = userType === "driver" ? "#843FE3" : "#F36D14";

  // State
  const [porterService, setPorterService] =
    useState<PorterServiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState<string>(
    PASSENGER_CANCEL_REASONS[0]
  );
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [showVerificationInput, setShowVerificationInput] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const hasNavigatedToDetailsRef = useRef<string | null>(null);

  const { initiate: callInitiate, loading: callLoading } = useCall(
    porterService ? { porterServiceId: porterService.id } : null
  );
  const toast = useToast();
  const { showAlert } = useAlert();

  const navigatePassengerAfterDelivery = useCallback(async (serviceId: string) => {
    try {
      const paymentResponse = await getPorterPayment(serviceId);
      const payment = paymentResponse.success ? paymentResponse.data?.payment : null;
      if (payment?.status === "PENDING" && !payment.paymentMethod) {
        router.replace({
          pathname: "/porter-payment",
          params: { porterServiceId: serviceId },
        });
        return;
      }
      if (payment && (payment.status === "PENDING" || payment.status === "COMPLETED")) {
        router.replace({
          pathname: "/porter-payment-status",
          params: { porterServiceId: serviceId },
        });
        return;
      }
    } catch (error) {
      // Fall back to payment screen
    }

    router.replace({
      pathname: "/porter-payment",
      params: { porterServiceId: serviceId },
    });
  }, []);

  // Get driver ID from porter service
  const driverId = porterService?.driver?.id || porterService?.driverId || null;
  const activePorterServiceId = porterService?.id || null;

  // Realtime subscriptions
  const { porterStatus, driverLocation, isSubscribed } =
    useActivePorterTracking({
      porterServiceId: activePorterServiceId,
      driverId,
      userType: userType as "passenger" | "driver" | null,
      enabled:
        visible &&
        !!porterService &&
        isPorterServiceActive(porterService.status),
    });

  // Watch driver's location
  const driverSelfLocation = useWatchLocation({
    enabled:
      visible &&
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
        ).catch(console.error);
      } catch (error) {
        console.warn(
          "[ActivePorterModal] Failed location publish fallback check:",
          error
        );
      }
    },
  });

  // Update porter state from realtime (hook returns porterStatus.porter, not porterService)
  useEffect(() => {
    if (!porterStatus.porter) return;
    const p = porterStatus.porter;
    const newStatus = p.status as any;

    if (newStatus === PorterStatus.DELIVERED && p.id) {
      if (hasNavigatedToDetailsRef.current === p.id) return;
      hasNavigatedToDetailsRef.current = p.id;
      onClose();
      onServiceComplete?.();
      if (userType === "passenger") {
        void navigatePassengerAfterDelivery(p.id);
      } else {
        router.replace({
          pathname: "/porter-payment-status",
          params: { porterServiceId: p.id },
        });
      }
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
        acceptedAt: p.accepted_at || prev.acceptedAt,
        pickedUpAt: p.picked_up_at || prev.pickedUpAt,
        inTransitAt:
          (p as { in_transit_at?: string | null }).in_transit_at ||
          prev.inTransitAt,
        deliveredAt: p.delivered_at || prev.deliveredAt,
        cancelledAt: p.cancelled_at || prev.cancelledAt,
        cancellationReason: p.cancellation_reason || prev.cancellationReason,
      };
    });
  }, [porterStatus.porter, onClose, onServiceComplete, navigatePassengerAfterDelivery, userType]);

  // When porterService is already DELIVERED (e.g. from fetch), navigate to payment once
  useEffect(() => {
    if (
      !visible ||
      !porterService ||
      porterService.status !== PorterStatus.DELIVERED
    )
      return;
    const serviceId = porterService.id;
    if (hasNavigatedToDetailsRef.current === serviceId) return;
    hasNavigatedToDetailsRef.current = serviceId;
    onClose();
    onServiceComplete?.();
    if (userType === "passenger") {
      void navigatePassengerAfterDelivery(serviceId);
    } else {
      router.replace({
        pathname: "/porter-payment-status",
        params: { porterServiceId: serviceId },
      });
    }
  }, [
    visible,
    porterService?.id,
    porterService?.status,
    onClose,
    onServiceComplete,
    navigatePassengerAfterDelivery,
    userType,
  ]);

  // Fetch porter service on mount
  useEffect(() => {
    if (visible) {
      fetchActivePorterService();
    }
  }, [visible]);

  // Backup polling
  useEffect(() => {
    if (
      !visible ||
      !porterService ||
      !isPorterServiceActive(porterService.status)
    )
      return;

    const interval = setInterval(() => {
      if (!isSubscribed) {
        fetchActivePorterService(true);
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [visible, porterService, isSubscribed]);

  const fetchActivePorterService = async (
    silent: boolean = false,
    retryCount: number = 0
  ) => {
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

        if (!silent) {
          toast.error("Failed to fetch Parcel service details.");
        }
      }
    } catch (error) {
      if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        return fetchActivePorterService(silent, retryCount + 1);
      }

      if (!silent) {
        toast.error("Failed to fetch Parcel service details.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActivePorterService();
    setRefreshing(false);
  };

  const handleUpdateStatus = async (verificationCode?: string) => {
    if (!porterService) return;

    const nextStatus = getNextDriverStatus(porterService.status);
    if (!nextStatus) return;

    if (nextStatus === PorterStatus.PICKED_UP && !verificationCode) {
      setShowVerificationInput(true);
      return;
    }

    setActionLoading(true);
    setVerificationError(null);

    try {
      const response = await updatePorterStatus(
        porterService.id,
        nextStatus,
        verificationCode
      );

      if (response.success && response.data) {
        const updatedData = response.data;
        setShowVerificationInput(false);
        setVerificationError(null);

        if (nextStatus === PorterStatus.DELIVERED) {
          hasNavigatedToDetailsRef.current = updatedData.id;
          onClose();
          onServiceComplete?.();
          router.replace({
            pathname: "/porter-payment-status",
            params: { porterServiceId: updatedData.id },
          });
          InteractionManager.runAfterInteractions(() => {
            setTimeout(() => {
              toast.success(
                `Delivery completed! Fare: ${formatFare(updatedData.fare)}`
              );
            }, 300);
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
          onClose();
          onServiceComplete?.();
        } else {
          const errorMessage =
            typeof response.error === "object" &&
            response.error !== null &&
            "message" in response.error
              ? String((response.error as { message: string }).message)
              : "Failed to cancel service";
          toast.error(errorMessage);
        }
      } catch (error) {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setCancelLoading(false);
      }
    },
    [onClose, onServiceComplete, porterService, toast]
  );

  const handleCancelService = async () => {
    if (!porterService) return;

    if (userType === "passenger") {
      setSelectedCancelReason(PASSENGER_CANCEL_REASONS[0]);
      setShowCancelReasonModal(true);
      return;
    }

    showAlert(
      "Cancel Service",
      "Are you sure you want to cancel this Parcel service?",
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

  // Map locations
  const mapLocations = useMemo(() => {
    if (!porterService)
      return { pickup: undefined, destination: undefined, driver: undefined };

    const pickup: MapLocation | undefined =
      porterService.pickupLatitude && porterService.pickupLongitude
        ? {
            latitude: Number(porterService.pickupLatitude),
            longitude: Number(porterService.pickupLongitude),
            title: porterService.pickupLocation || "Pickup",
          }
        : undefined;

    const destination: MapLocation | undefined =
      porterService.deliveryLatitude && porterService.deliveryLongitude
        ? {
            latitude: Number(porterService.deliveryLatitude),
            longitude: Number(porterService.deliveryLongitude),
            title: porterService.deliveryLocation || "Delivery",
          }
        : undefined;

    let driver: MapLocation | undefined;
    if (driverLocation.location) {
      driver = {
        latitude: driverLocation.location.latitude,
        longitude: driverLocation.location.longitude,
        title: porterService.driver?.fullName || "Driver",
      };
    } else if (userType === "driver" && driverSelfLocation.location) {
      driver = {
        latitude: driverSelfLocation.location.coords.latitude,
        longitude: driverSelfLocation.location.coords.longitude,
        title: "You",
      };
    }

    return { pickup, destination, driver };
  }, [
    porterService,
    driverLocation.location,
    driverSelfLocation.location,
    userType,
  ]);

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

  const handleClose = () => {
    if (porterService && !isPorterServiceActive(porterService.status)) {
      onServiceComplete?.();
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
            Active Parcel Service
          </Text>
          <View className="w-10" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <Loading message="Loading service..." />
          </View>
        ) : !porterService ? (
          <View className="flex-1 items-center justify-center p-6">
            <Ionicons name="cube-outline" size={48} color="#6B7280" />
            <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-4">
              No Active Service
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              Create a Parcel service to see your active delivery here.
            </Text>
            <Button onPress={handleClose} className="mt-6">
              Close
            </Button>
          </View>
        ) : (
          <>
            {/* Map */}
            {isPorterServiceActive(porterService.status) &&
              porterService.status !== PorterStatus.REQUESTED && (
                <View className="px-4 pt-4">
                  <ServiceMap
                    pickupLocation={mapLocations.pickup}
                    destinationLocation={mapLocations.destination}
                    driverLocation={mapLocations.driver}
                    showRoute={true}
                    serviceType="porter"
                    interactive={true}
                    height={MAP_HEIGHT}
                  />
                </View>
              )}

            <ScrollView
              className="flex-1"
              contentContainerClassName="p-4 pb-8"
              refreshControl={
                Platform.OS === "ios" ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={handleRefresh}
                  />
                ) : undefined
              }
            >
              {/* Status Card */}
              <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
                <View className="items-center">
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center mb-3"
                    style={{
                      backgroundColor: `${getStatusColor(
                        porterService.status
                      )}20`,
                    }}
                  >
                    <Ionicons
                      name="cube"
                      size={28}
                      color={getStatusColor(porterService.status)}
                    />
                  </View>
                  <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {getStatusLabel(porterService.status)}
                  </Text>
                  {porterService.status === PorterStatus.DELIVERED && (
                    <Text className="text-2xl font-bold text-emerald-600 mt-2">
                      {formatFare(porterService.fare)}
                    </Text>
                  )}
                  {isSubscribed &&
                    isPorterServiceActive(porterService.status) && (
                      <View className="flex-row items-center mt-2">
                        <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                        <Text className="text-xs text-green-600">
                          Live tracking
                        </Text>
                      </View>
                    )}
                </View>
              </View>

              {/* Package Info */}
              <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
                <Text className="text-sm font-medium text-gray-500 mb-2">
                  Package Details
                </Text>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="cube-outline" size={16} color="#6B7280" />
                  <Text className="text-gray-900 dark:text-gray-100 ml-2">
                    {formatPackageType(porterService.packageType)}
                  </Text>
                </View>
                {porterService.packageDescription && (
                  <Text className="text-gray-600 dark:text-gray-400 text-sm">
                    {porterService.packageDescription}
                  </Text>
                )}
                {porterService.isFragile && (
                  <View className="flex-row items-center mt-2">
                    <Ionicons
                      name="warning-outline"
                      size={16}
                      color="#F59E0B"
                    />
                    <Text className="text-amber-600 text-sm ml-1">
                      Fragile - Handle with care
                    </Text>
                  </View>
                )}
              </View>

              {/* Locations */}
              <View className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4">
                <View className="flex-row items-start mb-3">
                  <View className="w-3 h-3 rounded-full bg-emerald-500 mt-1 mr-3" />
                  <View className="flex-1">
                    <Text className="text-xs text-gray-500">Pickup</Text>
                    <Text className="text-gray-900 dark:text-gray-100">
                      {porterService.pickupLocation}
                    </Text>
                    <Text className="text-gray-500 text-sm">
                      {porterService.pickupContactName}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-start">
                  <View className="w-3 h-3 rounded-full bg-red-500 mt-1 mr-3" />
                  <View className="flex-1">
                    <Text className="text-xs text-gray-500">Delivery</Text>
                    <Text className="text-gray-900 dark:text-gray-100">
                      {porterService.deliveryLocation}
                    </Text>
                    <Text className="text-gray-500 text-sm">
                      {porterService.deliveryContactName}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Verification Code Display (Customer) */}
              {userType === "passenger" &&
                porterService.status === PorterStatus.ACCEPTED &&
                porterService.verificationCode && (
                  <View className="mb-4">
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
                  <View className="mb-4">
                    <VerificationCodeInput
                      onVerify={handleVerifyCode}
                      serviceType="porter"
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
                  onPress={handleCancelService}
                  loading={cancelLoading}
                  disabled={cancelLoading || actionLoading}
                  variant="outline"
                  size="lg"
                  className="border-red-500"
                >
                  <Text className="text-red-500 font-semibold">
                    {cancelLoading ? "Cancelling..." : "Cancel Service"}
                  </Text>
                </Button>
              )}

              {/* Close Button for completed/cancelled */}
              {!isPorterServiceActive(porterService.status) && (
                <Button onPress={handleClose} size="lg" className="mt-4">
                  Close
                </Button>
              )}

              {/* Contact Options */}
              {canUseCommunicationPorter(porterService.status) &&
                (userType === "passenger" ? !!porterService.driver : true) && (
                  <View className="mt-4 flex-row justify-center gap-3">
                    <TouchableOpacity
                      className="flex-row items-center px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm"
                      onPress={() => setChatVisible(true)}
                    >
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={18}
                        color="#10B981"
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
                          <Ionicons name="call" size={18} color="#10B981" />
                          <Text className="text-gray-900 dark:text-gray-100 font-medium ml-2">
                            {userType === "passenger"
                              ? "Call Driver"
                              : "Call Contact"}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
            </ScrollView>
          </>
        )}

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
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: "Figtree_700Bold",
                      color: "#FFFFFF",
                    }}
                  >
                    {cancelLoading ? "Cancelling..." : "Confirm Cancel"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {porterService &&
          canUseCommunicationPorter(porterService.status) &&
          (userType === "passenger" ? !!porterService.driver : true) && (
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
              onNewMessageWhenNotFocused={(msg) => {
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
      </SafeAreaView>
    </Modal>
  );
}
