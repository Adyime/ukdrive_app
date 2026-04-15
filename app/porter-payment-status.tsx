/**
 * Porter Payment Status / Confirmation Screen
 *
 * Dual-role:
 * - DRIVER: Service summary, Online/Cash selection, SwipeButton to confirm
 * - PASSENGER: Live payment status with polling
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  CreditCard,
  Banknote,
  MapPin,
  Flag,
  Package,
} from "lucide-react-native";

import SwipeButton from "@/components/swipe-button";
import { useToast } from "@/components/ui/toast";
import { usePorterPayment } from "@/hooks/usePorterPayment";
import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { formatAmount } from "@/lib/api/wallet";
import {
  getPaymentStatusLabel,
  getPaymentMethodLabel,
} from "@/lib/api/payment";
import {
  getPorterServiceById,
  confirmPorterCashPayment,
  type PorterServiceResponse,
  formatFare,
  formatPackageType,
} from "@/lib/api/porter";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";
const DRIVER_SURFACE = "#F3EDFC";
const DRIVER_BORDER = "#D8B4FE";
const PAYMENT_TIMEOUT_MS = 5 * 60 * 1000;
type ConfirmMethod = "ONLINE" | "CASH";

function PassengerStatusView({
  payment,
  isPolling,
  porterServiceId,
  onDone,
  brandColor,
}: {
  payment: ReturnType<typeof usePorterPayment>["payment"];
  isPolling: boolean;
  porterServiceId: string;
  onDone: () => void;
  brandColor: string;
}) {
  const insets = useSafeAreaInsets();

  if (!payment) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <Clock size={64} color="#D97706" />
        <Text
          style={{
            fontFamily: "Figtree_700Bold",
            fontSize: 22,
            color: "#111827",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          Payment Pending
        </Text>
        <Text
          style={{
            fontFamily: "Figtree_400Regular",
            fontSize: 14,
            color: "#6B7280",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          Your payment is being set up. Please wait a moment.
        </Text>
      </View>
    );
  }

  const statusLabel = getPaymentStatusLabel(payment.status);
  const methodLabel = getPaymentMethodLabel(payment.paymentMethod);

  const getTitle = () => {
    if (payment.status === "COMPLETED") return "Payment Successful!";
    if (payment.status === "FAILED") return "Payment Failed";
    if (payment.status === "PROCESSING") return "Processing Payment...";
    if (payment.status === "AWAITING_ONLINE") return "Verifying Payment...";
    if (payment.paymentMethod === "CASH") return "Awaiting Driver Confirmation";
    return "Pending Payment";
  };

  const getDesc = () => {
    if (payment.status === "COMPLETED")
      return "Payment has been processed successfully.";
    if (payment.status === "FAILED")
      return "Something went wrong. Please try again.";
    if (payment.status === "PROCESSING")
      return "Please wait while we process your payment.";
    if (payment.status === "AWAITING_ONLINE")
      return "Please wait while we verify your payment.";
    if (payment.paymentMethod === "CASH")
      return "Please pay cash to the driver. They will confirm the payment.";
    return "Please complete your payment.";
  };

  const getIconSection = () => {
    if (payment.status === "COMPLETED") {
      return (
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#DCFCE7",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircle2 size={48} color="#16A34A" />
        </View>
      );
    }
    if (payment.status === "FAILED") {
      return (
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#FEE2E2",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <XCircle size={48} color="#EF4444" />
        </View>
      );
    }
    if (
      payment.status === "PROCESSING" ||
      payment.status === "AWAITING_ONLINE"
    ) {
      return (
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#FFE4D6",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" color={brandColor} />
        </View>
      );
    }
    return (
      <View
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: "#FEF3C7",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Clock size={48} color="#D97706" />
      </View>
    );
  };

  const getStatusBadgeColor = () => {
    if (payment.status === "COMPLETED")
      return { bg: "#DCFCE7", text: "#16A34A" };
    if (payment.status === "FAILED") return { bg: "#FEE2E2", text: "#EF4444" };
    if (payment.status === "PROCESSING" || payment.status === "AWAITING_ONLINE")
      return { bg: "#FFE4D6", text: brandColor };
    return { bg: "#FEF3C7", text: "#D97706" };
  };

  const badgeColor = getStatusBadgeColor();

  return (
    <>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        {getIconSection()}
        <Text
          style={{
            fontFamily: "Figtree_700Bold",
            fontSize: 22,
            color: "#111827",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          {getTitle()}
        </Text>
        <Text
          style={{
            fontFamily: "Figtree_400Regular",
            fontSize: 14,
            color: "#6B7280",
            marginTop: 8,
            textAlign: "center",
          }}
        >
          {getDesc()}
        </Text>

        <View
          style={{
            width: "100%",
            marginTop: 28,
            padding: 16,
            backgroundColor: "#FFF",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
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
                fontSize: 14,
                color: "#6B7280",
              }}
            >
              Amount
            </Text>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 20,
                color: "#111827",
              }}
            >
              {formatAmount(payment.fareAmount)}
            </Text>
          </View>
          <View
            style={{ height: 1, backgroundColor: "#F3F4F6", marginVertical: 4 }}
          />
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
                fontSize: 14,
                color: "#6B7280",
              }}
            >
              Payment Method
            </Text>
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 14,
                color: "#111827",
              }}
            >
              {methodLabel}
            </Text>
          </View>
          <View
            style={{ height: 1, backgroundColor: "#F3F4F6", marginVertical: 4 }}
          />
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
                fontSize: 14,
                color: "#6B7280",
              }}
            >
              Status
            </Text>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: badgeColor.bg,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 12,
                  color: badgeColor.text,
                }}
              >
                {statusLabel}
              </Text>
            </View>
          </View>
          {payment.processedAt && (
            <>
              <View
                style={{
                  height: 1,
                  backgroundColor: "#F3F4F6",
                  marginVertical: 4,
                }}
              />
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
                    fontSize: 14,
                    color: "#6B7280",
                  }}
                >
                  Processed At
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#111827",
                  }}
                >
                  {new Date(payment.processedAt).toLocaleString("en-IN")}
                </Text>
              </View>
            </>
          )}
        </View>

        {isPolling && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <ActivityIndicator size="small" color={brandColor} />
            <Text
              style={{
                fontFamily: "Figtree_400Regular",
                fontSize: 13,
                color: "#9CA3AF",
                marginLeft: 8,
              }}
            >
              Checking payment status...
            </Text>
          </View>
        )}
      </View>

      <View
        style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}
      >
        {payment.status === "COMPLETED" && (
          <TouchableOpacity
            onPress={onDone}
            activeOpacity={0.85}
            style={{
              paddingVertical: 16,
              backgroundColor: brandColor,
              borderRadius: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 16,
                color: "#FFF",
              }}
            >
              Done
            </Text>
          </TouchableOpacity>
        )}
        {payment.status === "FAILED" && (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={() =>
                router.replace({
                  pathname: "/porter-payment",
                  params: { porterServiceId },
                })
              }
              activeOpacity={0.85}
              style={{
                paddingVertical: 16,
                backgroundColor: brandColor,
                borderRadius: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 16,
                  color: "#FFF",
                }}
              >
                Try Again
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDone}
              activeOpacity={0.85}
              style={{
                paddingVertical: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 16,
                  color: "#6B7280",
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {payment.status !== "COMPLETED" && payment.status !== "FAILED" && (
          <TouchableOpacity
            onPress={onDone}
            activeOpacity={0.85}
            style={{
              paddingVertical: 16,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 16,
                color: "#6B7280",
              }}
            >
              Continue in Background
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

export default function PorterPaymentStatusScreen() {
  const { porterServiceId } = useLocalSearchParams<{
    porterServiceId: string;
  }>();
  const toast = useToast();
  const { userType } = useAuth();
  const { showAlert } = useAlert();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const insets = useSafeAreaInsets();

  const {
    payment,
    loading,
    error,
    isPaymentComplete,
    refresh,
    startPolling,
    stopPolling,
    isPolling,
  } = usePorterPayment({
    porterServiceId: porterServiceId || "",
    autoFetch: true,
    pollingInterval: 3000,
  });

  const [service, setService] = useState<PorterServiceResponse | null>(null);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<ConfirmMethod | null>(
    null
  );
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDriver = userType === "driver";

  useEffect(() => {
    if (!porterServiceId) return;
    setServiceLoading(true);
    getPorterServiceById(porterServiceId)
      .then((res) => {
        if (res.success && res.data?.porterService)
          setService(res.data.porterService);
      })
      .finally(() => setServiceLoading(false));
  }, [porterServiceId]);

  useEffect(() => {
    if (
      !isDriver &&
      payment &&
      (payment.status === "AWAITING_ONLINE" || payment.status === "PROCESSING")
    )
      startPolling();
    return () => stopPolling();
  }, [isDriver, payment?.status, startPolling, stopPolling]);

  useEffect(() => {
    if (isDriver && porterServiceId) startPolling();
    return () => stopPolling();
  }, [isDriver, porterServiceId, startPolling, stopPolling]);

  useEffect(() => {
    if (payment?.status === "COMPLETED" && porterServiceId) {
      const timeout = setTimeout(() => {
        if (isDriver) {
          router.replace({
            pathname: "/porter-details",
            params: { id: porterServiceId },
          });
          return;
        }
        router.replace({
          pathname: "/thank-you",
          params: { serviceType: "porter", porterServiceId },
        });
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [isDriver, payment?.status, porterServiceId]);

  useEffect(() => {
    if (
      !isDriver &&
      payment?.paymentMethod === "CASH" &&
      payment?.status === "PENDING" &&
      porterServiceId
    ) {
      const timeout = setTimeout(() => {
        router.replace({
          pathname: "/thank-you",
          params: { serviceType: "porter", porterServiceId },
        });
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [
    isDriver,
    payment?.paymentMethod,
    payment?.status,
    porterServiceId,
  ]);

  useEffect(() => {
    if (!isDriver) return;
    timeoutRef.current = setTimeout(() => {
      showAlert(
        "Payment Taking Too Long",
        "You can leave this screen and come back later.",
        [
          { text: "Stay", style: "cancel" },
          { text: "Leave", onPress: () => router.replace("/(tabs)") },
        ]
      );
    }, PAYMENT_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isDriver]);

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleDone = useCallback(() => {
    if (!porterServiceId) {
      router.replace("/(tabs)");
      return;
    }

    if (payment?.status === "COMPLETED") {
      if (isDriver) {
        router.replace({
          pathname: "/porter-details",
          params: { id: porterServiceId },
        });
      } else {
        router.replace({
          pathname: "/thank-you",
          params: { serviceType: "porter", porterServiceId },
        });
      }
      return;
    }

    if (
      !isDriver &&
      payment?.paymentMethod === "CASH" &&
      payment?.status === "PENDING"
    ) {
      router.replace({
        pathname: "/thank-you",
        params: { serviceType: "porter", porterServiceId },
      });
      return;
    }

    router.replace("/(tabs)");
  }, [isDriver, payment?.paymentMethod, payment?.status, porterServiceId]);

  const handleSwipeComplete = useCallback(async () => {
    if (!porterServiceId || !selectedMethod || processing) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      if (selectedMethod === "CASH") {
        const res = await confirmPorterCashPayment(porterServiceId);
        if (res.success) {
          clearTimeouts();
          await refresh();
          toast.success(
            "Cash payment confirmed. Platform fee deducted from wallet."
          );
          handleDone();
        } else {
          const err = res.error as any;
          const code = err?.code || err?.message || "";
          if (
            code === "INSUFFICIENT_BALANCE" ||
            code === "INSUFFICIENT_BALANCE_FOR_CASH"
          ) {
            showAlert(
              "Insufficient Wallet Balance",
              "You do not have enough wallet balance to cover the platform fee.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Top Up", onPress: () => router.push("/wallet-topup") },
              ]
            );
          } else setErrorMsg(err?.message || "Failed to confirm payment");
        }
      } else if (selectedMethod === "ONLINE") {
        if (payment?.status === "COMPLETED") {
          clearTimeouts();
          toast.success("Online payment verified successfully.");
          handleDone();
        } else {
          toast.warning("The sender has not completed the online payment yet.");
        }
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [
    porterServiceId,
    selectedMethod,
    processing,
    payment?.status,
    clearTimeouts,
    refresh,
    handleDone,
  ]);

  if ((loading || serviceLoading) && !payment && !service) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={{
            flex: 1,
            backgroundColor: "#F9FAFB",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" color={brandColor} />
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

  const isPaymentDone = payment?.status === "COMPLETED";
  const fareAmount = payment?.fareAmount ?? service?.fare ?? 0;
  const driverEarning = payment?.driverEarningAmount ?? 0;
  const platformFee = payment?.platformFeeAmount ?? 0;

  if (!isDriver) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "#F9FAFB" }}
          edges={["top", "bottom"]}
        >
          <View
            style={{
              alignItems: "center",
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
              backgroundColor: "#FFF",
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 20,
                color: "#111827",
              }}
            >
              Payment Status
            </Text>
          </View>
          <PassengerStatusView
            payment={payment}
            isPolling={isPolling}
            porterServiceId={porterServiceId || ""}
            onDone={handleDone}
            brandColor={brandColor}
          />
        </SafeAreaView>
      </>
    );
  }

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
            Payment Confirmation
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 140 }}
        >
          {/* Status Badge */}
          <View style={{ alignItems: "center", marginTop: 16 }}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 16,
                backgroundColor: isPaymentDone ? "#EDE9FE" : "#F3EDFC",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 13,
                  color: brandColor,
                }}
              >
                {isPaymentDone
                  ? "Payment Completed"
                  : payment?.status === "AWAITING_ONLINE"
                  ? "Awaiting Online Payment"
                  : payment?.status === "PROCESSING"
                  ? "Processing..."
                  : "Payment Pending"}
              </Text>
            </View>
          </View>

          {/* Service Summary */}
          {service && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 16,
                padding: 16,
                backgroundColor: "#F3EDFC",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#D8B4FE",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 13,
                  color: "#9CA3AF",
                  marginBottom: 12,
                }}
              >
                Delivery Summary
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#16A34A",
                    marginRight: 10,
                  }}
                />
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#111827",
                    flex: 1,
                  }}
                >
                  {service.pickupLocation}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 1.5,
                    backgroundColor: "#EF4444",
                    marginRight: 10,
                  }}
                />
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#111827",
                    flex: 1,
                  }}
                >
                  {service.deliveryLocation}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                  paddingTop: 12,
                }}
              >
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 11,
                      color: "#9CA3AF",
                    }}
                  >
                    Package
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 13,
                      color: "#111827",
                      marginTop: 4,
                    }}
                  >
                    {formatPackageType(service.packageType)}
                  </Text>
                </View>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 11,
                      color: "#9CA3AF",
                    }}
                  >
                    Total Fare
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_700Bold",
                      fontSize: 18,
                      color: brandColor,
                      marginTop: 4,
                    }}
                  >
                    {formatFare(fareAmount)}
                  </Text>
                </View>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 11,
                      color: "#9CA3AF",
                    }}
                  >
                    Your Earning
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 13,
                      color: brandColor,
                      marginTop: 4,
                    }}
                  >
                    {driverEarning > 0 ? formatFare(driverEarning) : "--"}
                  </Text>
                </View>
              </View>
              {platformFee > 0 && (
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 11,
                    color: "#9CA3AF",
                    textAlign: "center",
                    marginTop: 8,
                  }}
                >
                  Platform Fee: {formatFare(platformFee)}
                </Text>
              )}
            </View>
          )}

          {/* Method selection (driver, when not yet complete) */}
          {!isPaymentDone && (
            <View style={{ marginHorizontal: 16, marginTop: 16 }}>
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 12,
                }}
              >
                How did the sender pay?
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedMethod("ONLINE");
                  setErrorMsg(null);
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  marginBottom: 12,
                  backgroundColor:
                    selectedMethod === "ONLINE" ? DRIVER_SURFACE : "#FFF",
                  borderColor:
                    selectedMethod === "ONLINE" ? DRIVER_BORDER : "#E5E7EB",
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    borderColor:
                      selectedMethod === "ONLINE" ? brandColor : "#D1D5DB",
                    backgroundColor:
                      selectedMethod === "ONLINE" ? brandColor : "transparent",
                  }}
                >
                  {selectedMethod === "ONLINE" && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: "#FFF",
                      }}
                    />
                  )}
                </View>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    backgroundColor:
                      selectedMethod === "ONLINE" ? "#E9D5FF" : "#F3F4F6",
                  }}
                >
                  <CreditCard
                    size={20}
                    color={selectedMethod === "ONLINE" ? brandColor : "#6B7280"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 15,
                      color: "#111827",
                    }}
                  >
                    Online / UPI
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 13,
                      color: "#9CA3AF",
                      marginTop: 2,
                    }}
                  >
                    Sender paid via app or online
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setSelectedMethod("CASH");
                  setErrorMsg(null);
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  marginBottom: 12,
                  backgroundColor:
                    selectedMethod === "CASH" ? DRIVER_SURFACE : "#FFF",
                  borderColor:
                    selectedMethod === "CASH" ? DRIVER_BORDER : "#E5E7EB",
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    borderColor:
                      selectedMethod === "CASH" ? brandColor : "#D1D5DB",
                    backgroundColor:
                      selectedMethod === "CASH" ? brandColor : "transparent",
                  }}
                >
                  {selectedMethod === "CASH" && (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: "#FFF",
                      }}
                    />
                  )}
                </View>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                    backgroundColor:
                      selectedMethod === "CASH" ? "#E9D5FF" : "#F3F4F6",
                  }}
                >
                  <Banknote
                    size={20}
                    color={selectedMethod === "CASH" ? brandColor : "#6B7280"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 15,
                      color: "#111827",
                    }}
                  >
                    Cash
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 13,
                      color: "#9CA3AF",
                      marginTop: 2,
                    }}
                  >
                    Sender paid cash directly
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {errorMsg && (
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
                {errorMsg}
              </Text>
            </View>
          )}

          {/* Payment Complete Banner */}
          {isPaymentDone && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 20,
                padding: 24,
                backgroundColor: "#F3EDFC",
                borderRadius: 16,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "#E9D5FF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <CheckCircle2 size={36} color={brandColor} />
              </View>
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 18,
                  color: brandColor,
                }}
              >
                Payment Complete
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#6B7280",
                  marginTop: 6,
                  textAlign: "center",
                }}
              >
                {driverEarning > 0
                  ? `You earned ${formatFare(
                      driverEarning
                    )} from this delivery.`
                  : "Payment has been processed successfully."}
              </Text>
              <TouchableOpacity
                onPress={handleDone}
                activeOpacity={0.85}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 32,
                  paddingVertical: 12,
                  backgroundColor: brandColor,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 15,
                    color: "#FFF",
                  }}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {isPolling && !isPaymentDone && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 16,
              }}
            >
              <ActivityIndicator size="small" color={brandColor} />
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#9CA3AF",
                  marginLeft: 8,
                }}
              >
                Checking payment status...
              </Text>
            </View>
          )}
        </ScrollView>

        {/* SwipeButton (driver, payment not done) */}
        {!isPaymentDone && (
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
            <SwipeButton
              onSwipeComplete={handleSwipeComplete}
              label={
                selectedMethod === "CASH"
                  ? "Swipe to Confirm Cash"
                  : selectedMethod === "ONLINE"
                  ? "Swipe to Verify Online"
                  : "Select payment method"
              }
              disabled={!selectedMethod || processing}
              loading={processing}
              color={selectedMethod ? brandColor : "#9CA3AF"}
            />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}
