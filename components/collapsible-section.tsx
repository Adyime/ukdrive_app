/**
 * Collapsible Section Component
 * Reusable component for collapsible sections with smooth expand/collapse animation
 */

import React, { useState } from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from '@expo/vector-icons';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
  className,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  return (
    <View className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${className || ''}`}>
      <TouchableOpacity
        onPress={toggleExpanded}
        className="flex-row items-center justify-between p-4"
        activeOpacity={0.7}
      >
        <Text className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6B7280"
        />
      </TouchableOpacity>

      {isExpanded && (
        <View className="px-4 pb-4">
          {children}
        </View>
      )}
    </View>
  );
}
