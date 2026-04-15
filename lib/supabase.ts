/**
 * Supabase Client Configuration
 * Provides Supabase client for Realtime subscriptions
 * 
 * Note: All business logic remains on the server. Supabase is used only for:
 * - Realtime subscriptions (listening to database changes)
 * - The server writes to Supabase via Prisma, clients subscribe to changes
 */

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// Environment variables for Supabase configuration
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    'Supabase configuration missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.'
  );
}

/**
 * Create Supabase client with Realtime enabled
 */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10, // Rate limit for realtime events
    },
  },
  auth: {
    // We use our own auth system, disable Supabase auth features
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Database types for Realtime subscriptions
 */
export interface DriverLocationUpdate {
  id: string;
  latitude: number;
  longitude: number;
  is_online: boolean;
  last_location_updated_at: string;
}

export interface RideStatusUpdate {
  id: string;
  status: string;
  driver_id: string | null;
  requested_driver_id: string | null;
  expires_at: string | null;
  passenger_id: string;
  pickup_latitude: number;
  pickup_longitude: number;
  destination_lat: number;
  destination_lng: number;
  accepted_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  warning_notified_at: string | null;
}

export interface RideAvailabilityUpdate {
  eventType: "INSERT" | "UPDATE";
  current: RideStatusUpdate;
  previous: Partial<RideStatusUpdate> | null;
}

export interface PorterStatusUpdate {
  id: string;
  status: string;
  driver_id: string | null;
  customer_id: string;
  pickup_latitude: number;
  pickup_longitude: number;
  delivery_latitude: number;
  delivery_longitude: number;
  accepted_at: string | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
}

export interface CarPoolStatusUpdate {
  id: string;
  status: string;
  driver_id: string;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  opened_at: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  current_passenger_count: number;
  max_passengers: number;
  verification_code?: string | null;
  verification_code_expires_at?: string | null;
}

export interface CarPoolMemberStatusUpdate {
  id: string;
  car_pool_id: string;
  passenger_id: string;
  status: string;
  verification_code?: string | null;
  verification_code_generated_at?: string | null;
  otp_verified_at?: string | null;
  picked_up_at?: string | null;
  dropped_off_at?: string | null;
  cancelled_at?: string | null;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_id: string;
  content: string;
  status: string;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentStatusUpdate {
  id: string;
  ride_id: string;
  payment_method: 'CASH' | 'WALLET' | 'ONLINE' | null;
  status: 'PENDING' | 'AWAITING_ONLINE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fare_amount: number;
  platform_fee_amount: number;
  driver_earning_amount: number;
  processed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Subscribe to chat_messages for a conversation (INSERT and optionally UPDATE for receipts).
 */
export function subscribeToChatMessages(
  conversationId: string,
  onInsert: (row: ChatMessageRow) => void,
  onUpdate?: (row: ChatMessageRow) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  let ch = supabase
    .channel(`chat-messages-${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[Realtime] chat_messages INSERT', (payload.new as ChatMessageRow)?.id);
        }
        onInsert(payload.new as ChatMessageRow);
      }
    );

  if (onUpdate) {
    ch = ch.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        onUpdate(payload.new as ChatMessageRow);
      }
    );
  }

  ch.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[Realtime] Subscribed to chat messages: ${conversationId}`);
      }
    } else if (status === 'CHANNEL_ERROR' && err) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[Realtime] chat_messages subscription error:', err.message);
      }
      onError?.(new Error(err.message));
    }
  });

  return ch;
}

/**
 * Subscribe to driver location updates for a specific driver
 */
export function subscribeToDriverLocation(
  driverId: string,
  onUpdate: (location: DriverLocationUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`driver-location-${driverId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'drivers',
        filter: `id=eq.${driverId}`,
      },
      (payload) => {
        const data = payload.new as DriverLocationUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to driver location: ${driverId}`);
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to ride status updates for a specific ride
 */
export function subscribeToRideStatus(
  rideId: string,
  onUpdate: (ride: RideStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`ride-status-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rides',
        filter: `id=eq.${rideId}`,
      },
      (payload) => {
        const data = payload.new as RideStatusUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to ride status: ${rideId}`);
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to new ride requests (for drivers)
 */
export function subscribeToNewRides(
  onNewRide: (ride: RideStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel('new-rides')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'rides',
      },
      (payload) => {
        const data = payload.new as RideStatusUpdate;
        if (data.status === 'REQUESTED') {
          onNewRide(data);
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to new ride requests');
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to ride rows that may affect the driver's pending-ride availability.
 * This listens to REQUESTED ride inserts plus subsequent ride updates.
 */
export function subscribeToRideAvailability(
  onUpdate: (update: RideAvailabilityUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel("ride-availability")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "rides",
      },
      (payload) => {
        onUpdate({
          eventType: "INSERT",
          current: payload.new as RideStatusUpdate,
          previous: null,
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rides",
      },
      (payload) => {
        onUpdate({
          eventType: "UPDATE",
          current: payload.new as RideStatusUpdate,
          previous: (payload.old as Partial<RideStatusUpdate> | null) ?? null,
        });
      }
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log("Subscribed to ride availability updates");
      } else if (status === "CHANNEL_ERROR" && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to porter service status updates for a specific porter service
 */
export function subscribeToPorterStatus(
  porterServiceId: string,
  onUpdate: (porter: PorterStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`porter-status-${porterServiceId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'porter_services',
        filter: `id=eq.${porterServiceId}`,
      },
      (payload) => {
        const data = payload.new as PorterStatusUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to porter service status: ${porterServiceId}`);
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to new porter service requests (for drivers)
 */
export function subscribeToNewPorterServices(
  onNewPorter: (porter: PorterStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel('new-porter-services')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'porter_services',
      },
      (payload) => {
        const data = payload.new as PorterStatusUpdate;
        if (data.status === 'REQUESTED') {
          onNewPorter(data);
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to new porter service requests');
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to car pool status updates for a specific car pool
 */
export function subscribeToCarPoolStatus(
  carPoolId: string,
  onUpdate: (carPool: CarPoolStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`car-pool-status-${carPoolId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'car_pools',
        filter: `id=eq.${carPoolId}`,
      },
      (payload) => {
        const data = payload.new as CarPoolStatusUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Subscribed to car pool status: ${carPoolId}`);
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to car pool member status updates for a specific car pool
 */
export function subscribeToCarPoolMemberStatus(
  carPoolId: string,
  onUpdate: (member: CarPoolMemberStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`car-pool-member-status-${carPoolId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "car_pool_members",
        filter: `car_pool_id=eq.${carPoolId}`,
      },
      (payload) => {
        const data = payload.new as CarPoolMemberStatusUpdate;
        onUpdate(data);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "car_pool_members",
        filter: `car_pool_id=eq.${carPoolId}`,
      },
      (payload) => {
        const data = payload.new as CarPoolMemberStatusUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`Subscribed to car pool member status: ${carPoolId}`);
      } else if (status === "CHANNEL_ERROR" && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to new car pool requests (for passengers)
 */
export function subscribeToNewCarPools(
  onNewCarPool: (carPool: CarPoolStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel('new-car-pools')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'car_pools',
      },
      (payload) => {
        const data = payload.new as CarPoolStatusUpdate;
        if (data.status === 'OPEN') {
          onNewCarPool(data);
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to new car pools');
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to updates for OPEN car pools (seat changes, status updates, etc.)
 */
export function subscribeToOpenCarPoolsUpdates(
  onUpdate: (carPool: CarPoolStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel('open-car-pools-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'car_pools',
      },
      (payload) => {
        const data = payload.new as CarPoolStatusUpdate;
        // Trigger refresh on any car pool update.
        // Caller already debounces refresh requests; this guarantees OPEN -> CANCELLED
        // transitions are not missed even when `old` row values are partial.
        onUpdate(data);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'car_pools',
        filter: 'status=eq.OPEN',
      },
      (payload) => {
        const data = payload.new as CarPoolStatusUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to OPEN car pool updates');
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Subscribe to payment status updates for a specific ride
 */
export function subscribeToPaymentStatus(
  rideId: string,
  onUpdate: (payment: PaymentStatusUpdate) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`payment-status-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_payments',
        filter: `ride_id=eq.${rideId}`,
      },
      (payload) => {
        const data = payload.new as PaymentStatusUpdate;
        onUpdate(data);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_payments',
        filter: `ride_id=eq.${rideId}`,
      },
      (payload) => {
        const data = payload.new as PaymentStatusUpdate;
        onUpdate(data);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log(`[Realtime] Subscribed to payment status: ${rideId}`);
        }
      } else if (status === 'CHANNEL_ERROR' && err && onError) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[Realtime] payment status subscription error:', err.message);
        }
        onError(new Error(err.message));
      }
    });

  return channel;
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribeChannel(channel: RealtimeChannel): Promise<void> {
  try {
    await supabase.removeChannel(channel);
  } catch (error) {
    console.error('Error unsubscribing from channel:', error);
  }
}

/**
 * Get all active channels
 */
export function getActiveChannels(): RealtimeChannel[] {
  return supabase.getChannels();
}

export default supabase;
