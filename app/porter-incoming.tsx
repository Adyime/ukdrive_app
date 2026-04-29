/**
 * Porter Incoming Screen
 * Full-screen incoming parcel request for drivers.
 * Mirrors ride incoming UX with pickup, delivery, fare, countdown, Accept/Dismiss.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, Navigation, X, Check } from "lucide-react-native";
import { Audio } from "expo-av";
import { OneSignal } from "react-native-onesignal";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import {
  getPorterServiceById,
  acceptPorterService,
} from "@/lib/api/porter";
import { dispatchServiceCreated } from "@/lib/events";
import {
  isIncomingPorterHandled,
  markIncomingPorterHandled,
} from "@/lib/incoming-porter-request";
import { stopNativeIncomingAlertSound } from "@/lib/incoming-request-sound";

const COUNTDOWN_SECONDS = 18;
const BRAND_PURPLE = "#843FE3";
const RINGTONE_URI = require("@/assets/ukdrive.mp3");

function parseNotificationTimestamp(value?: string): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1_000_000_000_000) return numeric;
    if (numeric > 1_000_000_000) return numeric * 1000;
    return null;
  }
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return asDate;
  return null;
}

function getRequestExpiresAtMs(sentAt?: string): number {
  const sentAtMs = parseNotificationTimestamp(sentAt);
  const requestStartedAtMs = sentAtMs ?? Date.now();
  return requestStartedAtMs + COUNTDOWN_SECONDS * 1000;
}

function getCountdownFromExpiresAt(expiresAtMs: number): number {
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

export default function PorterIncomingScreen() {
  const params = useLocalSearchParams<{
    porterServiceId: string;
    pickupLocation?: string;
    deliveryLocation?: string;
    fare?: string;
    sentAt?: string;
  }>();

  const {
    porterServiceId,
    pickupLocation: paramPickup,
    deliveryLocation: paramDelivery,
    fare: paramFare,
    sentAt: paramSentAt,
  } = params;

  const { userType } = useAuth();
  const toast = useToast();

  const [pickupLocation, setPickupLocation] = useState(paramPickup ?? "");
  const [deliveryLocation, setDeliveryLocation] = useState(paramDelivery ?? "");
  const [fare, setFare] = useState(paramFare ?? "");
  const [loading, setLoading] = useState(true);
  const expiresAtMsRef = useRef(getRequestExpiresAtMs(paramSentAt));
  const [countdown, setCountdown] = useState(
    getCountdownFromExpiresAt(expiresAtMsRef.current)
  );
  const [accepting, setAccepting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [ended, setEnded] = useState(false);
  const iosIncomingHint =
    Platform.OS === "ios"
      ? "If you opened from a notification, respond quickly. Expired requests are removed automatically."
      : null;

  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRingtone = useCallback(async () => {
    try {
      await stopNativeIncomingAlertSound();
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch {
      // ignore
    }
  }, []);

  const endScreen = useCallback(
    (navigate: boolean) => {
      setEnded(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      stopRingtone();
      if (navigate) {
        router.replace({ pathname: "/(tabs)", params: { mode: "porter" } } as never);
      }
    },
    [stopRingtone]
  );

  useEffect(() => {
    if (!porterServiceId) {
      setLoading(false);
      return;
    }
    if (isIncomingPorterHandled(porterServiceId)) {
      router.replace({ pathname: "/(tabs)", params: { mode: "porter" } } as never);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Best-effort fetch; for incoming open requests this may be 403 before assignment.
        const res = await getPorterServiceById(porterServiceId);
        if (cancelled) return;
        if (res.success && res.data?.porterService) {
          const ps = res.data.porterService;
          setPickupLocation(ps.pickupLocation ?? paramPickup ?? "");
          setDeliveryLocation(ps.deliveryLocation ?? paramDelivery ?? "");
          setFare(ps.fare != null ? String(ps.fare.toFixed(2)) : (paramFare ?? ""));
        }
      } catch {
        // Use push payload params as fallback.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [porterServiceId, paramPickup, paramDelivery, paramFare]);

  useEffect(() => {
    if (!porterServiceId || ended) return;

    timerRef.current = setInterval(() => {
      setCountdown(() => {
        const nextCountdown = getCountdownFromExpiresAt(expiresAtMsRef.current);
        if (nextCountdown <= 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (porterServiceId) {
            markIncomingPorterHandled(porterServiceId);
          }
          endScreen(true);
          return 0;
        }
        return nextCountdown;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [porterServiceId, ended, endScreen]);

  useEffect(() => {
    if (!porterServiceId || ended) return;

    let cancelled = false;

    (async () => {
      try {
        await stopNativeIncomingAlertSound();
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        const { sound } = await Audio.Sound.createAsync(RINGTONE_URI, {
          shouldPlay: true,
          isLooping: true,
        });
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
      } catch {
        // Ringtone optional.
      }
    })();

    return () => {
      cancelled = true;
      stopRingtone();
    };
  }, [porterServiceId, ended, stopRingtone]);

  const handleAccept = async () => {
    if (!porterServiceId || accepting || dismissing || ended) return;
    setAccepting(true);
    try {
      const res = await acceptPorterService(porterServiceId);
      if (res.success && res.data) {
        markIncomingPorterHandled(porterServiceId);
        try {
          OneSignal.Notifications.clearAll();
        } catch {
          // best-effort cleanup
        }
        dispatchServiceCreated();
        endScreen(false);
        router.replace("/(tabs)/active-porter" as never);
      } else {
        const msg =
          typeof res.error === "object" &&
          res.error !== null &&
          "message" in res.error
            ? String((res.error as { message: string }).message)
            : "Failed to accept parcel request";
        toast.error(msg);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setAccepting(false);
    }
  };

  const handleDismiss = async () => {
    if (!porterServiceId || accepting || dismissing || ended) return;
    setDismissing(true);
    markIncomingPorterHandled(porterServiceId);
    try {
      OneSignal.Notifications.clearAll();
    } catch {
      // best-effort cleanup
    }
    try {
      endScreen(true);
    } catch {
      toast.error("Failed to dismiss.");
    } finally {
      setDismissing(false);
    }
  };

  useEffect(() => {
    if (userType && userType !== "driver") {
      router.replace("/(tabs)" as never);
    }
  }, [userType]);

  if (!porterServiceId) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Missing parcel service ID</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Incoming parcel request</Text>
        <Text style={styles.subtitle}>You have {countdown}s to respond</Text>
        {iosIncomingHint ? (
          <Text style={styles.iosHint}>{iosIncomingHint}</Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={BRAND_PURPLE} />
        </View>
      ) : (
        <View style={styles.card}>
          <View style={styles.row}>
            <MapPin size={20} color="#6B7280" />
            <Text style={styles.label}>Pickup</Text>
          </View>
          <Text style={styles.value} numberOfLines={2}>
            {pickupLocation || "—"}
          </Text>

          <View style={[styles.row, { marginTop: 16 }]}>
            <Navigation size={20} color="#6B7280" />
            <Text style={styles.label}>Delivery</Text>
          </View>
          <Text style={styles.value} numberOfLines={2}>
            {deliveryLocation || "—"}
          </Text>

          <View style={[styles.row, { marginTop: 16 }]}>
            <Text style={styles.label}>Estimated fare</Text>
          </View>
          <Text style={styles.fare}>₹{fare || "0.00"}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={handleDismiss}
          disabled={accepting || dismissing || ended}
        >
          {dismissing ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <>
              <X size={24} color="#111827" />
              <Text style={styles.declineButtonText}>Dismiss</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={handleAccept}
          disabled={accepting || dismissing || ended}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Check size={24} color="#FFF" />
              <Text style={styles.acceptButtonText}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontFamily: "Figtree_500Medium",
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 16,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: BRAND_PURPLE,
    borderRadius: 12,
  },
  backBtnText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 16,
    color: "#FFF",
  },
  header: {
    paddingVertical: 24,
    alignItems: "center",
  },
  title: {
    fontFamily: "Figtree_700Bold",
    fontSize: 22,
    color: "#111827",
  },
  subtitle: {
    fontFamily: "Figtree_400Regular",
    fontSize: 15,
    color: "#6B7280",
    marginTop: 6,
  },
  iosHint: {
    fontFamily: "Figtree_400Regular",
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
    textAlign: "center",
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontFamily: "Figtree_500Medium",
    fontSize: 12,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: "Figtree_500Medium",
    fontSize: 16,
    color: "#111827",
    marginTop: 4,
    marginLeft: 28,
  },
  fare: {
    fontFamily: "Figtree_700Bold",
    fontSize: 24,
    color: BRAND_PURPLE,
    marginTop: 4,
    marginLeft: 28,
  },
  actions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 32,
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
    borderRadius: 14,
  },
  declineButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  declineButtonText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 16,
    color: "#111827",
  },
  acceptButton: {
    backgroundColor: BRAND_PURPLE,
  },
  acceptButtonText: {
    fontFamily: "Figtree_600SemiBold",
    fontSize: 16,
    color: "#FFF",
  },
});
