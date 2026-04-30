import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Linking,
  Modal,
  Platform,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpCircle, ShieldAlert } from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  compareAndroidVersionCodes,
  getAndroidAppVersion,
  getInstalledAndroidVersionCode,
  type AndroidVersionCheckResult,
} from "@/lib/api/app-version";

const BRAND_ORANGE = "#F36D14";
const BRAND_ORANGE_SOFT = "#FFF0E8";
const BRAND_PURPLE = "#843FE3";
const BRAND_PURPLE_SOFT = "#F3EEFE";
const PLAY_STORE_FALLBACK_URL =
  "https://play.google.com/store/apps/details?id=com.wnapp.id1755261066753";

type GateState =
  | { kind: "idle" }
  | { kind: "optional"; payload: AndroidVersionCheckResult }
  | { kind: "required"; payload: AndroidVersionCheckResult };

function UpdateActionButton(props: {
  label: string;
  onPress: () => void;
  backgroundColor: string;
  textColor?: string;
  loading?: boolean;
}) {
  const { label, onPress, backgroundColor, textColor = "#FFFFFF", loading } = props;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={{
        height: 58,
        borderRadius: 18,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        opacity: loading ? 0.7 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 17,
          lineHeight: 22,
          color: textColor,
          fontFamily: "Figtree_700Bold",
        }}
      >
        {loading ? "Opening..." : label}
      </Text>
    </TouchableOpacity>
  );
}

export function AppUpdateGate() {
  const { userType } = useAuth();
  const [gateState, setGateState] = useState<GateState>({ kind: "idle" });
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const lastCheckAtRef = useRef(0);
  const isCheckingRef = useRef(false);

  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const softColor = userType === "driver" ? BRAND_PURPLE_SOFT : BRAND_ORANGE_SOFT;

  const checkForAndroidUpdate = useCallback(async () => {
    if (Platform.OS !== "android") return;
    if (isCheckingRef.current) return;

    const installedVersionCode = getInstalledAndroidVersionCode();
    if (!installedVersionCode) return;

    isCheckingRef.current = true;

    try {
      const response = await getAndroidAppVersion();
      if (!response.success || !response.data) {
        return;
      }

      const result = compareAndroidVersionCodes(
        installedVersionCode,
        response.data
      );

      if (result.status === "required") {
        setGateState({ kind: "required", payload: result });
        return;
      }

      if (result.status === "optional") {
        setGateState({ kind: "optional", payload: result });
        return;
      }

      setGateState({ kind: "idle" });
    } catch (error) {
      console.warn("[AppUpdateGate] Version check failed:", error);
    } finally {
      lastCheckAtRef.current = Date.now();
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForAndroidUpdate();
  }, [checkForAndroidUpdate]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;

      const elapsed = Date.now() - lastCheckAtRef.current;
      if (elapsed < 1500) return;

      void checkForAndroidUpdate();
    });

    return () => subscription.remove();
  }, [checkForAndroidUpdate]);

  useEffect(() => {
    if (
      (gateState.kind !== "required" && gateState.kind !== "optional") ||
      Platform.OS !== "android"
    ) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true
    );

    return () => subscription.remove();
  }, [gateState.kind]);

  const storeUrl = useMemo(() => {
    if (gateState.kind === "idle") return PLAY_STORE_FALLBACK_URL;
    return gateState.payload.playStoreUrl || PLAY_STORE_FALLBACK_URL;
  }, [gateState]);

  const openPlayStore = useCallback(async () => {
    setIsOpeningStore(true);
    try {
      const packageName =
        gateState.kind === "idle"
          ? "com.wnapp.id1755261066753"
          : gateState.payload.packageName;
      const marketUrl = `market://details?id=${packageName}`;

      try {
        await Linking.openURL(marketUrl);
      } catch {
        await Linking.openURL(storeUrl);
      }
    } finally {
      setIsOpeningStore(false);
    }
  }, [gateState, storeUrl]);

  if (Platform.OS !== "android" || gateState.kind === "idle") {
    return null;
  }

  if (gateState.kind === "required") {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          zIndex: 1200,
          backgroundColor: "#FFFFFF",
        }}
      >
        <SafeAreaView
          style={{
            flex: 1,
            paddingHorizontal: 24,
            paddingVertical: 24,
            justifyContent: "space-between",
          }}
        >
          <View style={{ gap: 20 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 24,
                backgroundColor: softColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldAlert color={brandColor} size={34} />
            </View>

            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 28,
                  lineHeight: 34,
                  color: "#111827",
                  fontFamily: "Figtree_700Bold",
                }}
              >
                Update Required
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  lineHeight: 24,
                  color: "#4B5563",
                  fontFamily: "Figtree_400Regular",
                }}
              >
                This version of UK Drive is no longer supported. Update now to continue using the app.
              </Text>
            </View>

            <View
              style={{
                borderRadius: 24,
                padding: 18,
                backgroundColor: "#F9FAFB",
                borderWidth: 1,
                borderColor: "#E5E7EB",
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 13, color: "#6B7280", fontFamily: "Figtree_500Medium" }}>
                Installed version code
              </Text>
              <Text style={{ fontSize: 22, color: "#111827", fontFamily: "Figtree_700Bold" }}>
                {String(gateState.payload.installedVersionCode)}
              </Text>
              <Text style={{ fontSize: 13, color: "#6B7280", fontFamily: "Figtree_500Medium" }}>
                Minimum required version code
              </Text>
              <Text style={{ fontSize: 22, color: brandColor, fontFamily: "Figtree_700Bold" }}>
                {String(gateState.payload.minimumRequiredVersionCode)}
              </Text>
            </View>
          </View>

          <View style={{ gap: 12 }}>
            <UpdateActionButton
              label="Update Now"
              backgroundColor={brandColor}
              loading={isOpeningStore}
              onPress={() => {
                void openPlayStore();
              }}
            />
            <Text
              style={{
                fontSize: 12,
                lineHeight: 18,
                color: "#9CA3AF",
                textAlign: "center",
                fontFamily: "Figtree_400Regular",
              }}
            >
              {"You won't be able to continue until the app is updated."}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <Modal animationType="fade" transparent visible onRequestClose={() => {}}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(17,24,39,0.55)",
          justifyContent: "center",
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderRadius: 28,
            backgroundColor: "#FFFFFF",
            padding: 22,
            gap: 18,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: softColor,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ArrowUpCircle color={brandColor} size={30} />
          </View>

          <View style={{ gap: 8 }}>
            <Text
              style={{
                fontSize: 24,
                lineHeight: 30,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
              }}
            >
              Update Available
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                color: "#4B5563",
                fontFamily: "Figtree_400Regular",
              }}
            >
              A newer version of UK Drive is available. Update now for the latest improvements and fixes.
            </Text>
          </View>

          <View
            style={{
              borderRadius: 20,
              backgroundColor: "#F9FAFB",
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 16,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 13, color: "#6B7280", fontFamily: "Figtree_500Medium" }}>
              Installed version code: {String(gateState.payload.installedVersionCode)}
            </Text>
            <Text style={{ fontSize: 13, color: "#6B7280", fontFamily: "Figtree_500Medium" }}>
              Latest version code: {String(gateState.payload.latestVersionCode)}
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <UpdateActionButton
              label="Update Now"
              backgroundColor={brandColor}
              loading={isOpeningStore}
              onPress={() => {
                void openPlayStore();
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
