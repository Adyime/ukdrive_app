/**
 * Ride Payment Screen
 * Uber-style white payment screen
 */

import { useState, useCallback, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ArrowLeft,
  Wallet,
  Clock,
  AlertCircle,
} from "lucide-react-native";

import { useRidePayment } from "@/hooks/useRidePayment";
import { formatAmount } from "@/lib/api/wallet";
import { type PaymentMethod } from "@/lib/api/payment";
import {
  openCheckout,
  isUserCancellation,
  getErrorMessage,
} from "@/lib/services/razorpay";
import { useAuth } from "@/context/auth-context";
import { PaymentOption } from "@/components/payment/payment-option";

const BRAND_ORANGE = "#F36D14";

export default function RidePaymentScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const {
    payment,
    walletBalance,
    loading,
    error,
    canPayWithWallet,
    isPaymentComplete,
    selectPaymentMethod,
    processWalletPayment,
    startPolling,
    stopPolling,
  } = useRidePayment({ rideId: rideId || "", autoFetch: true });

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

  useEffect(() => {
    if (payment?.paymentMethod && !selectedMethod) {
      setSelectedMethod(payment.paymentMethod);
    }
  }, [payment?.paymentMethod, selectedMethod]);

  // Start polling on mount so we detect when driver confirms payment
  useEffect(() => {
    if (rideId && !isPaymentComplete) {
      startPolling();
    }
    return () => stopPolling();
  }, [rideId, isPaymentComplete, startPolling, stopPolling]);

  useEffect(() => {
    if (isPaymentComplete) {
      router.replace({ pathname: "/payment-status", params: { rideId } });
    }
  }, [isPaymentComplete, rideId]);

  useEffect(() => {
    if (
      payment?.paymentMethod === "CASH" &&
      payment?.status === "PENDING" &&
      rideId
    ) {
      router.replace({ pathname: "/payment-status", params: { rideId } });
    }
  }, [payment?.paymentMethod, payment?.status, rideId]);

  const handleSelectMethod = useCallback((method: PaymentMethod) => {
    setSelectedMethod(method);
    setLocalError(null);
  }, []);

  const handleWalletPayment = useCallback(async () => {
    if (selectedMethod !== "WALLET") return;
    setProcessing(true);
    setLocalError(null);
    try {
      const selectionResult = await selectPaymentMethod("WALLET");
      if (!selectionResult) {
        setProcessing(false);
        return;
      }
      const success = await processWalletPayment();
      if (success) {
        router.replace({ pathname: "/payment-status", params: { rideId } });
      }
    } catch {
      setLocalError("Failed to process payment");
    } finally {
      setProcessing(false);
    }
  }, [selectedMethod, selectPaymentMethod, processWalletPayment, rideId]);

  const handleOnlinePayment = useCallback(async () => {
    if (selectedMethod !== "ONLINE" || !payment) return;
    setProcessing(true);
    setLocalError(null);
    try {
      const selectionResult = await selectPaymentMethod("ONLINE");
      if (!selectionResult || !selectionResult.paymentOrder) {
        setLocalError("Failed to create payment order");
        setProcessing(false);
        return;
      }
      const order = selectionResult.paymentOrder;
      const checkoutResult = await openCheckout({
        orderId: order.razorpayOrderId,
        keyId: order.keyId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        description: `Ride Payment ₹${payment.fareAmount}`,
        prefill: { name: user?.fullName || "", contact: user?.phone || "" },
      });
      if (checkoutResult.success) {
        startPolling();
        router.replace({ pathname: "/payment-status", params: { rideId } });
      } else {
        if (!isUserCancellation(checkoutResult)) {
          setLocalError(getErrorMessage(checkoutResult));
        }
      }
    } catch {
      setLocalError("Failed to process payment");
    } finally {
      setProcessing(false);
    }
  }, [
    selectedMethod,
    payment,
    selectPaymentMethod,
    user,
    startPolling,
    rideId,
  ]);

  const handleCashPayment = useCallback(async () => {
    if (selectedMethod !== "CASH") return;
    setProcessing(true);
    setLocalError(null);
    try {
      const selectionResult = await selectPaymentMethod("CASH");
      if (selectionResult) {
        router.replace({ pathname: "/payment-status", params: { rideId } });
      }
    } catch {
      setLocalError("Failed to select cash payment");
    } finally {
      setProcessing(false);
    }
  }, [selectedMethod, selectPaymentMethod, rideId]);

  const handlePayNow = useCallback(async () => {
    if (!selectedMethod) {
      setLocalError("Please select a payment method");
      return;
    }
    if (selectedMethod === "WALLET") await handleWalletPayment();
    else if (selectedMethod === "ONLINE") await handleOnlinePayment();
    else if (selectedMethod === "CASH") await handleCashPayment();
  }, [
    selectedMethod,
    handleWalletPayment,
    handleOnlinePayment,
    handleCashPayment,
  ]);

  // Loading
  if (loading && !payment) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#FFF",
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
          }}
        >
          Loading payment details...
        </Text>
      </SafeAreaView>
    );
  }

  // No payment
  if (!payment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderColor: "#F3F4F6",
          }}
        >
          <TouchableOpacity
            onPress={handleSafeBack}
            style={{ marginRight: 12 }}
          >
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              color: "#111827",
              fontFamily: "Figtree_700Bold",
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
            padding: 24,
          }}
        >
          <AlertCircle size={48} color="#9CA3AF" />
          <Text
            style={{
              color: "#6B7280",
              marginTop: 16,
              textAlign: "center",
              fontFamily: "Figtree_400Regular",
            }}
          >
            Payment information not available
          </Text>
          <TouchableOpacity
            onPress={handleSafeBack}
            style={{
              marginTop: 16,
              paddingHorizontal: 24,
              paddingVertical: 12,
              backgroundColor: BRAND_ORANGE,
              borderRadius: 16,
            }}
          >
            <Text style={{ color: "#FFF", fontFamily: "Figtree_600SemiBold" }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const canPay = !!selectedMethod && !processing;

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
          backgroundColor: "#FFF",
          borderBottomWidth: 1,
          borderColor: "#E5E7EB",
        }}
      >
        <TouchableOpacity
          onPress={handleSafeBack}
          disabled={processing}
          style={{ marginRight: 12 }}
        >
          <ArrowLeft size={24} color={processing ? "#D1D5DB" : "#111827"} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            color: "#111827",
            fontFamily: "Figtree_700Bold",
          }}
        >
          Complete Payment
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Fare Hero Card */}
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 16,
            borderRadius: 14,
            backgroundColor: BRAND_ORANGE,
            padding: 18,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              marginBottom: 4,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Fare Summary
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 15,
                color: "#FFFFFF",
              }}
            >
              Total Fare
            </Text>
            <Text
              style={{
                fontSize: 28,
                color: "#FFFFFF",
                marginBottom: 2,
                fontFamily: "Figtree_700Bold",
              }}
            >
              {formatAmount(payment.fareAmount)}
            </Text>
          </View>
          {typeof payment.discountApplied === "number" &&
            payment.discountApplied > 0 && (
              <View
                style={{
                  marginTop: 8,
                  alignSelf: "flex-start",
                  backgroundColor: "rgba(255,255,255,0.2)",
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: "#FFFFFF",
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Discount saved: {formatAmount(payment.discountApplied)}
                </Text>
              </View>
            )}
        </View>

        {/* Wallet Balance */}
        <View
          style={{
                marginHorizontal: 16,
                marginBottom: 12,
                marginTop: 12,
                borderRadius: 14,
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#FED7AA",
                padding: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Wallet size={20} color={BRAND_ORANGE} />
            <Text
              style={{
                fontSize: 14,
                color: "#9A3412",
                marginLeft: 8,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              Your Wallet
            </Text>
          </View>
          <Text
            style={{
              fontSize: 17,
              color: "#9A3412",
              fontFamily: "Figtree_700Bold",
            }}
          >
            {formatAmount(walletBalance)}
          </Text>
        </View>

        {/* Driver waiting banner */}
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 20,
            borderRadius: 14,
            backgroundColor: "#FFFBEB",
            borderWidth: 1,
            borderColor: "#FEF3C7",
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
              <Clock size={16} color="#D97706" />
          <Text
            style={{
              fontSize: 13,
              color: "#92400E",
              marginLeft: 10,
              flex: 1,
              fontFamily: "Figtree_500Medium",
            }}
          >
            Your driver is waiting for payment confirmation.
          </Text>
        </View>

        {/* Payment Methods */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text
            style={{
            fontSize: 15,
            color: "#111827",
            marginBottom: 12,
            fontFamily: "Figtree_600SemiBold",
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

        {/* Error */}
        {(error || localError) && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 8,
              padding: 12,
              backgroundColor: "#FEF2F2",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#FECACA",
            }}
          >
            <Text
              style={{
                color: "#DC2626",
                textAlign: "center",
                fontSize: 13,
                fontFamily: "Figtree_400Regular",
              }}
            >
              {localError || error}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky Pay Button */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: 16,
          paddingBottom: insets.bottom + 16,
          backgroundColor: "#FFF",
          borderTopWidth: 1,
          borderColor: "#E5E7EB",
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
            },
            android: { elevation: 8 },
          }),
        }}
      >
        <TouchableOpacity
          onPress={handlePayNow}
          disabled={!canPay}
          style={{
            paddingVertical: 16,
            borderRadius: 16,
            backgroundColor: canPay ? BRAND_ORANGE : "#D1D5DB",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text
              style={{
                fontSize: 17,
                color: canPay ? "#FFF" : "#9CA3AF",
                fontFamily: "Figtree_700Bold",
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
