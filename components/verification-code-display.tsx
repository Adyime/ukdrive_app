/**
 * Verification Code Display Component
 * Shows 4-digit verification code to passengers/customers
 * Used for Ride, Parcel, and Ride Share services
 *
 * Clean light theme matching the login OTP input style
 */

import React, { useState, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export interface VerificationCodeDisplayProps {
  code: string;
  expiresAt?: string | Date | null;
  serviceType?: "ride" | "porter" | "carpool";
  className?: string;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
}

function getTimeRemaining(expiresAt: string | Date | null | undefined): {
  minutes: number;
  seconds: number;
  isExpired: boolean;
  hasExpiry: boolean;
} {
  if (!expiresAt) {
    return { minutes: 0, seconds: 0, isExpired: false, hasExpiry: false };
  }

  const expiry =
    typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();

  if (diff <= 0) {
    return { minutes: 0, seconds: 0, isExpired: true, hasExpiry: true };
  }

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return { minutes, seconds, isExpired: false, hasExpiry: true };
}

export function VerificationCodeDisplay({
  code,
  expiresAt,
  serviceType = "ride",
  className,
  onRefresh,
  refreshing = false,
}: VerificationCodeDisplayProps) {
  const { userType } = useAuth();
  const toast = useToast();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const lightBrandBg = userType === "driver" ? "#EDE4FB" : "#FFF0E8";

  const [timeRemaining, setTimeRemaining] = useState(
    getTimeRemaining(expiresAt)
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const remaining = getTimeRemaining(expiresAt);
      setTimeRemaining(remaining);
      if (remaining.isExpired) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy code to clipboard");
    }
  };

  const formatTime = (minutes: number, seconds: number): string => {
    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  const getServiceLabel = () => {
    switch (serviceType) {
      case "porter":
        return "Pickup Verification";
      case "carpool":
        return "Pool Verification";
      default:
        return "Ride Verification";
    }
  };

  const isExpired = timeRemaining.hasExpiry && timeRemaining.isExpired;

  return (
    <View
      className={cn(
        "bg-white rounded-2xl overflow-hidden border border-gray-100",
        className
      )}
    >
      {/* Header */}
      <View className="px-5 pt-5 pb-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View
              className="w-8 h-8 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: lightBrandBg }}
            >
              <Ionicons name="shield-checkmark" size={16} color={brandColor} />
            </View>
            <View>
              <Text
                className="text-gray-900 text-sm"
                style={{ fontFamily: "Figtree_600SemiBold" }}
              >
                {getServiceLabel()}
              </Text>
              <Text
                className="text-gray-500 text-xs"
                style={{ fontFamily: "Figtree_400Regular" }}
              >
                Share with your driver
              </Text>
            </View>
          </View>

          {!isExpired && (
            <View
              className="flex-row items-center px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "#ECFDF5" }}
            >
              <View className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
              <Text className="text-emerald-600 text-xs font-medium">
                Active
              </Text>
            </View>
          )}
          {isExpired && (
            <View
              className="flex-row items-center px-2.5 py-1 rounded-full"
              style={{ backgroundColor: "#FEF2F2" }}
            >
              <View className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />
              <Text className="text-red-600 text-xs font-medium">Expired</Text>
            </View>
          )}
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-gray-100 mx-5" />

      {/* Code Display */}
      <View className="px-5 py-6">
        <View className="flex-row items-center justify-center">
          {code.split("").map((digit, index) => (
            <View
              key={index}
              style={{
                width: 56,
                height: 64,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: isExpired ? "#D1D5DB" : brandColor,
                backgroundColor: isExpired ? "#F9FAFB" : "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                marginHorizontal: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontFamily: "Figtree_700Bold",
                  color: isExpired ? "#9CA3AF" : "#111827",
                }}
              >
                {digit}
              </Text>
            </View>
          ))}
        </View>

        {/* Timer or Status */}
        <View className="items-center mt-4">
          {timeRemaining.hasExpiry && !timeRemaining.isExpired && (
            <View className="flex-row items-center">
              <Ionicons name="time-outline" size={14} color="#6B7280" />
              <Text
                className="text-gray-500 text-xs ml-1.5"
                style={{ fontFamily: "Figtree_400Regular" }}
              >
                Valid for{" "}
                {formatTime(timeRemaining.minutes, timeRemaining.seconds)}
              </Text>
            </View>
          )}

          {!timeRemaining.hasExpiry && (
            <View className="flex-row items-center">
              <Ionicons name="checkmark-circle" size={14} color={brandColor} />
              <Text
                className="text-gray-500 text-xs ml-1.5"
                style={{ fontFamily: "Figtree_400Regular" }}
              >
                Valid until ride starts
              </Text>
            </View>
          )}

          {isExpired && (
            <Text
              className="text-gray-400 text-xs"
              style={{ fontFamily: "Figtree_400Regular" }}
            >
              This code is no longer valid
            </Text>
          )}
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-gray-100 mx-5" />

      {/* Actions */}
      <View className="px-5 py-4">
        {serviceType === "carpool" && isExpired && onRefresh && (
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            activeOpacity={0.7}
            style={{
              backgroundColor: refreshing ? "#F3F4F6" : brandColor,
              paddingVertical: 12,
              borderRadius: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={refreshing ? "#9CA3AF" : "#FFFFFF"}
            />
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 14,
                color: refreshing ? "#9CA3AF" : "#FFFFFF",
                marginLeft: 8,
              }}
            >
              {refreshing ? "Refreshing..." : "Generate New Code"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Copy Button */}
        <TouchableOpacity
          onPress={handleCopyCode}
          activeOpacity={0.7}
          disabled={isExpired}
          style={{
            backgroundColor: isExpired
              ? "#F9FAFB"
              : copied
              ? brandColor
              : lightBrandBg,
            paddingVertical: 12,
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={18}
            color={isExpired ? "#D1D5DB" : copied ? "#FFFFFF" : brandColor}
          />
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 14,
              color: isExpired ? "#D1D5DB" : copied ? "#FFFFFF" : brandColor,
              marginLeft: 8,
            }}
          >
            {copied ? "Copied to Clipboard" : "Copy Code"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Footer hint */}
      <View className="px-5 pb-4">
        <Text
          className="text-gray-400 text-xs text-center leading-4"
          style={{ fontFamily: "Figtree_400Regular" }}
        >
          Your driver will ask for this code to verify your identity before
          starting the ride
        </Text>
      </View>
    </View>
  );
}
