/**
 * OTP Input Component
 * 6-digit OTP input with individual boxes and SMS auto-fill support
 *
 * Auto-fill works via:
 * - iOS: textContentType="oneTimeCode" shows OTP suggestion above keyboard
 * - Android: autoComplete="sms-otp" enables Google's auto-fill
 */

import { cn } from "@/lib/utils";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

interface OtpInputProps {
  length?: number;
  onComplete: (otp: string) => void;
  error?: string;
  className?: string;
  /** Focus/border color for OTP boxes (e.g. orange for passenger, purple for driver) */
  focusColor?: string;
}

const DEFAULT_FOCUS_COLOR = "#843FE3";

export function OtpInput({
  length = 6,
  onComplete,
  error,
  className,
  focusColor = DEFAULT_FOCUS_COLOR,
}: OtpInputProps) {
  const [otp, setOtp] = useState("");
  const hiddenInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    // Focus input on mount
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  }, []);

  const handleChange = (text: string) => {
    // Only allow digits
    const digits = text.replace(/[^0-9]/g, "").slice(0, length);
    setOtp(digits);

    // Auto-submit when complete
    if (digits.length === length) {
      onComplete(digits);
    }
  };

  const handlePress = () => {
    // Force a fresh focus cycle so Android reliably re-opens keyboard
    // even if input is already focused but keyboard was manually dismissed.
    hiddenInputRef.current?.blur();
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 10);
  };

  // Split OTP into array for display
  const otpArray = otp.split("");

  return (
    <View className={cn("w-full", className)}>
      {/* Hidden input that receives auto-fill */}
      <TextInput
        ref={hiddenInputRef}
        value={otp}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={length}
        // iOS auto-fill
        textContentType="oneTimeCode"
        // Android auto-fill
        autoComplete="sms-otp"
        showSoftInputOnFocus={true}
        // Hide the actual input
        style={{
          position: "absolute",
          opacity: 0,
          height: 1,
          width: 1,
        }}
        // Accessibility
        accessibilityLabel="OTP input"
        accessibilityHint="Enter the 6-digit verification code"
      />

      {/* Visual OTP boxes */}
      <Pressable onPress={handlePress}>
        <View className="flex-row justify-between" pointerEvents="none">
          {Array.from({ length }).map((_, index) => {
            const digit = otpArray[index] || "";
            const isFocused = otp.length === index;

            return (
              <View
                key={index}
                className={cn(
                  "w-12 h-14 rounded-lg border-2 items-center justify-center",
                  "bg-white",
                  error && "border-red-500"
                )}
                style={{
                  backgroundColor: "#fff",
                  ...(!error ? { borderColor: focusColor } : {}),
                }}
              >
                <Text className={cn("text-xl font-semibold", "text-black")}>
                  {digit}
                </Text>
                {/* Cursor indicator */}
                {isFocused && !digit && (
                  <View
                    className="absolute w-0.5 h-6 animate-pulse"
                    style={{ backgroundColor: focusColor }}
                  />
                )}
              </View>
            );
          })}
        </View>
      </Pressable>

      {error && (
        <Text className="mt-2 text-sm text-center text-red-500">{error}</Text>
      )}
    </View>
  );
}
