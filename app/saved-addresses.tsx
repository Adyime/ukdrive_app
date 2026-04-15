/**
 * Saved Addresses Screen — Uber-style white + brand orange
 */

import { View, TouchableOpacity } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

export default function SavedAddressesScreen() {
  const { userType } = useAuth();
  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const lightBrandBg = userType === 'driver' ? '#EDE4FB' : '#FFF0E8';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#F3F4F6',
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 14 }} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontFamily: 'Figtree_700Bold', color: '#111827' }}>Saved Addresses</Text>
      </View>

      {/* Coming soon empty state */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: lightBrandBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons name="location-outline" size={38} color={brandColor} />
        </View>
        <Text style={{ fontSize: 18, fontFamily: 'Figtree_700Bold', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
          No Saved Addresses
        </Text>
        <Text style={{ fontSize: 14, fontFamily: 'Figtree_400Regular', color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
          Save your home, work, and favourite locations for quicker booking. This feature is coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
