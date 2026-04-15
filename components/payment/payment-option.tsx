import React from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity } from "react-native";
import {
  Wallet,
  CreditCard,
  Banknote,
  type LucideIcon,
} from "lucide-react-native";

import { type PaymentMethod } from "@/lib/api/payment";

const BRAND_ORANGE = "#F36D14";

const PAYMENT_ICONS: Record<PaymentMethod, LucideIcon> = {
  WALLET: Wallet,
  ONLINE: CreditCard,
  CASH: Banknote,
};

interface PaymentOptionProps {
  method: PaymentMethod;
  label: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSelect: () => void;
}

export function PaymentOption({
  method,
  label,
  description,
  selected,
  disabled,
  disabledReason,
  onSelect,
}: PaymentOptionProps) {
  const Icon = PAYMENT_ICONS[method] || CreditCard;

  return (
    <TouchableOpacity
      onPress={onSelect}
      disabled={disabled}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? BRAND_ORANGE : "#E5E7EB",
        backgroundColor: selected ? BRAND_ORANGE : disabled ? "#F9FAFB" : "#FFF",
        marginBottom: 12,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? "#FFF" : "#D1D5DB",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
          backgroundColor: selected ? "#FFF" : "transparent",
        }}
      >
        {selected && (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: BRAND_ORANGE,
            }}
          />
        )}
      </View>

      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: selected ? "rgba(255,255,255,0.2)" : "#F3F4F6",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <Icon size={20} color={selected ? "#FFF" : "#6B7280"} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            color: disabled ? "#9CA3AF" : selected ? "#FFF" : "#111827",
            fontFamily: "Figtree_600SemiBold",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: selected ? "rgba(255,255,255,0.9)" : "#9CA3AF",
            marginTop: 2,
            fontFamily: "Figtree_400Regular",
          }}
        >
          {disabled && disabledReason ? disabledReason : description}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
