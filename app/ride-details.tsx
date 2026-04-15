/**
 * Ride Details Screen
 * Uber-style white design with timeline, driver card, and payment breakdown
 */

import React, { useEffect, useState } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Image,
} from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Star,
  FileText,
  Download,
  ChevronRight,
  Search,
  ShieldCheck,
  HelpCircle,
  User,
  XCircle,
  CreditCard,
  Wallet,
  Banknote,
} from "lucide-react-native";

import {
  getRideById,
  type RideResponse,
  formatFare,
  formatVehicleType,
  formatDistance,
} from "@/lib/api/ride";
import {
  getRidePayment,
  type RidePayment,
  getPaymentStatusLabel,
  confirmCashPayment,
} from "@/lib/api/payment";
import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { useToast } from "@/components/ui/toast";
import { Loading } from "@/components/ui/loading";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const SUPPORT_PHONE = "9520559469";

export default function RideDetailsScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { userType } = useAuth();
  const toast = useToast();
  const { showAlert } = useAlert();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const [ride, setRide] = useState<RideResponse | null>(null);
  const [payment, setPayment] = useState<RidePayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCash, setConfirmingCash] = useState(false);

  const source = Array.isArray(from) ? from[0] : from;

  const handleSafeBack = () => {
    if (source === "notifications") {
      router.replace("/(tabs)/notifications");
      return;
    }

    if (source === "history" || source === "active-ride") {
      router.replace(userType === "driver" ? "/(tabs)/rides" : "/(tabs)/history");
      return;
    }

    router.replace(userType === "driver" ? "/(tabs)/rides" : "/(tabs)/history");
  };

  useEffect(() => {
    if (id) fetchRideDetails();
  }, [id]);

  const fetchRideDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getRideById(id);
      if (response.success && response.data?.ride) {
        setRide(response.data.ride);
        if (response.data.ride.status === "COMPLETED") {
          try {
            const paymentResponse = await getRidePayment(id);
            if (paymentResponse.success && paymentResponse.data?.payment) {
              setPayment(paymentResponse.data.payment);
            }
          } catch {
            /* Don't fail the whole screen */
          }
        }
      } else {
        setError("Failed to load ride details");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: string | Date) => {
    const d = new Date(date);
    return (
      d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year:
          d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      }) +
      " " +
      d.toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    );
  };

  const formatTime = (date: string | Date | null | undefined) => {
    if (!date) return "--:--";
    return new Date(date).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const normalizeVehicleValue = (value?: string | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === "any") return null;
    return trimmed;
  };

  const getRideVehicleLabel = (rideData: RideResponse): string => {
    const driverSubcategory = normalizeVehicleValue(
      rideData.driver?.vehicleSubcategoryName
    );
    if (driverSubcategory) return driverSubcategory;

    const driverType = normalizeVehicleValue(rideData.driver?.vehicleType);
    if (driverType) return formatVehicleType(driverType);

    const rideSubcategory = normalizeVehicleValue(rideData.vehicleSubcategoryName);
    if (rideSubcategory) return rideSubcategory;

    const requestedType = normalizeVehicleValue(rideData.vehicleType);
    if (requestedType) return formatVehicleType(requestedType);

    return "N/A";
  };

  const handleFindLostItem = () => {
    showAlert(
      "Find Lost Item",
      "Please contact support for lost item assistance.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call Support",
          onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`),
        },
      ]
    );
  };

  const handleConfirmCashPayment = async () => {
    if (!id || !payment) return;
    showAlert(
      "Confirm Cash Payment",
      `Have you received ${formatFare(payment.fareAmount)} in cash?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setConfirmingCash(true);
            try {
              const response = await confirmCashPayment(id);
              if (response.success) {
                const paymentResponse = await getRidePayment(id);
                if (paymentResponse.success && paymentResponse.data?.payment) {
                  setPayment(paymentResponse.data.payment);
                }
                toast.success("Cash payment confirmed successfully");
              } else {
                toast.error(
                  (response.error as any)?.message ||
                    "Failed to confirm cash payment"
                );
              }
            } catch {
              toast.error("Failed to confirm cash payment. Please try again.");
            } finally {
              setConfirmingCash(false);
            }
          },
        },
      ]
    );
  };

  const getContextualPaymentStatusLabel = (
    status: string,
    paymentMethod: string | null,
    isRideCompleted: boolean
  ): string => {
    // Passenger cash rides are considered settled once the ride is completed,
    // even if backend still waits for driver-side confirmation.
    if (
      userType === "passenger" &&
      isRideCompleted &&
      status === "PENDING" &&
      paymentMethod === "CASH"
    ) {
      return "Paid in Cash";
    }

    if (status === "PENDING" && paymentMethod === "CASH") {
      return userType === "driver"
        ? "Awaiting Your Confirmation"
        : "Awaiting Driver Confirmation";
    }
    return getPaymentStatusLabel(status as any);
  };

  const handleOpenReceipt = () => {
    if (!id) return;
    if (!payment || payment.status !== "COMPLETED") {
      toast.warning("Receipt is only available after payment is completed.");
      return;
    }
    router.push({
      pathname: "/document-viewer",
      params: {
        title: "Receipt",
        endpoint: `/api/rides/${id}/receipt`,
        fileName: `receipt-ride-${id.slice(0, 8)}.pdf`,
        templateType: "ride",
        rideId: id,
        docType: "receipt",
      },
    });
  };

  const handleOpenInvoice = () => {
    if (!id) return;
    if (!payment || payment.status !== "COMPLETED") {
      toast.warning("Invoice is only available after payment is completed.");
      return;
    }
    router.push({
      pathname: "/document-viewer",
      params: {
        title: "Invoice",
        endpoint: `/api/rides/${id}/invoice`,
        fileName: `invoice-ride-${id.slice(0, 8)}.pdf`,
        templateType: "ride",
        rideId: id,
        docType: "invoice",
      },
    });
  };

  const getPaymentMethodIcon = (method: string | null) => {
    if (method === "WALLET") return <Wallet size={16} color="#6B7280" />;
    if (method === "ONLINE") return <CreditCard size={16} color="#6B7280" />;
    if (method === "CASH") return <Banknote size={16} color="#6B7280" />;
    return null;
  };

  const getPaymentMethodLabel = (method: string | null): string => {
    if (method === "WALLET") return "Wallet";
    if (method === "ONLINE") return "Online Payment";
    if (method === "CASH") return "Cash";
    return method || "—";
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Loading message="Loading ride details..." />
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (error || !ride) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <TouchableOpacity
              onPress={handleSafeBack}
              style={{ marginRight: 12 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <ArrowLeft size={24} color="#111827" />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 18,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
              }}
            >
              Ride Details
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <XCircle size={48} color="#EF4444" />
            <Text
              style={{
                color: "#6B7280",
                marginTop: 16,
                textAlign: "center",
                fontFamily: "Figtree_400Regular",
              }}
            >
              {error || "Ride not found"}
            </Text>
            <TouchableOpacity
              onPress={fetchRideDetails}
              style={{
                marginTop: 16,
                paddingHorizontal: 24,
                paddingVertical: 12,
                backgroundColor: brandColor,
                borderRadius: 16,
              }}
            >
              <Text
                style={{ color: "#FFF", fontFamily: "Figtree_600SemiBold" }}
              >
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const isCompleted = ride.status === "COMPLETED";
  const isCancelled = ride.status === "CANCELLED";
  const statusBg = isCompleted
    ? "#F0FDF4"
    : isCancelled
    ? "#FEF2F2"
    : "#F9FAFB";
  const statusColor = isCompleted
    ? "#059669"
    : isCancelled
    ? "#DC2626"
    : "#6B7280";
  const statusLabel = isCompleted
    ? "Completed"
    : isCancelled
    ? "Cancelled"
    : ride.status;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#FFF" }}
        edges={["top"]}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: "#FFF",
            borderBottomWidth: 1,
            borderColor: "#F3F4F6",
          }}
        >
          <TouchableOpacity
            onPress={handleSafeBack}
            style={{ marginRight: 12 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              color: "#111827",
              fontFamily: "Figtree_700Bold",
            }}
          >
            Ride Details
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Hero card */}
          <View
            style={{
              padding: 20,
              backgroundColor: "#FFF",
              borderBottomWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 20,
                    color: "#111827",
                    marginBottom: 8,
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {getRideVehicleLabel(ride)} ride
                  {ride.driver
                    ? ` with ${ride.driver.fullName
                        .split(" ")[0]
                        .toUpperCase()}`
                    : ""}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 20,
                      backgroundColor: statusBg,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color: statusColor,
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#9CA3AF",
                    marginBottom: 4,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {formatDateTime(ride.requestedAt)}
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    color: "#111827",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {formatFare(ride.fare)}
                </Text>
              </View>
              {/* Driver avatar */}
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: "#FFF7F2",
                  borderWidth: 2,
                  borderColor: "#FDE8D8",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {ride.driver?.profileImageUrl?.trim() ? (
                  <Image
                    source={{ uri: ride.driver.profileImageUrl }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                  />
                ) : ride.driver ? (
                  <Text
                    style={{
                      fontSize: 20,
                      color: brandColor,
                      fontFamily: "Figtree_700Bold",
                    }}
                  >
                    {ride.driver.fullName?.charAt(0)?.toUpperCase() || "D"}
                  </Text>
                ) : (
                  <User size={26} color="#9CA3AF" />
                )}
              </View>
            </View>
          </View>

          {/* Receipt & Invoice */}
          {isCompleted && (
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: 16,
                paddingVertical: 14,
                gap: 10,
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
                backgroundColor: "#FFF",
              }}
            >
              <TouchableOpacity
                onPress={handleOpenReceipt}
                disabled={!payment || payment.status !== "COMPLETED"}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 22,
                  backgroundColor:
                    !payment || payment.status !== "COMPLETED"
                      ? "#F3F4F6"
                      : "#FFF7F2",
                  borderWidth: 1,
                  borderColor:
                    !payment || payment.status !== "COMPLETED"
                      ? "#E5E7EB"
                      : "#FDE8D8",
                  opacity: !payment || payment.status !== "COMPLETED" ? 0.6 : 1,
                  gap: 6,
                }}
              >
                <FileText size={15} color={brandColor} />
                <Text
                  style={{
                    fontSize: 14,
                    color: "#374151",
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Receipt
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleOpenInvoice}
                disabled={!payment || payment.status !== "COMPLETED"}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 22,
                  backgroundColor:
                    !payment || payment.status !== "COMPLETED"
                      ? "#F3F4F6"
                      : "#FFF7F2",
                  borderWidth: 1,
                  borderColor:
                    !payment || payment.status !== "COMPLETED"
                      ? "#E5E7EB"
                      : "#FDE8D8",
                  opacity: !payment || payment.status !== "COMPLETED" ? 0.6 : 1,
                  gap: 6,
                }}
              >
                <Download size={15} color={brandColor} />
                <Text
                  style={{
                    fontSize: 14,
                    color: "#374151",
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Invoice
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Route Timeline */}
          <View
            style={{
              padding: 20,
              backgroundColor: "#FFF",
              borderBottomWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: "#111827",
                marginBottom: 16,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Trip Route
            </Text>
            {/* Pickup */}
            <View style={{ flexDirection: "row" }}>
              <View style={{ alignItems: "center", marginRight: 14 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "#16A34A",
                    borderWidth: 2,
                    borderColor: "#A7F3D0",
                  }}
                />
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    backgroundColor: "#E5E7EB",
                    marginVertical: 4,
                    minHeight: 36,
                  }}
                />
              </View>
              <View style={{ flex: 1, paddingBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#374151",
                    fontFamily: "Figtree_700Bold",
                  }}
                  numberOfLines={2}
                >
                  {ride.pickupLocation}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 2,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {formatTime(ride.startedAt || ride.acceptedAt)}
                </Text>
              </View>
            </View>
            {/* Destination */}
            <View style={{ flexDirection: "row" }}>
              <View style={{ alignItems: "center", marginRight: 14 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: "#EF4444",
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#374151",
                    fontFamily: "Figtree_700Bold",
                  }}
                  numberOfLines={2}
                >
                  {ride.destination}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 2,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {formatTime(ride.completedAt)}
                </Text>
              </View>
            </View>
            {/* Distance */}
            {ride.distance && (
              <View
                style={{
                  marginTop: 14,
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderColor: "#F3F4F6",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#9CA3AF",
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Distance
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    color: "#374151",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {formatDistance(ride.distance)}
                </Text>
              </View>
            )}
          </View>

          {/* Driver / Passenger Card */}
          {((userType === "passenger" && ride.driver) ||
            (userType === "driver" && ride.passenger)) && (
            <View
              style={{
                padding: 20,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: "#111827",
                  marginBottom: 14,
                  fontFamily: "Figtree_700Bold",
                }}
              >
                {userType === "passenger" ? "Your Driver" : "Passenger"}
              </Text>
              {userType === "passenger" && ride.driver && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: "#FFF7F2",
                      borderWidth: 2,
                      borderColor: "#FDE8D8",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
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
                        fontSize: 16,
                        color: "#111827",
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      {ride.driver.fullName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#6B7280",
                        marginTop: 2,
                        fontFamily: "Figtree_400Regular",
                      }}
                    >
                      {getRideVehicleLabel(ride)}
                      {ride.driver.vehicleRegistration
                        ? ` • ${ride.driver.vehicleRegistration}`
                        : ""}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#FFFBEB",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                    }}
                  >
                    <Star size={13} color="#F59E0B" fill="#F59E0B" />
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#92400E",
                        marginLeft: 4,
                        fontFamily: "Figtree_700Bold",
                      }}
                    >
                      {ride.driver.rating.toFixed(1)}
                    </Text>
                  </View>
                </View>
              )}
              {userType === "driver" && ride.passenger && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: "#F3F4F6",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 14,
                    }}
                  >
                    <User size={24} color="#6B7280" />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontSize: 16,
                        color: "#111827",
                        fontFamily: "Figtree_600SemiBold",
                      }}
                    >
                      {ride.passenger.fullName}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: "#9CA3AF",
                        marginTop: 2,
                        fontFamily: "Figtree_400Regular",
                      }}
                    >
                      {ride.passenger.phone}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Payment Summary */}
          {isCompleted && (
            <View
              style={{
                padding: 20,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: "#111827",
                  marginBottom: 14,
                  fontFamily: "Figtree_700Bold",
                }}
              >
                Payment Summary
              </Text>

              {payment ? (
                <>
                  {userType === "passenger" && (
                    <>
                      {ride.baseFare && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            paddingVertical: 8,
                            borderBottomWidth: 1,
                            borderColor: "#F9FAFB",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              color: "#6B7280",
                              fontFamily: "Figtree_400Regular",
                            }}
                          >
                            Base fare
                          </Text>
                          <Text
                            style={{
                              fontSize: 14,
                              color: "#374151",
                              fontFamily: "Figtree_400Regular",
                            }}
                          >
                            {formatFare(ride.baseFare)}
                          </Text>
                        </View>
                      )}
                      {ride.distance && (
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            paddingVertical: 8,
                            borderBottomWidth: 1,
                            borderColor: "#F9FAFB",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              color: "#6B7280",
                              fontFamily: "Figtree_400Regular",
                            }}
                          >
                            Distance ({formatDistance(ride.distance)})
                          </Text>
                          <Text
                            style={{
                              fontSize: 14,
                              color: "#374151",
                              fontFamily: "Figtree_400Regular",
                            }}
                          >
                            {formatFare(ride.fare - ride.baseFare)}
                          </Text>
                        </View>
                      )}
                      {payment.discountApplied &&
                        payment.discountApplied > 0 && (
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              paddingVertical: 8,
                              borderBottomWidth: 1,
                              borderColor: "#F9FAFB",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 14,
                                color: "#6B7280",
                                fontFamily: "Figtree_400Regular",
                              }}
                            >
                              Discount
                            </Text>
                            <Text
                              style={{
                                fontSize: 14,
                                color: "#10B981",
                                fontFamily: "Figtree_600SemiBold",
                              }}
                            >
                              -{formatFare(payment.discountApplied)}
                            </Text>
                          </View>
                        )}
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            color: "#111827",
                            fontFamily: "Figtree_700Bold",
                          }}
                        >
                          Total Fare
                        </Text>
                        <Text
                          style={{
                            fontSize: 15,
                            color: "#111827",
                            fontFamily: "Figtree_700Bold",
                          }}
                        >
                          {formatFare(payment.fareAmount)}
                        </Text>
                      </View>
                      {payment.paymentMethod && (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderColor: "#F3F4F6",
                            paddingTop: 12,
                            marginTop: 4,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#6B7280",
                                fontFamily: "Figtree_400Regular",
                              }}
                            >
                              Payment Method
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {getPaymentMethodIcon(payment.paymentMethod)}
                              <Text
                                style={{
                                  fontSize: 13,
                                  color: "#374151",
                                  fontFamily: "Figtree_600SemiBold",
                                }}
                              >
                                {getPaymentMethodLabel(payment.paymentMethod)}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#6B7280",
                                fontFamily: "Figtree_400Regular",
                              }}
                            >
                              Payment Status
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color:
                                  payment.status === "COMPLETED"
                                    ? "#10B981"
                                    : payment.status === "FAILED"
                                    ? "#EF4444"
                                    : "#F59E0B",
                                fontFamily: "Figtree_600SemiBold",
                              }}
                            >
                              {getContextualPaymentStatusLabel(
                                payment.status,
                                payment.paymentMethod,
                                ride.status === "COMPLETED"
                              )}
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}

                  {userType === "driver" && (
                    <>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 8,
                          borderBottomWidth: 1,
                          borderColor: "#F9FAFB",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            color: "#6B7280",
                            fontFamily: "Figtree_400Regular",
                          }}
                        >
                          Total Fare
                        </Text>
                        <Text
                          style={{
                            fontSize: 14,
                            color: "#374151",
                            fontFamily: "Figtree_400Regular",
                          }}
                        >
                          {formatFare(payment.fareAmount)}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 8,
                          borderBottomWidth: 1,
                          borderColor: "#F9FAFB",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            color: "#6B7280",
                            fontFamily: "Figtree_400Regular",
                          }}
                        >
                          Platform Fee ({payment.platformFeePercent.toFixed(1)}
                          %)
                        </Text>
                        <Text
                          style={{
                            fontSize: 14,
                            color: "#EF4444",
                            fontFamily: "Figtree_400Regular",
                          }}
                        >
                          -{formatFare(payment.platformFeeAmount)}
                        </Text>
                      </View>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            color: "#111827",
                            fontFamily: "Figtree_700Bold",
                          }}
                        >
                          {payment.status === "COMPLETED"
                            ? "Your Earning"
                            : "Estimated Earning"}
                        </Text>
                        <Text
                          style={{
                            fontSize: 18,
                            color:
                              payment.status === "COMPLETED"
                                ? "#10B981"
                                : "#9CA3AF",
                            fontFamily: "Figtree_700Bold",
                          }}
                        >
                          {formatFare(payment.driverEarningAmount)}
                        </Text>
                      </View>
                      {payment.paymentMethod && (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderColor: "#F3F4F6",
                            paddingTop: 12,
                            marginTop: 4,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#6B7280",
                                fontFamily: "Figtree_400Regular",
                              }}
                            >
                              Payment Method
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {getPaymentMethodIcon(payment.paymentMethod)}
                              <Text
                                style={{
                                  fontSize: 13,
                                  color: "#374151",
                                  fontFamily: "Figtree_600SemiBold",
                                }}
                              >
                                {getPaymentMethodLabel(payment.paymentMethod)}
                              </Text>
                            </View>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                color: "#6B7280",
                                fontFamily: "Figtree_400Regular",
                              }}
                            >
                              Payment Status
                            </Text>
                            <Text
                              style={{
                                fontSize: 13,
                                color:
                                  payment.status === "COMPLETED"
                                    ? "#10B981"
                                    : "#F59E0B",
                                fontFamily: "Figtree_600SemiBold",
                              }}
                            >
                              {getContextualPaymentStatusLabel(
                                payment.status,
                                payment.paymentMethod,
                                ride.status === "COMPLETED"
                              )}
                            </Text>
                          </View>
                        </View>
                      )}
                      {/* Confirm cash button */}
                      {userType === "driver" &&
                        payment.status === "PENDING" &&
                        payment.paymentMethod === "CASH" && (
                          <TouchableOpacity
                            onPress={handleConfirmCashPayment}
                            disabled={confirmingCash}
                            style={{
                              marginTop: 12,
                              paddingVertical: 12,
                              backgroundColor: brandColor,
                              borderRadius: 16,
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: "#FFF",
                                fontSize: 14,
                                fontFamily: "Figtree_700Bold",
                              }}
                            >
                              {confirmingCash
                                ? "Confirming..."
                                : "Confirm Cash Received"}
                            </Text>
                          </TouchableOpacity>
                        )}
                    </>
                  )}
                </>
              ) : (
                <>
                  {ride.baseFare && (
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderColor: "#F9FAFB",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#6B7280",
                          fontFamily: "Figtree_400Regular",
                        }}
                      >
                        Base fare
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: "#374151",
                          fontFamily: "Figtree_400Regular",
                        }}
                      >
                        {formatFare(ride.baseFare)}
                      </Text>
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingVertical: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 15,
                        color: "#111827",
                        fontFamily: "Figtree_700Bold",
                      }}
                    >
                      Total
                    </Text>
                    <Text
                      style={{
                        fontSize: 15,
                        color: "#111827",
                        fontFamily: "Figtree_700Bold",
                      }}
                    >
                      {formatFare(ride.fare)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Cancellation info */}
          {isCancelled && (
            <View
              style={{
                margin: 16,
                padding: 16,
                backgroundColor: "#FEF2F2",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#FECACA",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <XCircle size={18} color="#EF4444" />
                <Text
                  style={{
                    fontSize: 15,
                    color: "#DC2626",
                    marginLeft: 8,
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  Ride Cancelled
                </Text>
              </View>
              {ride.cancellationReason && (
                <Text
                  style={{
                    fontSize: 13,
                    color: "#B91C1C",
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Reason: {ride.cancellationReason}
                </Text>
              )}
              {ride.cancelledBy && (
                <Text
                  style={{
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 4,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  By: {ride.cancelledBy}
                </Text>
              )}
            </View>
          )}

          {/* Help & Safety */}
          <View
            style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}
          >
            <Text
              style={{
                fontSize: 16,
                color: "#111827",
                marginBottom: 12,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Help & Safety
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "#FFF",
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            {userType === "passenger" && (
              <TouchableOpacity
                onPress={handleFindLostItem}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  borderBottomWidth: 1,
                  borderColor: "#F9FAFB",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#F9FAFB",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 14,
                  }}
                >
                  <Search size={18} color="#6B7280" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 15,
                      color: "#111827",
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    Find lost item
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: "#9CA3AF",
                      marginTop: 2,
                      fontFamily: "Figtree_400Regular",
                    }}
                  >
                    We can help you get in touch with your driver
                  </Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.push("/support")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderColor: "#F9FAFB",
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#F9FAFB",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <ShieldCheck size={18} color="#6B7280" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    color: "#111827",
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Report safety issue
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#9CA3AF",
                    marginTop: 2,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Report any safety related issues to us
                </Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/support")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 16,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#F9FAFB",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <HelpCircle size={18} color="#6B7280" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    color: "#111827",
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Customer Support
                </Text>
              </View>
              <ChevronRight size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
