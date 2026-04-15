/**
 * Settings Screen — Uber-style white + brand orange
 */

import { View, ScrollView, TouchableOpacity } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

function InfoRow({ icon, label, value, color, bg }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string; bg?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: bg || '#FFF0E8', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon} size={18} color={color || BRAND_ORANGE} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#111827' }}>{value}</Text>
      </View>
    </View>
  );
}

function SettingRow({ icon, label, subtitle }: { icon: keyof typeof Ionicons.glyphMap; label: string; subtitle: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon} size={18} color="#6B7280" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#111827' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
    </View>
  );
}

export default function SettingsScreen() {
  const { user, userType } = useAuth();
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
        <Text style={{ fontSize: 22, fontFamily: 'Figtree_700Bold', color: '#111827' }}>Settings</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Profile info */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            Profile Information
          </Text>
          {user?.phone && (
            <InfoRow icon="call-outline" label="Phone Number" value={user.phone} color={brandColor} bg={lightBrandBg} />
          )}
          {!user?.phone && (
            <InfoRow icon="call-outline" label="Phone Number" value="Not available" color={brandColor} bg={lightBrandBg} />
          )}
          {user?.email && (
            <InfoRow icon="mail-outline" label="Email" value={user.email} color={brandColor} bg={lightBrandBg} />
          )}
          {user?.fullName && (
            <InfoRow icon="person-outline" label="Full Name" value={user.fullName} color={brandColor} bg={lightBrandBg} />
          )}
          <InfoRow
            icon="male-female-outline"
            label="Gender"
            value={typeof user?.gender === "string" && user.gender.trim().length > 0 ? user.gender : "Not available"}
            color={brandColor}
            bg={lightBrandBg}
          />
        </View>

        {/* App Settings */}
        {/* <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            App Settings
          </Text>
          <SettingRow icon="notifications-outline" label="Notifications" subtitle="Manage notification preferences" />
          <SettingRow icon="shield-outline" label="Privacy & Security" subtitle="Control your privacy settings" />
          <SettingRow icon="language-outline" label="Language & Region" subtitle="Set your preferred language" />
        </View> */}

        {/* About */}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            About
          </Text>
          <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
            <Text style={{ fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#111827', marginBottom: 4 }}>UK Drive</Text>
            <Text style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#9CA3AF' }}>Version 1.0.0 · A modern ride-sharing platform</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
