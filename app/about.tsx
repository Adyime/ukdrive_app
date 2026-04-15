/**
 * About Screen — Uber-style white + brand orange
 */

import { View, TouchableOpacity, ScrollView } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

function InfoRow({ icon, label, value, color = BRAND_ORANGE, bg = '#FFF0E8' }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string; bg?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: bg || '#FFF0E8', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon} size={18} color={color || BRAND_ORANGE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 14, fontFamily: 'Figtree_600SemiBold', color: '#111827' }}>{value}</Text>
      </View>
    </View>
  );
}

export default function AboutScreen() {
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
        <Text style={{ fontSize: 22, fontFamily: 'Figtree_700Bold', color: '#111827' }}>About UK Drive</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Brand hero */}
        <View
          style={{
            alignItems: 'center',
            paddingTop: 40,
            paddingBottom: 32,
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: brandColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              shadowColor: brandColor,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            <Ionicons name="car-sport" size={44} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 28, fontFamily: 'Figtree_700Bold', color: '#111827', marginBottom: 6 }}>UK Drive</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Figtree_400Regular', color: '#9CA3AF' }}>Version 1.0.0</Text>
        </View>

        {/* App info */}
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            App Info
          </Text>
          <InfoRow icon="information-circle-outline" label="App Name"   value="UK Drive" color={brandColor} bg={lightBrandBg} />
          <InfoRow icon="code-slash-outline"         label="Version"    value="1.0.0" color={brandColor} bg={lightBrandBg} />
          {/* <InfoRow icon="globe-outline"              label="Category"   value="Ride Sharing & Delivery" color={brandColor} bg={lightBrandBg} /> */}
        </View>

        {/* Description */}
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 24,
            backgroundColor: '#F9FAFB',
            borderRadius: 16,
            padding: 20,
          }}
        >
          <Text style={{ fontSize: 15, fontFamily: 'Figtree_700Bold', color: '#111827', marginBottom: 10 }}>About the App</Text>
          <Text style={{ fontSize: 14, fontFamily: 'Figtree_400Regular', color: '#6B7280', lineHeight: 22 }}>
            UK Drive is a modern ride-sharing and delivery platform designed to connect passengers and drivers seamlessly. Book rides, send packages, and join ride shares — all in one app.
          </Text>
        </View>

        {/* Legal links */}
        {/* <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            Legal
          </Text>
          {[
            { label: 'Terms & Conditions', onPress: () => router.push('/terms-conditions') },
            { label: 'Privacy Policy', onPress: () => router.push('/privacy-policy') },
          ].map((item, i) => (
            <TouchableOpacity
              key={i}
              onPress={item.onPress}
              activeOpacity={0.75}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}
            >
              <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Figtree_400Regular', color: '#111827' }}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
            </TouchableOpacity>
          ))}
        </View> */}
      </ScrollView>
    </SafeAreaView>
  );
}
