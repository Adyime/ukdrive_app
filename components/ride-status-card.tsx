/**
 * Ride Status Card Component
 * Displays ride information in a card format (white/orange theme, no dark mode)
 */

import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { Car, Star } from "lucide-react-native";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import {
  RideResponse,
  RideStatus,
  getStatusLabel,
  getStatusColor,
  formatFare,
  formatDistance,
  formatVehicleType,
} from "@/lib/api/ride";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

interface RideStatusCardProps {
  ride: RideResponse;
  userType: "passenger" | "driver";
  onPress?: () => void;
  onActionPress?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
  showDetails?: boolean;
  className?: string;
}

export function RideStatusCard({
  ride,
  userType,
  onPress,
  onActionPress,
  actionLabel,
  actionLoading,
  showDetails = false,
  className,
}: RideStatusCardProps) {
  const statusColor = getStatusColor(ride.status);
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      className={cn(
        "bg-white rounded-xl p-4 shadow-sm border border-gray-100",
        className
      )}
    >
      {/* Status Badge */}
      <View className="flex-row items-center justify-between mb-3">
        <View
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: `${statusColor}20` }}
        >
          <Text
            style={{
              color: statusColor,
              fontSize: 13,
              fontFamily: "Figtree_600SemiBold",
            }}
          >
            {getStatusLabel(ride.status)}
          </Text>
        </View>
        <Text
          style={{
            color: "#6B7280",
            fontSize: 12,
            fontFamily: "Figtree_400Regular",
          }}
        >
          {formatVehicleType(ride.vehicleType)}
        </Text>
      </View>

      {/* Locations */}
      <View className="mb-3">
        {/* Pickup */}
        <View className="flex-row items-start mb-2">
          <View className="w-6 h-6 rounded-full bg-green-50 items-center justify-center mr-3 mt-0.5">
            <View className="w-2 h-2 rounded-full bg-emerald-500" />
          </View>
          <View className="flex-1">
            <Text
              style={{
                color: "#6B7280",
                fontSize: 11,
                fontFamily: "Figtree_400Regular",
                marginBottom: 2,
              }}
            >
              Pickup
            </Text>
            <Text
              style={{
                color: "#111827",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
              numberOfLines={2}
            >
              {ride.pickupLocation}
            </Text>
          </View>
        </View>

        {/* Connector Line */}
        <View className="w-0.5 h-4 bg-gray-200 ml-[11px] my-1" />

        {/* Destination */}
        <View className="flex-row items-start">
          <View
            className="w-6 h-6 rounded-full items-center justify-center mr-3 mt-0.5"
            style={{ backgroundColor: userType === "driver" ? "#EDE4FB" : "#FFF7F2" }}
          >
            <View
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: brandColor }}
            />
          </View>
          <View className="flex-1">
            <Text
              style={{
                color: "#6B7280",
                fontSize: 11,
                fontFamily: "Figtree_400Regular",
                marginBottom: 2,
              }}
            >
              Drop-off
            </Text>
            <Text
              style={{
                color: "#111827",
                fontSize: 13,
                fontFamily: "Figtree_500Medium",
              }}
              numberOfLines={2}
            >
              {ride.destination}
            </Text>
          </View>
        </View>
      </View>

      {/* Fare and Distance */}
      <View className="flex-row items-center justify-between pt-3 border-t border-gray-100">
        <View className="flex-row items-center">
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              fontFamily: "Figtree_700Bold",
              color: "#111827",
            }}
          >
            {formatFare(ride.fare)}
          </Text>
          {ride.distance && (
            <Text
              style={{
                color: "#6B7280",
                fontSize: 13,
                fontFamily: "Figtree_400Regular",
                marginLeft: 8,
              }}
            >
              • {formatDistance(ride.distance)}
            </Text>
          )}
        </View>

        {/* Action Button */}
        {actionLabel && onActionPress && (
          <TouchableOpacity
            onPress={onActionPress}
            disabled={actionLoading}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: actionLoading ? "#E5E7EB" : brandColor,
            }}
          >
            <Text
              style={{
                color: actionLoading ? "#9CA3AF" : "#FFF",
                fontWeight: "600",
                fontSize: 13,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              {actionLoading ? "Loading..." : actionLabel}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Extended Details */}
      {showDetails && (
        <View className="mt-3 pt-3 border-t border-gray-100">
          {/* Driver info (passenger view) */}
          {userType === "passenger" && ride.driver && (
            <View className="mb-2">
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 11,
                  fontFamily: "Figtree_400Regular",
                  marginBottom: 4,
                }}
              >
                Driver
              </Text>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    style={{
                      color: "#111827",
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 14,
                    }}
                  >
                    {ride.driver.fullName}
                  </Text>
                  <Text
                    style={{
                      color: "#6B7280",
                      fontSize: 13,
                      fontFamily: "Figtree_400Regular",
                    }}
                  >
                    {ride.driver.vehicleCategoryName
                      ? ride.driver.vehicleSubcategoryName
                        ? `${ride.driver.vehicleCategoryName} - ${ride.driver.vehicleSubcategoryName}`
                        : ride.driver.vehicleCategoryName
                      : formatVehicleType(ride.driver.vehicleType)}{" "}
                    • {ride.driver.vehicleRegistration}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Star size={13} color="#F59E0B" fill="#F59E0B" />
                  <Text
                    style={{
                      color: "#374151",
                      marginLeft: 4,
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {ride.driver.rating.toFixed(1)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Passenger info (driver view) */}
          {userType === "driver" && ride.passenger && (
            <View className="mb-2">
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 11,
                  fontFamily: "Figtree_400Regular",
                  marginBottom: 4,
                }}
              >
                Passenger
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                }}
              >
                {ride.passenger.fullName}
              </Text>
              <Text
                style={{
                  color: "#6B7280",
                  fontSize: 13,
                  fontFamily: "Figtree_400Regular",
                }}
              >
                {ride.passenger.phone}
              </Text>
            </View>
          )}

          {/* Timestamps */}
          <View className="flex-row flex-wrap">
            {ride.requestedAt && (
              <View className="mr-4 mb-1">
                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: 11,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Requested
                </Text>
                <Text
                  style={{
                    color: "#374151",
                    fontSize: 13,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  {formatTime(ride.requestedAt)}
                </Text>
              </View>
            )}
            {ride.acceptedAt && (
              <View className="mr-4 mb-1">
                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: 11,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Accepted
                </Text>
                <Text
                  style={{
                    color: "#374151",
                    fontSize: 13,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  {formatTime(ride.acceptedAt)}
                </Text>
              </View>
            )}
            {ride.startedAt && (
              <View className="mr-4 mb-1">
                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: 11,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Started
                </Text>
                <Text
                  style={{
                    color: "#374151",
                    fontSize: 13,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  {formatTime(ride.startedAt)}
                </Text>
              </View>
            )}
            {ride.completedAt && (
              <View className="mr-4 mb-1">
                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: 11,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Completed
                </Text>
                <Text
                  style={{
                    color: "#374151",
                    fontSize: 13,
                    fontFamily: "Figtree_500Medium",
                  }}
                >
                  {formatTime(ride.completedAt)}
                </Text>
              </View>
            )}
          </View>

          {/* Cancellation Info */}
          {ride.status === RideStatus.CANCELLED && (
            <View className="mt-2 p-2 bg-red-50 rounded-lg">
              <Text
                style={{
                  color: "#DC2626",
                  fontSize: 13,
                  fontFamily: "Figtree_500Medium",
                }}
              >
                Cancelled by {ride.cancelledBy}
                {ride.cancellationReason && `: ${ride.cancellationReason}`}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Compact version for lists (driver pending rides, history)
 */
export function RideStatusCardCompact({
  ride,
  onPress,
  onAccept,
  acceptLoading,
}: {
  ride: RideResponse;
  onPress?: () => void;
  onAccept?: () => void;
  acceptLoading?: boolean;
}) {
  const { userType } = useAuth();
  const statusColor = getStatusColor(ride.status);
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <View
            className="w-2 h-2 rounded-full mr-2"
            style={{ backgroundColor: statusColor }}
          />
          <Text
            style={{
              color: "#111827",
              fontFamily: "Figtree_700Bold",
              fontSize: 15,
            }}
          >
            {formatFare(ride.fare)}
          </Text>
          <Text
            style={{
              color: "#6B7280",
              fontSize: 13,
              fontFamily: "Figtree_400Regular",
              marginLeft: 8,
            }}
          >
            • {formatDistance(ride.distance)}
          </Text>
        </View>
        {ride.passenger && (
          <Text
            style={{
              color: "#6B7280",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
            }}
          >
            {ride.passenger.fullName}
          </Text>
        )}
      </View>

      {/* Locations */}
      <View className="mb-2">
        <View className="flex-row items-center mb-1">
          <View className="w-3 h-3 rounded-full bg-emerald-500 mr-2" />
          <Text
            style={{
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
              flex: 1,
            }}
            numberOfLines={1}
          >
            {ride.pickupLocation}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View
            className="w-3 h-3 rounded-sm mr-2"
            style={{ backgroundColor: brandColor }}
          />
          <Text
            style={{
              color: "#374151",
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
              flex: 1,
            }}
            numberOfLines={1}
          >
            {ride.destination}
          </Text>
        </View>
      </View>

      {/* Accept Button */}
      {onAccept && (
        <TouchableOpacity
          onPress={onAccept}
          disabled={acceptLoading}
          style={{
            marginTop: 8,
            paddingVertical: 10,
            borderRadius: 12,
            alignItems: "center",
            backgroundColor: acceptLoading ? "#E5E7EB" : brandColor,
          }}
        >
          <Text
            style={{
              color: acceptLoading ? "#9CA3AF" : "#FFF",
              fontWeight: "700",
              fontSize: 14,
              fontFamily: "Figtree_700Bold",
            }}
          >
            {acceptLoading ? "Accepting..." : "Accept Ride"}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

/**
 * Empty state component
 */
export function NoRidesCard({ message }: { message: string }) {
  return (
    <View className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 items-center">
      <Car size={36} color="#9CA3AF" style={{ marginBottom: 12 }} />
      <Text
        style={{
          color: "#6B7280",
          textAlign: "center",
          fontFamily: "Figtree_400Regular",
          fontSize: 14,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

