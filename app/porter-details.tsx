/**
 * Parcel Service Details Screen
 * Uber-style design with orange theme
 */

import React, { useEffect, useState, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Image,
  ActivityIndicator,
} from "react-native";
import {
  useRouter,
  useLocalSearchParams,
  Stack,
  useFocusEffect,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Package,
  Star,
  Phone,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  FileText,
  Receipt,
  XCircle,
  CheckCircle2,
  Clock,
  Banknote,
  QrCode,
  Info,
  AlertTriangle,
} from "lucide-react-native";

import {
  getPorterServiceById,
  type PorterServiceResponse,
  formatFare,
  createReceiverQROrder,
} from "@/lib/api/porter";
import { usePorterPayment } from "@/hooks/usePorterPayment";
import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { useToast } from "@/components/ui/toast";
import { formatAmount } from "@/lib/api/wallet";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

export default function PorterDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userType } = useAuth();
  const { showAlert } = useAlert();
  const toast = useToast();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)" as never);
  }, [router]);

  const [service, setService] = useState<PorterServiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrCheckoutUrl, setQrCheckoutUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const {
    payment,
    loading: paymentLoading,
    isPaymentComplete,
    confirmCashPayment,
    refresh: refreshPayment,
    startPolling,
    isPolling,
  } = usePorterPayment({
    porterServiceId: id || "",
    autoFetch: !!(id && service?.status === "DELIVERED"),
  });

  useEffect(() => {
    if (id) fetchServiceDetails();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (id && service?.status === "DELIVERED") refreshPayment();
    }, [id, service?.status, refreshPayment])
  );

  const fetchServiceDetails = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getPorterServiceById(id);
      if (response.success && response.data?.porterService)
        setService(response.data.porterService);
      else setError("Failed to load Parcel service details");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date: string | Date) => {
    const d = new Date(date);
    return (
      d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year:
          d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      }) +
      " " +
      d.toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    );
  };

  const formatTime = (date: string | Date | null | undefined) => {
    if (!date) return "--:--";
    return new Date(date).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusBadge = (status: string) => {
    if (status === "DELIVERED")
      return { bg: "#DCFCE7", color: "#16A34A", label: "Delivered" };
    if (status === "CANCELLED")
      return { bg: "#FEE2E2", color: "#EF4444", label: "Cancelled" };
    return {
      bg: "#FFE4D6",
      color: brandColor,
      label: status.replace("_", " "),
    };
  };

  const fmtPkg = (type: string) =>
    ({
      DOCUMENT: "Document",
      FOOD: "Food",
      ELECTRONICS: "Electronics",
      FURNITURE: "Furniture",
      CLOTHING: "Clothing",
      OTHER: "Other",
    }[type] || type);

  const handleContactDriver = () => {
    if (service?.driver?.phone) {
      showAlert(
        "Contact Driver",
        `Would you like to contact ${service.driver.fullName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Call Driver",
            onPress: () => Linking.openURL(`tel:${service.driver?.phone}`),
          },
        ]
      );
    }
  };

  if (loading) {
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
            Loading Parcel service details...
          </Text>
        </View>
      </>
    );
  }

  if (error || !service) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
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
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
              <ArrowLeft size={24} color="#111827" />
            </TouchableOpacity>
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 18,
                color: "#111827",
                marginLeft: 12,
              }}
            >
              Parcel Service Details
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
            <AlertCircle size={48} color="#EF4444" />
            <Text
              style={{
                fontFamily: "Figtree_500Medium",
                fontSize: 14,
                color: "#6B7280",
                marginTop: 16,
                textAlign: "center",
              }}
            >
              {error || "Parcel service not found"}
            </Text>
            <TouchableOpacity
              onPress={fetchServiceDetails}
              activeOpacity={0.85}
              style={{
                marginTop: 16,
                paddingHorizontal: 24,
                paddingVertical: 12,
                backgroundColor: brandColor,
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#FFF",
                }}
              >
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const badge = getStatusBadge(service.status);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "#F9FAFB" }}
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
          <TouchableOpacity onPress={handleBack} activeOpacity={0.7}>
            <ArrowLeft size={24} color="#111827" />
          </TouchableOpacity>
          <Text
            style={{
              fontFamily: "Figtree_700Bold",
              fontSize: 18,
              color: "#111827",
              marginLeft: 12,
            }}
          >
            Parcel Service Details
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* Service Title */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              backgroundColor: "#FFF",
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 20,
                    color: "#111827",
                  }}
                >
                  {fmtPkg(service.packageType)} delivery
                  {service.driver
                    ? ` with ${service.driver.fullName
                        .split(" ")[0]
                        .toUpperCase()}`
                    : ""}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 8,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 10,
                      backgroundColor: badge.bg,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 12,
                        color: badge.color,
                      }}
                    >
                      {badge.label}
                    </Text>
                  </View>
                  {service.isFragile && (
                    <View
                      style={{
                        marginLeft: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 10,
                        backgroundColor: "#FEF3C7",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 12,
                          color: "#D97706",
                        }}
                      >
                        Fragile
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                    marginTop: 8,
                  }}
                >
                  {formatDateTime(service.requestedAt)}
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 18,
                    color: brandColor,
                    marginTop: 4,
                  }}
                >
                  {formatFare(service.fare)}
                </Text>
              </View>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: "#FFE4D6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Package size={24} color={brandColor} />
              </View>
            </View>
          </View>

          {/* Receipt & Invoice */}
          {service.status === "DELIVERED" && isPaymentComplete && (
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
              }}
            >
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/document-viewer",
                    params: {
                      title: "Receipt",
                      endpoint: `/api/porter/${id}/receipt`,
                      fileName: `receipt-porter-${id?.slice(0, 8) || "service"}.pdf`,
                      templateType: "porter",
                      porterId: id,
                      docType: "receipt",
                    },
                  })
                }
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  backgroundColor: "#F3F4F6",
                  borderRadius: 20,
                  marginRight: 10,
                }}
              >
                <Receipt size={16} color="#111827" />
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 13,
                    color: "#111827",
                    marginLeft: 6,
                  }}
                >
                  Receipt
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/document-viewer",
                    params: {
                      title: "Invoice",
                      endpoint: `/api/porter/${id}/invoice`,
                      fileName: `invoice-porter-${id?.slice(0, 8) || "service"}.pdf`,
                      templateType: "porter",
                      porterId: id,
                      docType: "invoice",
                    },
                  })
                }
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  backgroundColor: "#F3F4F6",
                  borderRadius: 20,
                }}
              >
                <FileText size={16} color="#111827" />
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 13,
                    color: "#111827",
                    marginLeft: 6,
                  }}
                >
                  Invoice
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Route Details */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              backgroundColor: "#FFF",
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            <View style={{ flexDirection: "row", marginBottom: 16 }}>
              <View style={{ alignItems: "center", marginRight: 12 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#16A34A",
                  }}
                />
                <View
                  style={{
                    width: 1.5,
                    flex: 1,
                    backgroundColor: "#D1D5DB",
                    marginVertical: 2,
                    minHeight: 40,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  PICKUP
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  {service.pickupLocation}
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                  }}
                >
                  Contact: {service.pickupContactName} ·{" "}
                  {service.pickupContactPhone}
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 4,
                  }}
                >
                  {formatTime(service.pickedUpAt || service.acceptedAt)}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row" }}>
              <View style={{ alignItems: "center", marginRight: 12 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: "#EF4444",
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 11,
                    color: "#9CA3AF",
                    marginBottom: 4,
                  }}
                >
                  DELIVERY
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  {service.deliveryLocation}
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                  }}
                >
                  Contact: {service.deliveryContactName} ·{" "}
                  {service.deliveryContactPhone}
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 4,
                  }}
                >
                  {formatTime(service.deliveredAt)}
                </Text>
              </View>
            </View>
          </View>

          {/* Package Details */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              backgroundColor: "#FFF",
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 15,
                color: "#111827",
                marginBottom: 12,
              }}
            >
              Package Details
            </Text>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 14,
                  color: "#6B7280",
                }}
              >
                Type
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                {fmtPkg(service.packageType)}
              </Text>
            </View>
            {service.packageWeight ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                    color: "#6B7280",
                  }}
                >
                  Weight
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  {service.packageWeight} kg
                </Text>
              </View>
            ) : null}
            {service.packageDimensions ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 6,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                    color: "#6B7280",
                  }}
                >
                  Dimensions
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  {service.packageDimensions} cm
                </Text>
              </View>
            ) : null}
            {service.packageDescription ? (
              <View style={{ paddingVertical: 6 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                    color: "#6B7280",
                    marginBottom: 4,
                  }}
                >
                  Description
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  {service.packageDescription}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Fare Breakdown */}
          {service.status === "DELIVERED" && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                    color: "#6B7280",
                  }}
                >
                  Base fare
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  {formatFare(service.baseFare)}
                </Text>
              </View>
              {service.distance ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 14,
                      color: "#6B7280",
                    }}
                  >
                    Distance ({service.distance.toFixed(1)} km)
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      color: "#111827",
                    }}
                  >
                    {formatFare(
                      service.fare -
                        service.baseFare -
                        (service.weightCharge || 0)
                    )}
                  </Text>
                </View>
              ) : null}
              {service.weightCharge && service.weightCharge > 0 ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 14,
                      color: "#6B7280",
                    }}
                  >
                    Weight charge
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      color: "#111827",
                    }}
                  >
                    {formatFare(service.weightCharge)}
                  </Text>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 15,
                    color: "#111827",
                  }}
                >
                  Total
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 15,
                    color: brandColor,
                  }}
                >
                  {formatFare(service.fare)}
                </Text>
              </View>
            </View>
          )}

          {/* Payment Loading */}
          {service.status === "DELIVERED" && paymentLoading && !payment && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="small" color={BRAND_ORANGE} />
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#6B7280",
                  marginLeft: 8,
                }}
              >
                Loading payment info...
              </Text>
            </View>
          )}

          {/* Payment not available */}
          {service.status === "DELIVERED" && !paymentLoading && !payment && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#6B7280",
                  marginBottom: 8,
                }}
              >
                Payment information is loading.
              </Text>
              <TouchableOpacity
                onPress={() => refreshPayment()}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: BRAND_ORANGE,
                  }}
                >
                  Refresh payment
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* SENDER-pays + Passenger: Proceed to Payment */}
          {service.status === "DELIVERED" &&
            service.paymentParty === "SENDER" &&
            userType === "passenger" &&
            !isPaymentComplete && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  backgroundColor: "#FFF",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 17,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  Payment Required
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                    marginBottom: 16,
                  }}
                >
                  {formatAmount(payment?.fareAmount ?? service.fare)} due
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/porter-payment",
                      params: { porterServiceId: id },
                    })
                  }
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: brandColor,
                    borderRadius: 16,
                    paddingVertical: 16,
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
                    Proceed to Payment (
                    {formatAmount(payment?.fareAmount ?? service.fare)})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          {/* SENDER-pays + Driver: Waiting */}
          {service.status === "DELIVERED" &&
            service.paymentParty === "SENDER" &&
            userType === "driver" &&
            !isPaymentComplete && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  backgroundColor: "#FFFBEB",
                  borderBottomWidth: 1,
                  borderBottomColor: "#FEF3C7",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <Clock size={20} color="#D97706" />
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 15,
                      color: "#92400E",
                      marginLeft: 8,
                    }}
                  >
                    Waiting for Payment
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#92400E",
                  }}
                >
                  The sender is being prompted to complete payment of{" "}
                  {formatAmount(payment?.fareAmount ?? service.fare)}.
                </Text>
              </View>
            )}

          {/* RECEIVER-pays + Passenger: Info */}
          {service.status === "DELIVERED" &&
            service.paymentParty === "RECEIVER" &&
            userType === "passenger" &&
            !isPaymentComplete && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  backgroundColor: "#FFF",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E5E7EB",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Info size={20} color="#6B7280" />
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                    marginLeft: 8,
                  }}
                >
                  Receiver will pay{" "}
                  {formatAmount(payment?.fareAmount ?? service.fare)} on
                  delivery
                </Text>
              </View>
            )}

          {/* RECEIVER-pays + Driver: Cash / QR */}
          {service.status === "DELIVERED" &&
            service.paymentParty === "RECEIVER" &&
            userType === "driver" &&
            !isPaymentComplete && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  backgroundColor: "#FFF",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 17,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  Collect Payment from Receiver
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                    marginBottom: 16,
                  }}
                >
                  Amount: {formatAmount(payment?.fareAmount ?? service.fare)}
                </Text>
                {qrCheckoutUrl ? (
                  <View
                    style={{
                      alignItems: "center",
                      marginBottom: 16,
                      padding: 16,
                      backgroundColor: "#F9FAFB",
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 13,
                        color: "#6B7280",
                        marginBottom: 12,
                      }}
                    >
                      Ask the receiver to scan this QR code to pay
                    </Text>
                    <Image
                      source={{
                        uri: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                          qrCheckoutUrl
                        )}`,
                      }}
                      style={{ width: 200, height: 200 }}
                      resizeMode="contain"
                    />
                    <Text
                      style={{
                        fontFamily: "Figtree_400Regular",
                        fontSize: 12,
                        color: "#9CA3AF",
                        marginTop: 8,
                        textAlign: "center",
                      }}
                    >
                      {isPolling
                        ? "Waiting for payment confirmation..."
                        : "Receiver scans and pays via UPI/Card/Net Banking"}
                    </Text>
                    {isPolling && (
                      <ActivityIndicator
                        size="small"
                        color={brandColor}
                        style={{ marginTop: 8 }}
                      />
                    )}
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    <TouchableOpacity
                      onPress={async () => {
                        const ok = await confirmCashPayment();
                        if (ok) {
                          toast.success("Cash payment confirmed!");
                          await refreshPayment();
                          await fetchServiceDetails();
                        }
                      }}
                      disabled={paymentLoading}
                      activeOpacity={0.85}
                      style={{
                        backgroundColor: brandColor,
                        borderRadius: 16,
                        paddingVertical: 16,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {paymentLoading ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <>
                          <Banknote size={20} color="#FFF" />
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 15,
                              color: "#FFF",
                              marginLeft: 8,
                            }}
                          >
                            Confirm Cash Received
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        setQrLoading(true);
                        try {
                          const res = await createReceiverQROrder(id as string);
                          if (res.success && res.data?.checkoutUrl) {
                            setQrCheckoutUrl(res.data.checkoutUrl);
                            startPolling();
                          } else toast.error("Failed to generate payment QR.");
                        } catch {
                          toast.error("Something went wrong.");
                        } finally {
                          setQrLoading(false);
                        }
                      }}
                      disabled={qrLoading}
                      activeOpacity={0.85}
                      style={{
                        borderRadius: 16,
                        paddingVertical: 16,
                        borderWidth: 1,
                        borderColor: brandColor,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {qrLoading ? (
                        <ActivityIndicator size="small" color={brandColor} />
                      ) : (
                        <>
                          <QrCode size={20} color={brandColor} />
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 15,
                              color: brandColor,
                              marginLeft: 8,
                            }}
                          >
                            Show Payment QR
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

          {/* Driver Cash Confirm — SENDER chose CASH */}
          {service.status === "DELIVERED" &&
            service.paymentParty === "SENDER" &&
            userType === "driver" &&
            payment?.paymentMethod === "CASH" &&
            payment.status === "PENDING" && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  backgroundColor: "#FFF",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 17,
                    color: "#111827",
                    marginBottom: 8,
                  }}
                >
                  Confirm Cash Payment
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#6B7280",
                    marginBottom: 16,
                  }}
                >
                  Customer has selected cash. Please confirm once you receive
                  payment.
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await confirmCashPayment();
                    if (ok) {
                      toast.success("Cash payment confirmed!");
                      await refreshPayment();
                      await fetchServiceDetails();
                    }
                  }}
                  disabled={paymentLoading}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: brandColor,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  {paymentLoading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 16,
                        color: "#FFF",
                      }}
                    >
                      Confirm Cash Received
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

          {/* Payment Complete */}
          {service.status === "DELIVERED" && isPaymentComplete && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: "#DCFCE7",
                borderBottomWidth: 1,
                borderBottomColor: "#BBF7D0",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <CheckCircle2 size={20} color="#16A34A" />
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 15,
                  color: "#16A34A",
                  marginLeft: 8,
                }}
              >
                Payment Complete
              </Text>
            </View>
          )}

          {/* Driver Rating */}
          {service.driver && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                backgroundColor: "#FFF",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Star size={20} color="#FBBF24" />
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#111827",
                  marginLeft: 8,
                }}
              >
                Driver Rating: {service.driver.rating.toFixed(1)}
              </Text>
            </View>
          )}

          {/* Cancellation */}
          {service.status === "CANCELLED" && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: "#FEF2F2",
                borderBottomWidth: 1,
                borderBottomColor: "#FECACA",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <XCircle size={20} color="#EF4444" />
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 15,
                    color: "#EF4444",
                    marginLeft: 8,
                  }}
                >
                  Service Cancelled
                </Text>
              </View>
              {service.cancellationReason && (
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#DC2626",
                  }}
                >
                  Reason: {service.cancellationReason}
                </Text>
              )}
              {service.cancelledBy && (
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 12,
                    color: "#EF4444",
                    marginTop: 4,
                  }}
                >
                  Cancelled by: {service.cancelledBy}
                </Text>
              )}
            </View>
          )}

          {/* Help & Support */}
          <View
            style={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 10 }}
          >
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 17,
                color: "#111827",
              }}
            >
              Help & support
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "#FFF",
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            {service.driver && (
              <TouchableOpacity
                onPress={handleContactDriver}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F3F4F6",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  <Phone size={20} color="#6B7280" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 14,
                      color: "#111827",
                    }}
                  >
                    Contact driver
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Figtree_400Regular",
                      fontSize: 12,
                      color: "#9CA3AF",
                      marginTop: 2,
                    }}
                  >
                    Get in touch with your delivery driver
                  </Text>
                </View>
                <ChevronRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => router.push("/support")}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <AlertCircle size={20} color="#6B7280" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  Report an issue
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 12,
                    color: "#9CA3AF",
                    marginTop: 2,
                  }}
                >
                  Report issues with package or delivery
                </Text>
              </View>
              <ChevronRight size={20} color="#9CA3AF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/support")}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 14,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <HelpCircle size={20} color="#6B7280" />
              </View>
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  flex: 1,
                }}
              >
                Customer Support
              </Text>
              <ChevronRight size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
