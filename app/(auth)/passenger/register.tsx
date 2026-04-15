/**
 * Passenger Register Screen
 * Complete registration for new passengers
 */

import { useState, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/ui/loading";
import { registerPassenger, type GenderOption } from "@/lib/api/auth";
import { useAuth } from "@/context/auth-context";

const BRAND_ORANGE = "#F36D14";
const GENDER_OPTIONS: GenderOption[] = ["Male", "Female", "Others"];

export default function PassengerRegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone, registrationToken } = useLocalSearchParams<{
    phone: string;
    registrationToken: string;
  }>();
  const { login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<GenderOption | "">("");
  const [email, setEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [errors, setErrors] = useState<{
    fullName?: string;
    gender?: string;
    email?: string;
    general?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const bottomFormPadding =
    Platform.OS === "android"
      ? Math.max(insets.bottom + 20, 64)
      : insets.bottom + 20;

  useEffect(() => {
    if (!phone || !registrationToken) {
      router.replace("/(auth)/passenger/send-otp");
    }
  }, [phone, registrationToken, router]);

  const validateForm = (): boolean => {
    const newErrors: { fullName?: string; gender?: string; email?: string } = {};

    if (!fullName.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = "Name must be at least 2 characters";
    }

    if (!gender) {
      newErrors.gender = "Gender is required";
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        newErrors.email = "Please enter a valid email address";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!phone || !registrationToken) return;

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const payload: Parameters<typeof registerPassenger>[0] = {
        fullName: fullName.trim(),
        phone,
        gender: gender as GenderOption,
        email: email.trim() || undefined,
      };
      const trimmedCode = referralCode.trim();
      if (trimmedCode.length > 0) {
        payload.referralCode = trimmedCode;
      }

      const response = await registerPassenger(payload, registrationToken);

      if (response.success && response.data) {
        const data = response.data as any;

        if (data.tokens && data.user) {
          await login(data.tokens, data.user, "passenger");
          router.replace("/(tabs)");
        }
      } else {
        // Extract field-specific validation errors
        const apiError = response.error as
          | {
              code?: string;
              message?: string;
              details?: Array<{ field: string; message: string }>;
            }
          | undefined;
        const newErrors: {
          fullName?: string;
          gender?: string;
          email?: string;
          general?: string;
        } = {};
        let generalMessage =
          apiError?.message || "Registration failed. Please try again.";

        // Check if we have validation error details
        if (
          apiError?.code === "VALIDATION_ERROR" &&
          apiError.details &&
          Array.isArray(apiError.details)
        ) {
          // Map validation errors to form fields
          apiError.details.forEach((detail) => {
            if (detail.field && detail.message) {
              const fieldName = detail.field as keyof typeof newErrors;
              if (
                fieldName === "fullName" ||
                fieldName === "gender" ||
                fieldName === "email"
              ) {
                newErrors[fieldName] = detail.message;
              }
            }
          });

          // Update general message if we have field-specific errors
          if (Object.keys(newErrors).length > 0) {
            generalMessage = "Please fix the errors below and try again.";
          }
        }

        setErrors({
          ...newErrors,
          general: generalMessage,
        });
      }
    } catch {
      setErrors({
        general: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!phone || !registrationToken) {
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
          contentContainerStyle={{
            paddingTop: 20,
            paddingBottom: bottomFormPadding,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-8">
            <Text
              style={{ fontFamily: "Figtree_600SemiBold" }}
              className="text-2xl text-gray-900 mb-2"
            >
              Complete Registration
            </Text>
            <Text
              style={{ fontFamily: "Figtree_400Regular" }}
              className="text-base text-gray-600"
            >
              Please provide your details to continue
            </Text>
          </View>

          <Input
            label="Full Name"
            placeholder="Enter your Name"
            value={fullName}
            onChangeText={setFullName}
            error={errors.fullName}
            className="mb-4"
            autoCapitalize="words"
            focusColor={BRAND_ORANGE}
          />

          <Input
            label="Email (Optional)"
            placeholder="email@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
            className="mb-4"
            focusColor={BRAND_ORANGE}
          />

          <View className="mb-4">
            <Text
              style={{ fontFamily: "Figtree_500Medium" }}
              className="mb-2 text-sm text-gray-700"
            >
              Gender
            </Text>
            <View className="flex-row flex-wrap">
              {GENDER_OPTIONS.map((option) => {
                const isSelected = gender === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setGender(option)}
                    activeOpacity={0.8}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      marginRight: 8,
                      marginBottom: 8,
                      borderWidth: 1.5,
                      borderColor: isSelected ? BRAND_ORANGE : "#D1D5DB",
                      backgroundColor: isSelected ? "#FFF2E8" : "#FFFFFF",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 14,
                        color: isSelected ? BRAND_ORANGE : "#374151",
                      }}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.gender && (
              <Text
                style={{ fontFamily: "Figtree_400Regular" }}
                className="text-sm text-red-500"
              >
                {errors.gender}
              </Text>
            )}
          </View>

          <Input
            label="Referral Code (Optional)"
            placeholder="e.g. UKD12345678"
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="characters"
            autoCorrect={false}
            className="mb-6"
            focusColor={BRAND_ORANGE}
          />

          {errors.general && (
            <Text
              style={{ fontFamily: "Figtree_400Regular" }}
              className="text-sm text-red-500 mb-4"
            >
              {errors.general}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading || !fullName.trim() || !gender}
            activeOpacity={0.8}
            style={{
              backgroundColor:
                loading || !fullName.trim() || !gender ? "#F9B994" : BRAND_ORANGE,
              borderRadius: 10,
              paddingVertical: 14,
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
                  className="text-base tracking-wide text-white"
                >
                  Complete Registration
                </Text>
              </View>
            ) : (
              <Text
                style={{ fontFamily: "Figtree_600SemiBold" }}
                className="text-base tracking-wide text-white"
              >
                Complete Registration
              </Text>
            )}
          </TouchableOpacity>

          {loading && <Loading message="Registering..." />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
