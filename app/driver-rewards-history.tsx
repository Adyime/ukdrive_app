import { useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/context/auth-context";
import { useDriverRewards } from "@/hooks/use-driver-rewards";
import { formatCurrencyINR } from "@/lib/utils/formatters";

const BRAND_PURPLE = "#843FE3";

function missionTypeLabel(type: string | null): string {
  switch (type) {
    case "RIDE_COUNT":
      return "Ride Count";
    case "TIME_BASED":
      return "Online Time";
    case "RATING":
      return "Rating";
    case "SPECIAL_EVENT":
      return "Special Event";
    default:
      return "Reward";
  }
}

function periodLabel(period: string | null): string {
  switch (period) {
    case "DAILY":
      return "Daily";
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "ONE_TIME":
      return "One-Time";
    default:
      return "Period";
  }
}

function formatCurrency(amount: number): string {
  return formatCurrencyINR(amount);
}

export default function DriverRewardsHistoryScreen() {
  const { userType } = useAuth();
  const isDriver = userType === "driver";

  const {
    summary,
    rewards,
    historyLoading,
    historyRefreshing,
    historyError,
    historyHasMore,
    totalRewardsCount,
    refreshHistory,
    loadMoreHistory,
  } = useDriverRewards({ autoFetchHistory: true, historyPageSize: 20 });

  useFocusEffect(
    useCallback(() => {
      if (isDriver) {
        refreshHistory();
      }
    }, [isDriver, refreshHistory])
  );

  if (!isDriver) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 16,
              color: "#111827",
              textAlign: "center",
            }}
          >
            Rewards are available for driver accounts only.
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.back()}
            style={{
              marginTop: 14,
              backgroundColor: BRAND_PURPLE,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontFamily: "Figtree_600SemiBold" }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["top"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={{ marginRight: 14 }}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 22,
            fontFamily: "Figtree_700Bold",
            color: "#111827",
          }}
        >
          Rewards History
        </Text>
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginTop: 16,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#F3F4F6",
          backgroundColor: "#FFFFFF",
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 11,
                color: "#6B7280",
                textTransform: "uppercase",
              }}
            >
              Total Reward
            </Text>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 18,
                color: BRAND_PURPLE,
                marginTop: 2,
              }}
            >
              {formatCurrency(summary?.totalEarned ?? 0)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 11,
                color: "#6B7280",
                textTransform: "uppercase",
              }}
            >
              This Month
            </Text>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 18,
                color: "#111827",
                marginTop: 2,
              }}
            >
              {formatCurrency(summary?.thisMonthEarned ?? 0)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 11,
                color: "#6B7280",
                textTransform: "uppercase",
              }}
            >
              Rewards
            </Text>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 18,
                color: "#111827",
                marginTop: 2,
              }}
            >
              {summary?.totalRewards ?? totalRewardsCount}
            </Text>
          </View>
        </View>
      </View>

      {historyError ? (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FECACA",
          }}
        >
          <Text
            style={{
              color: "#991B1B",
              fontSize: 13,
              fontFamily: "Figtree_400Regular",
            }}
          >
            {historyError}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={rewards}
        keyExtractor={(item) => item.grantId}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={historyRefreshing}
            onRefresh={refreshHistory}
            colors={[BRAND_PURPLE]}
            tintColor={BRAND_PURPLE}
          />
        }
        onEndReached={() => {
          if (historyHasMore && !historyLoading) {
            loadMoreHistory();
          }
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          historyLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <ActivityIndicator size="small" color={BRAND_PURPLE} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !historyLoading && !historyRefreshing ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 80,
                paddingHorizontal: 32,
              }}
            >
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: "#F3EEFE",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Ionicons name="gift-outline" size={30} color={BRAND_PURPLE} />
              </View>
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 16,
                  color: "#111827",
                }}
              >
                No rewards yet
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#6B7280",
                  textAlign: "center",
                }}
              >
                Complete active offers to start earning mission rewards.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 10,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#F3F4F6",
              backgroundColor: "#FFFFFF",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: "#111827",
                  }}
                  numberOfLines={1}
                >
                  {item.missionTitle || "Mission Reward"}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: "Figtree_400Regular",
                    fontSize: 12,
                    color: "#6B7280",
                  }}
                >
                  {missionTypeLabel(item.missionType)} • {periodLabel(item.timePeriod)}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  color: BRAND_PURPLE,
                  fontSize: 15,
                }}
              >
                +{formatCurrency(item.amount)}
              </Text>
            </View>

            <Text
              style={{
                marginTop: 8,
                fontFamily: "Figtree_400Regular",
                fontSize: 11,
                color: "#9CA3AF",
              }}
            >
              {new Date(item.createdAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

