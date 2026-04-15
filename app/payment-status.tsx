/**
 * Payment Status Screen
 * Uber-style white theme with clear status indicators
 */

import { useState, useEffect, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View, TouchableOpacity, ActivityIndicator } from "react-native";
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
import { useAlert } from "@/context/alert-context";
import { useAuth } from "@/context/auth-context";
import { useRidePayment } from "@/hooks/useRidePayment";
import { formatAmount } from "@/lib/api/wallet";
import {
  getPaymentStatusLabel,
  getPaymentStatusColor,
  getPaymentMethodLabel,
  retryOnlinePayment,
} from "@/lib/api/payment";

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

export default function PaymentStatusScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { userType } = useAuth();
  const toast = useToast();
  const { showAlert } = useAlert();
  const [retrying, setRetrying] = useState(false);
  const [stuckPaymentDetected, setStuckPaymentDetected] = useState(false);

  const handleSafeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  }, []);

  const {
    payment,
    loading,
    error,
    refresh,
    startPolling,
    stopPolling,
    isPolling,
  } = useRidePayment({
    rideId: rideId || "",
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
    if (payment?.status === "COMPLETED" && rideId) {
      const timeoutId = setTimeout(() => {
        router.replace({ pathname: "/thank-you", params: { rideId } });
      }, 2000);
      return () => clearTimeout(timeoutId);
    }
  }, [payment?.status, rideId]);

  useEffect(() => {
    if (
      payment?.paymentMethod === "CASH" &&
      payment?.status === "PENDING" &&
      rideId
    ) {
      const timeoutId = setTimeout(() => {
        router.replace({ pathname: "/thank-you", params: { rideId } });
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [payment?.paymentMethod, payment?.status, rideId]);

  const handleDone = useCallback(() => {
    if (
      rideId &&
      (payment?.status === "COMPLETED" ||
        (payment?.paymentMethod === "CASH" && payment?.status === "PENDING"))
    ) {
      router.replace({ pathname: "/thank-you", params: { rideId } });
    } else {
      router.replace("/(tabs)");
    }
  }, [payment?.paymentMethod, payment?.status, rideId]);

  const handleRetry = useCallback(() => {
    router.replace({ pathname: "/ride-payment", params: { rideId } });
  }, [rideId]);

  const handleRetryOnlinePayment = useCallback(async () => {
    if (!rideId) return;
    showAlert(
      "Retry Payment Processing",
      "Your payment was successful, but processing failed. Would you like to retry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Retry",
          onPress: async () => {
            setRetrying(true);
            try {
              const response = await retryOnlinePayment(rideId);
              if (response.success) {
                await refresh();
                toast.success("Payment processing retried successfully");
              } else {
                toast.error(
                  (response.error as any)?.message || "Failed to retry payment"
                );
              }
            } catch {
              toast.error(
                "Failed to retry payment. Please try again or contact support."
              );
            } finally {
              setRetrying(false);
            }
          },
        },
      ]
    );
  }, [rideId, refresh]);

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

  const isPassengerCashPending =
    userType === "passenger" &&
    payment.paymentMethod === "CASH" &&
    payment.status === "PENDING";
  const statusColor = isPassengerCashPending
    ? "#10B981"
    : getPaymentStatusColor(payment.status);
  const statusLabel = isPassengerCashPending
    ? "Paid in Cash"
    : getPaymentStatusLabel(payment.status);
  const methodLabel = getPaymentMethodLabel(payment.paymentMethod);
  const effectiveStatus = isPassengerCashPending ? "COMPLETED" : payment.status;

  const getStatusTitle = () => {
    if (isPassengerCashPending) {
      return "Payment Successful!";
    }
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
    if (isPassengerCashPending) {
      return "Cash payment is marked as settled from your side.";
    }
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
        {/* Status Icon */}
        <StatusIcon status={effectiveStatus} />

        {/* Status title */}
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

        {/* Status subtitle */}
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
                onPress={handleRetryOnlinePayment}
                disabled={retrying}
                style={{
                  paddingVertical: 16,
                  backgroundColor: retrying ? "#D1D5DB" : "#F59E0B",
                  borderRadius: 16,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {retrying ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <RefreshCw size={18} color="#FFF" />
                )}
                <Text
                  style={{
                    fontSize: 15,
                    color: "#FFF",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {retrying ? "Retrying..." : "Retry Payment Processing"}
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
