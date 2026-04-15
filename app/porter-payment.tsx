/**
 * Porter Payment Screen
 * Uber-style payment selection for completed porter services
 */

import React, { useState, useCallback, useEffect } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ArrowLeft,
  Wallet,
  Clock,
} from "lucide-react-native";

import { usePorterPayment } from "@/hooks/usePorterPayment";
import {
  getPorterServiceById,
  type PorterServiceResponse,
} from "@/lib/api/porter";
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

export default function PorterPaymentScreen() {
  const { porterServiceId } = useLocalSearchParams<{
    porterServiceId: string;
  }>();
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
    startPolling,
    stopPolling,
  } = usePorterPayment({
    porterServiceId: porterServiceId || "",
    autoFetch: true,
  });

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null
  );
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [serviceWhenNoPayment, setServiceWhenNoPayment] =
    useState<PorterServiceResponse | null>(null);
  const [loadingService, setLoadingService] = useState(false);

  useEffect(() => {
    if (payment?.paymentMethod && !selectedMethod)
      setSelectedMethod(payment.paymentMethod);
  }, [payment?.paymentMethod, selectedMethod]);

  useEffect(() => {
    if (porterServiceId && !payment && !loading) {
      setLoadingService(true);
      getPorterServiceById(porterServiceId)
        .then((res) => {
          if (res.success && res.data?.porterService)
            setServiceWhenNoPayment(res.data.porterService);
        })
        .finally(() => setLoadingService(false));
    } else {
      setServiceWhenNoPayment(null);
    }
  }, [porterServiceId, payment, loading]);

  // Start polling on mount so we detect when driver confirms payment
  useEffect(() => {
    if (porterServiceId && !isPaymentComplete) {
      startPolling();
    }
    return () => stopPolling();
  }, [porterServiceId, isPaymentComplete, startPolling, stopPolling]);

  useEffect(() => {
    if (isPaymentComplete)
      router.replace({
        pathname: "/porter-payment-status",
        params: { porterServiceId },
      });
  }, [isPaymentComplete, porterServiceId]);

  const fareAmount = payment?.fareAmount ?? serviceWhenNoPayment?.fare ?? 0;
  const canPayWithWalletNoPayment = !payment
    ? walletBalance >= fareAmount
    : canPayWithWallet;

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
    const goToStatus = () => {
      router.replace({
        pathname: "/porter-payment-status",
        params: { porterServiceId },
      });
    };
    try {
      if (selectedMethod === "WALLET") {
        const result = await selectPaymentMethod("WALLET");
        if (result) goToStatus();
      } else if (selectedMethod === "ONLINE") {
        const selectionResult = await selectPaymentMethod("ONLINE");
        if (!selectionResult || !selectionResult.order) {
          setLocalError("Failed to create payment order");
          setProcessing(false);
          return;
        }
        const order = selectionResult.order;
        const checkoutResult = await openCheckout({
          orderId: order.razorpayOrderId,
          keyId: order.keyId,
          amountPaise: order.amountPaise,
          currency: order.currency,
          description: `Parcel Payment ₹${payment?.fareAmount ?? fareAmount}`,
          prefill: { name: user?.fullName || "", contact: user?.phone || "" },
        });
        if (checkoutResult.success) {
          startPolling();
          goToStatus();
        } else {
          if (!isUserCancellation(checkoutResult))
            setLocalError(getErrorMessage(checkoutResult));
        }
      } else if (selectedMethod === "CASH") {
        const result = await selectPaymentMethod("CASH");
        if (result) goToStatus();
      }
    } catch (err) {
      console.error("[PorterPayment] Payment error:", err);
      setLocalError("Failed to process payment");
    } finally {
      setProcessing(false);
    }
  }, [
    selectedMethod,
    selectPaymentMethod,
    user,
    startPolling,
    porterServiceId,
    payment,
    fareAmount,
  ]);

  if (
    (loading && !payment) ||
    loadingService ||
    (loading && !serviceWhenNoPayment && !payment)
  ) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View
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
              fontFamily: "Figtree_500Medium",
              fontSize: 14,
              color: "#9CA3AF",
              marginTop: 12,
            }}
          >
            Loading payment details...
          </Text>
        </View>
      </>
    );
  }

  const activeFare = payment?.fareAmount ?? fareAmount;
  const activeCanPayWallet = payment
    ? canPayWithWallet
    : canPayWithWalletNoPayment;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
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
            paddingVertical: 14,
            backgroundColor: "#FFF",
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            disabled={processing}
            activeOpacity={0.7}
            style={{ marginRight: 12 }}
          >
            <ArrowLeft size={24} color={processing ? "#D1D5DB" : "#111827"} />
          </TouchableOpacity>
          <Text
            style={{
              fontFamily: "Figtree_700Bold",
              fontSize: 20,
              color: "#111827",
            }}
          >
            Complete Payment
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
        >
          {/* Fare Card */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 16,
              padding: 18,
              backgroundColor: BRAND_ORANGE,
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_500Medium",
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                marginBottom: 4,
              }}
            >
              {payment ? "Fare Summary" : "Amount due"}
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
                  fontSize: 14,
                  color: "#FFFFFF",
                }}
              >
                Total Fare
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 24,
                  color: "#FFFFFF",
                }}
              >
                {formatAmount(activeFare)}
              </Text>
            </View>
          </View>

          {/* Wallet Balance */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 12,
              padding: 14,
              backgroundColor: "#FFFFFF",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#FED7AA",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Wallet size={20} color={BRAND_ORANGE} />
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#9A3412",
                  marginLeft: 8,
                }}
              >
                Your Wallet
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 16,
                color: "#9A3412",
              }}
            >
              {formatAmount(walletBalance)}
            </Text>
          </View>

          {/* Driver waiting info */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 12,
              padding: 12,
              backgroundColor: "#FFFBEB",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#FEF3C7",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Clock size={18} color="#D97706" />
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 13,
                color: "#92400E",
                marginLeft: 8,
                flex: 1,
              }}
            >
              Your driver is waiting for payment confirmation.
            </Text>
          </View>

          {/* Payment Methods */}
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 14,
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
              disabled={!activeCanPayWallet}
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

          {(error || localError) && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 16,
                padding: 16,
                backgroundColor: "#FEF2F2",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#FECACA",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#EF4444",
                  textAlign: "center",
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
            paddingBottom: insets.bottom + 16,
            backgroundColor: "#FFF",
            borderTopWidth: 1,
            borderTopColor: "#E5E7EB",
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
            disabled={!selectedMethod || processing}
            activeOpacity={0.85}
            style={{
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: "center",
              backgroundColor:
                selectedMethod && !processing ? BRAND_ORANGE : "#D1D5DB",
            }}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 16,
                  color: selectedMethod ? "#FFF" : "#9CA3AF",
                }}
              >
                {selectedMethod === "CASH"
                  ? "Confirm Cash Payment"
                  : `Pay ${formatAmount(activeFare)}`}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}
