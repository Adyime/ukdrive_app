/**
 * Car Pool Payment Status Screen
 * Mirrors the ride payment-status screen for consistent UX
 */

import { useState, useEffect, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
} from "lucide-react-native";

import { useToast } from "@/components/ui/toast";
import { useCarPoolPayment } from "@/hooks/useCarPoolPayment";
import { useAuth } from "@/context/auth-context";
import { formatAmount } from "@/lib/api/wallet";
import {
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getPaymentMethodLabel,
} from "@/lib/api/payment";
import type { RidePaymentStatus } from "@/lib/api/payment";

const BRAND_ORANGE = "#F36D14";

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "COMPLETED":
      return (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: "#F0FDF4",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircle size={56} color="#10B981" />
        </View>
      );
    case "FAILED":
      return (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: "#FEF2F2",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <XCircle size={56} color="#EF4444" />
        </View>
      );
    case "PROCESSING":
    case "AWAITING_ONLINE":
      return (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: "#FFF7F2",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 3,
            borderColor: BRAND_ORANGE,
          }}
        >
          <ActivityIndicator size="large" color={BRAND_ORANGE} />
        </View>
      );
    default:
      return (
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: "#FFFBEB",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Clock size={56} color="#F59E0B" />
        </View>
      );
  }
}

export default function CarPoolPaymentStatusScreen() {
  const toast = useToast();
  const { userType } = useAuth();
  const { carPoolId, memberId } = useLocalSearchParams<{
    carPoolId: string;
    memberId: string;
  }>();
  const [stuckPaymentDetected, setStuckPaymentDetected] = useState(false);

  const {
    payment,
    loading,
    error,
    refresh,
    startPolling,
    stopPolling,
    isPolling,
  } = useCarPoolPayment({
    carPoolId: carPoolId || "",
    memberId: memberId || "",
    autoFetch: true,
    pollingInterval: 2000,
  });

  useEffect(() => {
    if (
      payment?.status === "AWAITING_ONLINE" &&
      payment.paymentMethod === "ONLINE"
    ) {
      const timeoutId = setTimeout(() => setStuckPaymentDetected(true), 30000);
      return () => clearTimeout(timeoutId);
    } else {
      setStuckPaymentDetected(false);
    }
  }, [payment?.status, payment?.paymentMethod]);

  useEffect(() => {
    if (
      payment &&
      (payment.status === "AWAITING_ONLINE" || payment.status === "PROCESSING")
    ) {
      startPolling();
    }
    return () => stopPolling();
  }, [payment?.status, startPolling, stopPolling]);

  useEffect(() => {
    if (payment?.status === "COMPLETED" && userType === "passenger") {
      const timeoutId = setTimeout(() => {
        router.replace({
          pathname: "/thank-you",
          params: { serviceType: "carPool", carPoolId, memberId },
        });
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [carPoolId, memberId, payment?.status, userType]);

  useEffect(() => {
    if (
      userType === "passenger" &&
      payment?.paymentMethod === "CASH" &&
      payment?.status === "PENDING"
    ) {
      const timeoutId = setTimeout(() => {
        router.replace({
          pathname: "/thank-you",
          params: { serviceType: "carPool", carPoolId, memberId },
        });
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [carPoolId, memberId, payment?.paymentMethod, payment?.status, userType]);

  const handleDone = useCallback(() => {
    if (
      userType === "passenger" &&
      (payment?.status === "COMPLETED" ||
        (payment?.paymentMethod === "CASH" && payment?.status === "PENDING"))
    ) {
      router.replace({
        pathname: "/thank-you",
        params: { serviceType: "carPool", carPoolId, memberId },
      });
      return;
    }
    router.replace("/(tabs)");
  }, [carPoolId, memberId, payment?.paymentMethod, payment?.status, userType]);

  const handleRetry = useCallback(() => {
    router.replace({
      pathname: "/carpool-payment",
      params: { carPoolId, memberId },
    });
  }, [carPoolId, memberId]);

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
          Loading payment status...
        </Text>
      </SafeAreaView>
    );
  }

  if (!payment) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <AlertCircle size={56} color="#9CA3AF" />
          <Text
            style={{
              color: "#6B7280",
              marginTop: 16,
              textAlign: "center",
              fontSize: 15,
              fontFamily: "Figtree_400Regular",
            }}
          >
            Payment information not available
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)")}
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

  const statusColor = getPaymentStatusColor(
    payment.status as RidePaymentStatus
  );
  const statusLabel = getPaymentStatusLabel(
    payment.status as RidePaymentStatus
  );
  const methodLabel = getPaymentMethodLabel(payment.paymentMethod);

  const getStatusTitle = () => {
    switch (payment.status) {
      case "COMPLETED":
        return "Payment Successful!";
      case "FAILED":
        return "Payment Failed";
      case "PROCESSING":
        return "Processing Payment...";
      case "AWAITING_ONLINE":
        return "Verifying Payment...";
      case "PENDING":
        return payment.paymentMethod === "CASH"
          ? "Awaiting Driver Confirmation"
          : "Pending Payment";
      default:
        return "Payment Status";
    }
  };

  const getStatusSubtitle = () => {
    switch (payment.status) {
      case "COMPLETED":
        return "Your payment has been processed successfully.";
      case "FAILED":
        return (
          payment.failureReason || "Something went wrong. Please try again."
        );
      case "PROCESSING":
        return "Please wait while we process your payment.";
      case "AWAITING_ONLINE":
        return stuckPaymentDetected
          ? "Payment verification is taking longer than expected."
          : "Please wait while we verify your payment.";
      case "PENDING":
        return payment.paymentMethod === "CASH"
          ? "Please pay cash to the driver. They will confirm the payment."
          : "Please complete your payment.";
      default:
        return "";
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#FFF" }}
      edges={["top", "bottom"]}
    >
      {/* Header */}
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: "#F3F4F6",
        }}
      >
        <Text
          style={{
            fontSize: 18,
            color: "#111827",
            fontFamily: "Figtree_700Bold",
          }}
        >
          Payment Status
        </Text>
      </View>

      {/* Main Content */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <StatusIcon status={payment.status} />

        <Text
          style={{
            fontSize: 24,
            color: "#111827",
            marginTop: 24,
            textAlign: "center",
            fontFamily: "Figtree_700Bold",
          }}
        >
          {getStatusTitle()}
        </Text>

        <Text
          style={{
            fontSize: 15,
            color: "#6B7280",
            marginTop: 8,
            textAlign: "center",
            lineHeight: 22,
            fontFamily: "Figtree_400Regular",
          }}
        >
          {getStatusSubtitle()}
        </Text>

        {/* Payment Details Card */}
        <View
          style={{
            width: "100%",
            marginTop: 28,
            backgroundColor: "#F9FAFB",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            overflow: "hidden",
          }}
        >
          {typeof payment.discountApplied === "number" &&
            payment.discountApplied > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 16,
                  borderBottomWidth: 1,
                  borderColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Discount
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: "#10B981",
                    fontFamily: "Figtree_600SemiBold",
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
              padding: 16,
              borderBottomWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: "#6B7280",
                fontFamily: "Figtree_400Regular",
              }}
            >
              Amount
            </Text>
            <Text
              style={{
                fontSize: 22,
                color: "#111827",
                fontFamily: "Figtree_700Bold",
              }}
            >
              {formatAmount(payment.fareAmount)}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: "#6B7280",
                fontFamily: "Figtree_400Regular",
              }}
            >
              Payment Method
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#111827",
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              {methodLabel}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: "#6B7280",
                fontFamily: "Figtree_400Regular",
              }}
            >
              Status
            </Text>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 20,
                backgroundColor: statusColor + "20",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: statusColor,
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
          {payment.processedAt && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 16,
                borderTopWidth: 1,
                borderColor: "#F3F4F6",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: "#6B7280",
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Processed At
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "#374151",
                  fontFamily: "Figtree_400Regular",
                }}
              >
                {new Date(payment.processedAt).toLocaleString("en-IN")}
              </Text>
            </View>
          )}
        </View>

        {/* Polling indicator */}
        {isPolling && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <ActivityIndicator size="small" color={BRAND_ORANGE} />
            <Text
              style={{
                fontSize: 13,
                color: "#9CA3AF",
                marginLeft: 8,
                fontFamily: "Figtree_400Regular",
              }}
            >
              Checking payment status...
            </Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
        {payment.status === "COMPLETED" && (
          <TouchableOpacity
            onPress={handleDone}
            style={{
              paddingVertical: 16,
              backgroundColor: BRAND_ORANGE,
              borderRadius: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 17,
                color: "#FFF",
                fontFamily: "Figtree_700Bold",
              }}
            >
              Done
            </Text>
          </TouchableOpacity>
        )}

        {payment.status === "FAILED" && (
          <>
            <TouchableOpacity
              onPress={handleRetry}
              style={{
                paddingVertical: 16,
                backgroundColor: BRAND_ORANGE,
                borderRadius: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  color: "#FFF",
                  fontFamily: "Figtree_700Bold",
                }}
              >
                Try Again
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDone}
              style={{
                paddingVertical: 14,
                backgroundColor: "#F9FAFB",
                borderRadius: 16,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: "#374151",
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </>
        )}

        {payment.status === "PENDING" && payment.paymentMethod !== "CASH" && (
          <TouchableOpacity
            onPress={handleRetry}
            style={{
              paddingVertical: 16,
              backgroundColor: BRAND_ORANGE,
              borderRadius: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 17,
                color: "#FFF",
                fontFamily: "Figtree_700Bold",
              }}
            >
              Complete Payment
            </Text>
          </TouchableOpacity>
        )}

        {payment.status === "PENDING" && payment.paymentMethod === "CASH" && (
          <TouchableOpacity
            onPress={handleDone}
            style={{
              paddingVertical: 14,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                color: "#374151",
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              Done
            </Text>
          </TouchableOpacity>
        )}

        {(payment.status === "PROCESSING" ||
          payment.status === "AWAITING_ONLINE") && (
          <>
            {stuckPaymentDetected && payment.paymentMethod === "ONLINE" && (
              <TouchableOpacity
                onPress={async () => {
                  await refresh();
                  toast.info("Payment status has been refreshed.");
                }}
                style={{
                  paddingVertical: 16,
                  backgroundColor: "#F59E0B",
                  borderRadius: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <RefreshCw size={18} color="#FFF" />
                <Text
                  style={{
                    fontSize: 15,
                    color: "#FFF",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  Refresh Payment Status
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleDone}
              style={{
                paddingVertical: 14,
                backgroundColor: "#F9FAFB",
                borderRadius: 16,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: "#374151",
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                Continue in Background
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
