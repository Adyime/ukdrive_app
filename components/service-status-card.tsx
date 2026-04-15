/**
 * Generic Service Status Card Component
 * Base component for displaying service information (Ride, Porter, Car Pool)
 * Can be extended or used directly
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { cn } from '@/lib/utils';

export interface ServiceStatusCardProps {
  // Status
  status: string;
  statusLabel: string;
  statusColor: string;

  // Locations
  pickupLocation?: string;
  destinationLocation?: string;
  startLocation?: string;
  endLocation?: string;

  // Pricing
  fare?: number;
  distance?: number | null;

  // Additional info
  vehicleType?: string | null;
  serviceType?: 'ride' | 'porter' | 'carpool';

  // Actions
  onPress?: () => void;
  onActionPress?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;

  // Display options
  showDetails?: boolean;
  className?: string;

  // Custom content
  children?: React.ReactNode;
}

export function ServiceStatusCard({
  status,
  statusLabel,
  statusColor,
  pickupLocation,
  destinationLocation,
  startLocation,
  endLocation,
  fare,
  distance,
  vehicleType,
  serviceType = 'ride',
  onPress,
  onActionPress,
  actionLabel,
  actionLoading,
  showDetails = false,
  className,
  children,
}: ServiceStatusCardProps) {
  const formatFare = (amount?: number) => {
    if (!amount) return 'N/A';
    return `₹${amount.toFixed(2)}`;
  };

  const formatDistance = (dist?: number | null) => {
    if (!dist) return 'N/A';
    if (dist < 1) {
      return `${Math.round(dist * 1000)}m`;
    }
    return `${dist.toFixed(1)} km`;
  };

  const formatVehicleType = (type?: string | null) => {
    if (!type) return 'Any';
    return type;
  };

  // Determine which locations to show
  const originLocation = pickupLocation || startLocation;
  const destLocation = destinationLocation || endLocation;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700',
        className
      )}
    >
      {/* Status Badge */}
      <View className="flex-row items-center justify-between mb-3">
        <View
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: `${statusColor}20` }}
        >
          <Text style={{ color: statusColor }} className="text-sm font-semibold">
            {statusLabel}
          </Text>
        </View>
        {vehicleType && (
          <Text className="text-gray-500 dark:text-gray-400 text-xs">
            {formatVehicleType(vehicleType)}
          </Text>
        )}
      </View>

      {/* Locations */}
      {(originLocation || destLocation) && (
        <View className="mb-3">
          {/* Origin */}
          {originLocation && (
            <>
              <View className="flex-row items-start mb-2">
                <View className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 items-center justify-center mr-3 mt-0.5">
                  <View className="w-2 h-2 rounded-full bg-emerald-500" />
                </View>
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                    {serviceType === 'carpool' ? 'Start' : 'Pickup'}
                  </Text>
                  <Text
                    className="text-gray-900 dark:text-gray-100 text-sm"
                    numberOfLines={2}
                  >
                    {originLocation}
                  </Text>
                </View>
              </View>

              {/* Connector Line */}
              {destLocation && (
                <View className="w-0.5 h-4 bg-gray-200 dark:bg-gray-600 ml-[11px] my-1" />
              )}
            </>
          )}

          {/* Destination */}
          {destLocation && (
            <View className="flex-row items-start">
              <View className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center mr-3 mt-0.5">
                <View className="w-2 h-2 rounded-full bg-red-500" />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                  {serviceType === 'carpool' ? 'End' : 'Drop-off'}
                </Text>
                <Text
                  className="text-gray-900 dark:text-gray-100 text-sm"
                  numberOfLines={2}
                >
                  {destLocation}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Fare and Distance */}
      {(fare !== undefined || distance) && (
        <View className="flex-row items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
          <View className="flex-row items-center">
            {fare !== undefined && (
              <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatFare(fare)}
              </Text>
            )}
            {distance && (
              <Text className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                {fare !== undefined ? '•' : ''} {formatDistance(distance)}
              </Text>
            )}
          </View>

          {/* Action Button */}
          {actionLabel && onActionPress && (
            <TouchableOpacity
              onPress={onActionPress}
              disabled={actionLoading}
              className={cn(
                'px-4 py-2 rounded-lg',
                actionLoading ? 'bg-gray-300 dark:bg-gray-600' : 'bg-emerald-500'
              )}
            >
              <Text className="text-white font-semibold text-sm">
                {actionLoading ? 'Loading...' : actionLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Custom Content */}
      {children && <View className="mt-3">{children}</View>}
    </TouchableOpacity>
  );
}
