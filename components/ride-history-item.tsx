/**
 * Ride History Item Component
 * Displays a single ride in the history list
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/utils';
import {
  RideResponse,
  RideStatus,
  getStatusLabel,
  getStatusColor,
  formatFare,
  formatDistance,
  formatVehicleType,
} from '@/lib/api/ride';

export interface RideHistoryItemProps {
  ride: RideResponse;
  userType: 'passenger' | 'driver';
  onPress?: () => void;
}

export function RideHistoryItem({
  ride,
  userType,
  onPress,
}: RideHistoryItemProps) {
  const statusColor = getStatusColor(ride.status);
  const isCompleted = ride.status === RideStatus.COMPLETED;
  const isCancelled = ride.status === RideStatus.CANCELLED;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Check if today
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }

    // Check if yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // Otherwise show date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 shadow-sm border border-gray-100 dark:border-gray-700"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1">
          <View
            className="w-2 h-2 rounded-full mr-2"
            style={{ backgroundColor: statusColor }}
          />
          <Text className="text-gray-900 dark:text-gray-100 font-semibold flex-1">
            {formatDate(ride.requestedAt)}
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-xs">
            {formatTime(ride.requestedAt)}
          </Text>
        </View>
      </View>

      {/* Status Badge */}
      <View className="mb-3">
        <View
          className="px-3 py-1 rounded-full self-start"
          style={{ backgroundColor: `${statusColor}20` }}
        >
          <Text style={{ color: statusColor }} className="text-sm font-semibold">
            {getStatusLabel(ride.status)}
          </Text>
        </View>
      </View>

      {/* Locations */}
      <View className="mb-3">
        {/* Pickup */}
        <View className="flex-row items-start mb-2">
          <View className="w-4 h-4 rounded-full bg-emerald-500 mr-2 mt-1" />
          <View className="flex-1">
            <Text
              className="text-gray-900 dark:text-gray-100 text-sm"
              numberOfLines={1}
            >
              {ride.pickupLocation}
            </Text>
          </View>
        </View>

        {/* Destination */}
        <View className="flex-row items-start">
          <View className="w-4 h-4 rounded-full bg-red-500 mr-2 mt-1" />
          <View className="flex-1">
            <Text
              className="text-gray-900 dark:text-gray-100 text-sm"
              numberOfLines={1}
            >
              {ride.destination}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View className="flex-row items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
        <View className="flex-row items-center">
          {isCompleted && (
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {formatFare(ride.fare)}
            </Text>
          )}
          {ride.distance && (
            <Text className="text-gray-500 dark:text-gray-400 text-sm ml-2">
              {isCompleted ? '•' : ''} {formatDistance(ride.distance)}
            </Text>
          )}
          {ride.vehicleType && (
            <Text className="text-gray-500 dark:text-gray-400 text-sm ml-2">
              • {formatVehicleType(ride.vehicleType)}
            </Text>
          )}
        </View>

        {/* User Info */}
        {userType === 'passenger' && ride.driver && (
          <View className="flex-row items-center">
            <Ionicons name="person" size={16} color="#6B7280" />
            <Text className="text-gray-600 dark:text-gray-400 text-sm ml-1">
              {ride.driver.fullName}
            </Text>
          </View>
        )}

        {userType === 'driver' && ride.passenger && (
          <View className="flex-row items-center">
            <Ionicons name="person" size={16} color="#6B7280" />
            <Text className="text-gray-600 dark:text-gray-400 text-sm ml-1">
              {ride.passenger.fullName}
            </Text>
          </View>
        )}

        {/* Arrow */}
        {onPress && (
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        )}
      </View>

      {/* Cancellation Reason */}
      {isCancelled && ride.cancellationReason && (
        <View className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <Text className="text-red-600 dark:text-red-400 text-xs">
            Cancelled: {ride.cancellationReason}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
