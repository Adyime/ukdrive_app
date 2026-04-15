/**
 * Loading Component
 * Loading spinner overlay
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from '@/context/auth-context';
import type { UserType } from '@/lib/api/auth';

interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
  userTypeOverride?: UserType | null;
}

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

export function Loading({ message, fullScreen = false, userTypeOverride }: LoadingProps) {
  const { userType } = useAuth();
  const effectiveUserType = userTypeOverride ?? userType;
  const brandColor = effectiveUserType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const softBg = effectiveUserType === 'driver' ? '#F3EEFE' : '#FFF0E8';

  return (
    <View
      style={{
        ...(fullScreen
          ? {
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 50,
              backgroundColor: 'rgba(255,255,255,0.92)',
            }
          : {}),
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: softBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="large" color={brandColor} />
      </View>
      {message && (
        <Text
          style={{
            marginTop: 12,
            fontSize: 14,
            color: '#6B7280',
            fontFamily: 'Figtree_500Medium',
            textAlign: 'center',
          }}
        >
          {message}
        </Text>
      )}
    </View>
  );
}
