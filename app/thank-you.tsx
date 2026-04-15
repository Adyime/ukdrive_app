/**
 * Thank You Screen
 * Post-payment rating screen for ride, parcel, and ride share.
 */

import React, { useEffect, useMemo, useState } from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle, Star, MapPin, Flag, AlertCircle } from "lucide-react-native";

import { getRideById, type RideResponse } from "@/lib/api/ride";
import { getPorterServiceById, type PorterServiceResponse } from "@/lib/api/porter";
import {
  getCarPoolById,
  type CarPoolResponse,
  type CarPoolMemberResponse,
} from "@/lib/api/carPool";
import {
  submitRideRating,
  submitPorterRating,
  submitCarPoolRating,
} from "@/lib/api/rating";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { formatCurrencyINR } from "@/lib/utils/formatters";

const BRAND_ORANGE = "#F36D14";
const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

type ThankYouServiceType = "ride" | "porter" | "carPool";

function getParamValue(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
}

function formatCurrency(value: number | null | undefined): string {
  return formatCurrencyINR(value);
}

function formatDistanceKm(value: number | null | undefined): string {
  const distance = Number(value || 0);
  if (!Number.isFinite(distance) || distance <= 0) return "";
  return `${distance.toFixed(1)} km`;
}

export default function ThankYouScreen() {
  const params = useLocalSearchParams<{
    serviceType?: string | string[];
    rideId?: string | string[];
    porterServiceId?: string | string[];
    carPoolId?: string | string[];
    memberId?: string | string[];
  }>();

  const { user } = useAuth();
  const toast = useToast();

  const rideId = getParamValue(params.rideId);
  const porterServiceId = getParamValue(params.porterServiceId);
  const carPoolId = getParamValue(params.carPoolId);
  const memberId = getParamValue(params.memberId);
  const serviceTypeParam = getParamValue(params.serviceType);

  const resolvedServiceType: ThankYouServiceType = useMemo(() => {
    if (serviceTypeParam === "porter") return "porter";
    if (serviceTypeParam === "carPool") return "carPool";
    if (serviceTypeParam === "ride") return "ride";
    if (porterServiceId) return "porter";
    if (carPoolId) return "carPool";
    return "ride";
  }, [serviceTypeParam, porterServiceId, carPoolId]);

  const [ride, setRide] = useState<RideResponse | null>(null);
  const [porterService, setPorterService] = useState<PorterServiceResponse | null>(null);
  const [carPool, setCarPool] = useState<CarPoolResponse | null>(null);
  const [carPoolMember, setCarPoolMember] =
    useState<CarPoolMemberResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setRide(null);
      setPorterService(null);
      setCarPool(null);
      setCarPoolMember(null);

      try {
        if (resolvedServiceType === "ride") {
          if (!rideId) {
            setLoading(false);
            return;
          }

          const response = await getRideById(rideId);
          if (!cancelled && response.success && response.data?.ride) {
            setRide(response.data.ride);
          }
        } else if (resolvedServiceType === "porter") {
          if (!porterServiceId) {
            setLoading(false);
            return;
          }

          const response = await getPorterServiceById(porterServiceId);
          if (!cancelled && response.success && response.data?.porterService) {
            setPorterService(response.data.porterService);
          }
        } else {
          if (!carPoolId) {
            setLoading(false);
            return;
          }

          const response = await getCarPoolById(carPoolId);
          if (!cancelled && response.success && response.data) {
            const pool = response.data;
            setCarPool(pool);

            const byMemberId = memberId
              ? pool.members?.find((member) => member.id === memberId)
              : null;
            const byPassengerId = user?.id
              ? pool.members?.find((member) => member.passengerId === user.id)
              : null;

            setCarPoolMember(byMemberId || byPassengerId || null);
          }
        }
      } catch {
        if (!cancelled) {
          toast.error("Something went wrong");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedServiceType,
    rideId,
    porterServiceId,
    carPoolId,
    memberId,
    user?.id,
    toast,
  ]);

  const serviceView = useMemo(() => {
    if (resolvedServiceType === "ride" && ride) {
      return {
        title: "Ride Complete!",
        companionText: ride.driver?.fullName
          ? `You rode with ${ride.driver.fullName}`
          : "",
        amount: formatCurrency(ride.fare),
        distance: formatDistanceKm(ride.distance),
        pickup: ride.pickupLocation,
        destination: ride.destination,
        feedbackPlaceholder: "Tell us about your ride...",
        notFoundText: "Ride not found",
      };
    }

    if (resolvedServiceType === "porter" && porterService) {
      return {
        title: "Delivery Complete!",
        companionText: porterService.driver?.fullName
          ? `Delivered by ${porterService.driver.fullName}`
          : "",
        amount: formatCurrency(porterService.fare),
        distance: formatDistanceKm(porterService.distance),
        pickup: porterService.pickupLocation,
        destination: porterService.deliveryLocation,
        feedbackPlaceholder: "Tell us about your parcel delivery...",
        notFoundText: "Parcel delivery not found",
      };
    }

    if (resolvedServiceType === "carPool" && carPool) {
      const fare =
        carPoolMember?.fare ?? carPool.calculatedFarePerPerson ?? carPool.baseFare;

      return {
        title: "Ride Share Complete!",
        companionText: carPool.driver?.fullName
          ? `You traveled with ${carPool.driver.fullName}`
          : "",
        amount: formatCurrency(fare),
        distance: "",
        pickup: carPoolMember?.pickupLocation || carPool.startLocation,
        destination: carPoolMember?.destinationLocation || carPool.endLocation,
        feedbackPlaceholder: "Tell us about your ride share experience...",
        notFoundText: "Ride share not found",
      };
    }

    return null;
  }, [resolvedServiceType, ride, porterService, carPool, carPoolMember]);

  const handleSubmitRating = async () => {
    if (rating === 0) {
      toast.warning("Please select a rating before submitting.");
      return;
    }

    setSubmitting(true);

    try {
      let response:
        | { success: boolean; error?: unknown }
        | undefined;

      if (resolvedServiceType === "ride") {
        if (!rideId) {
          toast.error("Invalid ride. Please try again.");
          setSubmitting(false);
          return;
        }
        response = await submitRideRating(rideId, rating, comment);
      } else if (resolvedServiceType === "porter") {
        if (!porterServiceId) {
          toast.error("Invalid parcel delivery. Please try again.");
          setSubmitting(false);
          return;
        }
        response = await submitPorterRating(porterServiceId, rating, comment);
      } else {
        if (!carPoolId) {
          toast.error("Invalid ride share trip. Please try again.");
          setSubmitting(false);
          return;
        }
        response = await submitCarPoolRating(carPoolId, rating, comment);
      }

      if (!response?.success) {
        throw response?.error ?? new Error("Failed to submit rating");
      }

      toast.success("Thank you! Your rating has been submitted.");
      router.replace("/(tabs)");
    } catch {
      toast.error("Failed to submit rating. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: "#FFF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" color={BRAND_ORANGE} />
        </SafeAreaView>
      </>
    );
  }

  if (!serviceView) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <AlertCircle size={48} color="#EF4444" />
            <Text
              style={{
                color: "#6B7280",
                marginTop: 16,
                textAlign: "center",
                fontFamily: "Figtree_400Regular",
              }}
            >
              {resolvedServiceType === "porter"
                ? "Parcel delivery not found"
                : resolvedServiceType === "carPool"
                ? "Ride share not found"
                : "Ride not found"}
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
                Go Home
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const activeRating = hoveredRating || rating;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }} edges={["top", "bottom"]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
          <View
            style={{
              alignItems: "center",
              paddingTop: 36,
              paddingBottom: 24,
              paddingHorizontal: 24,
            }}
          >
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: "#FFF7F2",
                borderWidth: 3,
                borderColor: BRAND_ORANGE,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <CheckCircle size={52} color={BRAND_ORANGE} />
            </View>
            <Text
              style={{
                fontSize: 28,
                color: "#111827",
                textAlign: "center",
                marginBottom: 6,
                fontFamily: "Figtree_700Bold",
              }}
            >
              {serviceView.title}
            </Text>
            {serviceView.companionText ? (
              <Text
                style={{
                  fontSize: 15,
                  color: "#6B7280",
                  textAlign: "center",
                  fontFamily: "Figtree_400Regular",
                }}
              >
                {serviceView.companionText}
              </Text>
            ) : null}
          </View>

          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#F9FAFB",
                borderRadius: 24,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  color: "#111827",
                  fontFamily: "Figtree_700Bold",
                }}
              >
                {serviceView.amount}
              </Text>
              {serviceView.distance ? (
                <>
                  <Text
                    style={{
                      fontSize: 16,
                      color: "#D1D5DB",
                      marginHorizontal: 8,
                      fontFamily: "Figtree_400Regular",
                    }}
                  >
                    �
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      color: "#6B7280",
                      fontFamily: "Figtree_600SemiBold",
                    }}
                  >
                    {serviceView.distance}
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 24,
              backgroundColor: "#F9FAFB",
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: "#F3F4F6",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <MapPin size={16} color="#16A34A" style={{ marginTop: 2, marginRight: 10 }} />
              <Text
                style={{
                  fontSize: 13,
                  color: "#374151",
                  flex: 1,
                  fontFamily: "Figtree_400Regular",
                }}
                numberOfLines={2}
              >
                {serviceView.pickup}
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
              <Flag size={16} color="#EF4444" style={{ marginTop: 2, marginRight: 10 }} />
              <Text
                style={{
                  fontSize: 13,
                  color: "#374151",
                  flex: 1,
                  fontFamily: "Figtree_400Regular",
                }}
                numberOfLines={2}
              >
                {serviceView.destination}
              </Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 20,
                color: "#111827",
                textAlign: "center",
                marginBottom: 20,
                fontFamily: "Figtree_700Bold",
              }}
            >
              Rate your experience
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const isFilled = star <= activeRating;
                return (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    onPressIn={() => setHoveredRating(star)}
                    onPressOut={() => setHoveredRating(0)}
                    style={{ marginHorizontal: 6 }}
                    activeOpacity={0.85}
                  >
                    <Star
                      size={48}
                      color={isFilled ? BRAND_ORANGE : "#E5E7EB"}
                      fill={isFilled ? BRAND_ORANGE : "transparent"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeRating > 0 ? (
              <Text
                style={{
                  textAlign: "center",
                  fontSize: 16,
                  color: BRAND_ORANGE,
                  marginBottom: 16,
                  fontFamily: "Figtree_700Bold",
                }}
              >
                {RATING_LABELS[activeRating]}
              </Text>
            ) : null}

            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: "#374151",
                  marginBottom: 8,
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                Additional feedback (optional)
              </Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder={serviceView.feedbackPlaceholder}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 16,
                  padding: 14,
                  minHeight: 100,
                  color: "#111827",
                  fontSize: 14,
                  textAlignVertical: "top",
                }}
              />
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <TouchableOpacity
              onPress={handleSubmitRating}
              disabled={rating === 0 || submitting}
              style={{
                paddingVertical: 16,
                backgroundColor: rating === 0 || submitting ? "#D1D5DB" : BRAND_ORANGE,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color="#FFF" />
                  <Text
                    style={{
                      fontSize: 17,
                      color: "#FFF",
                      fontFamily: "Figtree_700Bold",
                    }}
                  >
                    Submitting...
                  </Text>
                </>
              ) : (
                <Text
                  style={{
                    fontSize: 17,
                    color: rating === 0 ? "#9CA3AF" : "#FFF",
                    fontFamily: "Figtree_700Bold",
                  }}
                >
                  Submit Rating
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/(tabs)")}
              disabled={submitting}
              style={{ paddingVertical: 14, alignItems: "center" }}
            >
              <Text
                style={{
                  fontSize: 15,
                  color: "#9CA3AF",
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                Skip for Now
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
