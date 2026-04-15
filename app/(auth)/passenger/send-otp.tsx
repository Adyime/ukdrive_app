/**
 * Passenger Send OTP Screen
 * Phone number input with country code selector and OTP sending
 */

import { PhoneInput, validatePhoneNumber, type Country, } from "@/components/phone-input";
import { LocalizedText as Text } from "@/components/localized-text";
import { useLanguage } from "@/context/language-context";
import { sendOtp } from "@/lib/api/auth";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export default function PassengerSendOtpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [fullPhone, setFullPhone] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomFormPadding =
    Platform.OS === "android"
      ? Math.max(insets.bottom + 20, 64)
      : insets.bottom + 20;

  const handlePhoneChange = useCallback(
    (full: string, phone: string, country: Country) => {
      setFullPhone(full);
      setPhoneNumber(phone);
      setSelectedCountry(country);
      setError(""); // Clear error when user types
    },
    []
  );

  const handleSendOtp = async () => {
    setError("");

    if (!phoneNumber.trim()) {
      setError(t("Phone number is required"));
      return;
    }

    if (!selectedCountry) {
      setError(t("Please select a country"));
      return;
    }

    if (!validatePhoneNumber(fullPhone, selectedCountry)) {
      setError(
        t("Please enter a valid {{digits}}-digit phone number", {
          digits: selectedCountry.phoneLength,
        })
      );
      return;
    }

    setLoading(true);
    try {
      const response = await sendOtp(fullPhone, "passenger");

      if (response.success && response.data) {
        // Navigate to verify OTP screen with phone number
        router.push({
          pathname: "/(auth)/passenger/verify-otp",
          params: { phone: fullPhone },
        });
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String(response.error.message)
            : t("Failed to send OTP. Please try again.");
        console.error("OTP Send Error:", response.error);
        setError(errorMessage);
      }
    } catch (err) {
      console.error("OTP Send Exception:", err);
      setError(
        t("An unexpected error occurred. Please check your connection and try again.")
      );
    } finally {
      setLoading(false);
    }
  };

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
          contentContainerClassName="flex-grow items-center px-6 pb-6"
          contentContainerStyle={{
            paddingTop: 20,
            paddingBottom: bottomFormPadding,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          {/* <View className="items-center mt-4 mb-2">
            <Image
              source={require('@/assets/logo.svg')}
              style={{ width: 130, height: 70 }}
              contentFit="contain"
            />
          </View> */}

          {/* Title */}
          {/* <Text
            className="mb-2 w-full text-2xl font-bold text-left"
            style={{ color: BRAND_ORANGE }}
          >
            Passenger Login
          </Text> */}

          {/* Taxi Illustration */}
          {/* <View className="items-center my-2">
            <Image
              source={require('@/assets/png_1.svg')}
              style={{ width: 300, height: 300 }}
              contentFit="contain"
            />
          </View> */}

          {/* Mobile Number Label */}
          <Text
            style={{ fontFamily: "Figtree_600SemiBold" }}
            className="mb-3 w-full text-2xl text-left text-black"
          >
            Enter your phone number for verification
          </Text>

          <Text
            style={{ fontFamily: "Figtree_400Regular" }}
            className="mb-3 w-full text-base text-left text-gray-900"
          >
            This number will be used to verify your identity and for
            communication purposes.
          </Text>

          {/* Phone Input */}
          <View className="mb-4 w-full">
            <PhoneInput
              value={fullPhone}
              onChangePhone={handlePhoneChange}
              error={error}
              label=""
              placeholder="Enter your phone number"
              autoFocus
              defaultCountry="IN"
              disableCountryPicker={true}
            />
          </View>

          {/* Send OTP Button */}
          <TouchableOpacity
            onPress={handleSendOtp}
            disabled={loading || !phoneNumber.trim()}
            activeOpacity={0.8}
            style={{
              backgroundColor: BRAND_ORANGE,
              borderRadius: 8,
              paddingVertical: 14,
              paddingHorizontal: 40,
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
            }}
          >
            {loading ? (
              <View className="flex-row items-center">
                <ActivityIndicator
                  size="small"
                  color="#ffffff"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{ fontFamily: "Figtree_600SemiBold" }}
                  className="text-base font-bold tracking-widest text-white"
                >
                  Send OTP
                </Text>
              </View>
            ) : (
              <Text
                style={{ fontFamily: "Figtree_600SemiBold" }}
                className="text-base tracking-widest text-white"
              >
                Send OTP
              </Text>
            )}
          </TouchableOpacity>

          {/* Driver Sign-in + Legal */}
          <View className="items-center mt-4 mb-2 w-full">
            <TouchableOpacity
              onPress={() => router.push("/(auth)/driver/send-otp")}
              activeOpacity={0.7}
              className="mb-3"
            >
              <Text
                style={{ fontFamily: "Figtree_400Regular" }}
                className="text-sm text-gray-800"
              >
                Are you a driver?{" "}
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    color: BRAND_PURPLE,
                  }}
                >
                  sign in as driver
                </Text>
              </Text>
            </TouchableOpacity>
            <Text
              style={{ fontFamily: "Figtree_400Regular" }}
              className="mt-1 text-xs text-gray-400"
            >
              By sign in, you agree with
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/terms-conditions")}
              >
                <Text
                  style={{ textDecorationLine: "underline", color: "#6B7280" }}
                  className="text-xs"
                >
                  Terms &amp; Conditions
                </Text>
              </TouchableOpacity>
              <Text
                style={{ fontFamily: "Figtree_400Regular" }}
                className="text-xs text-gray-400"
              >
                {" "}and{" "}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push("/privacy-policy")}
              >
                <Text
                  style={{ textDecorationLine: "underline", color: "#6B7280" }}
                  className="text-xs"
                >
                  Privacy Policy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

