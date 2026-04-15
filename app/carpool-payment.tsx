/**
 * Car Pool Payment Screen
 * Allows passengers to select and process payment for their car pool seat
 *
 * Payment Methods:
 * - Wallet: Instant debit from passenger wallet
 * - Online: Razorpay payment gateway (handled inside createOnlinePaymentOrder)
 * - Cash: Passenger pays driver directly
 */

import { useState, useCallback, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Wallet, Clock, AlertCircle } from "lucide-react-native";

import { useCarPoolPayment } from "@/hooks/useCarPoolPayment";
import { formatAmount } from "@/lib/api/wallet";
import { type PaymentMethod } from "@/lib/api/payment";
import { PaymentOption } from "@/components/payment/payment-option";

const BRAND_ORANGE = "#F36D14";

// ============================================
// Main Component
// ============================================

export default function CarPoolPaymentScreen() {
  const { carPoolId, memberId } = useLocalSearchParams<{
    carPoolId: string;
    memberId: string;
  }>();

  const {
    payment,
    walletBalance,
    loading,
    error,
    canPayWithWallet,
    isPaymentComplete,
    selectPaymentMethod,
    processWalletPayment,
    createOnlinePaymentOrder,
    startPolling,
    stopPolling,
  } = useCarPoolPayment({
    carPoolId: carPoolId || "",
    memberId: memberId || "",
    autoFetch: true,
  });

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null
  );
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSafeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  }, []);

  // Sync selected method from payment state
  useEffect(() => {
    if (payment?.paymentMethod && !selectedMethod) {
      setSelectedMethod(payment.paymentMethod);
    }
  }, [payment?.paymentMethod, selectedMethod]);

  // Start polling on mount so we detect when driver confirms payment
  useEffect(() => {
    if (memberId && !isPaymentComplete) {
      startPolling();
    }
    return () => stopPolling();
  }, [memberId, isPaymentComplete, startPolling, stopPolling]);

  // Auto-navigate to payment status when payment is complete
  useEffect(() => {
    if (isPaymentComplete) {
      router.replace({
        pathname: "/carpool-payment-status",
        params: { carPoolId, memberId },
      });
    }
  }, [isPaymentComplete, carPoolId, memberId]);

  const handleSelectMethod = useCallback((method: PaymentMethod) => {
    setSelectedMethod(method);
    setLocalError(null);
  }, []);

  const handlePayNow = useCallback(async () => {
    if (!selectedMethod) {
      setLocalError("Please select a payment method");
      return;
    }

    setProcessing(true);
    setLocalError(null);

    try {
      if (selectedMethod === "WALLET") {
        const result = await selectPaymentMethod("WALLET");
        if (!result) return;
        await processWalletPayment();
        router.replace({
          pathname: "/carpool-payment-status",
          params: { carPoolId, memberId },
        });
      } else if (selectedMethod === "ONLINE") {
        const order = await createOnlinePaymentOrder();
        if (order) {
          router.replace({
            pathname: "/carpool-payment-status",
            params: { carPoolId, memberId },
          });
        }
      } else if (selectedMethod === "CASH") {
        const result = await selectPaymentMethod("CASH");
        if (result) {
          router.replace({
            pathname: "/carpool-payment-status",
            params: { carPoolId, memberId },
          });
        }
      }
    } catch (err) {
      console.error("[CarPoolPayment] Payment error:", err);
      setLocalError("Failed to process payment");
    } finally {
      setProcessing(false);
    }
  }, [
    selectedMethod,
    selectPaymentMethod,
    processWalletPayment,
    createOnlinePaymentOrder,
    carPoolId,
    memberId,
  ]);

  // Loading state
  if (loading && !payment) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={BRAND_ORANGE} />
        <Text
          style={{
            color: "#6B7280",
            marginTop: 16,
            fontFamily: "Figtree_400Regular",
            fontSize: 15,
          }}
        >
          Loading payment details...
        </Text>
      </SafeAreaView>
    );
  }

  // No payment found
  if (!payment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
            backgroundColor: "#FFFFFF",
          }}
        >
          <TouchableOpacity onPress={handleSafeBack}>
            <ArrowLeft size={24} color={BRAND_ORANGE} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 20,
              fontFamily: "Figtree_700Bold",
              color: "#111827",
              marginLeft: 12,
            }}
          >
            Payment
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
          }}
        >
          <AlertCircle size={64} color="#9CA3AF" />
          <Text
            style={{
              color: "#6B7280",
              marginTop: 16,
              textAlign: "center",
              fontFamily: "Figtree_400Regular",
              fontSize: 15,
            }}
          >
            Payment information not available
          </Text>
          <TouchableOpacity
            onPress={handleSafeBack}
            style={{
              marginTop: 16,
              paddingHorizontal: 24,
              paddingVertical: 14,
              backgroundColor: BRAND_ORANGE,
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontFamily: "Figtree_600SemiBold",
                fontSize: 15,
              }}
            >
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      edges={["top"]}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: "#E5E7EB",
          backgroundColor: "#FFFFFF",
        }}
      >
        <TouchableOpacity onPress={handleSafeBack} disabled={processing}>
          <ArrowLeft size={24} color={processing ? "#D1D5DB" : BRAND_ORANGE} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            fontFamily: "Figtree_700Bold",
            color: "#111827",
            marginLeft: 12,
          }}
        >
          Complete Payment
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Fare Summary */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 16,
            padding: 18,
            backgroundColor: BRAND_ORANGE,
            borderRadius: 16,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Figtree_500Medium",
              color: "rgba(255,255,255,0.85)",
              marginBottom: 8,
            }}
          >
            Fare Summary
          </Text>

          {typeof payment.discountApplied === "number" &&
            payment.discountApplied > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    color: "#FFFFFF",
                    fontSize: 15,
                  }}
                >
                  Discount
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: "Figtree_600SemiBold",
                    color: "#FFFFFF",
                  }}
                >
                  -{formatAmount(payment.discountApplied)}
                </Text>
              </View>
            )}

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 8,
            }}
          >
            <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  color: "#FFFFFF",
                  fontSize: 15,
                }}
              >
                Your Fare
            </Text>
            <Text
                style={{
                  fontSize: 26,
                  fontFamily: "Figtree_700Bold",
                  color: "#FFFFFF",
                }}
              >
                {formatAmount(payment.fareAmount)}
              </Text>
            </View>
        </View>

        {/* Wallet Balance */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 16,
            padding: 16,
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#FED7AA",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Wallet size={20} color={BRAND_ORANGE} />
              <Text
                style={{
                  color: "#9A3412",
                  marginLeft: 8,
                  fontFamily: "Figtree_500Medium",
                  fontSize: 15,
                }}
              >
                Your Wallet
              </Text>
            </View>
            <Text
              style={{
                fontSize: 18,
                fontFamily: "Figtree_700Bold",
                color: "#9A3412",
              }}
            >
              {formatAmount(walletBalance)}
            </Text>
          </View>
        </View>

        {/* Driver waiting info */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 16,
            padding: 12,
            backgroundColor: "#FFFBEB",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#FDE68A",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Clock size={18} color="#D97706" />
          <Text
            style={{
              color: "#92400E",
              fontSize: 14,
              marginLeft: 8,
              flex: 1,
              fontFamily: "Figtree_400Regular",
            }}
          >
            Your driver is waiting for payment confirmation.
          </Text>
        </View>

        {/* Payment Methods */}
        <View style={{ marginHorizontal: 16, marginTop: 24 }}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: "Figtree_600SemiBold",
              color: "#111827",
              marginBottom: 12,
            }}
          >
            Select Payment Method
          </Text>

          <PaymentOption
            method="WALLET"
            label="Wallet"
            description="Pay instantly from wallet balance"
            selected={selectedMethod === "WALLET"}
            disabled={!canPayWithWallet}
            disabledReason="Insufficient balance"
            onSelect={() => handleSelectMethod("WALLET")}
          />

          <PaymentOption
            method="ONLINE"
            label="Online Payment"
            description="Pay via UPI, Card, Net Banking"
            selected={selectedMethod === "ONLINE"}
            disabled={false}
            onSelect={() => handleSelectMethod("ONLINE")}
          />

          <PaymentOption
            method="CASH"
            label="Cash"
            description="Pay cash directly to driver"
            selected={selectedMethod === "CASH"}
            disabled={false}
            onSelect={() => handleSelectMethod("CASH")}
          />
        </View>

        {/* Error Messages */}
        {(error || localError) && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 16,
              padding: 16,
              backgroundColor: "#FEF2F2",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#FECACA",
            }}
          >
            <Text
              style={{
                color: "#DC2626",
                textAlign: "center",
                fontFamily: "Figtree_500Medium",
                fontSize: 14,
              }}
            >
              {localError || error}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Pay Now Button */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          paddingBottom: Platform.OS === "ios" ? 32 : 16,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
        }}
      >
        <TouchableOpacity
          onPress={handlePayNow}
          disabled={!selectedMethod || processing}
          style={{
            paddingVertical: 16,
            borderRadius: 14,
            backgroundColor:
              selectedMethod && !processing ? BRAND_ORANGE : "#D1D5DB",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text
              style={{
                textAlign: "center",
                fontSize: 18,
                fontFamily: "Figtree_600SemiBold",
                color: selectedMethod ? "#FFFFFF" : "#6B7280",
              }}
            >
              {selectedMethod === "CASH"
                ? "Confirm Cash Payment"
                : `Pay ${formatAmount(payment.fareAmount)}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
