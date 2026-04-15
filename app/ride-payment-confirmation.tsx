/**
 * Driver Payment Confirmation Screen
 * Uber-style white theme
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CheckCircle,
  CreditCard,
  Banknote,
  MapPin,
  Flag,
  QrCode,
} from "lucide-react-native";

import SwipeButton from "@/components/swipe-button";
import { useToast } from "@/components/ui/toast";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";
import { formatAmount } from "@/lib/api/wallet";
import { dispatchServiceCompleted } from "@/lib/events";
import { useAlert } from "@/context/alert-context";
import {
  driverConfirmPayment,
  createPaymentQRCode,
  getRidePayment,
  type RidePaymentStatus,
} from "@/lib/api/payment";
import {
  getRideById,
  type RideResponse,
  formatFare,
  formatDistance,
} from "@/lib/api/ride";

const BRAND_PURPLE = "#843FE3";
const DRIVER_SURFACE = "#F3EDFC";
const DRIVER_BORDER = "#D8B4FE";
const PAYMENT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

type ConfirmMethod = "ONLINE" | "CASH";

export default function RidePaymentConfirmationScreen() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const toast = useToast();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();
  const footerBottomInset =
    Platform.OS === "android" ? Math.max(insets.bottom, 24) : insets.bottom;

  const [ride, setRide] = useState<RideResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<RidePaymentStatus | null>(
    null
  );
  const [fareAmount, setFareAmount] = useState<number>(0);
  const [platformFee, setPlatformFee] = useState<number>(0);
  const [driverEarning, setDriverEarning] = useState<number>(0);
  const [selectedMethod, setSelectedMethod] = useState<ConfirmMethod | null>(
    null
  );
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrAmount, setQrAmount] = useState<number | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSafeBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  }, []);

  const { payment: realtimePayment } = usePaymentStatus({
    rideId: rideId || null,
    enabled: !!rideId,
    onUpdate: (p) => {
      setPaymentStatus(p.status);
      if (p.status === "COMPLETED") clearTimeouts();
    },
  });

  useEffect(() => {
    if (realtimePayment) {
      setPaymentStatus(realtimePayment.status);
      if (realtimePayment.fareAmount) setFareAmount(realtimePayment.fareAmount);
      if (realtimePayment.driverEarningAmount)
        setDriverEarning(realtimePayment.driverEarningAmount);
      if (realtimePayment.platformFeeAmount)
        setPlatformFee(realtimePayment.platformFeeAmount);
    }
  }, [realtimePayment]);

  useEffect(() => {
    if (!rideId) return;
    async function fetchData() {
      setLoading(true);
      try {
        const [rideRes, paymentRes] = await Promise.all([
          getRideById(rideId!),
          getRidePayment(rideId!),
        ]);
        if (rideRes.success && rideRes.data?.ride) setRide(rideRes.data.ride);
        if (paymentRes.success && paymentRes.data?.payment) {
          const p = paymentRes.data.payment;
          setPaymentStatus(p.status);
          setFareAmount(p.fareAmount);
          setPlatformFee(p.platformFeeAmount);
          setDriverEarning(p.driverEarningAmount);
        }
      } catch (err) {
        console.error("[PaymentConfirmation] Fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [rideId]);

  useEffect(() => {
    if (!rideId) return;
    async function fetchQR() {
      setQrLoading(true);
      try {
        const res = await createPaymentQRCode(rideId!);
        if (res.success && res.data?.qrCode) {
          setQrCodeUrl(res.data.qrCode.imageUrl || null);
          if (typeof res.data.amountRupees === "number") {
            setQrAmount(res.data.amountRupees);
          }
        } else {
          setQrCodeUrl(null);
        }
      } catch (err) {
        console.error("[PaymentConfirmation] QR Code error:", err);
        setQrCodeUrl(null);
      } finally {
        setQrLoading(false);
      }
    }
    fetchQR();
  }, [rideId]);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      showAlert(
        "Payment Taking Too Long",
        "You can leave this screen and come back later from ride history.",
        [
          { text: "Stay", style: "cancel" },
          { text: "Leave", onPress: handleSafeBack },
        ]
      );
    }, PAYMENT_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleSafeBack, showAlert]);

  useEffect(() => {
    if (!rideId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await getRidePayment(rideId);
        if (res.success && res.data?.payment) {
          const s = res.data.payment.status;
          setPaymentStatus(s);
          if (s === "COMPLETED") clearTimeouts();
        }
      } catch {
        /* Ignore polling errors */
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [rideId]);

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleSwipeComplete = useCallback(async () => {
    if (!rideId || !selectedMethod || processing) return;
    setProcessing(true);
    setErrorMsg(null);
    try {
      const res = await driverConfirmPayment(rideId, selectedMethod);
      if (res.success) {
        const confirmedStatus = res.data?.payment?.status ?? "COMPLETED";
        clearTimeouts();
        setPaymentStatus(confirmedStatus);
        dispatchServiceCompleted();
        if (selectedMethod === "CASH") {
          toast.success(
            "Cash payment confirmed. Platform fee deducted from wallet."
          );
        } else {
          toast.success("Online payment verified successfully.");
        }
      } else {
        const err = res.error as any;
        const code = err?.code || "";
        if (code === "ONLINE_PAYMENT_NOT_COMPLETED") {
          toast.warning(
            "The passenger has not completed the online payment yet."
          );
        } else if (code === "INSUFFICIENT_BALANCE") {
          showAlert(
            "Insufficient Wallet Balance",
            "You do not have enough wallet balance to cover the platform fee.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Top Up", onPress: () => router.push("/wallet-topup") },
            ]
          );
        } else {
          setErrorMsg(err?.message || "Failed to confirm payment");
        }
      }
    } catch (err: any) {
      setErrorMsg("Something went wrong. Please try again.");
    } finally {
      setProcessing(false);
    }
  }, [rideId, selectedMethod, processing, clearTimeouts]);

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={BRAND_PURPLE} />
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

  const isPaymentDone = paymentStatus === "COMPLETED";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }} edges={["top"]}>
      {/* Header */}
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
          disabled={processing}
          style={{ marginRight: 12 }}
        >
          <ArrowLeft size={24} color={processing ? "#D1D5DB" : "#111827"} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 18,
            color: "#111827",
            flex: 1,
            fontFamily: "Figtree_700Bold",
          }}
        >
          Payment Confirmation
        </Text>
        {/* Status badge */}
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 20,
            backgroundColor: isPaymentDone ? "#F0FDF4" : "#FFFBEB",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: isPaymentDone ? "#059669" : BRAND_PURPLE,
              fontFamily: "Figtree_600SemiBold",
            }}
          >
            {isPaymentDone
              ? "Completed"
              : paymentStatus === "AWAITING_ONLINE"
              ? "Awaiting"
              : "Pending"}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: isPaymentDone ? 32 : 140 + footerBottomInset,
        }}
      >
        {/* Earning Hero Card */}
        <View
          style={{
            margin: 16,
            borderRadius: 16,
            backgroundColor: DRIVER_SURFACE,
            borderWidth: 1,
            borderColor: DRIVER_BORDER,
            padding: 20,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: "#6B7280",
              marginBottom: 4,
              fontFamily: "Figtree_400Regular",
            }}
          >
            Your Earning
          </Text>
          <Text
            style={{
              fontSize: 38,
              color: "#059669",
              marginBottom: 4,
              fontFamily: "Figtree_700Bold",
            }}
          >
            {driverEarning > 0
              ? formatFare(driverEarning)
              : formatFare(fareAmount)}
          </Text>
          {platformFee > 0 && (
            <Text
              style={{
                fontSize: 12,
                color: "#9CA3AF",
                fontFamily: "Figtree_400Regular",
              }}
            >
              After platform fee: {formatAmount(platformFee)} deducted
            </Text>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              width: "100%",
              borderTopWidth: 1,
              borderColor: DRIVER_BORDER,
              paddingTop: 12,
              marginTop: 8,
            }}
          >
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  marginBottom: 2,
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Total Fare
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: "#111827",
                  fontFamily: "Figtree_700Bold",
                }}
              >
                {formatFare(fareAmount)}
              </Text>
            </View>
            {ride?.distance && (
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginBottom: 2,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Distance
                </Text>
                <Text
                  style={{
                    fontSize: 15,
                    color: "#111827",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  {formatDistance(ride.distance)}
                </Text>
              </View>
            )}
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  marginBottom: 2,
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Platform Fee
              </Text>
              <Text
                style={{
                  fontSize: 15,
                  color: "#EF4444",
                  fontFamily: "Figtree_700Bold",
                }}
              >
                -{formatAmount(platformFee)}
              </Text>
            </View>
          </View>
        </View>

        {/* Route summary */}
        {ride && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <MapPin
                size={16}
                color="#16A34A"
                style={{ marginTop: 2, marginRight: 10 }}
              />
              <Text
                style={{
                  fontSize: 13,
                  color: "#374151",
                  flex: 1,
                  fontFamily: "Figtree_400Regular",
                }}
                numberOfLines={2}
              >
                {ride.pickupLocation}
              </Text>
            </View>
            <View
              style={{
                width: 1,
                height: 12,
                backgroundColor: "#E5E7EB",
                marginLeft: 7,
                marginBottom: 10,
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <Flag
                size={16}
                color="#EF4444"
                style={{ marginTop: 2, marginRight: 10 }}
              />
              <Text
                style={{
                  fontSize: 13,
                  color: "#374151",
                  flex: 1,
                  fontFamily: "Figtree_400Regular",
                }}
                numberOfLines={2}
              >
                {ride.destination}
              </Text>
            </View>
          </View>
        )}

        {/* QR Code */}
        {!isPaymentDone && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16,
              backgroundColor: "#FFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#F3F4F6",
              padding: 20,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: "#374151",
                marginBottom: 16,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              Show this to passenger
            </Text>
            <Text
              style={{
                fontSize: 26,
                color: "#111827",
                marginBottom: 14,
                fontFamily: "Figtree_700Bold",
              }}
            >
              {formatFare(qrAmount ?? fareAmount)}
            </Text>
            {qrLoading ? (
              <View
                style={{
                  width: 192,
                  height: 192,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator size="large" color="#9CA3AF" />
              </View>
            ) : qrCodeUrl ? (
              <Image
                source={{ uri: qrCodeUrl }}
                style={{ width: 192, height: 192 }}
                resizeMode="contain"
              />
            ) : (
              <View
                style={{
                  width: 192,
                  height: 192,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: 12,
                }}
              >
                <QrCode size={48} color="#9CA3AF" />
                <Text
                  style={{
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 8,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  QR unavailable
                </Text>
              </View>
            )}
            <Text
              style={{
                fontSize: 12,
                color: "#9CA3AF",
                marginTop: 12,
                textAlign: "center",
                fontFamily: "Figtree_400Regular",
              }}
            >
              Scan to pay the exact fare amount
            </Text>
          </View>
        )}

        {/* Payment method selection */}
        {!isPaymentDone && (
          <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 14,
                color: "#374151",
                marginBottom: 12,
                fontFamily: "Figtree_600SemiBold",
              }}
            >
              How did the passenger pay?
            </Text>

            {/* Online Option */}
            <TouchableOpacity
              onPress={() => {
                setSelectedMethod("ONLINE");
                setErrorMsg(null);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor:
                  selectedMethod === "ONLINE" ? DRIVER_BORDER : "#F3F4F6",
                backgroundColor:
                  selectedMethod === "ONLINE" ? DRIVER_SURFACE : "#FFF",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor:
                    selectedMethod === "ONLINE" ? BRAND_PURPLE : "#D1D5DB",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                  backgroundColor:
                    selectedMethod === "ONLINE" ? BRAND_PURPLE : "transparent",
                }}
              >
                {selectedMethod === "ONLINE" && (
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: "#FFF",
                    }}
                  />
                )}
              </View>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor:
                    selectedMethod === "ONLINE" ? "#EDE4FB" : "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <CreditCard
                  size={20}
                  color={
                    selectedMethod === "ONLINE" ? BRAND_PURPLE : "#6B7280"
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    color: "#111827",
                    marginBottom: 2,
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Online / UPI
                </Text>
              </View>
            </TouchableOpacity>

            {/* Cash Option */}
            <TouchableOpacity
              onPress={() => {
                setSelectedMethod("CASH");
                setErrorMsg(null);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor:
                  selectedMethod === "CASH" ? DRIVER_BORDER : "#F3F4F6",
                backgroundColor:
                  selectedMethod === "CASH" ? DRIVER_SURFACE : "#FFF",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor:
                    selectedMethod === "CASH" ? BRAND_PURPLE : "#D1D5DB",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                  backgroundColor:
                    selectedMethod === "CASH" ? BRAND_PURPLE : "transparent",
                }}
              >
                {selectedMethod === "CASH" && (
                  <View
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: "#FFF",
                    }}
                  />
                )}
              </View>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor:
                    selectedMethod === "CASH" ? "#EDE4FB" : "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                }}
              >
                <Banknote
                  size={20}
                  color={selectedMethod === "CASH" ? BRAND_PURPLE : "#6B7280"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 15,
                    color: "#111827",
                    marginBottom: 2,
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Cash
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Error */}
        {errorMsg && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16,
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
              {errorMsg}
            </Text>
          </View>
        )}

        {/* Payment Complete Banner */}
        {isPaymentDone && (
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 8,
              padding: 24,
              backgroundColor: DRIVER_SURFACE,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: DRIVER_BORDER,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: "#E9D5FF",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <CheckCircle size={38} color={BRAND_PURPLE} />
            </View>
            <Text
              style={{
                fontSize: 20,
                color: BRAND_PURPLE,
                marginBottom: 4,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Payment Complete
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#6B7280",
                textAlign: "center",
                marginBottom: 16,
                fontFamily: "Figtree_400Regular",
              }}
            >
              {driverEarning > 0
                ? `You earned ${formatFare(driverEarning)} from this ride.`
                : "Payment has been processed successfully."}
            </Text>
            <TouchableOpacity
              onPress={() => {
                dispatchServiceCompleted();
                handleSafeBack();
              }}
              style={{
                paddingHorizontal: 32,
                paddingVertical: 12,
                backgroundColor: BRAND_PURPLE,
                borderRadius: 16,
              }}
            >
              <Text
                style={{
                  color: "#FFF",
                  fontSize: 15,
                  fontFamily: "Figtree_700Bold",
                }}
              >
                Done
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* SwipeButton */}
      {!isPaymentDone && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: footerBottomInset + 16,
            backgroundColor: "#FFF",
            borderTopWidth: 1,
            borderColor: "#F3F4F6",
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
            color={
              selectedMethod === "CASH"
                ? BRAND_PURPLE
                : selectedMethod === "ONLINE"
                ? BRAND_PURPLE
                : "#9CA3AF"
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}
