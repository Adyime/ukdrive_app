import { Platform } from "react-native";
import {
  OneSignal,
  NotificationClickEvent,
  NotificationWillDisplayEvent,
} from "react-native-onesignal";
import { router } from "expo-router";
import { registerDeviceToken } from "@/lib/api/notifications";
import { acceptRide } from "@/lib/api/ride";
import { acceptPorterService } from "@/lib/api/porter";
import {
  dispatchNotificationReceived,
  dispatchServiceCreated,
  dispatchServiceUpdated,
} from "@/lib/events";
import {
  clearHandledRide,
  hasActiveIncomingRidePopup,
  isIncomingRideRecentlyShown,
  markIncomingRideHandled,
  setActiveRideId,
  setHandledRide,
  setPendingIncomingRideId,
  shouldIgnoreIncomingRideNotification,
  toIncomingRideRouteParams,
} from "@/lib/incoming-ride-request";
import {
  isIncomingPorterHandled,
  markIncomingPorterHandled,
} from "@/lib/incoming-porter-request";
import { stopNativeIncomingAlertSound } from "@/lib/incoming-request-sound";
import { resolveNotificationHref } from "@/lib/utils/notification-navigation";

const ONESIGNAL_APP_ID = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || "";

let currentUserId: string | null = null;
const RIDE_TERMINAL_ERROR_CODES = new Set([
  "RIDE_NOT_FOUND",
  "RIDE_EXPIRED",
  "RIDE_ALREADY_ACCEPTED",
  "RIDE_ALREADY_CANCELLED",
  "RIDE_NOT_YOURS",
  "FORBIDDEN",
]);

function getApiErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return null;
  return code.toUpperCase();
}

function isRideTerminalError(error: unknown): boolean {
  const code = getApiErrorCode(error);
  if (!code) return false;
  return RIDE_TERMINAL_ERROR_CODES.has(code);
}

function isDriverCarPoolRequestNotification(
  data: Record<string, unknown> | undefined
): boolean {
  if (!data) return false;
  const notificationType = data.notificationType;
  const type = data.type;
  const action = data.action;
  const hasCarPoolId = typeof data.carPoolId === "string";

  if (!hasCarPoolId) return false;

  return (
    notificationType === "carpool_seat_requested" ||
    notificationType === "carpool_join_requested" ||
    type === "carpool_seat_requested" ||
    type === "carpool_join_requested" ||
    action === "carpool_seat_requested" ||
    action === "carpool_join_requested"
  );
}

function isPassengerCarPoolJoinApprovedNotification(
  data: Record<string, unknown> | undefined
): boolean {
  if (!data) return false;
  const notificationType = data.notificationType;
  const type = data.type;
  const action = data.action;
  const hasCarPoolId = typeof data.carPoolId === "string";

  if (!hasCarPoolId) return false;

  return (
    notificationType === "carpool_join_approved" ||
    type === "carpool_join_approved" ||
    action === "carpool_join_approved"
  );
}

function buildRideIncomingParams(
  rideId: string,
  data: Record<string, unknown> | undefined
): Record<string, string> {
  const params: Record<string, string> = { rideId };
  if (typeof data?.pickupLocation === "string")
    params.pickupLocation = data.pickupLocation;
  if (typeof data?.destination === "string")
    params.destination = data.destination;
  if (typeof data?.estimatedFare === "string" || typeof data?.estimatedFare === "number") {
    params.fare = String(data.estimatedFare);
  } else if (typeof data?.fare === "string" || typeof data?.fare === "number") {
    params.fare = String(data.fare);
  }
  if (typeof data?.estimatedDistance === "string" || typeof data?.estimatedDistance === "number") {
    params.distance = String(data.estimatedDistance);
  } else if (typeof data?.distance === "string" || typeof data?.distance === "number") {
    params.distance = String(data.distance);
  }
  const sentAt = getRideNotificationSentAt(data);
  if (typeof sentAt === "string" || typeof sentAt === "number") {
    params.sentAt = String(sentAt);
  }
  return params;
}

async function queueRideIncomingAndMaybeOpen(
  rideId: string,
  data: Record<string, unknown> | undefined
): Promise<void> {
  const params = buildRideIncomingParams(rideId, data);
  const queued = await setPendingIncomingRideId(rideId, params.sentAt, {
    pickupLocation: params.pickupLocation,
    destination: params.destination,
    fare: params.fare,
    distance: params.distance,
    sentAt: params.sentAt,
  });
  if (queued.shouldPresentNow && queued.request) {
    router.replace({
      pathname: "/ride-incoming",
      params: toIncomingRideRouteParams(queued.request),
    } as never);
  }
}

function getRideNotificationSentAt(
  data: Record<string, unknown> | undefined
): unknown {
  if (!data) return null;
  return (
    data.sentAt ?? data.sent_at ?? data.createdAt ?? data.created_at ?? null
  );
}

function clearDeliveredNotification(androidNotificationId?: number): void {
  try {
    if (
      Platform.OS === "android" &&
      typeof androidNotificationId === "number"
    ) {
      OneSignal.Notifications.removeNotification(androidNotificationId);
    }
    OneSignal.Notifications.clearAll();
  } catch {
    // best-effort cleanup
  }
}

async function registerTokenWithServer(playerId: string): Promise<void> {
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await registerDeviceToken({ playerId, platform });
}

/**
 * Initialize OneSignal - call once in root layout
 */
export function initializeOneSignal(): void {
  if (!ONESIGNAL_APP_ID) {
    console.warn("[OneSignal] App ID not configured");
    return;
  }

  try {
    OneSignal.initialize(ONESIGNAL_APP_ID);
    OneSignal.Notifications.requestPermission(true);

    // Android: Configure "Ride Requests" channel (high priority / heads-up) in OneSignal
    // dashboard: Settings → Notifications → Android Channel.

    OneSignal.Notifications.addEventListener(
      "click",
      (event: NotificationClickEvent) => {
        const data = event.notification.additionalData as
          | Record<string, unknown>
          | undefined;
        const actionId = (event as { result?: { actionId?: string } }).result
          ?.actionId;
        void handleNotificationClick(
          data,
          actionId,
          event.notification.androidNotificationId
        );
      }
    );

    OneSignal.Notifications.addEventListener(
      "foregroundWillDisplay",
      (event: NotificationWillDisplayEvent) => {
        const notification = event.getNotification();
        const data = notification.additionalData as
          | Record<string, unknown>
          | undefined;
        const isIncomingRide =
          data?.notificationType === "incoming_ride" ||
          (typeof data?.rideId === "string" && data?.type === "ride_request");
        const isIncomingPorter =
          data?.notificationType === "incoming_porter" ||
          (typeof data?.porterServiceId === "string" &&
            data?.type === "porter_request");
        const isDriverCarPoolRequest = isDriverCarPoolRequestNotification(data);
        const isPassengerCarPoolJoinApproved =
          isPassengerCarPoolJoinApprovedNotification(data);

        // Ride handled-clear: the accepting driver cancelled, so clear our stale "handled"
        // state so we can receive the re-dispatched ride request
        if (
          data?.type === "ride_handled_clear" ||
          data?.notificationType === "ride_handled_clear"
        ) {
          event.preventDefault();
          if (typeof data?.rideId === "string") {
            void clearHandledRide(data.rideId);
          }
          return;
        }

        // Ride dismissed: another driver accepted — silently close incoming screen & clear sound
        if (
          data?.type === "ride_request_dismissed" ||
          data?.notificationType === "ride_dismissed"
        ) {
          event.preventDefault();
          if (typeof data?.rideId === "string") {
            markIncomingRideHandled(data.rideId);
          }
          void stopNativeIncomingAlertSound();
          try {
            OneSignal.Notifications.clearAll();
          } catch {}
          dispatchNotificationReceived();
          dispatchServiceUpdated();
          return;
        }

        if (isIncomingRide && typeof data?.rideId === "string") {
          const rideId = data.rideId;
          event.preventDefault();
          // If ride-incoming screen is already open with JS audio active,
          // stop the native alert sound that was just restarted by the notification extension
          // so we don't get two sounds playing simultaneously.
          if (hasActiveIncomingRidePopup()) {
            void stopNativeIncomingAlertSound();
          }
          void (async () => {
            const gate = await shouldIgnoreIncomingRideNotification({
              rideId,
              sentAt: getRideNotificationSentAt(data),
            });
            const rideSentAt = getRideNotificationSentAt(data);

            if (
              gate.ignore ||
              isIncomingRideRecentlyShown(rideId, rideSentAt)
            ) {
              dispatchNotificationReceived();
              clearDeliveredNotification(notification.androidNotificationId);
              return;
            }

            await queueRideIncomingAndMaybeOpen(rideId, data);
            dispatchNotificationReceived();
            dispatchServiceUpdated();
          })();
          return;
        }

        if (isIncomingPorter && typeof data?.porterServiceId === "string") {
          if (isIncomingPorterHandled(data.porterServiceId)) {
            dispatchNotificationReceived();
            clearDeliveredNotification(notification.androidNotificationId);
            return;
          }

          const params: Record<string, string> = {
            porterServiceId: data.porterServiceId,
          };
          if (typeof data.pickupLocation === "string")
            params.pickupLocation = data.pickupLocation;
          if (typeof data.deliveryLocation === "string")
            params.deliveryLocation = data.deliveryLocation;
          if (typeof data.estimatedFare === "string")
            params.fare = data.estimatedFare;
          else if (typeof data.fare === "string") params.fare = data.fare;
          router.replace({ pathname: "/porter-incoming", params } as never);
          return;
        }

        if (isDriverCarPoolRequest) {
          event.preventDefault();
          notification.display();
          dispatchNotificationReceived();
          dispatchServiceUpdated();
          return;
        }

        if (isPassengerCarPoolJoinApproved) {
          event.preventDefault();
          notification.display();
          dispatchNotificationReceived();
          dispatchServiceUpdated();
          return;
        } else {
          // Keep normal tray/banner behavior for all other foreground notifications.
          notification.display();
        }

        // Car-pool OTP ready: auto-open active car-pool screen for passenger.
        if (
          typeof data?.carPoolId === "string" &&
          (data?.type === "carpool_confirmed" ||
            data?.action === "carpool_otp_ready" ||
            data?.action === "carpool_member_otp_ready")
        ) {
          router.replace("/(tabs)/active-car-pool" as never);
        }

        dispatchNotificationReceived();
        if (data?.rideId || data?.porterServiceId || data?.carPoolId) {
          dispatchServiceUpdated();
        }
      }
    );

    OneSignal.User.pushSubscription.addEventListener(
      "change",
      (subscription) => {
        const playerId = subscription.current.id;
        if (playerId && currentUserId) {
          registerTokenWithServer(playerId).catch(() => {});
        }
      }
    );
  } catch (error) {
    console.error("[OneSignal] Failed to initialize:", error);
  }
}

async function handleNotificationClick(
  data: Record<string, unknown> | undefined,
  actionId?: string,
  androidNotificationId?: number
) {
  if (!data) return;

  const rideId = typeof data.rideId === "string" ? data.rideId : null;
  const porterServiceId =
    typeof data.porterServiceId === "string" ? data.porterServiceId : null;
  const isRideRequest =
    data.notificationType === "incoming_ride" || data.type === "ride_request";
  const isPorterRequest =
    data.notificationType === "incoming_porter" ||
    data.type === "porter_request";
  const isRideDismissed =
    data.type === "ride_request_dismissed" ||
    data.notificationType === "ride_dismissed";

  try {
    // Ride dismissed by another driver accepting — just clear and go home
    if (rideId && isRideDismissed) {
      markIncomingRideHandled(rideId);
      await stopNativeIncomingAlertSound();
      clearDeliveredNotification(androidNotificationId);
      try {
        OneSignal.Notifications.clearAll();
      } catch {}
      dispatchServiceUpdated();
      return;
    }

    if (rideId && isRideRequest) {
      const gate = await shouldIgnoreIncomingRideNotification({
        rideId,
        sentAt: getRideNotificationSentAt(data),
      });
      if (gate.ignore) {
        await stopNativeIncomingAlertSound();
        clearDeliveredNotification(androidNotificationId);
        return;
      }

      // Handle Accept/Dismiss from notification action buttons.
      if (actionId === "accept") {
        try {
          await stopNativeIncomingAlertSound();
          const res = await acceptRide(rideId);
          clearDeliveredNotification(androidNotificationId);
          if (res.success && res.data) {
            await Promise.allSettled([
              setHandledRide(rideId),
              setActiveRideId(rideId),
            ]);
            dispatchServiceCreated();
            router.replace("/(tabs)/active-ride" as never);
            return;
          }

          if (isRideTerminalError(res.error)) {
            await setHandledRide(rideId);
            dispatchNotificationReceived();
            dispatchServiceUpdated();
            router.replace("/(tabs)" as never);
            return;
          }

          await queueRideIncomingAndMaybeOpen(rideId, data);
        } catch (error) {
          if (isRideTerminalError(error)) {
            await setHandledRide(rideId);
            dispatchNotificationReceived();
            dispatchServiceUpdated();
            router.replace("/(tabs)" as never);
            return;
          }
          await queueRideIncomingAndMaybeOpen(rideId, data);
        }
        return;
      }
      if (actionId === "dismiss" || actionId === "decline") {
        await setHandledRide(rideId);
        await stopNativeIncomingAlertSound();
        clearDeliveredNotification(androidNotificationId);
        dispatchServiceUpdated();
        router.replace("/(tabs)" as never);
        return;
      }

      const rideSentAt = getRideNotificationSentAt(data);
      if (isIncomingRideRecentlyShown(rideId, rideSentAt)) {
        await stopNativeIncomingAlertSound();
        clearDeliveredNotification(androidNotificationId);
        return;
      }

      await queueRideIncomingAndMaybeOpen(rideId, data);
      return;
    }

    if (porterServiceId && isPorterRequest) {
      if (isIncomingPorterHandled(porterServiceId)) {
        await stopNativeIncomingAlertSound();
        clearDeliveredNotification(androidNotificationId);
        return;
      }

      if (actionId === "accept") {
        await stopNativeIncomingAlertSound();
        acceptPorterService(porterServiceId).then((res) => {
          if (res.success && res.data) {
            markIncomingPorterHandled(porterServiceId);
            clearDeliveredNotification(androidNotificationId);
            dispatchServiceCreated();
            router.replace("/(tabs)/active-porter" as never);
          } else {
            const params: Record<string, string> = { porterServiceId };
            if (typeof data.pickupLocation === "string")
              params.pickupLocation = data.pickupLocation;
            if (typeof data.deliveryLocation === "string")
              params.deliveryLocation = data.deliveryLocation;
            if (typeof data.estimatedFare === "string")
              params.fare = data.estimatedFare;
            else if (typeof data.fare === "string") params.fare = data.fare;
            router.replace({ pathname: "/porter-incoming", params } as never);
          }
        });
        return;
      }
      if (actionId === "dismiss" || actionId === "decline") {
        markIncomingPorterHandled(porterServiceId);
        await stopNativeIncomingAlertSound();
        clearDeliveredNotification(androidNotificationId);
        router.replace({
          pathname: "/(tabs)",
          params: { mode: "porter" },
        } as never);
        return;
      }

      const params: Record<string, string> = { porterServiceId };
      if (typeof data.pickupLocation === "string")
        params.pickupLocation = data.pickupLocation;
      if (typeof data.deliveryLocation === "string")
        params.deliveryLocation = data.deliveryLocation;
      if (typeof data.estimatedFare === "string")
        params.fare = data.estimatedFare;
      else if (typeof data.fare === "string") params.fare = data.fare;
      router.replace({ pathname: "/porter-incoming", params } as never);
      return;
    }

    // Chat message tapped — navigate to the active ride/porter/carpool screen
    if (data.notificationType === "chat_message") {
      if (typeof data.rideId === "string") {
        router.push("/(tabs)/active-ride" as never);
        return;
      }
      if (typeof data.porterServiceId === "string") {
        router.push("/(tabs)/active-porter" as never);
        return;
      }
      if (typeof data.carPoolId === "string") {
        router.push("/(tabs)/active-car-pool" as never);
        return;
      }
    }

    const href = resolveNotificationHref({
      type: typeof data.type === "string" ? data.type : null,
      data,
    });
    router.push(href as never);
  } catch (error) {
    console.error("[OneSignal] Navigation error:", error);
    router.push("/(tabs)/notifications" as never);
  }
}

/**
 * Register user for push notifications - call on login
 */
export async function registerForPushNotifications(
  userId: string,
  userType: "passenger" | "driver"
): Promise<string | null> {
  if (!ONESIGNAL_APP_ID) return null;

  try {
    currentUserId = userId;

    OneSignal.login(userId);
    OneSignal.User.addTags({ userType, userId });

    let playerId = await OneSignal.User.pushSubscription.getIdAsync();

    if (!playerId) {
      // Wait up to 5 seconds for player ID
      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        playerId = await OneSignal.User.pushSubscription.getIdAsync();
        if (playerId) break;
      }
    }

    if (playerId) {
      await registerTokenWithServer(playerId);
    }

    return playerId || null;
  } catch (error) {
    console.error("[OneSignal] Failed to register user:", error);
    return null;
  }
}

/**
 * Unregister user from push notifications - call on logout
 */
export function unregisterFromPushNotifications(): void {
  if (!ONESIGNAL_APP_ID) return;

  try {
    currentUserId = null;
    OneSignal.logout();
    OneSignal.User.removeTags(["userType", "userId"]);
  } catch (error) {
    console.error("[OneSignal] Failed to unregister user:", error);
  }
}

export async function getPlayerId(): Promise<string | null> {
  if (!ONESIGNAL_APP_ID) return null;
  try {
    return await OneSignal.User.pushSubscription.getIdAsync();
  } catch {
    return null;
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  try {
    return await OneSignal.User.pushSubscription.getOptedInAsync();
  } catch {
    return false;
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (!ONESIGNAL_APP_ID) return false;
  try {
    return await OneSignal.Notifications.requestPermission(true);
  } catch {
    return false;
  }
}
