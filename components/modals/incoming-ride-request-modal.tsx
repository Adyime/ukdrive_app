/**
 * Incoming Ride Request Modal (Driver)
 * Shown when a direct ride request is received (push or Realtime).
 * Fetches + validates ride, shows summary, 30s timer, Accept/Decline.
 * Subscribes to ride by rideId; unsubscribes on unmount.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, Modal, TouchableOpacity, ActivityIndicator, Platform, Vibration } from "react-native";
import { Ionicons } from '@expo/vector-icons';
import { OneSignal } from "react-native-onesignal";

import { Button } from '@/components/ui/button';
import { getRideById, acceptRide, declineRide, formatFare, type RideResponse } from '@/lib/api/ride';
import { subscribeToRideStatus, unsubscribeChannel } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { addNotificationEventListener, addServiceEventListener } from '@/lib/events';
import { isRideHandled, markIncomingRideHandled, setActiveRideId, setHandledRide } from "@/lib/incoming-ride-request";

const TIMER_TICK_MS = 1000;
const BRAND_PURPLE = '#843FE3';

export interface IncomingRideRequestModalProps {
  visible: boolean;
  rideId: string | null;
  driverId: string;
  onAccept: (ride: RideResponse) => void;
  onDecline: () => void;
  onClose: () => void;
}

export function IncomingRideRequestModal({
  visible,
  rideId,
  driverId,
  onAccept,
  onDecline,
  onClose,
}: IncomingRideRequestModalProps) {
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [declineLoading, setDeclineLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearDeliveredNotifications = useCallback(() => {
    try {
      OneSignal.Notifications.clearAll();
    } catch {
      // best-effort cleanup
    }
  }, []);

  const validateRide = useCallback(
    (r: RideResponse): boolean => {
      if (r.status !== 'REQUESTED') return false;
      const now = new Date().getTime();
      const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : null;
      if (exp != null && exp <= now) return false;
      if (r.requestedDriverId != null && r.requestedDriverId !== driverId) return false;
      return true;
    },
    [driverId]
  );

  useEffect(() => {
    if (!visible || !rideId) {
      setRide(null);
      setError(null);
      setLoading(true);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getRideById(rideId);
        if (cancelled) return;
        if (!res.success || !res.data?.ride) {
          setError('Ride not found');
          setRide(null);
          return;
        }
        const r = res.data.ride;
        if (!validateRide(r)) {
          setError('Ride no longer available');
          setRide(null);
          return;
        }
        setRide(r);
        const exp = r.expiresAt ? new Date(r.expiresAt).getTime() : null;
        if (exp != null) {
          const left = Math.max(0, Math.ceil((exp - Date.now()) / 1000));
          setSecondsLeft(left);
        }
        if (Platform.OS === 'android') {
          try {
            Vibration.vibrate([0, 200, 100, 200]);
          } catch (_) {}
        }
      } catch (e) {
        if (!cancelled) {
          setError('Failed to load ride');
          setRide(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, rideId, driverId, validateRide]);

  // Timer countdown
  useEffect(() => {
    if (!visible || !ride || secondsLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, TIMER_TICK_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, ride, secondsLeft, onClose]);

  // Subscribe to ride by rideId (single subscription, unsubscribe on unmount)
  useEffect(() => {
    if (!visible || !rideId || !ride) return;

    const channel = subscribeToRideStatus(
      rideId,
      (updated) => {
        const status = updated.status;
        if (status === 'ACCEPTED' || status === 'CANCELLED') {
          if (rideId) {
            markIncomingRideHandled(rideId);
            clearDeliveredNotifications();
          }
          onClose();
        }
      },
      () => {}
    );
    channelRef.current = channel;

    return () => {
      unsubscribeChannel(channel);
      channelRef.current = null;
    };
  }, [visible, rideId, ride?.id, onClose, clearDeliveredNotifications]);

  useEffect(() => {
    if (!visible || !rideId) return;

    const closeIfHandled = () => {
      void (async () => {
        if (!(await isRideHandled(rideId))) return;
        clearDeliveredNotifications();
        onClose();
      })();
    };

    const cleanupNotifications = addNotificationEventListener(closeIfHandled);
    const cleanupServices = addServiceEventListener(closeIfHandled);

    return () => {
      cleanupNotifications();
      cleanupServices();
    };
  }, [visible, rideId, clearDeliveredNotifications, onClose]);

  const handleAccept = async () => {
    if (!ride) return;
    setAcceptLoading(true);
    try {
      const res = await acceptRide(ride.id);
      if (res.success && res.data) {
        await setHandledRide(ride.id);
        await setActiveRideId(ride.id);
        clearDeliveredNotifications();
        onAccept(res.data);
        onClose();
      } else {
        const msg =
          typeof res.error === 'object' && res.error !== null && 'message' in res.error
            ? String((res.error as { message: string }).message)
            : 'Failed to accept';
        setError(msg);
      }
    } catch (e) {
      setError('Something went wrong');
    } finally {
      setAcceptLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!ride) return;
    setDeclineLoading(true);
    await setHandledRide(ride.id);
    clearDeliveredNotifications();
    try {
      await declineRide(ride.id);
      onDecline();
      onClose();
    } catch (e) {
      setError('Failed to decline');
    } finally {
      setDeclineLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white dark:bg-gray-900 rounded-t-2xl p-6 pb-8">
          {loading ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="large" color={BRAND_PURPLE} />
              <Text className="text-gray-500 dark:text-gray-400 mt-2">Loading request...</Text>
            </View>
          ) : error ? (
            <View className="py-4">
              <Text className="text-center text-amber-600 dark:text-amber-400">{error}</Text>
              <Button className="mt-4" onPress={onClose}>
                Close
              </Button>
            </View>
          ) : ride ? (
            <>
              <View className="flex-row items-center justify-between mb-4">
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: '#EDE4FB' }}>
                    <Ionicons name="car-sport" size={24} color={BRAND_PURPLE} />
                  </View>
                  <View className="ml-3">
                    <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      New ride request
                    </Text>
                    {secondsLeft > 0 && (
                      <Text className="text-sm text-amber-600 dark:text-amber-400">
                        {secondsLeft}s to respond
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <View className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <View className="mb-2">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">Pickup</Text>
                  <Text className="text-gray-900 dark:text-gray-100">{ride.pickupLocation}</Text>
                </View>
                <View className="mb-2">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">Destination</Text>
                  <Text className="text-gray-900 dark:text-gray-100">{ride.destination}</Text>
                </View>
                <View className="mb-4">
                  <Text className="text-xs text-gray-500 dark:text-gray-400">Fare</Text>
                  <Text className="text-lg font-semibold" style={{ color: BRAND_PURPLE }}>
                    {formatFare(ride.fare)}
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={handleDecline}
                  loading={declineLoading}
                  disabled={acceptLoading}
                >
                  Decline
                </Button>
                <Button
                  className="flex-1"
                  onPress={handleAccept}
                  loading={acceptLoading}
                  disabled={declineLoading}
                >
                  Accept
                </Button>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
