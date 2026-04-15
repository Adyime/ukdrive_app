/**
 * usePaymentStatus Hook
 * Subscribes to payment status updates via Supabase Realtime
 * Use this to get real-time payment status changes for a ride
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribeToPaymentStatus, unsubscribeChannel, type PaymentStatusUpdate, type RealtimeChannel } from '@/lib/supabase';
import type { RidePayment, RidePaymentStatus, PaymentMethod } from '@/lib/api/payment';

// Transform database format to API format
function transformPaymentUpdate(update: PaymentStatusUpdate): RidePayment {
  return {
    id: update.id,
    rideId: update.ride_id,
    paymentMethod: update.payment_method as PaymentMethod | null,
    status: update.status as RidePaymentStatus,
    fareAmount: update.fare_amount,
    platformFeeAmount: update.platform_fee_amount,
    platformFeePercent: 0, // Not in database update, will be fetched separately if needed
    driverEarningAmount: update.driver_earning_amount,
    processedAt: update.processed_at,
    failureReason: update.failure_reason,
  };
}

export interface UsePaymentStatusOptions {
  rideId: string | null;
  enabled?: boolean;
  onUpdate?: (payment: RidePayment) => void;
  onError?: (error: Error) => void;
}

export interface UsePaymentStatusReturn {
  payment: RidePayment | null;
  isSubscribed: boolean;
  error: Error | null;
  unsubscribe: () => void;
}

export function usePaymentStatus({
  rideId,
  enabled = true,
  onUpdate,
  onError,
}: UsePaymentStatusOptions): UsePaymentStatusReturn {
  const [payment, setPayment] = useState<RidePayment | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Use refs for callbacks to prevent re-subscriptions
  const onUpdateRef = useRef(onUpdate);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      unsubscribeChannel(channelRef.current);
      channelRef.current = null;
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    // Don't subscribe if disabled or no ride ID
    if (!enabled || !rideId || rideId === 'null' || rideId === 'undefined' || rideId.trim() === '') {
      setIsSubscribed(false);
      return;
    }

    // Subscribe to payment status
    const channel = subscribeToPaymentStatus(
      rideId,
      (data: PaymentStatusUpdate) => {
        const transformed = transformPaymentUpdate(data);
        setPayment(transformed);
        setError(null);
        onUpdateRef.current?.(transformed);
      },
      (err: Error) => {
        setError(err);
        setIsSubscribed(false);
        onErrorRef.current?.(err);
      }
    );

    channelRef.current = channel;
    setIsSubscribed(true);

    // Cleanup on unmount or ride change
    return () => {
      if (channelRef.current) {
        unsubscribeChannel(channelRef.current);
        channelRef.current = null;
        setIsSubscribed(false);
      }
    };
  }, [rideId, enabled, unsubscribe]);

  return {
    payment,
    isSubscribed,
    error,
    unsubscribe,
  };
}

