/**
 * Wallet Screen — Uber-style white + brand orange
 */

import { useState, useCallback } from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, RefreshControl, ActivityIndicator, FlatList, Platform } from "react-native";
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';
import { useWallet } from '@/hooks/useWallet';
import {
  type WalletTransaction,
  getTransactionTypeLabel,
  isCredit,
  formatAmount,
} from '@/lib/api/wallet';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

// ── Transaction item ──────────────────────────────────────────────────────
function TransactionItem({
  transaction,
  creditAccentColor,
  creditBgColor,
}: {
  transaction: WalletTransaction;
  creditAccentColor: string;
  creditBgColor: string;
}) {
  const credit = isCredit(transaction.type);
  const formattedDate = new Date(transaction.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getIcon = (): keyof typeof Ionicons.glyphMap => {
    if (transaction.type.includes('TOPUP')) return 'add-circle';
    if (transaction.type.includes('WITHDRAWAL')) return 'arrow-down-circle';
    if (transaction.type.includes('RIDE')) return 'car';
    if (transaction.type.includes('PORTER')) return 'cube';
    if (transaction.type.includes('CARPOOL')) return 'people';
    if (transaction.type.includes('PLATFORM_FEE')) return 'business';
    if (transaction.type.includes('ADMIN')) return 'shield-checkmark';
    return credit ? 'arrow-down' : 'arrow-up';
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          backgroundColor: credit ? creditBgColor : '#FEF2F2',
        }}
      >
        <Ionicons
          name={getIcon()}
          size={20}
          color={credit ? creditAccentColor : '#EF4444'}
        />
      </View>

      {/* Details */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontFamily: 'Figtree_600SemiBold', color: '#111827' }}>
          {getTransactionTypeLabel(transaction.type)}
        </Text>
        <Text
          style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#6B7280', marginTop: 2 }}
          numberOfLines={1}
        >
          {transaction.description}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginTop: 2 }}>
          {formattedDate}
        </Text>
      </View>

      {/* Amount */}
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: 'Figtree_700Bold',
            color: credit ? creditAccentColor : '#EF4444',
          }}
        >
          {credit ? '+' : '-'}{formatAmount(transaction.amount)}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: 'Figtree_400Regular', color: '#9CA3AF', marginTop: 2 }}>
          Bal: {formatAmount(transaction.balanceAfter)}
        </Text>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════════
export default function WalletScreen() {
  const { userType } = useAuth();
  const isDriver = userType === 'driver';
  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const creditAccentColor = userType === 'driver' ? BRAND_PURPLE : '#10B981';
  const creditBgColor = userType === 'driver' ? '#F3EEFE' : '#F0FDF4';

  const {
    formattedBalance,
    transactions,
    transactionsLoading,
    transactionsHasMore,
    loading,
    error,
    refresh,
    refreshBalance,
    loadMoreTransactions,
  } = useWallet();

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshBalance();
    }, [refreshBalance])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      {/* ── Header ── */}
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
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginRight: 14 }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ fontSize: 22, fontFamily: 'Figtree_700Bold', color: '#111827' }}>
          Wallet
        </Text>
      </View>

      {/* ── Balance card ── */}
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 20,
          borderRadius: 20,
          backgroundColor: brandColor,
          padding: 24,
          shadowColor: brandColor,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Figtree_400Regular' }}>
          Available Balance
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 8 }} />
        ) : (
          <Text style={{ color: '#FFFFFF', fontSize: 36, fontFamily: 'Figtree_700Bold', marginTop: 6 }}>
            {formattedBalance}
          </Text>
        )}

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', marginTop: 20, gap: 10 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/wallet-topup')}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.22)',
              borderRadius: 12,
              paddingVertical: 12,
            }}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontFamily: 'Figtree_600SemiBold', fontSize: 14, marginLeft: 6 }}>
              Top Up
            </Text>
          </TouchableOpacity>
          {isDriver && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/withdrawal-request')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.22)',
                borderRadius: 12,
                paddingVertical: 12,
              }}
            >
              <Ionicons name="arrow-down" size={18} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontFamily: 'Figtree_600SemiBold', fontSize: 14, marginLeft: 6 }}>
                Withdraw
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Driver: withdrawal history link ── */}
      {isDriver && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.push('/withdrawal-history')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 20,
            marginTop: 14,
            padding: 14,
            backgroundColor: '#F9FAFB',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#F3F4F6',
          }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3EEFE', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Ionicons name="time-outline" size={18} color={brandColor} />
          </View>
          <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Figtree_400Regular', color: '#111827' }}>
            Withdrawal History
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      )}

      {/* ── Error ── */}
      {error && (
        <View style={{ marginHorizontal: 20, marginTop: 12, padding: 14, backgroundColor: '#FEE2E2', borderRadius: 12 }}>
          <Text style={{ color: '#991B1B', fontFamily: 'Figtree_400Regular', fontSize: 13, textAlign: 'center' }}>{error}</Text>
        </View>
      )}

      {/* ── Transactions ── */}
      <View style={{ flex: 1, marginTop: 20 }}>
        <Text style={{ paddingHorizontal: 20, paddingBottom: 10, fontSize: 13, fontFamily: 'Figtree_600SemiBold', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Recent Transactions
        </Text>
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TransactionItem
              transaction={item}
              creditAccentColor={creditAccentColor}
              creditBgColor={creditBgColor}
            />
          )}
          ListFooterComponent={
            transactionsLoading ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={brandColor} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !loading && !transactionsLoading ? (
              <View style={{ alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: userType === 'driver' ? '#F3EEFE' : '#FFF0E8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Ionicons name="receipt-outline" size={30} color={brandColor} />
                </View>
                <Text style={{ fontSize: 16, fontFamily: 'Figtree_700Bold', color: '#111827', marginBottom: 6 }}>No transactions yet</Text>
                <Text style={{ fontSize: 13, fontFamily: 'Figtree_400Regular', color: '#6B7280', textAlign: 'center' }}>Top up your wallet to get started</Text>
              </View>
            ) : null
          }
          onEndReached={loadMoreTransactions}
          onEndReachedThreshold={0.3}
          refreshControl={
            Platform.OS === 'ios' ? (
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={brandColor} />
            ) : undefined
          }
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}
