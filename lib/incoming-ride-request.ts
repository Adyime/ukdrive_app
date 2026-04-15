/**
 * Pending incoming ride request (direct request to this driver).
 * Push and Realtime both set rideId here; rides.tsx reads and shows modal.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

export type IncomingRideRequestPayload = {
  rideId: string;
  sentAt?: string;
  pickupLocation?: string;
  destination?: string;
  fare?: string;
  distance?: string;
};

let listener: ((request: IncomingRideRequestPayload) => void) | null = null;
const pendingRideQueue: IncomingRideRequestPayload[] = [];
const recentlyShownRideIds = new Map<string, number>();
const handledRideTimestamps = new Map<string, number>();
let activeRideId: string | null = null;
let incomingRidePopupRideId: string | null = null;
let incomingRidePopupVisible = false;

const RECENTLY_SHOWN_TTL_MS = 60 * 1000;
const DEFAULT_NOTIFICATION_MAX_AGE_MS = 20 * 1000;
const HANDLED_RIDE_KEY_PREFIX = "ride:";
const ACTIVE_RIDE_KEY = "activeRideId";

function pruneRecentlyShownRideIds(): void {
  const now = Date.now();
  for (const [rideId, timestamp] of recentlyShownRideIds.entries()) {
    if (now - timestamp > RECENTLY_SHOWN_TTL_MS) {
      recentlyShownRideIds.delete(rideId);
    }
  }
}

function decodeEscapedText(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep original
  }

  let normalized = decoded;
  for (let i = 0; i < 2; i += 1) {
    normalized = normalized
      .replace(/\\\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }

  return normalized
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ");
}

function sanitizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = decodeEscapedText(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function removePendingRideFromQueue(rideId: string): void {
  if (!rideId) return;
  const nextQueue = pendingRideQueue.filter((item) => item.rideId !== rideId);
  if (nextQueue.length !== pendingRideQueue.length) {
    pendingRideQueue.splice(0, pendingRideQueue.length, ...nextQueue);
  }
}

function hasNewerIncomingPayload(
  currentSentAt?: string,
  incomingSentAt?: string
): boolean {
  const currentSentAtMs = parseNotificationTimestamp(currentSentAt);
  const incomingSentAtMs = parseNotificationTimestamp(incomingSentAt);

  if (incomingSentAtMs == null) return currentSentAtMs == null;
  if (currentSentAtMs == null) return true;
  return incomingSentAtMs >= currentSentAtMs;
}

function mergeIncomingRidePayload(
  current: IncomingRideRequestPayload,
  incoming: IncomingRideRequestPayload
): IncomingRideRequestPayload {
  const preferIncoming = hasNewerIncomingPayload(current.sentAt, incoming.sentAt);
  const primary = preferIncoming ? incoming : current;
  const secondary = preferIncoming ? current : incoming;

  return {
    rideId: current.rideId,
    sentAt: primary.sentAt ?? secondary.sentAt,
    pickupLocation: primary.pickupLocation ?? secondary.pickupLocation,
    destination: primary.destination ?? secondary.destination,
    fare: primary.fare ?? secondary.fare,
    distance: primary.distance ?? secondary.distance,
  };
}

function normalizeIncomingRidePayload(
  rideId: string,
  sentAt?: unknown,
  payload?: Partial<IncomingRideRequestPayload>
): IncomingRideRequestPayload {
  return {
    rideId,
    sentAt: sanitizeOptionalText(
      payload?.sentAt ?? (typeof sentAt === "string" || typeof sentAt === "number" ? String(sentAt) : undefined)
    ),
    pickupLocation: sanitizeOptionalText(payload?.pickupLocation),
    destination: sanitizeOptionalText(payload?.destination),
    fare: sanitizeOptionalText(payload?.fare),
    distance: sanitizeOptionalText(payload?.distance),
  };
}

function enqueueIncomingRideRequest(payload: IncomingRideRequestPayload): void {
  const existingIndex = pendingRideQueue.findIndex((item) => item.rideId === payload.rideId);
  if (existingIndex >= 0) {
    pendingRideQueue[existingIndex] = mergeIncomingRidePayload(
      pendingRideQueue[existingIndex],
      payload
    );
  } else {
    pendingRideQueue.push(payload);
  }
}

function dequeueNextIncomingRideRequest(): IncomingRideRequestPayload | null {
  if (pendingRideQueue.length === 0) {
    return null;
  }
  const next = pendingRideQueue.shift() ?? null;
  if (next) incomingRidePopupRideId = next.rideId;
  return next;
}

export function hasActiveIncomingRidePopup(): boolean {
  return incomingRidePopupVisible || Boolean(incomingRidePopupRideId);
}

export function markIncomingRidePopupVisible(rideId: string): void {
  incomingRidePopupVisible = true;
  if (!rideId) return;
  incomingRidePopupRideId = rideId;
  removePendingRideFromQueue(rideId);
}

export function clearIncomingRidePopup(rideId?: string): void {
  if (!rideId) {
    incomingRidePopupVisible = false;
    incomingRidePopupRideId = null;
    return;
  }
  if (incomingRidePopupRideId === rideId) {
    incomingRidePopupRideId = null;
  }
}

export function takeNextQueuedIncomingRideRequest(
  completedRideId?: string
): IncomingRideRequestPayload | null {
  clearIncomingRidePopup(completedRideId);
  if (hasActiveIncomingRidePopup()) return null;
  return dequeueNextIncomingRideRequest();
}

export function getPendingIncomingRideRequests(): IncomingRideRequestPayload[] {
  return pendingRideQueue.map((request) => ({ ...request }));
}

export function toIncomingRideRouteParams(
  request: IncomingRideRequestPayload
): Record<string, string> {
  const params: Record<string, string> = { rideId: request.rideId };
  if (request.pickupLocation) params.pickupLocation = request.pickupLocation;
  if (request.destination) params.destination = request.destination;
  if (request.fare) params.fare = request.fare;
  if (request.distance) params.distance = request.distance;
  if (request.sentAt) params.sentAt = request.sentAt;
  return params;
}

type RideNotificationGuardNativeModule = {
  setRideHandled?: (rideId: string, handledAtMs?: number) => Promise<void> | void;
  isRideHandled?: (rideId: string, sentAtMs?: number) => Promise<boolean>;
  clearRideHandled?: (rideId: string) => Promise<void> | void;
  setActiveRideId?: (rideId: string) => Promise<void> | void;
  clearActiveRideId?: () => Promise<void> | void;
  getActiveRideId?: () => Promise<string | null>;
};

const nativeRideGuard: RideNotificationGuardNativeModule | null =
  Platform.OS === "android"
    ? ((NativeModules.RideNotificationGuard as RideNotificationGuardNativeModule | undefined) ?? null)
    : null;

let initialized = false;
let initializePromise: Promise<void> | null = null;

function isLegacyNativeArgumentCountError(
  methodName: "setRideHandled" | "isRideHandled",
  error: unknown
): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return (
    message.includes(`"${methodName}"`) &&
    message.includes("called with 2 arguments") &&
    (message.includes("expected argument count: 1") || message.includes("expected 1"))
  );
}

async function setRideHandledCompat(
  rideId: string,
  handledAtMs: number
): Promise<void> {
  const method = nativeRideGuard?.setRideHandled;
  if (!method) return;

  try {
    await method(rideId, handledAtMs);
  } catch (error) {
    if (!isLegacyNativeArgumentCountError("setRideHandled", error)) {
      throw error;
    }
    await method(rideId);
  }
}

async function isRideHandledCompat(
  rideId: string,
  sentAtMs?: number
): Promise<boolean> {
  const method = nativeRideGuard?.isRideHandled;
  if (!method) return false;

  try {
    return Boolean(await method(rideId, sentAtMs));
  } catch (error) {
    if (!isLegacyNativeArgumentCountError("isRideHandled", error)) {
      throw error;
    }
    return Boolean(await method(rideId));
  }
}

async function clearRideHandledCompat(rideId: string): Promise<void> {
  await nativeRideGuard?.clearRideHandled?.(rideId);
}

function toHandledRideStorageKey(rideId: string): string {
  return `${HANDLED_RIDE_KEY_PREFIX}${rideId}`;
}

function parseHandledRideTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;

  if (value === "handled") {
    // Legacy marker from older builds. Treat as "handled before any new sentAt"
    // so re-issued requests with fresh sentAt can break through.
    return 1;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber;
  }

  return null;
}

async function initializePersistentState(): Promise<void> {
  if (initialized) return;
  if (initializePromise) {
    await initializePromise;
    return;
  }

  initializePromise = (async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const handledKeys = keys.filter((key) => key.startsWith(HANDLED_RIDE_KEY_PREFIX));

      if (handledKeys.length > 0) {
        const handledEntries = await AsyncStorage.multiGet(handledKeys);
        for (const [key, value] of handledEntries) {
          const handledAt = parseHandledRideTimestamp(value);
          if (handledAt != null) {
            handledRideTimestamps.set(
              key.slice(HANDLED_RIDE_KEY_PREFIX.length),
              handledAt
            );
          }
        }
      }

      const storedActiveRideId = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
      activeRideId = storedActiveRideId && storedActiveRideId.trim() ? storedActiveRideId : null;
    } catch (error) {
      console.warn("[IncomingRide] Failed to initialize persistent notification state:", error);
    } finally {
      initialized = true;
      initializePromise = null;
    }
  })();

  await initializePromise;
}

export function markIncomingRideShown(rideId: string, sentAt?: unknown): void {
  pruneRecentlyShownRideIds();
  recentlyShownRideIds.set(
    rideId,
    parseNotificationTimestamp(sentAt) ?? Date.now()
  );
}

export function isIncomingRideRecentlyShown(
  rideId: string,
  sentAt?: unknown
): boolean {
  pruneRecentlyShownRideIds();
  const lastShownAt = recentlyShownRideIds.get(rideId);
  if (lastShownAt == null) return false;

  const sentAtMs = parseNotificationTimestamp(sentAt);
  if (sentAtMs != null && sentAtMs > lastShownAt) {
    recentlyShownRideIds.delete(rideId);
    return false;
  }

  return true;
}

export function markIncomingRideHandled(rideId: string): void {
  void setHandledRide(rideId);
}

export function isIncomingRideHandled(rideId: string): boolean {
  return handledRideTimestamps.has(rideId);
}

export async function initializeIncomingRideState(): Promise<void> {
  await initializePersistentState();
}

export async function clearHandledRide(rideId: string): Promise<void> {
  if (!rideId) return;

  handledRideTimestamps.delete(rideId);
  await Promise.allSettled([
    AsyncStorage.removeItem(toHandledRideStorageKey(rideId)),
    clearRideHandledCompat(rideId),
  ]);
}

export async function setHandledRide(
  rideId: string,
  handledAtMs = Date.now()
): Promise<void> {
  if (!rideId) return;

  handledRideTimestamps.set(rideId, handledAtMs);
  removePendingRideFromQueue(rideId);
  if (incomingRidePopupRideId === rideId) {
    incomingRidePopupRideId = null;
  }

  await Promise.allSettled([
    AsyncStorage.setItem(toHandledRideStorageKey(rideId), String(handledAtMs)),
    setRideHandledCompat(rideId, handledAtMs),
  ]);
}

async function getHandledRideTimestamp(rideId: string): Promise<number | null> {
  if (!rideId) return null;
  if (handledRideTimestamps.has(rideId)) {
    return handledRideTimestamps.get(rideId) ?? null;
  }

  await initializePersistentState();
  if (handledRideTimestamps.has(rideId)) {
    return handledRideTimestamps.get(rideId) ?? null;
  }

  try {
    const value = await AsyncStorage.getItem(toHandledRideStorageKey(rideId));
    const handledAt = parseHandledRideTimestamp(value);
    if (handledAt != null) {
      handledRideTimestamps.set(rideId, handledAt);
      return handledAt;
    }
  } catch (error) {
    console.warn(`[IncomingRide] Failed to read handled state for ride ${rideId}:`, error);
  }

  return null;
}

function hasNewerNotification(
  handledAtMs: number | null,
  sentAt: unknown
): boolean {
  if (handledAtMs == null) return false;
  const sentAtMs = parseNotificationTimestamp(sentAt);
  return sentAtMs != null && sentAtMs > handledAtMs;
}

export async function isRideHandled(
  rideId: string,
  sentAt?: unknown
): Promise<boolean> {
  if (!rideId) return false;

  const handledAt = await getHandledRideTimestamp(rideId);
  if (hasNewerNotification(handledAt, sentAt)) {
    await clearHandledRide(rideId);
    return false;
  }
  if (handledAt != null) return true;

  try {
    const sentAtMs = parseNotificationTimestamp(sentAt);
    const nativeHandled = await isRideHandledCompat(rideId, sentAtMs ?? undefined);
    if (nativeHandled) {
      handledRideTimestamps.set(rideId, Date.now());
      return true;
    }
  } catch (error) {
    console.warn(`[IncomingRide] Native handled-state lookup failed for ride ${rideId}:`, error);
  }

  return false;
}

export function getActiveRideIdSync(): string | null {
  return activeRideId;
}

export async function getActiveRideId(): Promise<string | null> {
  if (activeRideId) return activeRideId;

  await initializePersistentState();
  if (activeRideId) return activeRideId;

  try {
    const nativeActiveRideId = await nativeRideGuard?.getActiveRideId?.();
    if (nativeActiveRideId && nativeActiveRideId.trim()) {
      activeRideId = nativeActiveRideId;
      return nativeActiveRideId;
    }
  } catch (error) {
    console.warn("[IncomingRide] Native active-ride lookup failed:", error);
  }

  return null;
}

export async function setActiveRideId(rideId: string): Promise<void> {
  if (!rideId) {
    await clearActiveRideId();
    return;
  }

  pendingRideQueue.splice(0, pendingRideQueue.length);
  incomingRidePopupRideId = null;
  activeRideId = rideId;
  await Promise.allSettled([
    AsyncStorage.setItem(ACTIVE_RIDE_KEY, rideId),
    nativeRideGuard?.setActiveRideId?.(rideId),
  ]);
}

export async function clearActiveRideId(): Promise<void> {
  activeRideId = null;
  await Promise.allSettled([
    AsyncStorage.removeItem(ACTIVE_RIDE_KEY),
    nativeRideGuard?.clearActiveRideId?.(),
  ]);
}

function parseNotificationTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return value;
    if (value > 1_000_000_000) return value * 1000;
    return null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return parseNotificationTimestamp(asNumber);
    }
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
  }

  return null;
}

export async function shouldIgnoreIncomingRideNotification(params: {
  rideId: string;
  sentAt?: unknown;
  maxAgeMs?: number;
}): Promise<{ ignore: boolean; reason: "handled" | "active" | "stale" | "none" }> {
  const { rideId, sentAt, maxAgeMs = DEFAULT_NOTIFICATION_MAX_AGE_MS } = params;

  if (!rideId) {
    return { ignore: true, reason: "none" };
  }

  if (await isRideHandled(rideId, sentAt)) {
    return { ignore: true, reason: "handled" };
  }

  const currentActiveRideId = await getActiveRideId();
  if (currentActiveRideId && currentActiveRideId === rideId) {
    return { ignore: true, reason: "active" };
  }

  const sentAtMs = parseNotificationTimestamp(sentAt);
  if (sentAtMs && Date.now() - sentAtMs > maxAgeMs) {
    return { ignore: true, reason: "stale" };
  }

  return { ignore: false, reason: "none" };
}

export async function setPendingIncomingRideId(
  rideId: string,
  sentAt?: unknown,
  payload?: Partial<IncomingRideRequestPayload>
): Promise<{ shouldPresentNow: boolean; request: IncomingRideRequestPayload | null }> {
  if (!rideId) {
    return { shouldPresentNow: false, request: null };
  }
  if (await isRideHandled(rideId, sentAt)) {
    return { shouldPresentNow: false, request: null };
  }
  if (activeRideId && activeRideId === rideId) {
    return { shouldPresentNow: false, request: null };
  }
  const requestPayload = normalizeIncomingRidePayload(rideId, sentAt, payload);
  markIncomingRideShown(rideId, requestPayload.sentAt);

  if (incomingRidePopupRideId === rideId) {
    return { shouldPresentNow: false, request: null };
  }

  enqueueIncomingRideRequest(requestPayload);

  const shouldPresentNow =
    !hasActiveIncomingRidePopup() &&
    pendingRideQueue.length > 0 &&
    pendingRideQueue[0].rideId === rideId;

  if (shouldPresentNow) {
    const next = dequeueNextIncomingRideRequest();
    if (next) {
      listener?.(next);
      return { shouldPresentNow: true, request: next };
    }
  }

  listener?.(requestPayload);
  return { shouldPresentNow: false, request: null };
}

export function getAndClearPendingIncomingRideId(): string | null {
  const next = dequeueNextIncomingRideRequest();
  return next?.rideId ?? null;
}

export function subscribeToPendingIncomingRideId(
  cb: (request: IncomingRideRequestPayload) => void
): () => void {
  listener = cb;
  return () => {
    listener = null;
  };
}

void initializePersistentState();
