/**
 * Notification Detail Modal
 * Clean modal showing detailed notification information
 */

import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, Modal, Pressable, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { Notification } from "@/lib/api/notifications";
import { resolveNotificationHref } from "@/lib/utils/notification-navigation";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface NotificationDetailModalProps {
  visible: boolean;
  notification: Notification | null;
  onClose: () => void;
}

function getNotificationIcon(type: string): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
} {
  if (type.startsWith("ride_"))
    return { name: "car", color: "#F36D14", bgColor: "#FFF0E8" };
  if (type.startsWith("porter_"))
    return { name: "cube", color: "#843FE3", bgColor: "#F3EDFC" };
  if (type.startsWith("carpool_"))
    return { name: "people", color: "#10B981", bgColor: "#ECFDF5" };
  if (type.startsWith("payment_") || type.startsWith("wallet_"))
    return { name: "wallet", color: "#F59E0B", bgColor: "#FFFBEB" };
  if (type.startsWith("promo_") || type.startsWith("offer_"))
    return { name: "gift", color: "#EC4899", bgColor: "#FDF2F8" };
  if (type.startsWith("system_"))
    return { name: "information-circle", color: "#6B7280", bgColor: "#F3F4F6" };
  return { name: "notifications", color: "#6B7280", bgColor: "#F3F4F6" };
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffHours < 24) {
    return date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return date.toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function DetailRow({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
      }}
    >
      <Ionicons name={icon} size={16} color="#6B7280" />
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Figtree_400Regular",
          color: "#4B5563",
          marginLeft: 10,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function NotificationDetailModal({
  visible,
  notification,
  onClose,
}: NotificationDetailModalProps) {
  if (!notification) return null;

  const icon = getNotificationIcon(notification.type);
  const timestamp = formatTimestamp(notification.createdAt);

  const hasRide = Boolean(notification.data?.rideId);
  const hasPorter = Boolean(notification.data?.porterServiceId);
  const hasCarPool = Boolean(notification.data?.carPoolId);
  const hasActionableData = hasRide || hasPorter || hasCarPool;

  const handleOpenTarget = () => {
    onClose();
    const href = resolveNotificationHref({
      type: notification.type,
      data: (notification.data as Record<string, unknown> | undefined) ?? null,
    });
    router.push(href);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* Card — stop propagation on inner press */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            style={{
              width: SCREEN_WIDTH * 0.88,
              maxHeight: SCREEN_HEIGHT * 0.7,
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 24,
              elevation: 10,
            }}
          >
            <ScrollView
              style={{ padding: 24 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Header with icon + close */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: icon.bgColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={icon.name} size={28} color={icon.color} />
                </View>

                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Ionicons name="close" size={20} color="#6B7280" />
                </Pressable>
              </View>

              {/* Title */}
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: "Figtree_700Bold",
                  color: "#111827",
                  marginBottom: 4,
                }}
              >
                {notification.title}
              </Text>

              {/* Timestamp */}
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Figtree_400Regular",
                  color: "#9CA3AF",
                  marginBottom: 16,
                }}
              >
                {timestamp}
              </Text>

              {/* Divider */}
              <View
                style={{
                  height: 1,
                  backgroundColor: "#F3F4F6",
                  marginBottom: 16,
                }}
              />

              {/* Body */}
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Figtree_400Regular",
                  color: "#374151",
                  lineHeight: 22,
                  marginBottom: 20,
                }}
              >
                {notification.body}
              </Text>

              {/* Details card */}
              {notification.data &&
                Object.keys(notification.data).length > 0 && (
                  <View
                    style={{
                      backgroundColor: "#F9FAFB",
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 20,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Figtree_600SemiBold",
                        color: "#111827",
                        marginBottom: 10,
                      }}
                    >
                      Details
                    </Text>

                    {hasRide && (
                      <>
                        <DetailRow
                          icon="car-outline"
                          label={`Ride: ${String(
                            notification.data.rideId
                          ).substring(0, 8)}…`}
                        />
                        {notification.data.fare != null && (
                          <DetailRow
                            icon="cash-outline"
                            label={`Fare: £${notification.data.fare}`}
                          />
                        )}
                        {notification.data.destination && (
                          <DetailRow
                            icon="location-outline"
                            label={`To: ${notification.data.destination}`}
                          />
                        )}
                      </>
                    )}

                    {hasPorter && (
                      <DetailRow
                        icon="cube-outline"
                        label={`Service: ${String(
                          notification.data.porterServiceId
                        ).substring(0, 8)}…`}
                      />
                    )}

                    {hasCarPool && (
                      <DetailRow
                        icon="people-outline"
                        label={`Pool: ${String(
                          notification.data.carPoolId
                        ).substring(0, 8)}…`}
                      />
                    )}

                    {notification.data.amount != null && (
                      <DetailRow
                        icon="wallet-outline"
                        label={`Amount: £${notification.data.amount}`}
                      />
                    )}
                  </View>
                )}

              {/* Actions */}
              <View style={{ gap: 10, paddingBottom: 4 }}>
                {hasActionableData && (
                  <Pressable
                    onPress={handleOpenTarget}
                    style={({ pressed }) => ({
                      backgroundColor: icon.color,
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 15,
                      }}
                    >
                      {hasRide
                        ? "Open Ride"
                        : hasPorter
                        ? "Open Delivery"
                        : "Open Ride Share"}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={onClose}
                  style={({ pressed }) => ({
                    backgroundColor: "#F3F4F6",
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: "#374151",
                      fontFamily: "Figtree_500Medium",
                      fontSize: 15,
                    }}
                  >
                    Close
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
