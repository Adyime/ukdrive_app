/**
 * Input Component
 * Styled to match OTP input: border-2, rounded-lg, white bg, black text.
 */

import React, { useState } from "react";
import { TextInputProps, View } from "react-native";
import { cn } from "@/lib/utils";
import { LocalizedText as Text } from "@/components/localized-text";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";

const DEFAULT_BORDER_COLOR = "#843FE3";
const UNFOCUSED_BORDER = "#D1D5DB";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  className?: string;
  containerClassName?: string;
  /** Border color when focused (matches OTP focusColor, e.g. orange passenger, purple driver) */
  focusColor?: string;
}

export function Input({
  label,
  error,
  className,
  containerClassName,
  focusColor = DEFAULT_BORDER_COLOR,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? "#ef4444"
    : isFocused
    ? focusColor
    : UNFOCUSED_BORDER;

  return (
    <View className={cn("w-full", containerClassName)}>
      {label && (
        <Text className="text-sm font-medium mb-2" style={{ color: "#000" }}>
          {label}
        </Text>
      )}
      <TextInput
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        className={cn("w-full px-4 py-3 rounded-lg border-2", className)}
        style={{
          backgroundColor: "#fff",
          borderColor,
          borderWidth: 2,
          borderRadius: 8,
          color: "#000",
          fontSize: 16,
        }}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
      {error && <Text className="text-sm text-red-500 mt-1">{error}</Text>}
    </View>
  );
}
