/**
 * Porter Status Card Component
 * Uber-style design with orange theme, lucide icons, inline styles
 */

import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, ActivityIndicator } from "react-native";
import { Package, Scale, AlertTriangle, User } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import {
  PorterServiceResponse,
  getStatusColor,
  formatFare,
  formatDistance,
  formatPackageType,
  formatWeight,
} from "@/lib/api/porter";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export function PorterStatusCardCompact({
  porterService,
  onPress,
  onAccept,
  acceptLoading,
}: {
  porterService: PorterServiceResponse;
  onPress?: () => void;
  onAccept?: () => void;
  acceptLoading?: boolean;
}) {
  const { userType } = useAuth();
  const statusColor = getStatusColor(porterService.status);
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        backgroundColor: "#FFF",
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 12,
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
        <View style={{ flexDirection: "row", alignItems: "center" }}>
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
              fontFamily: "Figtree_700Bold",
              fontSize: 16,
              color: "#111827",
            }}
          >
            {formatFare(porterService.fare)}
          </Text>
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 13,
              color: "#9CA3AF",
              marginLeft: 8,
            }}
          >
            · {formatDistance(porterService.distance)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Package size={16} color="#6B7280" />
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#6B7280",
              marginLeft: 4,
            }}
          >
            {formatPackageType(porterService.packageType)}
          </Text>
        </View>
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

      {/* Package Details */}
      <View
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}
      >
        {porterService.packageWeight ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginRight: 14,
            }}
          >
            <Scale size={14} color="#6B7280" />
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 12,
                color: "#9CA3AF",
                marginLeft: 4,
              }}
            >
              {formatWeight(porterService.packageWeight)}
            </Text>
          </View>
        ) : null}
        {porterService.isFragile && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
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

      {/* Actions */}
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
          <User size={14} color="#6B7280" />
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#6B7280",
              marginLeft: 6,
            }}
          >
            {porterService.customer?.fullName || "Customer"}
          </Text>
        </View>
        {onAccept && (
          <TouchableOpacity
            onPress={onAccept}
            disabled={acceptLoading}
            activeOpacity={0.85}
            style={{
              backgroundColor: brandColor,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 12,
            }}
          >
            {acceptLoading ? (
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
        )}
      </View>
    </TouchableOpacity>
  );
}

export function NoPorterServicesCard({ message }: { message?: string }) {
  return (
    <View
      style={{
        backgroundColor: "#FFF",
        borderRadius: 16,
        padding: 32,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#F3F4F6",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Package size={28} color="#9CA3AF" />
      </View>
      <Text
        style={{
          fontFamily: "Figtree_600SemiBold",
          fontSize: 17,
          color: "#111827",
          marginBottom: 8,
        }}
      >
        No Parcel Services
      </Text>
      <Text
        style={{
          fontFamily: "Figtree_400Regular",
          fontSize: 14,
          color: "#9CA3AF",
          textAlign: "center",
        }}
      >
        {message || "No Parcel service requests nearby. Pull down to refresh."}
      </Text>
    </View>
  );
}
