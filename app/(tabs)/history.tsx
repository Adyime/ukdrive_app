/**
 * History Screen — Uber-style white + brand orange
 */

import React from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, FlatList, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/context/auth-context';
import { useUnifiedHistory, type HistoryFilter } from '@/hooks/use-unified-history';
import { UnifiedHistoryItem } from '@/components/unified-history-item';
import { Loading } from '@/components/ui/loading';

const BRAND_ORANGE = '#F36D14';
const BRAND_PURPLE = '#843FE3';

type Chip = { label: string; value: HistoryFilter; icon: keyof typeof Ionicons.glyphMap };

export default function HistoryScreen() {
  const { userType } = useAuth();
  const brandColor = userType === 'driver' ? BRAND_PURPLE : BRAND_ORANGE;
  const lightBrandBg = userType === 'driver' ? '#F3EEFE' : '#FFF0E8';
  const {
    items,
    loading,
    refreshing,
    error,
    hasMore,
    total,
    loadMore,
    refresh,
    setFilter,
    filter,
  } = useUnifiedHistory(20);

  const filterChips: Chip[] = [
    { label: 'All', value: 'all', icon: 'list' },
    { label: 'Ride', value: 'ride', icon: 'car' },
    { label: 'Parcel', value: 'porter', icon: 'cube' },
    { label: 'Ride Share', value: 'pool', icon: 'people' },
  ];

  const renderItem = ({ item }: { item: typeof items[0] }) => (
    <View style={{ paddingHorizontal: 20 }}>
      <UnifiedHistoryItem type={item.type} service={item.service} />
    </View>
  );

  const renderFooter = () => {
    if (items.length === 0) return null;
    if (!hasMore) {
      return (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: 'Figtree_400Regular',
              color: '#9CA3AF',
            }}
          >
            You&apos;ve reached the end
          </Text>
        </View>
      );
    }
    return (
      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={brandColor} />
      </View>
    );
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Loading message="Loading history…" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      {/* ── Header ── */}
      <View style={{ paddingTop: 18, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 16,
            paddingHorizontal: 20,
          }}
        >
          <Text
            style={{
              fontSize: 24,
              fontFamily: 'Figtree_700Bold',
              color: '#111827',
            }}
          >
            History
          </Text>
          {total > 0 && (
            <Text
              style={{
                fontSize: 12,
                fontFamily: 'Figtree_400Regular',
                color: '#9CA3AF',
              }}
            >
              {total} {total === 1 ? 'trip' : 'trips'}
            </Text>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 2 }}
        >
          {filterChips.map((chip) => {
            const isActive = filter === chip.value;
            return (
              <TouchableOpacity
                key={chip.value}
                activeOpacity={0.8}
                onPress={() => setFilter(chip.value)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: isActive ? brandColor : '#F3F4F6',
                }}
              >
                <Ionicons
                  name={chip.icon}
                  size={13}
                  color={isActive ? '#FFFFFF' : '#6B7280'}
                />
                <Text
                  style={{
                    marginLeft: 6,
                    fontSize: 12,
                    fontFamily: 'Figtree_600SemiBold',
                    color: isActive ? '#FFFFFF' : '#6B7280',
                  }}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Error */}
      {error && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <View
            style={{
              backgroundColor: '#FEE2E2',
              borderRadius: 10,
              padding: 14,
              borderWidth: 1,
              borderColor: '#FECACA',
            }}
          >
            <Text style={{ color: '#991B1B', fontSize: 13, fontFamily: 'Figtree_400Regular' }}>
              {error}
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: 18 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[brandColor]}
            tintColor={brandColor}
          />
        }
        onEndReached={() => {
          if (hasMore && !loading) loadMore();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          !loading && !refreshing ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 }}>
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
                <Ionicons name="time-outline" size={38} color={brandColor} />
              </View>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: 'Figtree_700Bold',
                  color: '#111827',
                  marginBottom: 8,
                  textAlign: 'center',
                }}
              >
                No trips yet
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: 'Figtree_400Regular',
                  color: '#6B7280',
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                Your completed rides, parcel services, and ride shares will appear here.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
