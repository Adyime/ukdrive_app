/**
 * Porter History Item Component
 * Uber-style design with orange theme, lucide icons, inline styles
 */

import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import {
  Package,
  Scale,
  AlertTriangle,
  User,
  ChevronRight,
} from "lucide-react-native";
import {
  PorterServiceResponse,
  PorterStatus,
  getStatusLabel,
  getStatusColor,
  formatFare,
  formatDistance,
  formatPackageType,
  formatWeight,
} from "@/lib/api/porter";

const BRAND_ORANGE = "#F36D14";

export interface PorterHistoryItemProps {
  porterService: PorterServiceResponse;
  userType: "passenger" | "driver";
  onPress?: () => void;
}

export function PorterHistoryItem({
  porterService,
  userType,
  onPress,
}: PorterHistoryItemProps) {
  const statusColor = getStatusColor(porterService.status);
  const isDelivered = porterService.status === PorterStatus.DELIVERED;
  const isCancelled = porterService.status === PorterStatus.CANCELLED;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadgeStyle = () => {
    if (isDelivered) return { bg: "#DCFCE7", color: "#16A34A" };
    if (isCancelled) return { bg: "#FEE2E2", color: "#EF4444" };
    return { bg: "#FFE4D6", color: BRAND_ORANGE };
  };

  const badge = getStatusBadgeStyle();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        backgroundColor: "#FFF",
        borderRadius: 16,
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
              width: 8,
              height: 8,
              borderRadius: 4,
              marginRight: 8,
              backgroundColor: statusColor,
            }}
          />
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 15,
              color: "#111827",
              flex: 1,
            }}
          >
            {formatDate(porterService.requestedAt)}
          </Text>
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 12,
              color: "#9CA3AF",
            }}
          >
            {formatTime(porterService.requestedAt)}
          </Text>
        </View>
      </View>

      {/* Status Badge */}
      <View style={{ marginBottom: 10 }}>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            alignSelf: "flex-start",
            backgroundColor: badge.bg,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 12,
              color: badge.color,
            }}
          >
            {getStatusLabel(porterService.status)}
          </Text>
        </View>
      </View>

      {/* Package Type */}
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
      >
        <Package size={16} color="#6B7280" />
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
        {porterService.isFragile && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginLeft: 10,
            }}
          >
            <AlertTriangle size={14} color="#D97706" />
            <Text
              style={{
                fontFamily: "Figtree_500Medium",
                fontSize: 12,
                color: "#D97706",
                marginLeft: 4,
              }}
            >
              Fragile
            </Text>
          </View>
        )}
      </View>

      {/* Locations */}
      <View style={{ marginBottom: 10 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: "#16A34A",
              marginRight: 10,
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 14,
              color: "#111827",
              flex: 1,
            }}
          >
            {porterService.pickupLocation}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              backgroundColor: "#EF4444",
              marginRight: 10,
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 14,
              color: "#111827",
              flex: 1,
            }}
          >
            {porterService.deliveryLocation}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {isDelivered && (
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 16,
                color: BRAND_ORANGE,
              }}
            >
              {formatFare(porterService.fare)}
            </Text>
          )}
          {porterService.distance ? (
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 13,
                color: "#9CA3AF",
                marginLeft: isDelivered ? 8 : 0,
              }}
            >
              {isDelivered ? "·" : ""} {formatDistance(porterService.distance)}
            </Text>
          ) : null}
          {porterService.packageWeight ? (
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 13,
                color: "#9CA3AF",
                marginLeft: 8,
              }}
            >
              · {formatWeight(porterService.packageWeight)}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {userType === "passenger" && porterService.driver && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <User size={14} color="#6B7280" />
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 13,
                  color: "#6B7280",
                  marginLeft: 4,
                }}
              >
                {porterService.driver.fullName}
              </Text>
            </View>
          )}
          {userType === "driver" && porterService.customer && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginRight: 8,
              }}
            >
              <User size={14} color="#6B7280" />
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 13,
                  color: "#6B7280",
                  marginLeft: 4,
                }}
              >
                {porterService.customer.fullName}
              </Text>
            </View>
          )}
          {onPress && <ChevronRight size={20} color="#9CA3AF" />}
        </View>
      </View>

      {/* Cancellation Reason */}
      {isCancelled && porterService.cancellationReason && (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            backgroundColor: "#FEF2F2",
            borderRadius: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 12,
              color: "#EF4444",
            }}
          >
            Cancelled: {porterService.cancellationReason}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
