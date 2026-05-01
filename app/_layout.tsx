import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  AppState,
  Keyboard,
  Linking,
  LogBox,
  Platform,
  View,
  StyleSheet,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import "react-native-reanimated";
import "../global.css";
import "@/lib/services/driver-foreground-service";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { AlertProvider } from "@/context/alert-context";
import { LanguageProvider } from "@/context/language-context";
import { ToastProvider } from "@/components/ui/toast";
import { Loading } from "@/components/ui/loading";
import { AppUpdateGate } from "@/components/app-update-gate";
import {
  initializeIncomingRideState,
  isIncomingRideRecentlyShown,
  setPendingIncomingRideId,
  shouldIgnoreIncomingRideNotification,
  toIncomingRideRouteParams,
} from "@/lib/incoming-ride-request";
import { initializeOneSignal } from "@/lib/services/onesignal";
import {
  recordDriverLocationAppState,
  recordDriverLocationVisibleRoute,
} from "@/lib/services/driver-location-diagnostics";
import {
  useFonts,
  Figtree_300Light,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from "@expo-google-fonts/figtree";
import {
  NotoSansDevanagari_300Light,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
  NotoSansDevanagari_700Bold,
} from "@expo-google-fonts/noto-sans-devanagari";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Suppress SafeAreaView deprecation warning (we're using react-native-safe-area-context)
LogBox.ignoreLogs([
  "SafeAreaView has been deprecated and will be removed in a future release. Please use 'react-native-safe-area-context' instead.",
]);

export const unstable_settings = {
  anchor: "(tabs)",
};

function parseRideIncomingUrl(url: string): Record<string, string> | null {
  if (!url || !url.includes("ride-incoming")) return null;
  try {
    const parsed = new URL(url);
    const rideId = parsed.searchParams.get("rideId");
    if (!rideId) return null;
    const params: Record<string, string> = { rideId };
    const pickup = parsed.searchParams.get("pickupLocation");
    const dest = parsed.searchParams.get("destination");
    const fare = parsed.searchParams.get("fare");
    const distance = parsed.searchParams.get("distance");
    const action = parsed.searchParams.get("action");
    const sentAt =
      parsed.searchParams.get("sentAt") ?? parsed.searchParams.get("sent_at");
    if (pickup) params.pickupLocation = pickup;
    if (dest) params.destination = dest;
    if (fare) params.fare = fare;
    if (distance) params.distance = distance;
    if (action) params.action = action;
    if (sentAt) params.sentAt = sentAt;
    return params;
  } catch {
    return null;
  }
}

function RootLayoutNav() {
  const { isAuthenticated, isLoading, userType } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const initialUrlHandled = useRef(false);
  const routePath = segments.join("/") || "root";

  useEffect(() => {
    if (isLoading) return;

    const currentRootSegment = (segments[0] as string) ?? "";
    const inAuthGroup = currentRootSegment === "(auth)";
    const isPublicLegalRoute =
      currentRootSegment === "terms-conditions" ||
      currentRootSegment === "privacy-policy";

    if (!isAuthenticated && !inAuthGroup && !isPublicLegalRoute) {
      // Redirect to auth welcome screen if not authenticated
      router.replace("/(auth)" as any);
    } else if (isAuthenticated && inAuthGroup) {
      // Redirect to tabs home if authenticated
      router.replace("/(tabs)" as any);
    }
  }, [isAuthenticated, isLoading, segments, router]);

  useEffect(() => {
    void recordDriverLocationVisibleRoute(routePath);
  }, [routePath]);

  useEffect(() => {
    void recordDriverLocationAppState(AppState.currentState, routePath);

    const subscription = AppState.addEventListener("change", (nextState) => {
      void recordDriverLocationAppState(nextState, routePath);
    });

    return () => {
      subscription.remove();
    };
  }, [routePath]);

  // Open ride-incoming when app is opened via deep link (full-screen intent or notification tap)
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    const openRideIncomingIfUrl = async (url: string, isInitial: boolean) => {
      const params = parseRideIncomingUrl(url);
      if (params) {
        const rideId = params.rideId;
        const gate = await shouldIgnoreIncomingRideNotification({
          rideId,
          sentAt: params.sentAt,
        });
        if (gate.ignore) return;
        if (isIncomingRideRecentlyShown(rideId, params.sentAt)) return;
        const queued = await setPendingIncomingRideId(rideId, params.sentAt, {
          pickupLocation: params.pickupLocation,
          destination: params.destination,
          fare: params.fare,
          distance: params.distance,
          sentAt: params.sentAt,
        });
        if (!queued.shouldPresentNow || !queued.request) return;
        const nextParams = toIncomingRideRouteParams(queued.request);
        if (isInitial)
          router.replace({
            pathname: "/ride-incoming",
            params: nextParams,
          } as never);
        else
          router.replace({
            pathname: "/ride-incoming",
            params: nextParams,
          } as never);
      }
    };

    if (Platform.OS === "android" && !initialUrlHandled.current) {
      initialUrlHandled.current = true;
      Linking.getInitialURL().then((url) => {
        if (url) void openRideIncomingIfUrl(url, true);
      });
    }

    const sub = Linking.addEventListener("url", (e) => {
      void openRideIncomingIfUrl(e.url, false);
    });
    return () => sub.remove();
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loading message="Loading..." userTypeOverride={userType} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="driver-rewards-history"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ride-incoming"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}

function KeyboardInsetContainer({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onShow = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const androidKeyboardInset =
    Platform.OS === "android" ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  return (
    <View style={{ flex: 1, paddingBottom: androidKeyboardInset }}>
      {children}
    </View>
  );
}

const ANIMATED_SPLASH_GIF = require("@/assets/images/UKDRIVE.gif");
const ANIMATED_SPLASH_DURATION_MS = 3500; // how long to show the GIF
const SPLASH_BACKGROUND_COLOR = "#000000";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const oneSignalInitialized = useRef(false);
  const nativeSplashHidden = useRef(false);

  const [fontsLoaded, fontError] = useFonts({
    Figtree_300Light,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    NotoSansDevanagari_300Light,
    NotoSansDevanagari_400Regular,
    NotoSansDevanagari_500Medium,
    NotoSansDevanagari_600SemiBold,
    NotoSansDevanagari_700Bold,
  });

  // Animated splash state
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashStartedRef = useRef(false);
  const appContentReady = fontsLoaded || !!fontError;

  // Hide native splash ASAP so the GIF overlay is visible
  useEffect(() => {
    if (nativeSplashHidden.current) return;
    const frame = requestAnimationFrame(() => {
      nativeSplashHidden.current = true;
      SplashScreen.hideAsync().catch(() => {
        // best-effort; animated GIF overlay is the visible launch experience
      });
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Once the app is ready, let the GIF finish its run and then fade it out.
    if (!appContentReady || splashStartedRef.current) return;
    splashStartedRef.current = true;

    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShowAnimatedSplash(false);
      });
    }, ANIMATED_SPLASH_DURATION_MS);

    return () => clearTimeout(timer);
  }, [appContentReady, splashOpacity]);

  // Initialize OneSignal once on app mount
  useEffect(() => {
    if (!oneSignalInitialized.current) {
      oneSignalInitialized.current = true;
      void (async () => {
        await initializeIncomingRideState();
        initializeOneSignal();
      })();
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {appContentReady ? (
        <SafeAreaProvider>
          <LanguageProvider>
            <AuthProvider>
              <ThemeProvider
                value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
              >
                <AlertProvider>
                  <ToastProvider>
                    <KeyboardInsetContainer>
                      <RootLayoutNav />
                      <AppUpdateGate />
                      <StatusBar style="auto" />
                    </KeyboardInsetContainer>
                  </ToastProvider>
                </AlertProvider>
              </ThemeProvider>
            </AuthProvider>
          </LanguageProvider>
        </SafeAreaProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: SPLASH_BACKGROUND_COLOR }} />
      )}

      {/* Animated GIF splash overlay */}
      {showAnimatedSplash && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: splashOpacity,
              zIndex: 999,
              backgroundColor: SPLASH_BACKGROUND_COLOR,
            },
          ]}
        >
          <Animated.Image
            source={ANIMATED_SPLASH_GIF}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </Animated.View>
      )}
    </GestureHandlerRootView>
  );
}
