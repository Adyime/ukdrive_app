/**
 * Service Selection Component
 * Displays service cards (Book Ride, Parcel, Ride Share) for passengers
 * Shows Pending Requests card for drivers
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth-context';

const BRAND_PURPLE = '#843FE3';
const BRAND_ORANGE = '#F36D14';

export interface ServiceSelectionProps {
  userType: 'passenger' | 'driver' | null;
  pendingRequestsCount?: number;
  onPendingRequestsPress?: () => void;
}

export function ServiceSelection({
  userType,
  pendingRequestsCount = 0,
  onPendingRequestsPress,
}: ServiceSelectionProps) {
  const { userType: authUserType } = useAuth();
  const brandColor = authUserType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const brandBgLight = authUserType === 'driver' ? '#EDE4FB' : '#FFF4ED';
  const brandBorder = authUserType === 'driver' ? '#C4B5FD' : '#FDBA74';

  const handlePendingRequestsPress = () => {
    if (onPendingRequestsPress) {
      onPendingRequestsPress();
    } else {
      router.push('/(tabs)/rides');
    }
  };

  if (userType === 'driver') {
    // Driver view: Show Pending Requests card
    return (
      <View className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
        <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wide">
          Available Services
        </Text>
        <View className="gap-3">
          {/* Pending Requests */}
          <TouchableOpacity
            onPress={handlePendingRequestsPress}
            className="flex-row items-center p-4 rounded-xl dark:bg-opacity-20"
            style={{ backgroundColor: brandBgLight, borderColor: brandBorder, borderWidth: 1 }}
            activeOpacity={0.7}
          >
            <View className="w-12 h-12 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: BRAND_PURPLE }}>
              <Ionicons name="list" size={24} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <View className="flex-row items-center">
                <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  Pending Requests
                </Text>
                {pendingRequestsCount > 0 && (
                  <View className="ml-2 bg-red-500 rounded-full px-2 py-0.5 min-w-[24px] items-center">
                    <Text className="text-white text-xs font-bold">
                      {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Rides, Parcel, and Ride Share requests
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Create Ride Share */}
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/create-car-pool')}
            className="flex-row items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800"
            activeOpacity={0.7}
          >
            <View className="w-12 h-12 bg-purple-500 rounded-xl items-center justify-center mr-4">
              <Ionicons name="people" size={24} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Create Ride Share
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Start a shared ride route
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Passenger view: Show service selection cards
  return (
    <View className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
      <Text className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wide">
        Choose a Service
      </Text>
      <View className="gap-3">
        {/* Ride Service */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/create-ride')}
          className="flex-row items-center p-4 rounded-xl dark:bg-opacity-20"
          style={{ backgroundColor: brandBgLight, borderColor: brandBorder, borderWidth: 1 }}
          activeOpacity={0.7}
        >
          <View className="w-12 h-12 rounded-xl items-center justify-center mr-4" style={{ backgroundColor: brandColor }}>
            <Ionicons name="car" size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Book a Ride
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Get a driver to your location
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

          {/* Parcel Service */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/create-porter')}
          className="flex-row items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800"
          activeOpacity={0.7}
        >
          <View className="w-12 h-12 bg-blue-500 rounded-xl items-center justify-center mr-4">
            <Ionicons name="cube" size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Parcel Service
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Send packages and deliveries
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        {/* Ride Share Service */}
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/browse-car-pools')}
          className="flex-row items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800"
          activeOpacity={0.7}
        >
          <View className="w-12 h-12 bg-purple-500 rounded-xl items-center justify-center mr-4">
            <Ionicons name="people" size={24} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Ride Share
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Share a ride with others
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
