/**
 * Withdrawal History Screen
 * Shows list of withdrawal requests for drivers
 */

import { useState, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/auth-context";
import { useAlert, type AlertButton } from "@/context/alert-context";
import { useWithdrawals } from "@/hooks/useWithdrawals";
import {
  type Withdrawal,
  formatAmount,
  getWithdrawalStatusLabel,
  getWithdrawalStatusColor,
} from "@/lib/api/wallet";

// ============================================
// Withdrawal Item Component
// ============================================

interface WithdrawalItemProps {
  withdrawal: Withdrawal;
  onCancel: (id: string) => void;
  isCancelling: boolean;
  showAlert: (title: string, message?: string, buttons?: AlertButton[]) => void;
}

function WithdrawalItem({
  withdrawal,
  onCancel,
  isCancelling,
  showAlert,
}: WithdrawalItemProps) {
  const statusColor = getWithdrawalStatusColor(withdrawal.status);
  const statusLabel = getWithdrawalStatusLabel(withdrawal.status);

  const formattedDate = new Date(withdrawal.createdAt).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );

  const canCancel = withdrawal.status === "PENDING";
  const isUpi = withdrawal.withdrawalMethod === "UPI";

  const handleCancel = () => {
    showAlert(
      "Cancel Withdrawal",
      "Are you sure you want to cancel this withdrawal request?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: () => onCancel(withdrawal.id),
        },
      ]
    );
  };

  return (
    <View className="mx-4 mb-3 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header Row */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {formatAmount(withdrawal.amount)}
        </Text>
        <View
          className="px-3 py-1 rounded-full"
          style={{ backgroundColor: `${statusColor}20` }}
        >
          <Text style={{ color: statusColor }} className="text-xs font-medium">
            {statusLabel}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mb-2">
        <Ionicons
          name={isUpi ? "qr-code-outline" : "business-outline"}
          size={16}
          color="#6B7280"
        />
        <Text className="text-sm text-gray-600 dark:text-gray-400 ml-2">
          {isUpi
            ? `UPI: ${withdrawal.upiId ?? "-"}`
            : `Bank: ${withdrawal.bankAccountNumber ?? "-"} • ${withdrawal.bankIfscCode ?? "-"}`}
        </Text>
      </View>

      {!isUpi && (
        <View className="flex-row items-center mb-2">
          <Ionicons name="person-outline" size={16} color="#6B7280" />
          <Text className="text-sm text-gray-600 dark:text-gray-400 ml-2">
            {withdrawal.bankAccountHolder ?? "-"}
            {withdrawal.bankName ? ` (${withdrawal.bankName})` : ""}
          </Text>
        </View>
      )}

      {/* Date */}
      <View className="flex-row items-center">
        <Ionicons name="calendar-outline" size={16} color="#6B7280" />
        <Text className="text-sm text-gray-500 dark:text-gray-500 ml-2">
          Requested: {formattedDate}
        </Text>
      </View>

      {/* Transfer Reference (if completed) */}
      {withdrawal.transferReference && (
        <View className="flex-row items-center mt-2">
          <Ionicons name="checkmark-circle-outline" size={16} color="#22C55E" />
          <Text style={{ color: "#843FE3" }} className="text-sm ml-2">
            UTR: {withdrawal.transferReference}
          </Text>
        </View>
      )}

      {/* Rejection Reason (if rejected) */}
      {withdrawal.rejectionReason && (
        <View className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <Text className="text-sm text-red-600 dark:text-red-400">
            {withdrawal.rejectionReason}
          </Text>
        </View>
      )}

      {/* Transfer Failed Reason */}
      {withdrawal.transferFailReason && (
        <View className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <Text className="text-sm text-amber-600 dark:text-amber-400">
            Transfer failed: {withdrawal.transferFailReason}
          </Text>
        </View>
      )}

      {/* Cancel Button (if pending) */}
      {canCancel && (
        <TouchableOpacity
          onPress={handleCancel}
          disabled={isCancelling}
          className="mt-3 py-2 border border-red-300 dark:border-red-700 rounded-lg"
        >
          {isCancelling ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text className="text-center text-red-600 dark:text-red-400 font-medium">
              Cancel Request
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ============================================
// Main Component
// ============================================

export default function WithdrawalHistoryScreen() {
  const { userType } = useAuth();
  const { showAlert } = useAlert();
  const isDriver = userType === "driver";

  const {
    withdrawals,
    loading,
    error,
    refresh,
    loadMore,
    cancelWithdrawal,
  } = useWithdrawals();

  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleCancel = useCallback(
    async (id: string) => {
      setCancellingId(id);
      await cancelWithdrawal(id);
      setCancellingId(null);
    },
    [cancelWithdrawal]
  );

  const renderItem = useCallback(
    ({ item }: { item: Withdrawal }) => (
      <WithdrawalItem
        withdrawal={item}
        onCancel={handleCancel}
        showAlert={showAlert}
        isCancelling={cancellingId === item.id}
      />
    ),
    [handleCancel, cancellingId, showAlert]
  );

  const renderFooter = useCallback(() => {
    if (!loading || refreshing) return null;
    return (
      <View className="py-4">
        <ActivityIndicator size="small" color="#843FE3" />
      </View>
    );
  }, [loading, refreshing]);

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View className="flex-1 items-center justify-center py-16">
        <Ionicons name="wallet-outline" size={64} color="#9CA3AF" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
          No withdrawal requests yet
        </Text>
        <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1">
          Request a withdrawal from your wallet
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/withdrawal-request")}
          style={{ backgroundColor: "#843FE3" }}
          className="mt-4 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-medium">Request Withdrawal</Text>
        </TouchableOpacity>
      </View>
    );
  }, [loading]);

  // Redirect non-drivers
  if (!isDriver) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900 items-center justify-center">
        <Ionicons name="alert-circle-outline" size={64} color="#9CA3AF" />
        <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center px-8">
          Only drivers can view withdrawal history
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ backgroundColor: "#843FE3" }}
          className="mt-4 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-medium">Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      edges={["top"]}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#6B7280" />
          </TouchableOpacity>
          <Text className="text-xl font-semibold text-gray-900 dark:text-gray-100 ml-3">
            Withdrawal History
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push("/withdrawal-request")}
          style={{ backgroundColor: "#EDE4FB" }}
          className="px-3 py-2 rounded-lg"
        >
          <Text style={{ color: "#843FE3" }} className="font-medium text-sm">
            + New
          </Text>
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error && (
        <View className="mx-4 mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <Text className="text-red-600 dark:text-red-400 text-center">
            {error}
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={withdrawals}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#843FE3"]}
            tintColor="#843FE3"
          />
        }
        contentContainerStyle={{ flexGrow: 1, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

