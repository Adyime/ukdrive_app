import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

export interface ActivityCardProps {
  title: string;
  subtitle: string;
  time: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconBackground?: string;
  unread?: boolean;
  unreadColor?: string;
}

export function ActivityCard({
  title,
  subtitle,
  time,
  onPress,
  icon = "car-outline",
  iconColor = "#F36D14",
  iconBackground = "#FFF0E8",
  unread = false,
  unreadColor = "#F36D14",
}: ActivityCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, unread && styles.cardUnread, pressed && { opacity: 0.78 }]}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>

      <View style={styles.textWrap}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={[styles.title, unread && styles.titleUnread]}>
            {title}
          </Text>
          <View style={styles.timeWrap}>
            {unread ? <View style={[styles.dot, { backgroundColor: unreadColor }]} /> : null}
            <Text style={styles.time}>{time}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 2,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  cardUnread: {
    backgroundColor: "#FFFFFF",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  title: {
    flex: 1,
    marginRight: 6,
    fontSize: 13,
    color: "#111827",
    fontFamily: "Figtree_600SemiBold",
  },
  titleUnread: {
    fontFamily: "Figtree_600SemiBold",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    fontFamily: "Figtree_400Regular",
    lineHeight: 17,
  },
  timeWrap: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  time: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Figtree_400Regular",
  },
});
