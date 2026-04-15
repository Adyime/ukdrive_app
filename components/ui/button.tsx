/**
 * Button Component
 * Reusable button with NativeWind styling
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { TouchableOpacity, ActivityIndicator, View } from "react-native";
import { cn } from '@/lib/utils';

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className,
}: ButtonProps) {
  const baseStyles = 'rounded-lg items-center justify-center';
  
  const variantStyles = {
    primary: 'bg-primary-600 active:bg-primary-700',
    secondary: 'bg-gray-200 active:bg-gray-300 dark:bg-gray-700 dark:active:bg-gray-600',
    outline: 'border-2 border-primary-600 bg-transparent active:bg-primary-50 dark:border-primary-400',
  };

  const sizeStyles = {
    sm: 'px-4 py-2',
    md: 'px-6 py-3',
    lg: 'px-8 py-4',
  };

  const textVariantStyles = {
    primary: 'text-white',
    secondary: 'text-gray-900 dark:text-gray-100',
    outline: 'text-primary-600 dark:text-primary-400',
  };

  const textSizeStyles = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        (disabled || loading) ? 'opacity-50' : '',
        className
      )}
    >
      {loading ? (
        <View className="flex-row items-center">
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? '#ffffff' : '#0ea5e9'}
            style={{ marginRight: 8 }}
          />
          <Text
            className={cn(
              'font-semibold',
              textVariantStyles[variant],
              textSizeStyles[size]
            )}
          >
            {children}
          </Text>
        </View>
      ) : (
        <Text
          className={cn(
            'font-semibold',
            textVariantStyles[variant],
            textSizeStyles[size]
          )}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}

