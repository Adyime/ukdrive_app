/**
 * Active Service Card Component
 * Displays an active service (ride, porter, or carpool) on the Home screen
 * Shows key information, verification code, and action buttons
 * Note: Map is not shown on home screen to avoid unnecessary Google Maps loading
 * Full map with route is available on detail screens
 */

import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/auth-context";
import { VerificationCodeDisplay } from "@/components/verification-code-display";
import type { RideResponse } from "@/lib/api/ride";
import type { PorterServiceResponse } from "@/lib/api/porter";
import type { CarPoolResponse } from "@/lib/api/carPool";

const BRAND_PURPLE = "#843FE3";
const BRAND_ORANGE = "#F36D14";

export interface ActiveServiceCardProps {
  serviceType: "ride" | "porter" | "carpool";
  service: RideResponse | PorterServiceResponse | CarPoolResponse;
  onPress?: () => void;
  compact?: boolean;
}

export function ActiveServiceCard({
  serviceType,
  service,
  onPress,
  compact = false,
}: ActiveServiceCardProps) {
  const { userType, user } = useAuth();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Navigate to full-screen active service page
      if (serviceType === "ride") {
        router.push("/(tabs)/active-ride");
      } else if (serviceType === "porter") {
        router.push("/(tabs)/active-porter");
      } else if (serviceType === "carpool") {
        router.push("/(tabs)/active-car-pool");
      }
    }
  };

  // Get service-specific data
  const getServiceData = () => {
    if (serviceType === "ride") {
      const ride = service as RideResponse;
      return {
        icon: "car" as const,
        color: brandColor,
        title: "Active Ride",
        status: ride.status,
        driverName: ride.driver?.fullName,
        driverRating: ride.driver?.rating,
        vehicleType: ride.driver?.vehicleType,
        pickupLocation: ride.pickupLocation,
        destinationLocation: ride.destination,
        fare: ride.fare,
        verificationCode: ride.verificationCode,
        verificationCodeExpiresAt: ride.verificationCodeExpiresAt,
        pickupCoords:
          ride.pickupLatitude && ride.pickupLongitude
            ? { latitude: ride.pickupLatitude, longitude: ride.pickupLongitude }
            : null,
        destinationCoords:
          ride.destinationLat && ride.destinationLng
            ? { latitude: ride.destinationLat, longitude: ride.destinationLng }
            : null,
        driverCoords: null, // Driver location is tracked via real-time subscriptions, not in response
      };
    } else if (serviceType === "porter") {
      const porter = service as PorterServiceResponse;
      return {
        icon: "cube" as const,
        color: brandColor,
        title: "Active Parcel Service",
        status: porter.status,
        driverName: porter.driver?.fullName,
        driverRating: porter.driver?.rating,
        vehicleType: porter.driver?.vehicleType,
        pickupLocation: porter.pickupLocation,
        destinationLocation: porter.deliveryLocation,
        fare: porter.fare,
        verificationCode: porter.verificationCode,
        verificationCodeExpiresAt: porter.verificationCodeExpiresAt,
        pickupCoords:
          porter.pickupLatitude && porter.pickupLongitude
            ? {
                latitude: porter.pickupLatitude,
                longitude: porter.pickupLongitude,
              }
            : null,
        destinationCoords:
          porter.deliveryLatitude && porter.deliveryLongitude
            ? {
                latitude: porter.deliveryLatitude,
                longitude: porter.deliveryLongitude,
              }
            : null,
        driverCoords: null, // Driver location is tracked via real-time subscriptions, not in response
      };
    } else {
      const carPool = service as CarPoolResponse;
      const currentMember =
        userType === "passenger"
          ? carPool.members?.find((member) => member.passengerId === user?.id)
          : undefined;
      return {
        icon: "people" as const,
        color: brandColor,
        title: "Active Ride Share",
        status: currentMember?.status ?? carPool.status,
        driverName: carPool.driver?.fullName,
        driverRating: carPool.driver?.rating,
        vehicleType: carPool.driver?.vehicleType,
        pickupLocation: carPool.startLocation,
        destinationLocation: carPool.endLocation,
        fare: carPool.calculatedFarePerPerson,
        verificationCode: currentMember?.verificationCode ?? null,
        verificationCodeExpiresAt: null,
        pickupCoords:
          carPool.startLatitude && carPool.startLongitude
            ? {
                latitude: carPool.startLatitude,
                longitude: carPool.startLongitude,
              }
            : null,
        destinationCoords:
          carPool.endLatitude && carPool.endLongitude
            ? { latitude: carPool.endLatitude, longitude: carPool.endLongitude }
            : null,
        driverCoords: null, // Car pool doesn't have driver location tracking
      };
    }
  };

  const data = getServiceData();

  // Get status label and color
  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      REQUESTED: { label: "Requested", color: "#F59E0B" },
      ACCEPTED: { label: "Accepted", color: "#10B981" },
      ARRIVING: { label: "Arriving", color: "#3B82F6" },
      IN_PROGRESS: { label: "In Progress", color: "#10B981" },
      PICKED_UP: { label: "Picked Up", color: "#10B981" },
      IN_TRANSIT: { label: "In Transit", color: "#3B82F6" },
      CONFIRMED: { label: "Confirmed", color: "#10B981" },
      OTP_AVAILABLE: { label: "OTP Ready", color: "#8B5CF6" },
      IN_RIDE: { label: "In Ride", color: "#10B981" },
      DROPPED_OFF: { label: "Dropped Off", color: "#22C55E" },
      OPEN: { label: "Open", color: "#3B82F6" },
      COMPLETED: { label: "Completed", color: "#6B7280" },
      CANCELLED: { label: "Cancelled", color: "#EF4444" },
    };
    return statusMap[status] || { label: status, color: "#6B7280" };
  };

  const statusInfo = getStatusInfo(data.status);

  if (compact) {
    // Compact version for multiple active services
    return (
      <TouchableOpacity
        onPress={handlePress}
        className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center flex-1">
            <View
              className="w-12 h-12 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: `${data.color}20` }}
            >
              <Ionicons name={data.icon} size={24} color={data.color} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-900">
                {data.title}
              </Text>
              <Text className="text-sm text-gray-500" numberOfLines={1}>
                {data.pickupLocation} → {data.destinationLocation}
              </Text>
            </View>
          </View>
          <View className="items-end">
            <View
              className="px-2 py-1 rounded-full mb-1"
              style={{ backgroundColor: `${statusInfo.color}20` }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: statusInfo.color }}
              >
                {statusInfo.label}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Expanded version for single active service
  return (
    <View className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
      {/* Header */}
      <View className="p-4 border-b border-gray-100">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: `${data.color}20` }}
            >
              <Ionicons name={data.icon} size={20} color={data.color} />
            </View>
            <View>
              <Text className="text-lg font-bold text-gray-900">
                {data.title}
              </Text>
              <View className="flex-row items-center mt-1">
                <View
                  className="px-2 py-1 rounded-full mr-2"
                  style={{ backgroundColor: `${statusInfo.color}20` }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: statusInfo.color }}
                  >
                    {statusInfo.label}
                  </Text>
                </View>
                {data.fare && (
                  <Text className="text-sm font-semibold text-gray-900">
                    {typeof data.fare === "number"
                      ? `₹${data.fare.toFixed(2)}`
                      : data.fare}
                  </Text>
                )}
              </View>
            </View>
          </View>
          <TouchableOpacity onPress={handlePress}>
            <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Driver Info */}
        {data.driverName && (
          <View className="flex-row items-center mt-2">
            <Ionicons name="person" size={16} color="#6B7280" />
            <Text className="text-sm text-gray-700 ml-1">
              {data.driverName}
            </Text>
            {data.driverRating && (
              <View className="flex-row items-center ml-3">
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text className="text-xs text-gray-600 ml-1">
                  {data.driverRating.toFixed(1)}
                </Text>
              </View>
            )}
            {data.vehicleType && (
              <Text className="text-xs text-gray-500 ml-2">
                • {data.vehicleType}
              </Text>
            )}
          </View>
        )}

        {/* Locations */}
        <View className="mt-3 space-y-1">
          <View className="flex-row items-start">
            <View className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 mr-2" />
            <Text className="text-sm text-gray-700 flex-1" numberOfLines={2}>
              {data.pickupLocation}
            </Text>
          </View>
          <View className="flex-row items-start">
            <View className="w-2 h-2 rounded-full bg-red-500 mt-1.5 mr-2" />
            <Text className="text-sm text-gray-700 flex-1" numberOfLines={2}>
              {data.destinationLocation}
            </Text>
          </View>
        </View>
      </View>

      {/* Verification Code - Only show to passengers (not drivers) */}
      {userType === "passenger" && data.verificationCode && (
          <View className="p-4 border-t border-gray-100">
            <VerificationCodeDisplay
              code={data.verificationCode}
              expiresAt={data.verificationCodeExpiresAt}
              serviceType={serviceType}
            />
          </View>
        )}

      {/* Action Buttons */}
      <View className="p-4 border-t border-gray-100 flex-row space-x-2">
        <TouchableOpacity
          onPress={handlePress}
          className="flex-1 rounded-lg py-3 items-center"
          style={{ backgroundColor: brandColor }}
        >
          <Text className="text-white font-semibold">View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
