/**
 * Manage Car Pool Screen (Driver)
 * Allows drivers to manage their car pool: view members, accept/reject requests, open/confirm pool
 *
 * Uber-style full-screen map + bottom sheet
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, RefreshControl, TouchableOpacity, Dimensions, Platform, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  LocateFixed,
  Users,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useAlert } from "@/context/alert-context";
import { useToast } from "@/components/ui/toast";
import { Loading } from "@/components/ui/loading";
import { useCurrentLocation } from "@/lib/services/location";
import {
  getMyCarPools,
  getCarPoolById,
  openCarPool,
  confirmCarPool,
  acceptJoinRequest,
  rejectJoinRequest,
  cancelCarPool,
  type CarPoolResponse,
  type CarPoolMemberResponse,
  CarPoolStatus,
  CarPoolMemberStatus,
  isCarPoolActive,
  canDriverCancel,
  getNextDriverStatus,
  getDriverActionLabel,
  getStatusLabel,
  getStatusColor,
  getMemberStatusLabel,
  getMemberStatusColor,
  formatFare,
  formatDepartureTime,
  getAvailableSeats,
} from "@/lib/api/carPool";
import { dispatchServiceCompleted, dispatchServiceUpdated } from "@/lib/events";
import { MAP_STYLE } from "@/constants/map-style";

const BRAND_PURPLE = "#843FE3";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAP_HEIGHT = SCREEN_HEIGHT * 0.3;
const REFRESH_INTERVAL = 10000;
const LATITUDE_DELTA = 0.04;
const LONGITUDE_DELTA = LATITUDE_DELTA * 0.5;

export default function ManageCarPoolScreen() {
  const { userType } = useAuth();
  const toast = useToast();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const { location: currentLocation } = useCurrentLocation();

  // State
  const [carPool, setCarPool] = useState<CarPoolResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [memberActionLoading, setMemberActionLoading] = useState<
    Record<string, boolean>
  >({});

  // Fetch active car pool on mount
  useEffect(() => {
    fetchMyCarPools();
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!carPool || !isCarPoolActive(carPool.status)) return;

    const interval = setInterval(() => {
      fetchMyCarPools(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [carPool]);

  const fetchMyCarPools = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);

    try {
      // Only fetch active pools (CREATED, OPEN, CONFIRMED, IN_PROGRESS)
      const response = await getMyCarPools(1, 1, [
        CarPoolStatus.CREATED,
        CarPoolStatus.OPEN,
        CarPoolStatus.CONFIRMED,
        CarPoolStatus.IN_PROGRESS,
      ]);

      if (response.success && response.data && response.data.length > 0) {
        const activePool = response.data[0]; // Already filtered by status
        // Fetch full details
        const detailsResponse = await getCarPoolById(activePool.id);
        if (detailsResponse.success && detailsResponse.data) {
          setCarPool(detailsResponse.data);
        } else {
          setCarPool(activePool);
        }
      } else {
        setCarPool(null);
      }
    } catch (error) {
      console.error("[ManageCarPool] Error fetching car pools:", error);
      if (!silent) {
        toast.error(
          "Failed to fetch ride share details.",
          "Please pull down to refresh."
        );
      }
      setCarPool(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMyCarPools();
    setRefreshing(false);
  };

  const handleOpenPool = async () => {
    if (!carPool) return;

    
    setActionLoading(true);
    try {
      const response = await openCarPool(carPool.id);

      if (response.success && response.data) {
        setCarPool(response.data);
        dispatchServiceUpdated();
        toast.success("Ride share is now open for passengers to join!");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to open ride share";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error opening car pool:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmPool = async () => {
    if (!carPool) return;

    setActionLoading(true);
    try {
      const response = await confirmCarPool(carPool.id);

      if (response.success && response.data) {
        setCarPool(response.data);
        dispatchServiceUpdated();
        toast.success("Ride share confirmed! You can now start the ride.");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to confirm ride share";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error confirming car pool:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async (memberId: string) => {
    if (!carPool) return;

    setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
    try {
      const response = await acceptJoinRequest(carPool.id, memberId);

      if (response.success) {
        await fetchMyCarPools(true);
        toast.success("Join request accepted!");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to accept join request";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error accepting join request:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setMemberActionLoading((prev) => ({ ...prev, [memberId]: false }));
    }
  };

  const handleRejectRequest = async (memberId: string) => {
    if (!carPool) return;

    showAlert(
      "Reject Request",
      "Are you sure you want to reject this join request?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async () => {
            setMemberActionLoading((prev) => ({ ...prev, [memberId]: true }));
            try {
              const response = await rejectJoinRequest(carPool.id, memberId);

              if (response.success) {
                await fetchMyCarPools(true);
                toast.info("Join request rejected.");
              } else {
                const errorMessage =
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? String((response.error as { message: string }).message)
                    : "Failed to reject join request";
                toast.error(errorMessage);
              }
            } catch (error) {
              console.error("Error rejecting join request:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setMemberActionLoading((prev) => ({
                ...prev,
                [memberId]: false,
              }));
            }
          },
        },
      ]
    );
  };

  const handleCancelPool = async () => {
    if (!carPool) return;

    showAlert(
      "Cancel Ride Share",
      "Are you sure you want to cancel this ride share? All members will be notified.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelLoading(true);

            try {
              const response = await cancelCarPool(
                carPool.id,
                "Cancelled by driver"
              );

              if (response.success) {
                dispatchServiceCompleted();
                toast.success("Ride share cancelled.");
                setCarPool(null);
                router.replace("/(tabs)");
              } else {
                const errorMessage =
                  typeof response.error === "object" &&
                  response.error !== null &&
                  "message" in response.error
                    ? String((response.error as { message: string }).message)
                    : "Failed to cancel ride share";
                toast.error(errorMessage);
              }
            } catch (error) {
              console.error("Error cancelling car pool:", error);
              toast.error("Something went wrong. Please try again.");
            } finally {
              setCancelLoading(false);
            }
          },
        },
      ]
    );
  };

  // Map locations
  const mapLocations = React.useMemo(() => {
    if (!carPool) return { start: undefined, end: undefined };

    const start =
      carPool.startLatitude && carPool.startLongitude
        ? {
            latitude: Number(carPool.startLatitude),
            longitude: Number(carPool.startLongitude),
            title: carPool.startLocation || "Start",
          }
        : undefined;

    const end =
      carPool.endLatitude && carPool.endLongitude
        ? {
            latitude: Number(carPool.endLatitude),
            longitude: Number(carPool.endLongitude),
            title: carPool.endLocation || "End",
          }
        : undefined;

    return { start, end };
  }, [carPool]);

  // Get pending members
  const pendingMembers =
    carPool?.members?.filter((m) => m.status === CarPoolMemberStatus.PENDING) ||
    [];
  const confirmedMembers =
    carPool?.members?.filter(
      (m) =>
        m.status === CarPoolMemberStatus.CONFIRMED ||
        m.status === CarPoolMemberStatus.OTP_AVAILABLE
    ) || [];
  const inRideMembers =
    carPool?.members?.filter((m) => m.status === CarPoolMemberStatus.IN_RIDE) ||
    [];

  // Get driver action info
  const driverActionLabel = carPool
    ? getDriverActionLabel(carPool.status)
    : null;
  const nextStatus = carPool ? getNextDriverStatus(carPool.status) : null;
  const canCancel = carPool && canDriverCancel(carPool.status);

  const snapPoints = useMemo(() => ["40%", "70%", "92%"], []);

  const initialRegion = useMemo(() => {
    if (mapLocations.start) {
      return {
        latitude: mapLocations.start.latitude,
        longitude: mapLocations.start.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    }
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    }
    return {
      latitude: 51.5074,
      longitude: -0.1278,
      latitudeDelta: LATITUDE_DELTA,
      longitudeDelta: LONGITUDE_DELTA,
    };
  }, [mapLocations.start, currentLocation]);

  const fitMapToMarkers = useCallback(() => {
    if (!mapRef.current) return;
    const coords: { latitude: number; longitude: number }[] = [];
    if (mapLocations.start)
      coords.push({
        latitude: mapLocations.start.latitude,
        longitude: mapLocations.start.longitude,
      });
    if (mapLocations.end)
      coords.push({
        latitude: mapLocations.end.latitude,
        longitude: mapLocations.end.longitude,
      });
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
        animated: true,
      });
    } else if (coords.length === 1) {
      mapRef.current.animateToRegion(
        {
          ...coords[0],
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        },
        600
      );
    }
  }, [mapLocations]);

  const centerOnCurrentLocation = useCallback(() => {
    if (!mapRef.current || !currentLocation) return;
    mapRef.current.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      },
      600
    );
  }, [currentLocation]);

  useEffect(() => {
    if (carPool && (mapLocations.start || mapLocations.end)) {
      setTimeout(fitMapToMarkers, 500);
    }
  }, [carPool, fitMapToMarkers]);

  // Show loading state
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F9FAFB",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loading message="Loading ride share..." />
      </View>
    );
  }

  // Show no active car pool state
  if (!carPool) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F9FAFB",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#F3F4F6",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Users size={40} color="#6B7280" />
        </View>
        <Text
          style={{
            fontFamily: "Figtree_700Bold",
            fontSize: 20,
            color: "#111827",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          No Active Ride Share
        </Text>
        <Text
          style={{
            fontFamily: "Figtree_400Regular",
            fontSize: 15,
            color: "#6B7280",
            textAlign: "center",
            marginBottom: 24,
            lineHeight: 22,
          }}
        >
          Create a ride share to start sharing your ride and earning money.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/create-car-pool")}
          activeOpacity={0.85}
          style={{
            backgroundColor: BRAND_PURPLE,
            paddingHorizontal: 32,
            paddingVertical: 16,
            borderRadius: 14,
            flexDirection: "row",
            alignItems: "center",
            ...Platform.select({
              ios: {
                shadowColor: BRAND_PURPLE,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              },
              android: { elevation: 4 },
            }),
          }}
        >
          <Plus size={20} color="#FFFFFF" strokeWidth={2.5} />
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 16,
              color: "#FFFFFF",
              marginLeft: 8,
            }}
          >
            Create Ride Share
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Show message if not a driver
  if (userType !== "driver") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F9FAFB",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: "#F3F4F6",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <User size={40} color="#6B7280" />
        </View>
        <Text
          style={{
            fontFamily: "Figtree_700Bold",
            fontSize: 20,
            color: "#111827",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Passenger Account
        </Text>
        <Text
          style={{
            fontFamily: "Figtree_400Regular",
            fontSize: 15,
            color: "#6B7280",
            textAlign: "center",
            lineHeight: 22,
          }}
        >
          This screen is for drivers. Go to Browse tab to find ride shares.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F9FAFB" }}>
      {/* Full-screen Map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onMapReady={fitMapToMarkers}
      >
        {mapLocations.start && (
          <Marker
            coordinate={{
              latitude: mapLocations.start.latitude,
              longitude: mapLocations.start.longitude,
            }}
            title={mapLocations.start.title}
          >
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: "#16A34A",
                  borderWidth: 2,
                  borderColor: "#FFFFFF",
                }}
              />
            </View>
          </Marker>
        )}
        {mapLocations.end && (
          <Marker
            coordinate={{
              latitude: mapLocations.end.latitude,
              longitude: mapLocations.end.longitude,
            }}
            title={mapLocations.end.title}
          >
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: "#EF4444",
                  borderWidth: 2,
                  borderColor: "#FFFFFF",
                }}
              />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Back Button */}
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.85}
        style={{
          position: "absolute",
          top: insets.top + 12,
          left: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.12,
              shadowRadius: 6,
            },
            android: { elevation: 4 },
          }),
        }}
      >
        <ArrowLeft size={22} color="#111827" />
      </TouchableOpacity>

      {/* LocateFixed Button */}
      <TouchableOpacity
        onPress={centerOnCurrentLocation}
        activeOpacity={0.85}
        style={{
          position: "absolute",
          top: insets.top + 12,
          right: 16,
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: BRAND_PURPLE,
          alignItems: "center",
          justifyContent: "center",
          ...Platform.select({
            ios: {
              shadowColor: BRAND_PURPLE,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
            },
            android: { elevation: 4 },
          }),
        }}
      >
        <LocateFixed size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <BottomSheet
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture={true}
        android_keyboardInputMode="adjustResize"
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={{
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
        handleIndicatorStyle={{
          backgroundColor: "#D1D5DB",
          width: 40,
          height: 4,
          borderRadius: 2,
        }}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Status Header Card */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 16,
              marginBottom: 16,
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                },
                android: { elevation: 2 },
              }),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 20,
                  backgroundColor: `${getStatusColor(carPool.status)}18`,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 13,
                    color: getStatusColor(carPool.status),
                  }}
                >
                  {getStatusLabel(carPool.status)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Clock size={14} color="#9CA3AF" />
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#9CA3AF",
                    marginLeft: 4,
                  }}
                >
                  {formatDepartureTime(carPool.departureTime)}
                </Text>
              </View>
            </View>

            {/* Route */}
            <View style={{ marginBottom: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#16A34A",
                    marginRight: 10,
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 15,
                    color: "#111827",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {carPool.startLocation}
                </Text>
              </View>
              <View
                style={{
                  width: 1,
                  height: 16,
                  backgroundColor: "#E5E7EB",
                  marginLeft: 4.5,
                  marginBottom: 8,
                }}
              />
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: "#EF4444",
                    marginRight: 10,
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 15,
                    color: "#111827",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {carPool.endLocation}
                </Text>
              </View>
            </View>

            {/* Passengers count */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Users size={15} color="#6B7280" />
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 13,
                  color: "#6B7280",
                  marginLeft: 6,
                }}
              >
                {carPool.currentPassengerCount} / {carPool.maxPassengers}{" "}
                passengers
              </Text>
              {carPool.status === CarPoolStatus.OPEN && (
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#16A34A",
                    marginLeft: 4,
                  }}
                >
                  {" \u2022 "}
                  {getAvailableSeats(
                    carPool.maxPassengers,
                    carPool.currentPassengerCount
                  )}{" "}
                  seats available
                </Text>
              )}
            </View>
          </View>

          {/* Fare Breakdown Card */}
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 16,
              marginBottom: 16,
              ...Platform.select({
                ios: {
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                },
                android: { elevation: 2 },
              }),
            }}
          >
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 13,
                color: "#9CA3AF",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 12,
              }}
            >
              Fare Breakdown
            </Text>
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
                Price per Passenger
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                {formatFare(carPool.baseFare)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 14,
                  color: "#6B7280",
                }}
              >
                Passengers ({carPool.currentPassengerCount})
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_500Medium",
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                {formatFare(
                  carPool.baseFare * carPool.currentPassengerCount
                )}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 15,
                  color: "#111827",
                }}
              >
                Total Earnings
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 18,
                  color: "#16A34A",
                }}
              >
                {formatFare(
                  carPool.totalFareForDriver ||
                    carPool.baseFare * carPool.currentPassengerCount
                )}
              </Text>
            </View>
          </View>

          {/* Notes */}
          {carPool.notes && (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                padding: 16,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 13,
                  color: "#9CA3AF",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 8,
                }}
              >
                Notes
              </Text>
              <Text
                style={{
                  fontFamily: "Figtree_400Regular",
                  fontSize: 14,
                  color: "#111827",
                  lineHeight: 20,
                }}
              >
                {carPool.notes}
              </Text>
            </View>
          )}

          {/* Pending Join Requests */}
          {pendingMembers.length > 0 &&
            carPool.status === CarPoolStatus.OPEN && (
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 17,
                    color: "#111827",
                    marginBottom: 12,
                  }}
                >
                  Pending Requests ({pendingMembers.length})
                </Text>
                {pendingMembers.map((member) => (
                  <View
                    key={member.id}
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      padding: 16,
                      marginBottom: 12,
                      ...Platform.select({
                        ios: {
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.06,
                          shadowRadius: 4,
                        },
                        android: { elevation: 2 },
                      }),
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: "Figtree_600SemiBold",
                            fontSize: 15,
                            color: "#111827",
                          }}
                        >
                          {member.passenger?.fullName || "Passenger"}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Figtree_400Regular",
                            fontSize: 13,
                            color: "#9CA3AF",
                            marginTop: 2,
                          }}
                        >
                          {member.passenger?.phone || ""}
                        </Text>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 20,
                          backgroundColor: `${getMemberStatusColor(
                            member.status
                          )}18`,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Figtree_600SemiBold",
                            fontSize: 11,
                            color: getMemberStatusColor(member.status),
                          }}
                        >
                          {getMemberStatusLabel(member.status)}
                        </Text>
                      </View>
                    </View>

                    {/* Route indicators */}
                    <View style={{ marginBottom: 14 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          marginBottom: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 5,
                            backgroundColor: "#16A34A",
                            marginRight: 10,
                            marginTop: 4,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: "Figtree_400Regular",
                            fontSize: 13,
                            color: "#6B7280",
                            flex: 1,
                            lineHeight: 18,
                          }}
                        >
                          {member.pickupLocation}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 1,
                          height: 10,
                          backgroundColor: "#E5E7EB",
                          marginLeft: 4.5,
                        }}
                      />
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          marginTop: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            backgroundColor: "#EF4444",
                            marginRight: 10,
                            marginTop: 4,
                          }}
                        />
                        <Text
                          style={{
                            fontFamily: "Figtree_400Regular",
                            fontSize: 13,
                            color: "#6B7280",
                            flex: 1,
                            lineHeight: 18,
                          }}
                        >
                          {member.destinationLocation}
                        </Text>
                      </View>
                    </View>

                    {/* Accept / Reject buttons */}
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => handleAcceptRequest(member.id)}
                        disabled={memberActionLoading[member.id]}
                        activeOpacity={0.85}
                        style={{
                          flex: 1,
                          backgroundColor: BRAND_PURPLE,
                          paddingVertical: 12,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          opacity: memberActionLoading[member.id] ? 0.6 : 1,
                        }}
                      >
                        {memberActionLoading[member.id] ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <CheckCircle2 size={16} color="#FFFFFF" />
                            <Text
                              style={{
                                fontFamily: "Figtree_600SemiBold",
                                fontSize: 14,
                                color: "#FFFFFF",
                                marginLeft: 6,
                              }}
                            >
                              Accept
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRejectRequest(member.id)}
                        disabled={memberActionLoading[member.id]}
                        activeOpacity={0.85}
                        style={{
                          flex: 1,
                          backgroundColor: "#FFFFFF",
                          paddingVertical: 12,
                          borderRadius: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          borderWidth: 1.5,
                          borderColor: "#EF4444",
                          opacity: memberActionLoading[member.id] ? 0.6 : 1,
                        }}
                      >
                        {memberActionLoading[member.id] ? (
                          <ActivityIndicator size="small" color="#EF4444" />
                        ) : (
                          <>
                            <XCircle size={16} color="#EF4444" />
                            <Text
                              style={{
                                fontFamily: "Figtree_600SemiBold",
                                fontSize: 14,
                                color: "#EF4444",
                                marginLeft: 6,
                              }}
                            >
                              Reject
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

          {/* Confirmed Members */}
          {confirmedMembers.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 17,
                  color: "#111827",
                  marginBottom: 12,
                }}
              >
                Confirmed Passengers ({confirmedMembers.length})
              </Text>
              {confirmedMembers.map((member) => (
                <View
                  key={member.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    padding: 16,
                    marginBottom: 12,
                    ...Platform.select({
                      ios: {
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius: 4,
                      },
                      android: { elevation: 2 },
                    }),
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 15,
                          color: "#111827",
                        }}
                      >
                        {member.passenger?.fullName || "Passenger"}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 13,
                          color: "#9CA3AF",
                          marginTop: 2,
                        }}
                      >
                        {member.passenger?.phone || ""}
                      </Text>
                    </View>
                    {member.fare && (
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 15,
                          color: "#16A34A",
                        }}
                      >
                        {formatFare(member.fare)}
                      </Text>
                    )}
                  </View>
                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        marginBottom: 6,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: "#16A34A",
                          marginRight: 10,
                          marginTop: 4,
                        }}
                      />
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 13,
                          color: "#6B7280",
                          flex: 1,
                          lineHeight: 18,
                        }}
                      >
                        {member.pickupLocation}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 1,
                        height: 10,
                        backgroundColor: "#E5E7EB",
                        marginLeft: 4.5,
                      }}
                    />
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        marginTop: 6,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          backgroundColor: "#EF4444",
                          marginRight: 10,
                          marginTop: 4,
                        }}
                      />
                      <Text
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 13,
                          color: "#6B7280",
                          flex: 1,
                          lineHeight: 18,
                        }}
                      >
                        {member.destinationLocation}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Driver Actions */}
          {carPool.status === CarPoolStatus.CREATED && (
            <TouchableOpacity
              onPress={handleOpenPool}
              disabled={actionLoading}
              activeOpacity={0.85}
              style={{
                backgroundColor: BRAND_PURPLE,
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
                opacity: actionLoading ? 0.6 : 1,
                ...Platform.select({
                  ios: {
                    shadowColor: BRAND_PURPLE,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  },
                  android: { elevation: 4 },
                }),
              }}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 16,
                    color: "#FFFFFF",
                  }}
                >
                  Open for Joining
                </Text>
              )}
            </TouchableOpacity>
          )}

          {carPool.status === CarPoolStatus.OPEN && (
            <TouchableOpacity
              onPress={handleConfirmPool}
              disabled={actionLoading || pendingMembers.length > 0}
              activeOpacity={0.85}
              style={{
                backgroundColor: BRAND_PURPLE,
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
                opacity: actionLoading || pendingMembers.length > 0 ? 0.6 : 1,
                ...Platform.select({
                  ios: {
                    shadowColor: BRAND_PURPLE,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  },
                  android: { elevation: 4 },
                }),
              }}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 16,
                    color: "#FFFFFF",
                  }}
                >
                  {pendingMembers.length > 0
                    ? `Accept/Reject ${pendingMembers.length} Request${
                        pendingMembers.length > 1 ? "s" : ""
                      } First`
                    : "Confirm Pool"}
                </Text>
              )}
            </TouchableOpacity>
          )}

          {carPool.status === CarPoolStatus.CONFIRMED && (
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/active-car-pool")}
              activeOpacity={0.85}
              style={{
                backgroundColor: BRAND_PURPLE,
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
                ...Platform.select({
                  ios: {
                    shadowColor: BRAND_PURPLE,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  },
                  android: { elevation: 4 },
                }),
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 16,
                  color: "#FFFFFF",
                }}
              >
                Start Ride
              </Text>
            </TouchableOpacity>
          )}

          {/* Cancel Button */}
          {canCancel && (
            <TouchableOpacity
              onPress={handleCancelPool}
              disabled={cancelLoading || actionLoading}
              activeOpacity={0.85}
              style={{
                backgroundColor: "#FFFFFF",
                paddingVertical: 16,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#EF4444",
                opacity: cancelLoading || actionLoading ? 0.6 : 1,
              }}
            >
              {cancelLoading ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 16,
                    color: "#EF4444",
                  }}
                >
                  Cancel Ride Share
                </Text>
              )}
            </TouchableOpacity>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
}
