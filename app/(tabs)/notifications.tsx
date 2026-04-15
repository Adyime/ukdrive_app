/**
 * Activity Screen — Uber-style notifications
 * Clean layout with date grouping, category filters, driver/passenger theming
 */

import { View, SectionList, Pressable, RefreshControl, ActivityIndicator, StyleSheet } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback, useState, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../../hooks/use-notifications";
import { useAuth } from "../../context/auth-context";
import { NotificationDetailModal } from "../../components/modals/notification-detail-modal";
import type { Notification } from "../../lib/api/notifications";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

type FilterCategory = "all" | "rides" | "deliveries" | "pools" | "payments";

const FILTERS: { key: FilterCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "rides", label: "Rides" },
  { key: "deliveries", label: "Deliveries" },
  { key: "pools", label: "Ride Shares" },
  { key: "payments", label: "Payments" },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function relativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function dateSection(dateString: string): string {
  const date = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);
  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "This Week";
  return "Earlier";
}

function iconFor(type: string) {
  if (type.startsWith("ride_"))
    return { name: "car-outline" as const, fg: "#F36D14", bg: "#FFF0E8" };
  if (type.startsWith("porter_"))
    return { name: "cube-outline" as const, fg: "#843FE3", bg: "#F3EDFC" };
  if (type.startsWith("carpool_"))
    return { name: "people-outline" as const, fg: "#10B981", bg: "#ECFDF5" };
  if (type.startsWith("payment_") || type.startsWith("wallet_"))
    return { name: "wallet-outline" as const, fg: "#F59E0B", bg: "#FFFBEB" };
  return {
    name: "notifications-outline" as const,
    fg: "#6B7280",
    bg: "#F3F4F6",
  };
}

function matchesFilter(n: Notification, f: FilterCategory): boolean {
  if (f === "all") return true;
  if (f === "rides") return n.type.startsWith("ride_");
  if (f === "deliveries") return n.type.startsWith("porter_");
  if (f === "pools") return n.type.startsWith("carpool_");
  return n.type.startsWith("payment_") || n.type.startsWith("wallet_");
}

function buildSections(list: Notification[]) {
  const map: Record<string, Notification[]> = {};
  for (const n of list) {
    const key = dateSection(n.createdAt);
    (map[key] ??= []).push(n);
  }
  return ["Today", "Yesterday", "This Week", "Earlier"]
    .filter((k) => map[k]?.length)
    .map((k) => ({ title: k, data: map[k] }));
}

// ── Sub-components ────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onPress,
  accent,
}: {
  item: Notification;
  onPress: () => void;
  accent: string;
}) {
  const ic = iconFor(item.type);
  const unread = !item.isRead;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        unread && s.cardUnread,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {unread && <View style={[s.dot, { backgroundColor: accent }]} />}

      <View style={s.cardContent}>
        <View style={[s.iconCircle, { backgroundColor: ic.bg }]}>
          <Ionicons name={ic.name} size={22} color={ic.fg} />
        </View>

        <View style={s.textCol}>
          <View style={s.titleRow}>
            <Text
              numberOfLines={1}
              style={[s.title, unread && { fontFamily: "Figtree_600SemiBold" }]}
            >
              {item.title}
            </Text>
            <Text style={s.time}>{relativeTime(item.createdAt)}</Text>
          </View>
          <Text
            numberOfLines={2}
            style={[s.body, unread && { color: "#374151" }]}
          >
            {item.body}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

export default function NotificationsScreen() {
  const { userType } = useAuth();
  const accent = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const {
    notifications,
    unreadCount,
    hasMore,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  } = useNotifications();

  const [filter, setFilter] = useState<FilterCategory>("all");
  const [selected, setSelected] = useState<Notification | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n, filter)),
    [notifications, filter]
  );
  const sections = useMemo(() => buildSections(filtered), [filtered]);

  const counts = useMemo(() => {
    const c = { all: 0, rides: 0, deliveries: 0, pools: 0, payments: 0 };
    for (const n of notifications) {
      if (!n.isRead) {
        c.all++;
        if (n.type.startsWith("ride_")) c.rides++;
        else if (n.type.startsWith("porter_")) c.deliveries++;
        else if (n.type.startsWith("carpool_")) c.pools++;
        else if (n.type.startsWith("payment_") || n.type.startsWith("wallet_"))
          c.payments++;
      }
    }
    return c;
  }, [notifications]);

  const onPress = useCallback(
    async (n: Notification) => {
      if (!n.isRead) {
        try {
          await markRead(n.id);
        } catch {
          /* ignore */
        }
      }
      setSelected(n);
      setModalOpen(true);
    },
    [markRead]
  );

  const onEndReached = useCallback(() => {
    if (!isLoadingMore && hasMore) loadMore();
  }, [isLoadingMore, hasMore, loadMore]);

  // ── Loading / Error ─────────────────────────────────────────────────────

  if (isLoading && !notifications.length) {
    return (
      <SafeAreaView style={s.screen} edges={["top"]}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={s.centerLabel}>Loading activity…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !notifications.length) {
    return (
      <SafeAreaView style={s.screen} edges={["top"]}>
        <View style={s.center}>
          <View style={[s.emptyIcon, { backgroundColor: "#FEE2E2" }]}>
            <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
          </View>
          <Text style={s.emptyTitle}>Something went wrong</Text>
          <Text style={s.emptyBody}>{error}</Text>
          <Pressable
            onPress={refresh}
            style={[s.retryBtn, { backgroundColor: accent }]}
          >
            <Text style={s.retryLabel}>Try Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.headerTitle}>Activity</Text>
          {unreadCount > 0 && (
            <Pressable
              onPress={markAllRead}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <Text style={[s.markAll, { color: accent }]}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {unreadCount > 0 && (
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: `${accent}15` }]}>
              <View style={[s.badgeDot, { backgroundColor: accent }]} />
              <Text style={[s.badgeText, { color: accent }]}>
                {unreadCount} unread
              </Text>
            </View>
          </View>
        )}

        {/* Filter pills */}
        <View style={s.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = counts[f.key];
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  s.pill,
                  active
                    ? { backgroundColor: accent }
                    : { backgroundColor: "#F3F4F6" },
                ]}
              >
                <Text
                  style={[
                    s.pillText,
                    active
                      ? { color: "#FFF", fontFamily: "Figtree_600SemiBold" }
                      : { color: "#6B7280", fontFamily: "Figtree_500Medium" },
                  ]}
                >
                  {f.label}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      s.pillBadge,
                      active
                        ? { backgroundColor: "rgba(255,255,255,0.3)" }
                        : { backgroundColor: `${accent}20` },
                    ]}
                  >
                    <Text
                      style={[
                        s.pillBadgeText,
                        { color: active ? "#FFF" : accent },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={s.divider} />

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            onPress={() => onPress(item)}
            accent={accent}
          />
        )}
        ItemSeparatorComponent={() => <View style={s.cardGap} />}
        ListEmptyComponent={
          <View style={s.center}>
            <View style={[s.emptyIcon, { backgroundColor: `${accent}12` }]}>
              <Ionicons
                name={
                  filter === "rides"
                    ? "car-outline"
                    : filter === "deliveries"
                      ? "cube-outline"
                      : filter === "pools"
                        ? "people-outline"
                        : filter === "payments"
                          ? "wallet-outline"
                          : "notifications-off-outline"
                }
                size={32}
                color={accent}
              />
            </View>
            <Text style={s.emptyTitle}>
              {filter === "all"
                ? "No notifications yet"
                : `No ${FILTERS.find(
                    (f) => f.key === filter
                  )?.label.toLowerCase()} notifications`}
            </Text>
            <Text style={s.emptyBody}>
              Updates and alerts will appear here as they happen.
            </Text>
          </View>
        }
        ListFooterComponent={
          isLoadingMore ? (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <ActivityIndicator size="small" color={accent} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            colors={[accent]}
            tintColor={accent}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={
          !filtered.length
            ? { flex: 1 }
            : { paddingHorizontal: 16, paddingBottom: 100 }
        }
        stickySectionHeadersEnabled={false}
      />

      <NotificationDetailModal
        visible={modalOpen}
        notification={selected}
        onClose={() => {
          setModalOpen(false);
          setSelected(null);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  /* ── Header ── */
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Figtree_700Bold",
    color: "#111827",
  },
  markAll: {
    fontSize: 14,
    fontFamily: "Figtree_600SemiBold",
  },

  /* ── Unread badge ── */
  badgeRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  badgeText: {
    fontSize: 13,
    fontFamily: "Figtree_600SemiBold",
  },

  /* ── Filter pills ── */
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 14,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  pillText: {
    fontSize: 13,
  },
  pillBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  pillBadgeText: {
    fontSize: 11,
    fontFamily: "Figtree_600SemiBold",
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },

  /* ── Section headers ── */
  sectionHeader: {
    paddingHorizontal: 4,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Figtree_600SemiBold",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  /* ── Notification card ── */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    position: "relative",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ECECEE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardUnread: {
    borderColor: "#E2E2E6",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cardGap: {
    height: 12,
  },
  dot: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  title: {
    fontSize: 15,
    fontFamily: "Figtree_400Regular",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  body: {
    fontSize: 13,
    fontFamily: "Figtree_400Regular",
    color: "#6B7280",
    lineHeight: 18,
  },
  time: {
    fontSize: 12,
    fontFamily: "Figtree_400Regular",
    color: "#9CA3AF",
  },

  /* ── Empty / Center states ── */
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  centerLabel: {
    marginTop: 14,
    fontSize: 14,
    fontFamily: "Figtree_400Regular",
    color: "#6B7280",
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Figtree_700Bold",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    fontFamily: "Figtree_400Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryLabel: {
    color: "#FFF",
    fontFamily: "Figtree_600SemiBold",
    fontSize: 14,
  },
});
