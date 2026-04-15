/**
 * My Rides Screen (Driver) — Ride history + earnings summary
 * Shows daily, weekly, monthly & total earnings with a history list
 */

import React, { useState, useMemo, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, Platform, Modal, Pressable } from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/auth-context";
import {
  useUnifiedHistory,
  type HistoryFilter,
  type UnifiedHistoryItem as HistoryItem,
} from "@/hooks/use-unified-history";
import { UnifiedHistoryItem } from "@/components/unified-history-item";
import { Loading } from "@/components/ui/loading";
import type { RideResponse } from "@/lib/api/ride";
import type { PorterServiceResponse } from "@/lib/api/porter";
import type { CarPoolResponse } from "@/lib/api/carPool";

const BRAND_PURPLE = "#843FE3";
const BRAND_ORANGE = "#F36D14";

type Period = "today" | "week" | "month" | "total" | "custom";
type StatusFilter = "all" | "completed" | "cancelled";

function getEarningFromItem(item: HistoryItem): number {
  if (item.status !== "COMPLETED") return 0;

  if (item.type === "ride") {
    const ride = item.service as RideResponse;
    return ride.ridePayment?.driverEarningAmount ?? ride.fare ?? 0;
  }
  if (item.type === "porter") {
    const porter = item.service as PorterServiceResponse;
    return (
      (porter as any).porterPayment?.driverEarningAmount ?? porter.fare ?? 0
    );
  }
  if (item.type === "pool") {
    const pool = item.service as CarPoolResponse;
    return pool.totalFareForDriver ?? 0;
  }
  return 0;
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return date >= startOfWeek;
}

function isThisMonth(date: Date): boolean {
  const now = new Date();
  return (
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

// ── Earnings card ────────────────────────────────────────────────────────
function EarningCard({
  label,
  amount,
  count,
  active,
  onPress,
}: {
  label: string;
  amount: number;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: active ? BRAND_PURPLE : "#FFFFFF",
        borderRadius: 16,
        padding: 14,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: active ? BRAND_PURPLE : "#F3F4F6",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: active ? 0.15 : 0.05,
        shadowRadius: 3,
        elevation: active ? 3 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Figtree_600SemiBold",
          color: active ? "rgba(255,255,255,0.7)" : "#9CA3AF",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 20,
          fontFamily: "Figtree_700Bold",
          color: active ? "#FFFFFF" : "#111827",
          marginBottom: 2,
        }}
      >
        ₹{amount.toFixed(0)}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontFamily: "Figtree_400Regular",
          color: active ? "rgba(255,255,255,0.6)" : "#9CA3AF",
        }}
      >
        {count} {count === 1 ? "trip" : "trips"}
      </Text>
    </TouchableOpacity>
  );
}

// ── Filter chip ──────────────────────────────────────────────────────────
function FilterChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? "#EDE4FB" : "#F9FAFB",
        marginRight: 8,
        borderWidth: 1,
        borderColor: active ? BRAND_PURPLE : "#F3F4F6",
      }}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? BRAND_PURPLE : "#6B7280"}
      />
      <Text
        style={{
          fontSize: 13,
          fontFamily: active ? "Figtree_600SemiBold" : "Figtree_400Regular",
          color: active ? BRAND_PURPLE : "#6B7280",
          marginLeft: 5,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function MyRidesScreen() {
  const { userType } = useAuth();
  const [activePeriod, setActivePeriod] = useState<Period>("today");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Custom date filter state
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const formatDisplayDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const handleFromChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowFromPicker(false);
    if (date) {
      setFromDate(date);
      if (date > toDate) setToDate(date);
      setActivePeriod("custom");
    }
  };

  const handleToChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") setShowToPicker(false);
    if (date) {
      setToDate(date);
      if (date < fromDate) setFromDate(date);
      setActivePeriod("custom");
    }
  };

  const isInCustomRange = useCallback(
    (d: Date): boolean => {
      const start = new Date(fromDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    },
    [fromDate, toDate]
  );

  const {
    items,
    loading,
    refreshing,
    hasMore,
    loadMore,
    refresh,
    setFilter,
    filter,
  } = useUnifiedHistory(20);

  // Compute earnings from completed items
  const earnings = useMemo(() => {
    let todayAmt = 0,
      todayCount = 0;
    let weekAmt = 0,
      weekCount = 0;
    let monthAmt = 0,
      monthCount = 0;
    let totalAmt = 0,
      totalCount = 0;

    for (const item of items) {
      const earning = getEarningFromItem(item);
      if (earning <= 0) continue;
      totalAmt += earning;
      totalCount++;
      if (isThisMonth(item.date)) {
        monthAmt += earning;
        monthCount++;
      }
      if (isThisWeek(item.date)) {
        weekAmt += earning;
        weekCount++;
      }
      if (isToday(item.date)) {
        todayAmt += earning;
        todayCount++;
      }
    }

    return {
      today: { amount: todayAmt, count: todayCount },
      week: { amount: weekAmt, count: weekCount },
      month: { amount: monthAmt, count: monthCount },
      total: { amount: totalAmt, count: totalCount },
    };
  }, [items]);

  const matchesStatusFilter = useCallback(
    (item: HistoryItem): boolean => {
      if (statusFilter === "all") return true;
      const normalizedStatus = String(item.status ?? "").toUpperCase();
      if (statusFilter === "completed") return normalizedStatus === "COMPLETED";
      return normalizedStatus === "CANCELLED";
    },
    [statusFilter]
  );

  const passengerFilteredItems = useMemo(
    () => items.filter(matchesStatusFilter),
    [items, matchesStatusFilter]
  );

  // Filter items by selected period for the list
  const filteredByPeriod = useMemo(() => {
    if (activePeriod === "total") return passengerFilteredItems;
    if (activePeriod === "custom") {
      return passengerFilteredItems.filter((item) => isInCustomRange(item.date));
    }
    return passengerFilteredItems.filter((item) => {
      if (activePeriod === "today") return isToday(item.date);
      if (activePeriod === "week") return isThisWeek(item.date);
      if (activePeriod === "month") return isThisMonth(item.date);
      return true;
    });
  }, [passengerFilteredItems, activePeriod, isInCustomRange]);

  // Compute custom period earnings
  const customEarnings = useMemo(() => {
    if (activePeriod !== "custom") return { amount: 0, count: 0 };
    let amt = 0,
      count = 0;
    for (const item of items) {
      if (!isInCustomRange(item.date)) continue;
      const earning = getEarningFromItem(item);
      if (earning <= 0) continue;
      amt += earning;
      count++;
    }
    return { amount: amt, count };
  }, [items, activePeriod, isInCustomRange]);

  // ── Passenger view ─────────────────────────────────────────────────────
  if (userType !== "driver") {
    const passengerRenderItem = ({ item }: { item: HistoryItem }) => (
      <View style={{ paddingHorizontal: 16 }}>
        <UnifiedHistoryItem type={item.type} service={item.service} />
      </View>
    );

    const PassengerHeader = () => (
      <View>
        {/* Filter chips */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          {(
            [
              { label: "All", value: "all", icon: "list" },
              { label: "Rides", value: "ride", icon: "car" },
              { label: "Parcel", value: "porter", icon: "cube" },
              { label: "Ride Share", value: "pool", icon: "people" },
            ] as {
              label: string;
              value: HistoryFilter;
              icon: keyof typeof Ionicons.glyphMap;
            }[]
          ).map((chip) => {
            const isActive = filter === chip.value;
            return (
              <TouchableOpacity
                key={chip.value}
                activeOpacity={0.8}
                onPress={() => setFilter(chip.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: isActive ? "#FFF0E8" : "#F9FAFB",
                  marginRight: 8,
                  borderWidth: 1,
                  borderColor: isActive ? BRAND_ORANGE : "#F3F4F6",
                }}
              >
                <Ionicons
                  name={chip.icon}
                  size={14}
                  color={isActive ? BRAND_ORANGE : "#6B7280"}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: isActive
                      ? "Figtree_600SemiBold"
                      : "Figtree_400Regular",
                    color: isActive ? BRAND_ORANGE : "#6B7280",
                    marginLeft: 5,
                  }}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Status filter chips */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          {(
            [
              { label: "All Status", value: "all", icon: "funnel-outline" },
              {
                label: "Completed",
                value: "completed",
                icon: "checkmark-circle-outline",
              },
              {
                label: "Cancelled",
                value: "cancelled",
                icon: "close-circle-outline",
              },
            ] as {
              label: string;
              value: StatusFilter;
              icon: keyof typeof Ionicons.glyphMap;
            }[]
          ).map((chip) => {
            const isActive = statusFilter === chip.value;
            return (
              <TouchableOpacity
                key={chip.value}
                activeOpacity={0.8}
                onPress={() => setStatusFilter(chip.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: isActive ? "#FFF0E8" : "#F9FAFB",
                  marginRight: 8,
                  borderWidth: 1,
                  borderColor: isActive ? BRAND_ORANGE : "#F3F4F6",
                }}
              >
                <Ionicons
                  name={chip.icon}
                  size={14}
                  color={isActive ? BRAND_ORANGE : "#6B7280"}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: isActive
                      ? "Figtree_600SemiBold"
                      : "Figtree_400Regular",
                    color: isActive ? BRAND_ORANGE : "#6B7280",
                    marginLeft: 5,
                  }}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Count label */}
        {passengerFilteredItems.length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Figtree_400Regular",
                color: "#9CA3AF",
              }}
            >
              {passengerFilteredItems.length}{" "}
              {passengerFilteredItems.length === 1 ? "trip" : "trips"}
            </Text>
          </View>
        )}
      </View>
    );

    const passengerRenderEmpty = () =>
      !loading && !refreshing ? (
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
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: "#FFF0E8",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <Ionicons name="time-outline" size={38} color={BRAND_ORANGE} />
          </View>
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Figtree_700Bold",
              color: "#111827",
              marginBottom: 8,
              textAlign: "center",
            }}
            >
              No trips yet
          </Text>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Figtree_400Regular",
                color: "#6B7280",
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              {statusFilter === "completed"
                ? "No completed trips found for this filter."
                : statusFilter === "cancelled"
                ? "No cancelled trips found for this filter."
                : "Your completed rides, parcel services, and ride shares will appear here."}
            </Text>
        </View>
      ) : null;

    const passengerRenderFooter = () => {
      if (passengerFilteredItems.length === 0) return null;
      if (!hasMore) {
        return (
          <View style={{ paddingVertical: 32, alignItems: "center" }}>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Figtree_400Regular",
                color: "#9CA3AF",
              }}
            >
              You have reached the end
            </Text>
          </View>
        );
      }
      return (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <ActivityIndicator size="small" color={BRAND_ORANGE} />
        </View>
      );
    };

    if (loading && items.length === 0) {
      return (
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "#FFFFFF" }}
          edges={["top"]}
        >
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Loading message="Loading your rides…" />
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        edges={["top"]}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#F3F4F6",
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontFamily: "Figtree_700Bold",
              color: "#111827",
            }}
          >
            My Rides
          </Text>
        </View>

        <FlatList
          data={passengerFilteredItems}
          renderItem={passengerRenderItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={PassengerHeader}
          ListEmptyComponent={passengerRenderEmpty}
          ListFooterComponent={passengerRenderFooter}
          onEndReached={() => {
            if (hasMore && !loading) loadMore();
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[BRAND_ORANGE]}
              tintColor={BRAND_ORANGE}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────
  if (loading && items.length === 0) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        edges={["top"]}
      >
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Loading message="Loading your rides…" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Header component for FlatList ──────────────────────────────────────
  const ListHeader = () => (
    <View>
      {/* Earnings summary */}
      <View style={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row" }}>
          <EarningCard
            label="Today"
            amount={earnings.today.amount}
            count={earnings.today.count}
            active={activePeriod === "today"}
            onPress={() => setActivePeriod("today")}
          />
          <EarningCard
            label="This Week"
            amount={earnings.week.amount}
            count={earnings.week.count}
            active={activePeriod === "week"}
            onPress={() => setActivePeriod("week")}
          />
        </View>
        <View style={{ flexDirection: "row", marginTop: 8 }}>
          <EarningCard
            label="This Month"
            amount={earnings.month.amount}
            count={earnings.month.count}
            active={activePeriod === "month"}
            onPress={() => setActivePeriod("month")}
          />
          <EarningCard
            label="Total"
            amount={earnings.total.amount}
            count={earnings.total.count}
            active={activePeriod === "total"}
            onPress={() => setActivePeriod("total")}
          />
        </View>
      </View>

      {/* Date filter row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 4,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setShowFromPicker(true)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: activePeriod === "custom" ? "#EDE4FB" : "#F9FAFB",
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: activePeriod === "custom" ? BRAND_PURPLE : "#F3F4F6",
            marginRight: 8,
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={activePeriod === "custom" ? BRAND_PURPLE : "#6B7280"}
          />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Figtree_600SemiBold",
                color: "#9CA3AF",
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              From
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Figtree_600SemiBold",
                color: activePeriod === "custom" ? BRAND_PURPLE : "#111827",
              }}
            >
              {formatDisplayDate(fromDate)}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setShowToPicker(true)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: activePeriod === "custom" ? "#EDE4FB" : "#F9FAFB",
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: activePeriod === "custom" ? BRAND_PURPLE : "#F3F4F6",
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={activePeriod === "custom" ? BRAND_PURPLE : "#6B7280"}
          />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Figtree_600SemiBold",
                color: "#9CA3AF",
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              To
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Figtree_600SemiBold",
                color: activePeriod === "custom" ? BRAND_PURPLE : "#111827",
              }}
            >
              {formatDisplayDate(toDate)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Custom range earnings summary */}
      {activePeriod === "custom" && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            backgroundColor: "#EDE4FB",
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Figtree_600SemiBold",
                color: BRAND_PURPLE,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              Custom Range Earnings
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Figtree_400Regular",
                color: "#6B7280",
                marginTop: 2,
              }}
            >
              {customEarnings.count}{" "}
              {customEarnings.count === 1 ? "trip" : "trips"}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 22,
              fontFamily: "Figtree_700Bold",
              color: BRAND_PURPLE,
            }}
          >
            ₹{customEarnings.amount.toFixed(0)}
          </Text>
        </View>
      )}

      {/* Service type filter chips */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <FilterChip
          label="All"
          icon="list"
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterChip
          label="Rides"
          icon="car"
          active={filter === "ride"}
          onPress={() => setFilter("ride")}
        />
        <FilterChip
          label="Parcel"
          icon="cube"
          active={filter === "porter"}
          onPress={() => setFilter("porter")}
        />
        <FilterChip
          label="Ride Share"
          icon="people"
          active={filter === "pool"}
          onPress={() => setFilter("pool")}
        />
      </View>

      {/* Status filter chips */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        <FilterChip
          label="All Status"
          icon="funnel-outline"
          active={statusFilter === "all"}
          onPress={() => setStatusFilter("all")}
        />
        <FilterChip
          label="Completed"
          icon="checkmark-circle-outline"
          active={statusFilter === "completed"}
          onPress={() => setStatusFilter("completed")}
        />
        <FilterChip
          label="Cancelled"
          icon="close-circle-outline"
          active={statusFilter === "cancelled"}
          onPress={() => setStatusFilter("cancelled")}
        />
      </View>

      {/* Period label */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: "Figtree_600SemiBold",
            color: "#111827",
          }}
        >
          {activePeriod === "today"
            ? "Today's Rides"
            : activePeriod === "week"
            ? "This Week"
            : activePeriod === "month"
            ? "This Month"
            : activePeriod === "custom"
            ? `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`
            : "All Rides"}
          {filteredByPeriod.length > 0 && ` (${filteredByPeriod.length})`}
        </Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <View style={{ paddingHorizontal: 16 }}>
      <UnifiedHistoryItem type={item.type} service={item.service} />
    </View>
  );

  const renderFooter = () => {
    if (filteredByPeriod.length === 0) return null;
    if (!hasMore) {
      return (
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Figtree_400Regular",
              color: "#9CA3AF",
            }}
          >
            You have reached the end
          </Text>
        </View>
      );
    }
    return (
      <View style={{ paddingVertical: 20, alignItems: "center" }}>
        <ActivityIndicator size="small" color={BRAND_PURPLE} />
      </View>
    );
  };

  const renderEmpty = () => (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 60,
        paddingHorizontal: 32,
      }}
    >
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: "#EDE4FB",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Ionicons name="car-outline" size={38} color={BRAND_PURPLE} />
      </View>
      <Text
        style={{
          fontSize: 18,
          fontFamily: "Figtree_700Bold",
          color: "#111827",
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        No rides yet
      </Text>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Figtree_400Regular",
          color: "#6B7280",
          textAlign: "center",
          lineHeight: 20,
        }}
      >
        {statusFilter === "cancelled"
          ? activePeriod === "custom"
            ? "No cancelled rides found in the selected date range."
            : "No cancelled rides found for this period."
          : statusFilter === "completed"
          ? activePeriod === "today"
            ? "You haven't completed any rides today."
            : activePeriod === "week"
            ? "No completed rides this week."
            : activePeriod === "month"
            ? "No completed rides this month."
            : activePeriod === "custom"
            ? "No completed rides found in the selected date range."
            : "No completed rides found."
          : activePeriod === "custom"
          ? "No rides found in the selected date range."
          : "No rides found for this period."}
      </Text>
    </View>
  );

  // ── Main driver view ───────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 12,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontFamily: "Figtree_700Bold",
            color: "#111827",
          }}
        >
          My Rides
        </Text>
      </View>

      <FlatList
        data={filteredByPeriod}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[BRAND_PURPLE]}
            tintColor={BRAND_PURPLE}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Date pickers */}
      {Platform.OS === "android" && showFromPicker && (
        <DateTimePicker
          value={fromDate}
          mode="date"
          maximumDate={new Date()}
          onChange={handleFromChange}
        />
      )}
      {Platform.OS === "android" && showToPicker && (
        <DateTimePicker
          value={toDate}
          mode="date"
          maximumDate={new Date()}
          minimumDate={fromDate}
          onChange={handleToChange}
        />
      )}

      {/* iOS date picker modals */}
      {Platform.OS === "ios" && (
        <>
          <Modal
            transparent
            visible={showFromPicker}
            animationType="slide"
            onRequestClose={() => setShowFromPicker(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }}
              onPress={() => setShowFromPicker(false)}
            />
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: 34,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Figtree_600SemiBold",
                    color: "#111827",
                  }}
                >
                  From Date
                </Text>
                <TouchableOpacity onPress={() => setShowFromPicker(false)}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: "Figtree_600SemiBold",
                      color: BRAND_PURPLE,
                    }}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={fromDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={handleFromChange}
                style={{ height: 200 }}
              />
            </View>
          </Modal>

          <Modal
            transparent
            visible={showToPicker}
            animationType="slide"
            onRequestClose={() => setShowToPicker(false)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }}
              onPress={() => setShowToPicker(false)}
            />
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingBottom: 34,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Figtree_600SemiBold",
                    color: "#111827",
                  }}
                >
                  To Date
                </Text>
                <TouchableOpacity onPress={() => setShowToPicker(false)}>
                  <Text
                    style={{
                      fontSize: 15,
                      fontFamily: "Figtree_600SemiBold",
                      color: BRAND_PURPLE,
                    }}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={toDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                minimumDate={fromDate}
                onChange={handleToChange}
                style={{ height: 200 }}
              />
            </View>
          </Modal>
        </>
      )}
    </SafeAreaView>
  );
}
