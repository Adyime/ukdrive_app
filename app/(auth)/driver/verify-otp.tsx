/**
 * Driver Verify OTP Screen
 * OTP verification and navigation to onboarding or home
 */

import { Loading } from "@/components/ui/loading";
import { LocalizedText as Text } from "@/components/localized-text";
import { OtpInput } from "@/components/ui/otp-input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { sendOtp, verifyOtp } from "@/lib/api/auth";
import { saveDriverOnboardingContext } from "@/lib/storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND_ORANGE = "#F36D14";
const RESEND_COOLDOWN_SECONDS = 60;
const BRAND_PURPLE = "#843FE3";
export default function DriverVerifyOtpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { login } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const bottomFormPadding =
    Platform.OS === "android"
      ? Math.max(insets.bottom + 20, 64)
      : insets.bottom + 20;

  useEffect(() => {
    if (!phone) {
      router.replace("/(auth)/driver/send-otp");
    }
  }, [phone, router]);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(
      () => setResendCooldown((s) => Math.max(0, s - 1)),
      1000
    );
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleVerifyOtp = async (otpCode: string) => {
    if (!phone) return;

    setError("");
    setLoading(true);

    try {
      const response = await verifyOtp(phone, otpCode, "driver");

      if (response.success && response.data) {
        const { data } = response;

        if (data.verified) {
          if (
            data.isNewUser &&
            data.requiresOnboarding &&
            data.onboardingToken
          ) {
            // Persist so user can resume after refresh
            await saveDriverOnboardingContext(phone, data.onboardingToken);
            // New driver - navigate to onboarding
            router.push({
              pathname: "/(auth)/driver/onboarding",
              params: {
                phone,
                onboardingToken: data.onboardingToken,
              },
            });
          } else if (data.tokens && data.user) {
            // Existing driver - login
            await login(data.tokens, data.user as any, "driver");
            router.replace("/(tabs)");
          }
        }
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String(response.error.message)
            : t("Invalid OTP. Please try again.");
        setError(errorMessage);
      }
    } catch {
      setError(t("An unexpected error occurred. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = useCallback(async () => {
    if (!phone || resendCooldown > 0 || resendLoading) return;
    setError("");
    setResendLoading(true);
    try {
      const response = await sendOtp(phone, "driver");
      if (response.success && response.data?.sent) {
        setResendCount((c) => c + 1);
        const cooldown = response.data.retryAfter ?? RESEND_COOLDOWN_SECONDS;
        setResendCooldown(cooldown);
        toast.info(t("New code sent"));
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : t("Failed to send OTP. Please try again.");
        setError(errorMessage);
        const retryAfter =
          typeof response.error === "object" &&
          response.error !== null &&
          "retryAfter" in response.error
            ? Number((response.error as { retryAfter?: number }).retryAfter)
            : undefined;
        if (retryAfter != null && retryAfter > 0) setResendCooldown(retryAfter);
      }
    } catch {
      setError(t("Failed to send OTP. Please try again."));
    } finally {
      setResendLoading(false);
    }
  }, [phone, resendCooldown, resendLoading, t, toast]);

  if (!phone) {
    return null;
  }

  return (
    <SafeAreaView
      className="flex-1 bg-white"
      style={{ backgroundColor: "#fff" }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: 20,
            paddingBottom: bottomFormPadding,
          }}
        >
          {/* Title */}
          <Text
            style={{ fontFamily: "Figtree_600SemiBold" }}
            className="mt-4 mb-3 w-full text-2xl text-left text-black"
          >
            Enter verification code
          </Text>

          <Text
            style={{ fontFamily: "Figtree_400Regular" }}
            className="mb-6 w-full text-base text-left text-gray-900"
          >
            We&apos;ve sent a 6-digit code to{"\n"}
            <Text style={{ fontFamily: "Figtree_600SemiBold" }}>{phone}</Text>
          </Text>

          {/* OTP Input */}
          <View className="mb-4 w-full">
            <OtpInput
              key={resendCount}
              onComplete={handleVerifyOtp}
              error={error}
              focusColor={BRAND_PURPLE}
            />
          </View>

          {/* Resend OTP */}
          <View className="flex-row justify-center mb-6">
            <TouchableOpacity
              onPress={handleResendOtp}
              disabled={resendCooldown > 0 || resendLoading || loading}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontFamily:
                    resendCooldown > 0 || resendLoading || loading
                      ? "Figtree_400Regular"
                      : "Figtree_600SemiBold",
                  color:
                    resendCooldown > 0 || resendLoading || loading
                      ? "#9CA3AF"
                      : BRAND_PURPLE,
                }}
                className="text-sm"
              >
                {resendLoading
                  ? t("Sending...")
                  : resendCooldown > 0
                  ? t("Resend in {{seconds}}s", { seconds: resendCooldown })
                  : t("Resend OTP")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Change Phone Number */}
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="mb-4 w-full"
          >
            <Text
              style={{ fontFamily: "Figtree_400Regular", color: BRAND_PURPLE }}
              className="text-sm text-center"
            >
              Change Phone Number
            </Text>
          </TouchableOpacity>

          {/* Spacer to push bottom text down */}
          <View className="flex-1" />

          {/* Bottom Section */}
          <View className="items-center mt-10 mb-2">
            <TouchableOpacity
              onPress={() => router.push("/(auth)/passenger/send-otp")}
              activeOpacity={0.7}
              className="mb-3"
            >
              <Text
                style={{ fontFamily: "Figtree_400Regular" }}
                className="text-sm text-gray-800"
              >
                Are you a passenger?{" "}
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    color: BRAND_ORANGE,
                  }}
                >
                  sign in as passenger
                </Text>
              </Text>
            </TouchableOpacity>
            <Text
              style={{ fontFamily: "Figtree_400Regular" }}
              className="mt-1 text-xs text-gray-400"
            >
              By sign in, you agree with{" "}
              <Text
                style={{ textDecorationLine: "underline", color: "#6B7280" }}
                onPress={() => router.push("/terms-conditions")}
              >
                Terms &amp; Conditions
              </Text>{" "}
              and{" "}
              <Text
                style={{ textDecorationLine: "underline", color: "#6B7280" }}
                onPress={() => router.push("/privacy-policy")}
              >
                Privacy Policy
              </Text>
            </Text>
          </View>

          {loading && <Loading message="Verifying OTP..." />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

