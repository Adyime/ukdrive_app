/**
 * Car Pool Details Screen
 * Displays detailed information about a completed or cancelled car pool
 */

import React, { useEffect, useState, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from "react-native";
import {
  router,
  useLocalSearchParams,
  Stack,
  useFocusEffect,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Users,
  Star,
  Phone,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  FileText,
  Receipt,
  XCircle,
  CheckCircle2,
  User,
} from "lucide-react-native";

import {
  getCarPoolById,
  type CarPoolResponse,
  formatFare,
  type CarPoolMemberResponse,
} from "@/lib/api/carPool";
import { Loading } from "@/components/ui/loading";
import { useCarPoolPayment } from "@/hooks/useCarPoolPayment";
import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { useToast } from "@/components/ui/toast";
import { formatAmount } from "@/lib/api/wallet";

const BRAND_ORANGE = "#F36D14";
const BRAND_PURPLE = "#843FE3";

// ============================================
// Member Payment Card Component
// ============================================

interface MemberPaymentCardProps {
  member: CarPoolMemberResponse;
  carPoolId: string;
  isLast: boolean;
  onRefresh: () => void;
}

function MemberPaymentCard({
  member,
  carPoolId,
  isLast,
  onRefresh,
}: MemberPaymentCardProps) {
  const { userType, user } = useAuth();
  const toast = useToast();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;
  const isDroppedOff = member.status === "DROPPED_OFF";
  const isCurrentUser = member.passenger?.id === user?.id;
  const canViewPayment = userType === "driver" || isCurrentUser;

  const {
    payment,
    loading: paymentLoading,
    isPaymentComplete,
    confirmCashPayment,
    refresh: refreshPayment,
  } = useCarPoolPayment({
    carPoolId,
    memberId: member.id,
    autoFetch: isDroppedOff && canViewPayment,
  });

  if (!isDroppedOff || !member.fare) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          ...(!isLast
            ? { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }
            : {}),
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            backgroundColor: "#FFF7ED",
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <User size={20} color={brandColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "#111827",
              fontFamily: "Figtree_500Medium",
              fontSize: 15,
            }}
          >
            {member.passenger?.fullName || "Passenger"}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: "#6B7280",
              fontFamily: "Figtree_400Regular",
              textTransform: "capitalize",
            }}
          >
            {member.status.toLowerCase().replace("_", " ")}
          </Text>
        </View>
        {member.fare && (
          <Text
            style={{
              color: "#111827",
              fontFamily: "Figtree_600SemiBold",
              fontSize: 15,
            }}
          >
            {formatFare(member.fare)}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        ...(!isLast
          ? {
              borderBottomWidth: 1,
              borderBottomColor: "#F3F4F6",
              paddingBottom: 12,
              marginBottom: 12,
            }
          : {}),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            backgroundColor: "#FFF7ED",
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <User size={20} color={brandColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "#111827",
              fontFamily: "Figtree_500Medium",
              fontSize: 15,
            }}
          >
            {member.passenger?.fullName || "Passenger"}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: "#6B7280",
              fontFamily: "Figtree_400Regular",
              textTransform: "capitalize",
            }}
          >
            {member.status.toLowerCase().replace("_", " ")}
          </Text>
        </View>
        <Text
          style={{
            color: "#111827",
            fontFamily: "Figtree_600SemiBold",
            fontSize: 15,
          }}
        >
          {formatFare(member.fare)}
        </Text>
      </View>

      {/* Payment UI for current user (passenger) */}
      {isCurrentUser && userType === "passenger" && !isPaymentComplete && (
        <View style={{ marginLeft: 52, marginTop: 8 }}>
          {payment?.paymentMethod === "CASH" && payment.status === "PENDING" ? (
            <View
              style={{
                padding: 12,
                backgroundColor: "#FFFBEB",
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  color: "#B45309",
                  fontSize: 12,
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Waiting for driver confirmation
              </Text>
            </View>
          ) : payment?.paymentMethod === "ONLINE" &&
            payment.status === "AWAITING_ONLINE" ? (
            <View
              style={{
                padding: 12,
                backgroundColor: "#EFF6FF",
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  color: "#1D4ED8",
                  fontSize: 12,
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Waiting for payment confirmation...
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/carpool-payment",
                  params: { carPoolId, memberId: member.id },
                })
              }
              style={{
                backgroundColor: brandColor,
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                Pay {formatFare(member.fare)}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Driver cash confirmation */}
      {userType === "driver" &&
        payment?.paymentMethod === "CASH" &&
        payment.status === "PENDING" && (
          <View
            style={{
              marginLeft: 52,
              marginTop: 8,
              padding: 12,
              backgroundColor: "#FFFBEB",
              borderRadius: 12,
            }}
          >
            <Text
              style={{
                color: "#B45309",
                fontSize: 12,
                fontFamily: "Figtree_400Regular",
                marginBottom: 8,
              }}
            >
              Confirm cash payment received from {member.passenger?.fullName}
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const success = await confirmCashPayment();
                if (success) {
                  toast.success("Cash payment confirmed!");
                  await refreshPayment();
                  onRefresh();
                }
              }}
              disabled={paymentLoading}
              style={{
                backgroundColor: brandColor,
                borderRadius: 12,
                padding: 8,
                alignItems: "center",
              }}
            >
              {paymentLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 12,
                    fontFamily: "Figtree_600SemiBold",
                  }}
                >
                  Confirm Cash
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

      {/* Receipt & Invoice buttons for completed payments */}
      {isPaymentComplete && (
        <View
          style={{ marginLeft: 52, marginTop: 8, flexDirection: "row", gap: 8 }}
        >
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "/document-viewer",
                params: {
                  title: "Receipt",
                  endpoint: `/api/car-pool/${carPoolId}/member/${member.id}/receipt`,
                  fileName: `receipt-carpool-${member.id.slice(0, 8)}.pdf`,
                  templateType: "carpool",
                  carPoolId,
                  memberId: member.id,
                  docType: "receipt",
                },
              })
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: brandColor,
              backgroundColor: "#FFFFFF",
            }}
          >
            <Receipt size={12} color={brandColor} />
            <Text
              style={{
                color: brandColor,
                fontSize: 12,
                fontFamily: "Figtree_600SemiBold",
                marginLeft: 4,
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
                  endpoint: `/api/car-pool/${carPoolId}/member/${member.id}/invoice`,
                  fileName: `invoice-carpool-${member.id.slice(0, 8)}.pdf`,
                  templateType: "carpool",
                  carPoolId,
                  memberId: member.id,
                  docType: "invoice",
                },
              })
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: brandColor,
              backgroundColor: "#FFFFFF",
            }}
          >
            <FileText size={12} color={brandColor} />
            <Text
              style={{
                color: brandColor,
                fontSize: 12,
                fontFamily: "Figtree_600SemiBold",
                marginLeft: 4,
              }}
            >
              Invoice
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function PoolDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userType, user } = useAuth();
  const toast = useToast();
  const { showAlert } = useAlert();
  const brandColor = userType === "driver" ? BRAND_PURPLE : BRAND_ORANGE;

  const [pool, setPool] = useState<CarPoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (id) {
      fetchPoolDetails();
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchPoolDetails();
      setFocusKey((k) => k + 1);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])
  );

  const fetchPoolDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const response = await getCarPoolById(id);

      if (response.success && response.data) {
        setPool(response.data);
      } else {
        setError("Failed to load ride share details");
      }
    } catch (err) {
      console.error("[PoolDetails] Error fetching pool:", err);
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
    const d = new Date(date);
    return d.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusBadge = (status: string) => {
    const isCompleted = status === "COMPLETED";
    const isCancelled = status === "CANCELLED";
    const isInProgress = status === "IN_PROGRESS";

    return {
      bg: isCompleted
        ? "#ECFDF5"
        : isCancelled
        ? "#FEF2F2"
        : isInProgress
        ? "#EFF6FF"
        : "#FFF7ED",
      text: isCompleted
        ? "#059669"
        : isCancelled
        ? "#DC2626"
        : isInProgress
        ? "#2563EB"
        : brandColor,
      label: isCompleted
        ? "Completed"
        : isCancelled
        ? "Cancelled"
        : status.replace("_", " "),
    };
  };

  const handleContactDriver = () => {
    if (pool?.driver?.phone) {
      showAlert(
        "Contact Driver",
        `Would you like to contact the driver ${pool.driver.fullName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Call Driver",
            onPress: () => Linking.openURL(`tel:${pool.driver?.phone}`),
          },
        ]
      );
    }
  };

  const handleReportIssue = () => {
    router.push("/support");
  };

  const handleCustomerSupport = () => {
    router.push("/support");
  };

  const handleSafeBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)");
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <View
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            <Loading message="Loading ride share details..." />
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (error || !pool) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: "#FFFFFF",
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            <TouchableOpacity
              onPress={handleSafeBack}
              style={{ padding: 8, marginLeft: -8 }}
            >
              <ArrowLeft size={24} color={brandColor} />
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 18,
                fontFamily: "Figtree_700Bold",
                color: "#111827",
                marginLeft: 8,
              }}
            >
              Ride share details
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
                color: "#6B7280",
                marginTop: 16,
                textAlign: "center",
                fontFamily: "Figtree_400Regular",
                fontSize: 15,
              }}
            >
              {error || "Ride share not found"}
            </Text>
            <TouchableOpacity
              onPress={fetchPoolDetails}
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
                  color: "#FFFFFF",
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 15,
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

  const statusBadge = getStatusBadge(pool.status);

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
            paddingVertical: 12,
            backgroundColor: "#FFFFFF",
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          }}
        >
          <TouchableOpacity
            onPress={handleSafeBack}
            style={{ padding: 8, marginLeft: -8 }}
          >
            <ArrowLeft size={24} color={brandColor} />
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontFamily: "Figtree_700Bold",
              color: "#111827",
              marginLeft: 8,
            }}
          >
            Ride share details
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* Pool Title */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              backgroundColor: "#FFFFFF",
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
                    fontSize: 20,
                    fontFamily: "Figtree_700Bold",
                    color: "#111827",
                  }}
                >
                  Ride share
                  {pool.driver
                    ? ` with ${pool.driver.fullName
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
                      borderRadius: 12,
                      backgroundColor: statusBadge.bg,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Figtree_600SemiBold",
                        color: statusBadge.text,
                      }}
                    >
                      {statusBadge.label}
                    </Text>
                  </View>
                  <View
                    style={{
                      marginLeft: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Figtree_500Medium",
                        color: "#6B7280",
                      }}
                    >
                      {pool.currentPassengerCount}/{pool.maxPassengers} seats
                    </Text>
                  </View>
                </View>
                <Text
                  style={{
                    color: "#6B7280",
                    marginTop: 8,
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                  }}
                >
                  Departure: {formatDateTime(pool.departureTime)}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontFamily: "Figtree_700Bold",
                    color: brandColor,
                    marginTop: 4,
                  }}
                >
                  {formatFare(pool.calculatedFarePerPerson || pool.baseFare)}{" "}
                  per person
                </Text>
              </View>

              <View
                style={{
                  width: 56,
                  height: 56,
                  backgroundColor: "#FFF7ED",
                  borderRadius: 28,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Users size={28} color={brandColor} />
              </View>
            </View>
          </View>

          {/* Receipt & Invoice hint */}
          {pool.status === "COMPLETED" &&
            pool.members?.some((m) => m.status === "DROPPED_OFF") && (
              <View
                style={{
                  flexDirection: "row",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: "#FFFFFF",
                  borderBottomWidth: 1,
                  borderBottomColor: "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Download receipts and invoices for completed payments below
                </Text>
              </View>
            )}

          {/* Route Details */}
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              backgroundColor: "#FFFFFF",
              borderBottomWidth: 1,
              borderBottomColor: "#E5E7EB",
            }}
          >
            {/* Start */}
            <View style={{ flexDirection: "row" }}>
              <View style={{ alignItems: "center", marginRight: 12 }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: "#16A34A",
                  }}
                />
                <View
                  style={{
                    width: 2,
                    flex: 1,
                    borderStyle: "dashed",
                    borderWidth: 1,
                    borderColor: "#D1D5DB",
                    marginVertical: 4,
                    minHeight: 40,
                  }}
                />
              </View>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingBottom: 16,
                }}
              >
                <Text
                  style={{
                    color: "#111827",
                    flex: 1,
                    paddingRight: 16,
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                  }}
                  numberOfLines={2}
                >
                  {pool.startLocation}
                </Text>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 13,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {formatTime(pool.startedAt || pool.departureTime)}
                </Text>
              </View>
            </View>

            {/* End */}
            <View style={{ flexDirection: "row" }}>
              <View style={{ alignItems: "center", marginRight: 12 }}>
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    backgroundColor: "#EF4444",
                  }}
                />
              </View>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    color: "#111827",
                    flex: 1,
                    paddingRight: 16,
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                  }}
                  numberOfLines={2}
                >
                  {pool.endLocation}
                </Text>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 13,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  {formatTime(pool.completedAt)}
                </Text>
              </View>
            </View>
          </View>

          {/* Pool Info */}
          <View
            style={{
              marginHorizontal: 16,
              marginTop: 12,
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 16,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Figtree_700Bold",
                color: "#111827",
                marginBottom: 12,
              }}
            >
              Pool Information
            </Text>
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                  }}
                >
                  Total passengers
                </Text>
                <Text
                  style={{
                    color: "#111827",
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                  }}
                >
                  {pool.currentPassengerCount} / {pool.maxPassengers}
                </Text>
              </View>
              {pool.vehicleType && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "#6B7280",
                      fontFamily: "Figtree_400Regular",
                      fontSize: 14,
                    }}
                  >
                    Vehicle type
                  </Text>
                  <Text
                    style={{
                      color: "#111827",
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      textTransform: "capitalize",
                    }}
                  >
                    {pool.vehicleType}
                  </Text>
                </View>
              )}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                  }}
                >
                  Base fare
                </Text>
                <Text
                  style={{
                    color: "#111827",
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                  }}
                >
                  {formatFare(pool.baseFare)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                  }}
                >
                  Fare per person
                </Text>
                <Text
                  style={{
                    color: "#111827",
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                  }}
                >
                  {formatFare(pool.baseFare)}
                </Text>
              </View>
              {pool.notes && (
                <View style={{ paddingVertical: 4, marginTop: 8 }}>
                  <Text
                    style={{
                      color: "#6B7280",
                      fontFamily: "Figtree_400Regular",
                      fontSize: 14,
                      marginBottom: 4,
                    }}
                  >
                    Driver notes
                  </Text>
                  <Text
                    style={{
                      color: "#111827",
                      fontFamily: "Figtree_400Regular",
                      fontSize: 14,
                    }}
                  >
                    {pool.notes}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Passengers List with Payment */}
          {pool.members && pool.members.length > 0 && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: "Figtree_700Bold",
                  color: "#111827",
                  marginBottom: 12,
                }}
              >
                Passengers ({pool.members.length})
              </Text>
              {pool.members.map((member, index) => (
                <MemberPaymentCard
                  key={`${member.id}-${focusKey}`}
                  member={member}
                  carPoolId={id || ""}
                  isLast={index === pool.members!.length - 1}
                  onRefresh={fetchPoolDetails}
                />
              ))}
            </View>
          )}

          {/* Fare Summary */}
          {pool.status === "COMPLETED" && pool.calculatedFarePerPerson && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 16,
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
                    color: "#6B7280",
                    fontFamily: "Figtree_400Regular",
                    fontSize: 14,
                  }}
                >
                  Your share
                </Text>
                <Text
                  style={{
                    color: "#111827",
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                  }}
                >
                  {formatFare(pool.calculatedFarePerPerson)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    color: "#111827",
                    fontFamily: "Figtree_700Bold",
                    fontSize: 15,
                  }}
                >
                  Total paid
                </Text>
                <Text
                  style={{
                    color: brandColor,
                    fontFamily: "Figtree_700Bold",
                    fontSize: 15,
                  }}
                >
                  {formatFare(pool.calculatedFarePerPerson)}
                </Text>
              </View>
            </View>
          )}

          {/* Driver Rating */}
          {pool.driver && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Star size={20} color="#FBBF24" fill="#FBBF24" />
              <Text
                style={{
                  color: "#111827",
                  fontFamily: "Figtree_600SemiBold",
                  marginLeft: 8,
                  fontSize: 15,
                }}
              >
                Driver Rating: {pool.driver.rating.toFixed(1)}
              </Text>
            </View>
          )}

          {/* Cancellation Info */}
          {pool.status === "CANCELLED" && (
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 12,
                backgroundColor: "#FEF2F2",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#FECACA",
                padding: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <XCircle size={20} color="#EF4444" />
                <Text
                  style={{
                    color: "#DC2626",
                    fontFamily: "Figtree_600SemiBold",
                    marginLeft: 8,
                    fontSize: 15,
                  }}
                >
                  Pool Cancelled
                </Text>
              </View>
              {pool.cancellationReason && (
                <Text
                  style={{
                    color: "#DC2626",
                    fontSize: 13,
                    fontFamily: "Figtree_400Regular",
                  }}
                >
                  Reason: {pool.cancellationReason}
                </Text>
              )}
              {pool.cancelledBy && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    fontFamily: "Figtree_400Regular",
                    marginTop: 4,
                  }}
                >
                  Cancelled by: {pool.cancelledBy}
                </Text>
              )}
            </View>
          )}

          {/* Help & Support Section – commented out for now */}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
