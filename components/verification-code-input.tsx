/**
 * Verification Code Input Component
 * Allows drivers to enter 4-digit verification code
 * Used for Ride, Parcel, and Ride Share services
 *
 * Styled to match the login OTP input (white boxes with brand-colored borders)
 */

import React, { useState, useRef } from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export interface VerificationCodeInputProps {
  onVerify: (code: string) => Promise<void>;
  serviceType?: "ride" | "porter" | "carpool";
  error?: string | null;
  loading?: boolean;
  className?: string;
}

export function VerificationCodeInput({
  onVerify,
  serviceType = "ride",
  error,
  loading = false,
  className,
}: VerificationCodeInputProps) {
  const { userType } = useAuth();
  const toast = useToast();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const [code, setCode] = useState("");
  const hiddenInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const getServiceLabel = () => {
    switch (serviceType) {
      case "porter":
        return "package pickup";
      case "carpool":
        return "pool start";
      default:
        return "ride start";
    }
  };

  const handleChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, 4);
    setCode(digits);

    if (digits.length === 4) {
      handleVerify(digits);
    }
  };

  const handlePress = () => {
    // Force a fresh focus cycle so Android re-opens keyboard
    // after manual dismiss while field remains logically focused.
    hiddenInputRef.current?.blur();
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 10);
  };

  const handleVerify = async (codeToVerify?: string) => {
    const codeString = codeToVerify || code;

    if (codeString.length !== 4) {
      toast.warning("Please enter a 4-digit verification code");
      return;
    }

    try {
      await onVerify(codeString);
      setCode("");
    } catch {
      // Error handling is done by parent component
    }
  };

  const codeArray = code.split("");

  return (
    <View className={cn("w-full", className)}>
      <View className="mb-4">
        <Text
          className="text-sm font-medium text-gray-700 mb-1"
          style={{ fontFamily: "Figtree_600SemiBold" }}
        >
          Enter Verification Code
        </Text>
        <Text
          className="text-xs text-gray-500"
          style={{ fontFamily: "Figtree_400Regular" }}
        >
          Get the 4-digit code from the{" "}
          {serviceType === "porter" ? "customer" : "passenger"} to{" "}
          {getServiceLabel()}
        </Text>
      </View>

      {/* Hidden input for keyboard */}
      <TextInput
        ref={hiddenInputRef}
        value={code}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={4}
        showSoftInputOnFocus={true}
        editable={!loading}
        style={{
          position: "absolute",
          opacity: 0,
          height: 1,
          width: 1,
        }}
      />

      {/* Visual code boxes – matches login OTP style */}
      <Pressable onPress={handlePress}>
        <View
          className="flex-row items-center justify-center mb-4"
          pointerEvents="none"
        >
          {Array.from({ length: 4 }).map((_, index) => {
            const digit = codeArray[index] || "";
            const isFocused = code.length === index;

            return (
              <View
                key={index}
                style={{
                  width: 56,
                  height: 64,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: error ? "#EF4444" : brandColor,
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginHorizontal: 6,
                }}
              >
                <Text
                  style={{
                    fontSize: 24,
                    fontFamily: "Figtree_700Bold",
                    color: "#111827",
                  }}
                >
                  {digit}
                </Text>
                {isFocused && !digit && (
                  <View
                    style={{
                      position: "absolute",
                      width: 2,
                      height: 24,
                      backgroundColor: brandColor,
                      borderRadius: 1,
                    }}
                  />
                )}
              </View>
            );
          })}
        </View>
      </Pressable>

      {/* Error Message */}
      {error && (
        <View
          className="flex-row items-center mb-3 p-3 rounded-lg"
          style={{ backgroundColor: "#FEF2F2" }}
        >
          <Ionicons name="alert-circle" size={18} color="#EF4444" />
          <Text className="text-red-600 text-sm ml-2 flex-1">{error}</Text>
        </View>
      )}

      {/* Verify Button */}
      <TouchableOpacity
        onPress={() => handleVerify()}
        disabled={loading || code.length !== 4}
        style={{
          backgroundColor:
            loading || code.length !== 4 ? "#D1D5DB" : brandColor,
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontFamily: "Figtree_600SemiBold",
            fontSize: 15,
          }}
        >
          {loading ? "Verifying..." : "Verify Code"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
