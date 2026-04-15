/**
 * Unified History Item Component
 * Displays a history item for any service type (ride, porter, carpool)
 */

import React, { useState, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { RideResponse } from "@/lib/api/ride";
import type { PorterServiceResponse } from "@/lib/api/porter";
import type { CarPoolResponse } from "@/lib/api/carPool";
import { getStatusLabel, getStatusColor, formatFare } from "@/lib/api/ride";
import {
  getStatusLabel as getPorterStatusLabel,
  getStatusColor as getPorterStatusColor,
  formatFare as formatPorterFare,
} from "@/lib/api/porter";
import {
  getStatusLabel as getCarPoolStatusLabel,
  getStatusColor as getCarPoolStatusColor,
  formatFare as formatCarPoolFare,
} from "@/lib/api/carPool";
import {
  getRidePayment,
  getPaymentStatusLabel,
  getPaymentStatusColor,
  type RidePaymentStatus,
  type PaymentMethod,
} from "@/lib/api/payment";
import { useAuth } from "@/context/auth-context";

export interface UnifiedHistoryItemProps {
  type: "ride" | "porter" | "pool";
  service: RideResponse | PorterServiceResponse | CarPoolResponse;
  onPress?: () => void;
  /** Whether to enable navigation to details screen (default: true for rides) */
  navigateToDetails?: boolean;
}

export function UnifiedHistoryItem({
  type,
  service,
  onPress,
  navigateToDetails = true,
}: UnifiedHistoryItemProps) {
  const { userType } = useAuth();
  const [paymentStatus, setPaymentStatus] = useState<RidePaymentStatus | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Fetch payment status for completed rides
  useEffect(() => {
    if (type === "ride" && service.status === "COMPLETED" && service.id) {
      const ride = service as RideResponse;
      // Only fetch if ride ID is valid
      if (!ride.id || ride.id === "null" || ride.id === "undefined") {
        return;
      }
      setPaymentLoading(true);
      getRidePayment(ride.id)
        .then((response) => {
          if (response.success && response.data?.payment) {
            setPaymentStatus(response.data.payment.status as RidePaymentStatus);
            setPaymentMethod(response.data.payment.paymentMethod ?? null);
          }
        })
        .catch((err) => {
          // Only log non-404 errors (404 is expected if payment doesn't exist yet)
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            err.code !== "RIDE_NOT_FOUND"
          ) {
            console.error("[UnifiedHistoryItem] Error fetching payment:", err);
          }
        })
        .finally(() => {
          setPaymentLoading(false);
        });
    }
  }, [type, service]);

  // Handle navigation to details screen
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    // Navigate to details screen based on type
    if (navigateToDetails) {
      if (type === "ride") {
        // If ride has pending payment, navigate to the appropriate payment flow
        const isPassengerCashSettled =
          userType === "passenger" &&
          paymentStatus === "PENDING" &&
          paymentMethod === "CASH";

        if (
          service.status === "COMPLETED" &&
          paymentStatus &&
          paymentStatus !== "COMPLETED" &&
          !isPassengerCashSettled
        ) {
          if (userType === "driver") {
            router.push({
              pathname: "/ride-payment-confirmation",
              params: { rideId: service.id },
            } as never);
          } else {
            router.push({
              pathname: "/ride-payment",
              params: { rideId: service.id },
            });
          }
          return;
        }
        router.push({
          pathname: "/ride-details",
          params: { id: service.id, from: "history" },
        } as never);
      } else if (type === "porter") {
        router.push(`/porter-details?id=${service.id}`);
      } else if (type === "pool") {
        router.push(`/pool-details?id=${service.id}`);
      }
    }
  };

  // Enable interaction if onPress provided or navigation enabled
  const isInteractive = !!onPress || navigateToDetails;

  // Get service-specific data
  const getServiceData = () => {
    if (type === "ride") {
      const ride = service as RideResponse;
      return {
        icon: "car" as const,
        color: "#10B981",
        title: "Ride",
        statusLabel: getStatusLabel(ride.status),
        statusColor: getStatusColor(ride.status),
        location: `${ride.pickupLocation} → ${ride.destination}`,
        fare: ride.fare ? formatFare(ride.fare) : null,
        date: ride.requestedAt,
      };
    } else if (type === "porter") {
      const porter = service as PorterServiceResponse;
      return {
        icon: "cube" as const,
        color: "#3B82F6",
        title: "Parcel Service",
        statusLabel: getPorterStatusLabel(porter.status),
        statusColor: getPorterStatusColor(porter.status),
        location: `${porter.pickupLocation} → ${porter.deliveryLocation}`,
        fare: porter.fare ? formatPorterFare(porter.fare) : null,
        date: porter.requestedAt,
      };
    } else {
      const pool = service as CarPoolResponse;
      return {
        icon: "people" as const,
        color: "#9333EA",
        title: "Ride Share",
        statusLabel: getCarPoolStatusLabel(pool.status),
        statusColor: getCarPoolStatusColor(pool.status),
        location: `${pool.startLocation} → ${pool.endLocation}`,
        fare: pool.calculatedFarePerPerson
          ? formatCarPoolFare(pool.calculatedFarePerPerson)
          : null,
        date: pool.createdAt || pool.departureTime,
      };
    }
  };

  const data = getServiceData();

  const formatDate = (timestamp: string | Date) => {
    const date =
      typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  };

  const formatTime = (timestamp: string | Date) => {
    const date =
      typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const Container = isInteractive ? TouchableOpacity : View;
  const containerProps = isInteractive
    ? { onPress: handlePress, activeOpacity: 0.7 }
    : {};
  const serviceIconBg =
    type === "ride" ? "#EAFBF3" : type === "porter" ? "#EAF2FF" : "#F3EEFE";
  const statusBg = `${data.statusColor}1F`;

  return (
    <Container
      {...containerProps}
      style={{
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
              backgroundColor: serviceIconBg,
            }}
          >
            <Ionicons name={data.icon} size={20} color={data.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
              }}
            >
              {data.title}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: statusBg,
                }}
              >
                <Text
                  style={{
                    color: data.statusColor,
                    fontSize: 11,
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  {data.statusLabel}
                </Text>
              </View>
              {/* Payment Status Badge for Completed Rides */}
              {type === "ride" &&
                service.status === "COMPLETED" &&
                paymentStatus &&
                (() => {
                  const status: RidePaymentStatus = paymentStatus;
                  const isPassengerCashSettled =
                    userType === "passenger" &&
                    status === "PENDING" &&
                    paymentMethod === "CASH";
                  const badgeColor = isPassengerCashSettled
                    ? "#10B981"
                    : getPaymentStatusColor(status);
                  const badgeLabel = isPassengerCashSettled
                    ? "Paid in Cash"
                    : getPaymentStatusLabel(status);
                  return (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: `${badgeColor}1F`,
                      }}
                    >
                      <Text
                        style={{
                          color: badgeColor,
                          fontSize: 11,
                          fontFamily: "Figtree_600SemiBold",
                        }}
                      >
                        {badgeLabel}
                      </Text>
                    </View>
                  );
                })()}
            </View>
          </View>
        </View>
        {data.fare && (
          <Text
            style={{
              fontSize: 17,
              color: "#111827",
              fontFamily: "Figtree_700Bold",
            }}
          >
            {data.fare}
          </Text>
        )}
      </View>

      {/* Location */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{
            fontSize: 14,
            color: "#4B5563",
            fontFamily: "Figtree_500Medium",
            lineHeight: 20,
          }}
          numberOfLines={2}
        >
          {data.location}
        </Text>
      </View>

      {/* Date, Time, and Navigation Indicator */}
      <View
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name="time-outline" size={14} color="#6B7280" />
          <Text
            style={{
              marginLeft: 6,
              fontSize: 12,
              color: "#6B7280",
              fontFamily: "Figtree_400Regular",
            }}
          >
            {formatDate(data.date)} at {formatTime(data.date)}
          </Text>
        </View>
        {isInteractive && (
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        )}
      </View>
    </Container>
  );
}
