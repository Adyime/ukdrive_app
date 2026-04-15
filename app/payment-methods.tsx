/**
 * Payment Methods Screen — Uber-style white + brand orange
 */

import { View, TouchableOpacity, ScrollView } from "react-native";
import { LocalizedText as Text } from "@/components/localized-text";
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';
import { useWallet } from '@/hooks/useWallet';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

function PaymentOption({
  icon,
  iconBg,
  iconColor,
  label,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle: string;
}) {
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
      <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#111827' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginTop: 2 }}>{subtitle}</Text>
      </View>
    </View>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
  bg = '#FFF0E8',
  color = BRAND_ORANGE,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  bg?: string;
  color?: string;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Figtree_400Regular', color: '#111827' }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
    </TouchableOpacity>
  );
}

export default function PaymentMethodsScreen() {
  const { userType } = useAuth();
  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const lightBrandBg = userType === 'driver' ? '#EDE4FB' : '#FFF0E8';
  const { formattedBalance, loading } = useWallet({ fetchTransactions: false });
  const isDriver = userType === 'driver';

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
        <Text style={{ fontSize: 22, fontFamily: 'Figtree_700Bold', color: '#111827' }}>Payment Methods</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Wallet hero card */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push('/wallet')}
          style={{
            marginHorizontal: 20,
            marginTop: 20,
            backgroundColor: brandColor,
            borderRadius: 20,
            padding: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: brandColor,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            elevation: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
              <Ionicons name="wallet" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Figtree_400Regular' }}>UK Drive Wallet</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontFamily: 'Figtree_700Bold', marginTop: 2 }}>
                {loading ? '...' : formattedBalance}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Available methods */}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            Available Payment Methods
          </Text>
          <PaymentOption
            icon="wallet"
            iconBg={lightBrandBg}
            iconColor={brandColor}
            label="Wallet"
            subtitle="Pay instantly from your wallet balance"
          />
          <PaymentOption
            icon="card"
            iconBg="#EFF6FF"
            iconColor="#3B82F6"
            label="Online Payment"
            subtitle="UPI, Debit/Credit Cards, Net Banking"
          />
          <PaymentOption
            icon="cash"
            iconBg="#FFFBEB"
            iconColor="#F59E0B"
            label="Cash"
            subtitle="Pay cash directly to driver"
          />
        </View>

        {/* Driver info banner */}
        {isDriver && (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 24,
              padding: 16,
              backgroundColor: '#EFF6FF',
              borderRadius: 14,
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}
          >
            <Ionicons name="information-circle" size={20} color="#3B82F6" style={{ marginRight: 10, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: 'Figtree_600SemiBold', color: '#1D4ED8', marginBottom: 4 }}>Driver Wallet Info</Text>
              <Text style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#3B82F6', lineHeight: 18 }}>
                Your wallet is used for platform fees on cash rides and receiving earnings. You can withdraw your balance to your bank account.
              </Text>
            </View>
          </View>
        )}

        {/* Quick actions */}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <Text style={{ fontSize: 11, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            Quick Actions
          </Text>
          <QuickLink icon="add-circle-outline" label="Top Up Wallet" onPress={() => router.push('/wallet-topup')} bg={lightBrandBg} color={brandColor} />
          {isDriver && (
            <QuickLink icon="arrow-down-circle-outline" label="Withdraw to Bank" onPress={() => router.push('/withdrawal-request')} bg={lightBrandBg} color={brandColor} />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
