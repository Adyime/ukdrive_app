/**
 * Ride Expiry Warning Modal (Passenger)
 * Shown when a ride is approaching auto-cancellation timeout.
 * Displays a countdown timer with "Cancel Ride" and "Wait More" options.
 */

import React, { useState, useEffect, useRef } from 'react';
import { LocalizedText as Text } from "@/components/localized-text";
import { View, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/ui/button';
import { cancelRide, extendRideTimeout } from '@/lib/api/ride';

const TIMER_TICK_MS = 1000;

export interface RideExpiryWarningModalProps {
  visible: boolean;
  rideId: string;
  statusMessage: string;
  countdownSeconds: number;
  onDismiss: () => void;
}

export function RideExpiryWarningModal({
  visible,
  rideId,
  statusMessage,
  countdownSeconds,
  onDismiss,
}: RideExpiryWarningModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [extendLoading, setExtendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset countdown when modal opens with new value
  useEffect(() => {
    if (visible) {
      setSecondsLeft(countdownSeconds);
      setError(null);
    }
  }, [visible, countdownSeconds]);

  // Timer countdown
  useEffect(() => {
    if (!visible || secondsLeft <= 0) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          // Timer expired — server will cancel; just dismiss the modal
          onDismiss();
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
  }, [visible, secondsLeft > 0, onDismiss]);

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    setError(null);
    try {
      const res = await cancelRide(rideId, 'Cancelled by passenger (expiry warning)');
      if (res.success) {
        onDismiss();
      } else {
        const msg =
          typeof res.error === 'object' && res.error !== null && 'message' in res.error
            ? String((res.error as { message: string }).message)
            : 'Failed to cancel ride';
        setError(msg);
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleExtend = async () => {
    setExtendLoading(true);
    setError(null);
    try {
      const res = await extendRideTimeout(rideId);
      if (res.success) {
        onDismiss();
      } else {
        const msg =
          typeof res.error === 'object' && res.error !== null && 'message' in res.error
            ? String((res.error as { message: string }).message)
            : 'Failed to extend timeout';
        setError(msg);
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setExtendLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-center bg-black/50 px-6">
        <View className="bg-white dark:bg-gray-900 rounded-2xl p-6">
          {/* Header */}
          <View className="items-center mb-4">
            <View className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900 items-center justify-center mb-3">
              <Ionicons name="warning" size={28} color="#F59E0B" />
            </View>
            <Text className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Ride Expiring Soon
            </Text>
          </View>

          {/* Status message */}
          <Text className="text-center text-gray-600 dark:text-gray-400 mb-4">
            {statusMessage}
          </Text>

          {/* Countdown */}
          <View className="items-center mb-6">
            <Text className="text-4xl font-bold text-amber-600 dark:text-amber-400">
              {formatTime(secondsLeft)}
            </Text>
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              until auto-cancel
            </Text>
          </View>

          {/* Error message */}
          {error && (
            <Text className="text-center text-red-600 dark:text-red-400 text-sm mb-3">
              {error}
            </Text>
          )}

          {/* Action buttons */}
          <View className="flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onPress={handleCancel}
              loading={cancelLoading}
              disabled={extendLoading}
            >
              Cancel Ride
            </Button>
            <Button
              className="flex-1"
              onPress={handleExtend}
              loading={extendLoading}
              disabled={cancelLoading}
            >
              Wait More
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
