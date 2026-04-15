/**
 * Payment Status Section Component
 * Lightweight read-only display of payment status for a completed ride.
 * Action buttons have moved to the dedicated ride-payment-confirmation screen.
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ActivityIndicator } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import type { RidePayment } from '@/lib/api/payment';
import {
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getPaymentMethodLabel,
} from '@/lib/api/payment';
import { formatAmount } from '@/lib/api/wallet';

interface PaymentAwaitedSectionProps {
  payment: RidePayment | null;
  loading?: boolean;
}

export function PaymentAwaitedSection({
  payment,
  loading = false,
}: PaymentAwaitedSectionProps) {
  if (loading && !payment) {
    return (
      <View className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 border border-gray-200 dark:border-gray-700">
        <View className="items-center py-4">
          <ActivityIndicator size="small" color="#10B981" />
          <Text className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Loading payment status...
          </Text>
        </View>
      </View>
    );
  }

  if (!payment) {
    return null;
  }

  const isPaymentComplete = payment.status === 'COMPLETED';
  const isPaymentFailed = payment.status === 'FAILED';
  const isAwaitingOnline = payment.status === 'AWAITING_ONLINE' || payment.status === 'PROCESSING';
  const isPending = payment.status === 'PENDING';

  return (
    <View className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 border border-gray-200 dark:border-gray-700">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Payment Status
        </Text>
        <View
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: `${getPaymentStatusColor(payment.status)}20` }}
        >
          <Text
            style={{ color: getPaymentStatusColor(payment.status) }}
            className="text-sm font-medium"
          >
            {getPaymentStatusLabel(payment.status)}
          </Text>
        </View>
      </View>

      {/* Fare Amount */}
      <View className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
        <View className="flex-row justify-between items-center">
          <Text className="text-sm text-gray-600 dark:text-gray-400">Total Fare</Text>
          <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatAmount(payment.fareAmount)}
          </Text>
        </View>
      </View>

      {/* Payment Method */}
      {payment.paymentMethod && (
        <View className="mb-4">
          <Text className="text-sm text-gray-600 dark:text-gray-400 mb-1">Payment Method</Text>
          <View className="flex-row items-center">
            <Ionicons
              name={
                payment.paymentMethod === 'CASH'
                  ? 'cash'
                  : payment.paymentMethod === 'WALLET'
                  ? 'wallet'
                  : 'card'
              }
              size={20}
              color="#6B7280"
            />
            <Text className="text-base font-medium text-gray-900 dark:text-gray-100 ml-2">
              {getPaymentMethodLabel(payment.paymentMethod)}
            </Text>
          </View>
        </View>
      )}

      {/* Status Messages */}
      {isPending && (
        <View className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <View className="flex-row items-center">
            <Ionicons name="time-outline" size={20} color="#F59E0B" />
            <Text className="text-sm text-amber-700 dark:text-amber-300 ml-2 flex-1">
              Payment pending
            </Text>
          </View>
        </View>
      )}

      {isAwaitingOnline && (
        <View className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <View className="flex-row items-center">
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text className="text-sm text-blue-700 dark:text-blue-300 ml-2 flex-1">
              Payment is being processed...
            </Text>
          </View>
        </View>
      )}

      {isPaymentFailed && (
        <View className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <View className="flex-row items-center">
            <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
            <Text className="text-sm text-red-700 dark:text-red-300 ml-2 flex-1">
              {payment.failureReason || 'Payment failed'}
            </Text>
          </View>
        </View>
      )}

      {isPaymentComplete && (
        <View className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text className="text-sm text-emerald-700 dark:text-emerald-300 ml-2 flex-1">
              Payment confirmed
            </Text>
          </View>
        </View>
      )}

      {/* Driver Earnings Info */}
      <View className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <View className="flex-row justify-between items-center">
          <Text className="text-xs text-gray-500 dark:text-gray-400">Your Earnings</Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formatAmount(payment.driverEarningAmount)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mt-1">
          <Text className="text-xs text-gray-500 dark:text-gray-400">Platform Fee</Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {formatAmount(payment.platformFeeAmount)}
          </Text>
        </View>
      </View>
    </View>
  );
}
