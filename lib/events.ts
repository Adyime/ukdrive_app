/**
 * Application Events
 * 
 * Event constants for decoupled communication between modules.
 * This avoids circular dependencies by using a simple event emitter
 * that works in both web and React Native environments.
 */

/**
 * Auth unauthorized event - fired when refresh token is invalid/expired
 * and user needs to be logged out.
 * 
 * Listened by: AuthProvider in auth-context.tsx
 * Dispatched by: apiRequest() in api.ts when refresh fails with 401/403
 */
export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

/**
 * Token refreshed event - fired when access token is successfully refreshed
 * Used to trigger user profile refresh if needed
 * 
 * Listened by: AuthProvider in auth-context.tsx
 * Dispatched by: apiRequest() in api.ts after successful token refresh
 */
export const TOKEN_REFRESHED_EVENT = 'auth:token-refreshed';

/**
 * Service events - fired when services are created/updated/completed
 * Used to trigger real-time UI updates without manual refresh
 * 
 * Listened by: useActiveServices hook
 * Dispatched by: Service creation/update functions
 */
export const SERVICE_CREATED_EVENT = 'service:created';
export const SERVICE_UPDATED_EVENT = 'service:updated';
export const SERVICE_COMPLETED_EVENT = 'service:completed';

/**
 * Notification events - fired when notifications need refresh
 * Used for notification badge updates
 * 
 * Listened by: useNotifications, useUnreadNotificationCount hooks
 * Dispatched by: When push notification is received or notification is created
 */
export const NOTIFICATION_RECEIVED_EVENT = 'notification:received';
export const WALLET_UPDATED_EVENT = 'wallet:updated';

/**
 * Simple event emitter for React Native compatibility
 * Uses in-memory storage instead of window events
 */
class EventEmitter {
  private listeners: Map<string, Set<() => void>> = new Map();

  on(event: string, callback: () => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return cleanup function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  emit(event: string): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      // Create a copy of the set to avoid issues if listeners are modified during iteration
      const callbacksCopy = Array.from(callbacks);
      callbacksCopy.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error(`[Events] Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Create singleton instance
const eventEmitter = new EventEmitter();

// Debounce unauthorized event to prevent multiple dispatches
// This prevents the auth screen from flashing multiple times
let unauthorizedDispatched = false;
let unauthorizedTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Dispatch unauthorized event to trigger logout
 * This is called from api.ts when refresh token fails with auth error (401/403)
 * 
 * Debounced to prevent multiple dispatches within 1 second
 */
export function dispatchUnauthorized(): void {
  // If already dispatched recently, ignore
  if (unauthorizedDispatched) {
    if (__DEV__) {
      console.log('[Events] Unauthorized event already dispatched, ignoring duplicate');
    }
    return;
  }

  // Mark as dispatched
  unauthorizedDispatched = true;

  // Emit the event
  eventEmitter.emit(UNAUTHORIZED_EVENT);

  // Reset the flag after 1 second to allow future dispatches if needed
  if (unauthorizedTimeout) {
    clearTimeout(unauthorizedTimeout);
  }
  unauthorizedTimeout = setTimeout(() => {
    unauthorizedDispatched = false;
    unauthorizedTimeout = null;
  }, 1000);
}

/**
 * Add listener for unauthorized event
 * Returns cleanup function to remove the listener
 */
export function addUnauthorizedListener(callback: () => void): () => void {
  return eventEmitter.on(UNAUTHORIZED_EVENT, callback);
}

/**
 * Dispatch token refreshed event
 * This is called from api.ts after successful token refresh
 */
export function dispatchTokenRefreshed(): void {
  eventEmitter.emit(TOKEN_REFRESHED_EVENT);
}

/**
 * Add listener for token refreshed event
 * Returns cleanup function to remove the listener
 */
export function addTokenRefreshedListener(callback: () => void): () => void {
  return eventEmitter.on(TOKEN_REFRESHED_EVENT, callback);
}

/**
 * Dispatch service created event
 * Call this after a ride/porter/carpool is created
 */
export function dispatchServiceCreated(): void {
  eventEmitter.emit(SERVICE_CREATED_EVENT);
}

/**
 * Dispatch service updated event
 * Call this after a service status changes
 */
export function dispatchServiceUpdated(): void {
  eventEmitter.emit(SERVICE_UPDATED_EVENT);
}

/**
 * Dispatch service completed event
 * Call this after a service is completed/cancelled
 */
export function dispatchServiceCompleted(): void {
  eventEmitter.emit(SERVICE_COMPLETED_EVENT);
}

/**
 * Add listener for service events
 * Returns cleanup function to remove all listeners
 */
export function addServiceEventListener(callback: () => void): () => void {
  const cleanup1 = eventEmitter.on(SERVICE_CREATED_EVENT, callback);
  const cleanup2 = eventEmitter.on(SERVICE_UPDATED_EVENT, callback);
  const cleanup3 = eventEmitter.on(SERVICE_COMPLETED_EVENT, callback);
  
  return () => {
    cleanup1();
    cleanup2();
    cleanup3();
  };
}

/**
 * Dispatch notification received event
 * Call this when a push notification is received
 */
export function dispatchNotificationReceived(): void {
  eventEmitter.emit(NOTIFICATION_RECEIVED_EVENT);
}

/**
 * Add listener for notification events
 * Returns cleanup function to remove the listener
 */
export function addNotificationEventListener(callback: () => void): () => void {
  return eventEmitter.on(NOTIFICATION_RECEIVED_EVENT, callback);
}

/**
 * Dispatch wallet updated event.
 * Call this after wallet balance changes (top-up, debit, credit) so screens can refresh.
 */
export function dispatchWalletUpdated(): void {
  eventEmitter.emit(WALLET_UPDATED_EVENT);
}

/**
 * Add listener for wallet updates.
 * Returns cleanup function to remove the listener.
 */
export function addWalletUpdatedListener(callback: () => void): () => void {
  return eventEmitter.on(WALLET_UPDATED_EVENT, callback);
}
