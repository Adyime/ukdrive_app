import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  runOnJS,
  interpolate,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  MessageCircle,
  X,
} from "lucide-react-native";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "warning" | "info" | "chat";

export interface ToastOptions {
  type?: ToastType;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  duration?: number;
}

/** Legacy shape kept for backward compat with toast.show({ text }) */
interface LegacyToastOptions {
  text: string;
  action?: "Open";
  onAction?: () => void;
}

interface ToastContextValue {
  show: (opts: ToastOptions | LegacyToastOptions) => void;
  hide: () => void;
  success: (title: string, subtitle?: string) => void;
  error: (title: string, subtitle?: string) => void;
  warning: (title: string, subtitle?: string) => void;
  info: (title: string, subtitle?: string) => void;
  chat: (
    title: string,
    action?: { label: string; onPress: () => void }
  ) => void;
}

// ─── Theme Config ─────────────────────────────────────────────────────────────

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

interface VariantColors {
  bg: string;
  border: string;
  icon: string;
  title: string;
  subtitle: string;
  progress: string;
  actionBg: string;
  actionText: string;
}

function getVariantColors(
  type: ToastType,
  userType: "passenger" | "driver" | null
): VariantColors {
  const brand = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const base = {
    title: "#111827",
    subtitle: "#6B7280",
    actionText: "#FFFFFF",
  };

  switch (type) {
    case "success":
      return {
        ...base,
        bg: "#ECFDF5",
        border: "#A7F3D0",
        icon: "#10B981",
        progress: "#10B981",
        actionBg: "#10B981",
      };
    case "error":
      return {
        ...base,
        bg: "#FEF2F2",
        border: "#FECACA",
        icon: "#EF4444",
        progress: "#EF4444",
        actionBg: "#EF4444",
      };
    case "warning":
      return {
        ...base,
        bg: "#FFFBEB",
        border: "#FDE68A",
        icon: "#F59E0B",
        progress: "#F59E0B",
        actionBg: "#F59E0B",
      };
    case "info":
      return {
        ...base,
        bg: userType === "driver" ? "#F3EEFB" : "#FFF7ED",
        border: userType === "driver" ? "#D8C9F5" : "#FDBA74",
        icon: brand,
        progress: brand,
        actionBg: brand,
      };
    case "chat":
      return {
        ...base,
        bg: userType === "driver" ? "#F3EEFB" : "#FFF7ED",
        border: userType === "driver" ? "#D8C9F5" : "#FDBA74",
        icon: brand,
        progress: brand,
        actionBg: brand,
      };
  }
}

const ICON_MAP: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  chat: MessageCircle,
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_DURATION = 4000;
const CHAT_DURATION = 6000;
const SWIPE_THRESHOLD = -40;

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ─── Toast Renderer ───────────────────────────────────────────────────────────

interface ToastRendererProps {
  type: ToastType;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  duration: number;
  onDismiss: () => void;
}

function ToastRenderer({
  type,
  title,
  subtitle,
  action,
  duration,
  onDismiss,
}: ToastRendererProps) {
  const insets = useSafeAreaInsets();
  let userType: "passenger" | "driver" | null = null;
  const { t } = useLanguage();
  try {
    const auth = useAuth();
    userType = auth.userType;
  } catch {
    // Outside AuthProvider — fall back to passenger theme
  }

  const colors = getVariantColors(type, userType);
  const IconComponent = ICON_MAP[type];

  const progress = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(0, {
      duration,
      easing: Easing.linear,
    });
  }, [duration, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [0, SWIPE_THRESHOLD], [1, 0.3]),
  }));

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY < 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY < SWIPE_THRESHOLD) {
        runOnJS(onDismiss)();
      } else {
        translateY.value = withTiming(0, { duration: 200 });
      }
    });

  const topOffset = insets.top + (Platform.OS === "android" ? 8 : 4);

  return (
    <View
      style={[styles.overlay, { paddingTop: topOffset }]}
      pointerEvents="box-none"
    >
      <GestureDetector gesture={panGesture}>
        <Animated.View style={containerAnimatedStyle}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.bg,
                borderColor: colors.border,
                shadowColor: colors.icon,
              },
            ]}
          >
            {/* Main content row */}
            <View style={styles.contentRow}>
              {/* Icon */}
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${colors.icon}18` },
                ]}
              >
                <IconComponent
                  size={20}
                  color={colors.icon}
                  strokeWidth={2.2}
                />
              </View>

              {/* Text */}
              <View style={styles.textContainer}>
                <Text
                  style={[styles.title, { color: colors.title }]}
                  numberOfLines={1}
                >
                  {t(title)}
                </Text>
                {subtitle ? (
                  <Text
                    style={[styles.subtitle, { color: colors.subtitle }]}
                    numberOfLines={2}
                  >
                    {t(subtitle)}
                  </Text>
                ) : null}
              </View>

              {/* Action button or dismiss */}
              {action ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    action.onPress();
                    onDismiss();
                  }}
                  style={[
                    styles.actionButton,
                    { backgroundColor: colors.actionBg },
                  ]}
                >
                  <Text
                    style={[styles.actionText, { color: colors.actionText }]}
                  >
                    {t(action.label)}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={onDismiss}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  style={styles.dismissButton}
                >
                  <X size={16} color={colors.subtitle} strokeWidth={2.5} />
                </TouchableOpacity>
              )}
            </View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.progressBar,
                  { backgroundColor: colors.progress },
                  progressStyle,
                ]}
              />
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface InternalToastState {
  key: number;
  type: ToastType;
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  duration: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<InternalToastState | null>(null);
  const keyRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showInternal = useCallback(
    (opts: {
      type: ToastType;
      title: string;
      subtitle?: string;
      action?: { label: string; onPress: () => void };
      duration?: number;
    }) => {
      clearTimer();
      const dur =
        opts.duration ??
        (opts.type === "chat" ? CHAT_DURATION : DEFAULT_DURATION);
      keyRef.current += 1;
      const newToast: InternalToastState = {
        key: keyRef.current,
        type: opts.type,
        title: opts.title,
        subtitle: opts.subtitle,
        action: opts.action,
        duration: dur,
      };
      setToast(newToast);
      timerRef.current = setTimeout(() => {
        setToast(null);
      }, dur);
    },
    [clearTimer]
  );

  const show = useCallback(
    (opts: ToastOptions | LegacyToastOptions) => {
      if ("text" in opts) {
        const legacyAction =
          opts.action === "Open" && opts.onAction
            ? { label: "Open", onPress: opts.onAction }
            : undefined;
        showInternal({
          type: legacyAction ? "chat" : "info",
          title: opts.text,
          action: legacyAction,
        });
        return;
      }
      showInternal({
        type: opts.type ?? "info",
        title: opts.title,
        subtitle: opts.subtitle,
        action: opts.action,
        duration: opts.duration,
      });
    },
    [showInternal]
  );

  const success = useCallback(
    (title: string, subtitle?: string) =>
      showInternal({ type: "success", title, subtitle }),
    [showInternal]
  );

  const error = useCallback(
    (title: string, subtitle?: string) =>
      showInternal({ type: "error", title, subtitle }),
    [showInternal]
  );

  const warning = useCallback(
    (title: string, subtitle?: string) =>
      showInternal({ type: "warning", title, subtitle }),
    [showInternal]
  );

  const info = useCallback(
    (title: string, subtitle?: string) =>
      showInternal({ type: "info", title, subtitle }),
    [showInternal]
  );

  const chat = useCallback(
    (title: string, action?: { label: string; onPress: () => void }) =>
      showInternal({ type: "chat", title, action }),
    [showInternal]
  );

  return (
    <ToastContext.Provider
      value={{ show, hide, success, error, warning, info, chat }}
    >
      {children}
      {toast && (
        <ToastRenderer
          key={toast.key}
          type={toast.type}
          title={toast.title}
          subtitle={toast.subtitle}
          action={toast.action}
          duration={toast.duration}
          onDismiss={hide}
        />
      )}
    </ToastContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: "Figtree_600SemiBold",
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Figtree_400Regular",
    lineHeight: 17,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "Figtree_600SemiBold",
  },
  dismissButton: {
    padding: 4,
  },
  progressTrack: {
    height: 3,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  progressBar: {
    height: 3,
    borderRadius: 2,
  },
});
