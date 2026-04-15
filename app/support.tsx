/**
 * Support & Help Screen — Uber-style white + brand orange
 */

import { View, TouchableOpacity, ScrollView, Linking } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

type SupportItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle: string;
  onPress?: () => void;
};

export default function SupportScreen() {
  const { userType } = useAuth();
  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const lightBrandBg = userType === 'driver' ? '#EDE4FB' : '#FFF0E8';
  const items: SupportItem[] = [
    // {
    //   icon: 'chatbubble-outline',
    //   label: 'Chat with Support',
    //   subtitle: 'Average response time: 5 minutes',
    // },
    {
      icon: 'call-outline',
      label: 'Call Support',
      subtitle: 'Available 24/7',
      onPress: () => Linking.openURL('tel:09520559469'),
    },
    {
      icon: 'mail-outline',
      label: 'Email Support',
      subtitle: 'support@ukdrive.in',
      onPress: () => Linking.openURL('mailto:support@ukdrive.in'),
    },
    {
      icon: 'document-text-outline',
      label: 'FAQs',
      subtitle: 'Browse frequently asked questions',
      onPress: () => router.push('/faq'),
    },
    // {
    //   icon: 'shield-outline',
    //   label: 'Safety Center',
    //   subtitle: 'Learn about your safety features',
    // },
  ];

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
        <Text style={{ fontSize: 22, fontFamily: 'Figtree_700Bold', color: '#111827' }}>Help & Support</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero banner */}
        <View
          style={{
            backgroundColor: lightBrandBg,
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
            marginBottom: 28,
          }}
        >
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: brandColor, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <Ionicons name="help-circle" size={34} color="#FFFFFF" />
          </View>
          <Text style={{ fontSize: 18, fontFamily: 'Figtree_700Bold', color: '#111827', marginBottom: 6 }}>
            How can we help?
          </Text>
          <Text style={{ fontSize: 14, fontFamily: 'Figtree_400Regular', color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
            Our support team is here for you around the clock.
          </Text>
        </View>

        {/* Support options */}
        <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
          Contact Options
        </Text>
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={item.onPress ? 0.75 : 1}
            onPress={item.onPress}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#F3F4F6',
            }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: lightBrandBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name={item.icon} size={20} color={brandColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#111827' }}>{item.label}</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginTop: 2 }}>{item.subtitle}</Text>
            </View>
            {item.onPress && <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
