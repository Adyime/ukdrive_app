/**
 * Notification Bell Component
 * Shows a bell icon with unread count badge
 * Used in headers to navigate to notifications screen
 */

import { View, Pressable } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnreadNotificationCount } from '../hooks/use-notifications';

interface NotificationBellProps {
  // Optional color override
  color?: string;
  // Optional size override
  size?: number;
}

export function NotificationBell({ color = '#374151', size = 24 }: NotificationBellProps) {
  const { count } = useUnreadNotificationCount();

  const handlePress = () => {
    router.push('/(tabs)/notifications');
  };

  return (
    <Pressable
      onPress={handlePress}
      className="relative p-2"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Ionicons name="notifications-outline" size={size} color={color} />
      
      {count > 0 && (
        <View
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 items-center justify-center"
        >
          <Text
            className="text-white text-[10px] font-bold px-1"
            numberOfLines={1}
          >
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
