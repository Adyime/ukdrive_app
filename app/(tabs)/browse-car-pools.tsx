/**
 * Browse Ride Shares Screen (Passenger)
 * Uber-style full-screen map + bottom sheet with search and results
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Platform, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  LocateFixed,
  Car,
  Users,
  Minus,
  Plus,
  Star,
  Clock,
  MapPin,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import {
  getAvailableCarPools,
  joinCarPool,
  type AvailableCarPool,
  type JoinCarPoolRequest,
  CarPoolStatus,
  formatFare,
  formatDepartureTime,
  getAvailableSeats,
} from "@/lib/api/carPool";
import { updatePassengerLocation } from "@/lib/api/passenger";
import {
  useCurrentLocation,
  useLocationPermissions,
} from "@/lib/services/location";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapEditor } from "@/components/map-editor";
import { PickupMarker, DestinationMarker } from "@/components/map-markers";
import {
  SAMPLE_LOCATIONS,
  type LocationWithAddress,
} from "@/lib/utils/location";
import { dispatchServiceCreated } from "@/lib/events";
import {
  subscribeToOpenCarPoolsUpdates,
  unsubscribeChannel,
} from "@/lib/supabase";
import { MAP_STYLE } from "@/constants/map-style";

const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * 0.5;
const BRAND_ORANGE = "#F36D14";
const MIN_BOOKING_PASSENGERS = 1;
const RIDE_SHARE_SEARCH_RADIUS_KM = 14;

export default function BrowseCarPoolsScreen() {
  const { userType } = useAuth();
  const toast = useToast();
  const { location: currentLocation } = useCurrentLocation();
  const { permissions, requestForeground } = useLocationPermissions();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const openPoolsChannelRef = useRef<ReturnType<
    typeof subscribeToOpenCarPoolsUpdates
  > | null>(null);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => [280, "55%", "90%"], []);

  const [pools, setPools] = useState<AvailableCarPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupCoords, setPickupCoords] = useState<LocationWithAddress | null>(
    null
  );
  const [destinationLocation, setDestinationLocation] = useState("");
  const [destinationCoords, setDestinationCoords] =
    useState<LocationWithAddress | null>(null);
  const [showPickupAutocomplete, setShowPickupAutocomplete] = useState(false);
  const [showDestinationAutocomplete, setShowDestinationAutocomplete] =
    useState(false);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [editingLocationType, setEditingLocationType] = useState<
    "pickup" | "destination" | null
  >(null);
  const [joiningPoolId, setJoiningPoolId] = useState<string | null>(null);
  const [requestedPassengers, setRequestedPassengers] = useState(1);
  const skipInitialFocusRefreshRef = useRef(true);
  const activeSearchFetchIdRef = useRef(0);

  const limit = 20;
  const bothLocationsSelected =
    pickupCoords !== null && destinationCoords !== null;

  const getMapRegion = () => {
    if (pickupCoords && destinationCoords) {
      const minLat = Math.min(
        pickupCoords.latitude,
        destinationCoords.latitude
      );
      const maxLat = Math.max(
        pickupCoords.latitude,
        destinationCoords.latitude
      );
      const minLng = Math.min(
        pickupCoords.longitude,
        destinationCoords.longitude
      );
      const maxLng = Math.max(
        pickupCoords.longitude,
        destinationCoords.longitude
      );
      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * 1.5, LATITUDE_DELTA),
        longitudeDelta: Math.max((maxLng - minLng) * 1.5, LONGITUDE_DELTA),
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
      latitude: 28.6139,
      longitude: 77.209,
      latitudeDelta: LATITUDE_DELTA,
      longitudeDelta: LONGITUDE_DELTA,
    };
  };
  const mapRegion = getMapRegion();

  useEffect(() => {
    if (currentLocation && !pickupCoords && userType === "passenger") {
      setPickupCoords(currentLocation);
      setPickupLocation(
        currentLocation.address ||
          `${currentLocation.latitude.toFixed(
            6
          )}, ${currentLocation.longitude.toFixed(6)}`
      );
      updatePassengerLocation(
        currentLocation.latitude,
        currentLocation.longitude,
        currentLocation.address
      ).catch(() => {});
    }
  }, [currentLocation, pickupCoords, userType]);

  useEffect(() => {
    if (pickupCoords && destinationCoords && mapRef.current) {
      mapRef.current.fitToCoordinates([pickupCoords, destinationCoords], {
        edgePadding: { top: 80, right: 50, bottom: 300, left: 50 },
        animated: true,
      });
    }
  }, [pickupCoords, destinationCoords]);

  const resetSearchState = useCallback(() => {
    setPools([]);
    setPage(1);
    setHasMore(true);
    setTotal(0);
    setError(null);
  }, []);

  const fetchPools = useCallback(
    async (
      pageNum: number = 1,
      append: boolean = false,
      resetBeforeFetch: boolean = false
    ) => {
      const fetchId = append
        ? activeSearchFetchIdRef.current
        : activeSearchFetchIdRef.current + 1;
      if (!append) {
        activeSearchFetchIdRef.current = fetchId;
      }

      if (!pickupCoords || !destinationCoords) {
        if (!append) {
          if (resetBeforeFetch) {
            resetSearchState();
          }
          setLoading(false);
        }
        return;
      }
      try {
        setError(null);
        if (!append) {
          if (resetBeforeFetch) {
            resetSearchState();
          }
          setLoading(true);
        }
        const response = await getAvailableCarPools({
          latitude: pickupCoords.latitude,
          longitude: pickupCoords.longitude,
          destinationLatitude: destinationCoords.latitude,
          destinationLongitude: destinationCoords.longitude,
          radius: RIDE_SHARE_SEARCH_RADIUS_KM,
          page: pageNum,
          limit,
        });
        if (fetchId !== activeSearchFetchIdRef.current) {
          return;
        }
        if (response.success && response.data) {
          const fetched = response.data.filter((pool) => {
            if (pool.status !== CarPoolStatus.OPEN) return false;
            if (
              getAvailableSeats(pool.maxPassengers, pool.currentPassengerCount) <=
              0
            ) {
              return false;
            }
            const departureMs = new Date(pool.departureTime).getTime();
            return Number.isFinite(departureMs) ? departureMs > Date.now() : true;
          });
          const meta = response.meta;
          if (append) setPools((prev) => [...prev, ...fetched]);
          else setPools(fetched);
          setTotal(meta?.total || fetched.length);
          setHasMore(meta?.hasMore || fetched.length === limit);
          setPage(pageNum);
        } else {
          const msg =
            typeof response.error === "object" &&
            response.error !== null &&
            "message" in response.error
              ? String((response.error as { message: string }).message)
              : "Failed to load ride shares";
          setError(msg);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load ride shares"
        );
      } finally {
        if (!append) setLoading(false);
      }
    },
    [pickupCoords, destinationCoords, limit, resetSearchState]
  );

  const loadInitial = useCallback(async () => {
    if (!pickupCoords || !destinationCoords) {
      setLoading(false);
      return;
    }
    await fetchPools(1, false, true);
  }, [fetchPools, pickupCoords, destinationCoords]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchPools(page + 1, true, false);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchPools]);

  const handleJoinPool = async (pool: AvailableCarPool) => {
    if (!pickupCoords || !destinationCoords) {
      toast.warning("Please select both pickup and destination locations.");
      return;
    }
    const availableSeats = getAvailableSeats(
      pool.maxPassengers,
      pool.currentPassengerCount
    );
    if (requestedPassengers > availableSeats) {
      toast.error(
        `Only ${availableSeats} seat${availableSeats !== 1 ? "s are" : " is"} available in this pool.`
      );
      return;
    }

    setJoiningPoolId(pool.id);
    try {
      const joinData: JoinCarPoolRequest = {
        pickupLatitude: pickupCoords.latitude,
        pickupLongitude: pickupCoords.longitude,
        pickupLocation,
        destinationLatitude: destinationCoords.latitude,
        destinationLongitude: destinationCoords.longitude,
        destinationLocation,
        passengerCount: requestedPassengers,
      };
      const response = await joinCarPool(pool.id, joinData);
      if (response.success) {
        dispatchServiceCreated();
        const successMessage =
          response.data?.status === "CONFIRMED"
            ? "Additional seats added to your booking."
            : "Your join request has been sent to the driver.";
        toast.success(successMessage);
        router.push("/(tabs)/active-car-pool");
      } else {
        const errorCode =
          typeof response.error === "object" &&
          response.error !== null &&
          "code" in response.error
            ? String((response.error as { code?: string }).code || "").toUpperCase()
            : "";

        // If pool stopped accepting (cancelled/closed) while this screen was open,
        // remove stale card immediately and refresh list.
        if (errorCode === "CAR_POOL_NOT_OPEN" || errorCode === "CAR_POOL_NOT_FOUND") {
          setPools((prev) => prev.filter((p) => p.id !== pool.id));
          void fetchPools(1, false, true);
        }

        const msg =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to join ride share";
        toast.error(msg);
      }
    } catch (err) {
      console.error("Error joining car pool:", err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setJoiningPoolId(null);
    }
  };

  const handlePickupSelect = (location: LocationWithAddress) => {
    setPickupCoords(location);
    setPickupLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
  };

  const handleDestinationSelect = (location: LocationWithAddress) => {
    setDestinationCoords(location);
    setDestinationLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
  };

  const handleDestinationSelected = useCallback(
    (location: LocationWithAddress) => {
      handleDestinationSelect(location);
      bottomSheetRef.current?.snapToIndex(1);
    },
    []
  );

  const handlePickupSelected = useCallback((location: LocationWithAddress) => {
    handlePickupSelect(location);
  }, []);

  const handleMapEdit = (
    location: LocationWithAddress,
    locationType: "pickup" | "destination"
  ) => {
    if (locationType === "pickup") {
      handlePickupSelect(location);
      return;
    }
    handleDestinationSelect(location);
    bottomSheetRef.current?.snapToIndex(1);
  };

  useEffect(() => {
    if (pickupCoords && destinationCoords) loadInitial();
    else setLoading(false);
  }, [pickupCoords, destinationCoords, loadInitial]);

  useFocusEffect(
    useCallback(() => {
      if (skipInitialFocusRefreshRef.current) {
        skipInitialFocusRefreshRef.current = false;
        return () => {};
      }
      if (pickupCoords && destinationCoords) {
        void fetchPools(1, false, true);
      }
      return () => {};
    }, [pickupCoords, destinationCoords, fetchPools])
  );

  useEffect(() => {
    if (currentLocation && !destinationCoords) setLoading(false);
  }, [currentLocation, destinationCoords]);

  useEffect(() => {
    if (!bothLocationsSelected) return;

    const channel = subscribeToOpenCarPoolsUpdates(
      () => {
        if (realtimeRefreshTimeoutRef.current) {
          clearTimeout(realtimeRefreshTimeoutRef.current);
        }
        realtimeRefreshTimeoutRef.current = setTimeout(() => {
          fetchPools(1, false);
        }, 500);
      },
      () => {
        // Keep UX stable if realtime channel fails; manual refresh still works.
      }
    );

    openPoolsChannelRef.current = channel;

    return () => {
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      if (openPoolsChannelRef.current) {
        unsubscribeChannel(openPoolsChannelRef.current);
        openPoolsChannelRef.current = null;
      }
    };
  }, [bothLocationsSelected, fetchPools]);

  const handleUseCurrentLocation = async () => {
    if (permissions.foreground !== "granted") {
      const granted = await requestForeground();
      if (!granted) return;
    }
    if (currentLocation) {
      setPickupCoords(currentLocation);
      setPickupLocation(
        currentLocation.address ||
          `${currentLocation.latitude.toFixed(
            6
          )}, ${currentLocation.longitude.toFixed(6)}`
      );
      if (userType === "passenger")
        updatePassengerLocation(
          currentLocation.latitude,
          currentLocation.longitude,
          currentLocation.address
        ).catch(() => {});
      mapRef.current?.animateToRegion({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      });
    }
  };

  if (userType !== "passenger") {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center p-6">
          <View className="w-20 h-20 bg-gray-200 rounded-full items-center justify-center mb-4">
            <Car size={40} color="#6B7280" />
          </View>
          <Text className="text-xl font-semibold text-gray-900 mb-2 text-center">
            Driver Account
          </Text>
          <Text className="text-gray-600 text-center">
            This screen is for passengers. Go to Create tab to create a car
            pool.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e" }}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
        initialRegion={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {pickupCoords && (
          <PickupMarker
            key="pickup-marker"
            coordinate={pickupCoords}
            title="Pickup"
          />
        )}
        {destinationCoords && (
          <DestinationMarker
            key="destination-marker"
            coordinate={destinationCoords}
            title="Destination"
          />
        )}
      </MapView>

      {/* Back button */}
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          top: insets.top + 10,
          left: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
            },
            android: { elevation: 4 },
          }),
        }}
      >
        <ArrowLeft size={22} color="#111827" />
      </TouchableOpacity>

      {/* Locate button */}
      <TouchableOpacity
        onPress={handleUseCurrentLocation}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          top: insets.top + 10,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: "#FFF",
          alignItems: "center",
          justifyContent: "center",
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
            },
            android: { elevation: 4 },
          }),
        }}
      >
        <LocateFixed size={20} color={BRAND_ORANGE} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <BottomSheet
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture={true}
        android_keyboardInputMode="adjustResize"
        ref={bottomSheetRef}
        index={2}
        snapPoints={snapPoints}
        backgroundStyle={{
          backgroundColor: "#FFF",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
        handleIndicatorStyle={{ backgroundColor: "#D1D5DB", width: 40 }}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          onScroll={({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { layoutMeasurement, contentOffset, contentSize } =
              nativeEvent;
            if (
              layoutMeasurement.height + contentOffset.y >=
              contentSize.height - 20
            )
              handleLoadMore();
          }}
          scrollEventThrottle={400}
        >
          {/* Header */}
          <View
            style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}
          >
            <Text
              style={{
                fontFamily: "Figtree_700Bold",
                fontSize: 20,
                color: "#111827",
              }}
            >
              Browse Ride Shares
            </Text>
          </View>

          {/* Pickup + Destination card */}
          <View
            style={{
              marginHorizontal: 16,
              backgroundColor: "#FFF",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#E5E7EB",
              padding: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => setShowPickupAutocomplete(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: "#16A34A",
                  marginRight: 12,
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: pickupLocation ? "#111827" : "#9CA3AF",
                  fontFamily: "Figtree_500Medium",
                }}
              >
                {pickupLocation || "Pickup location"}
              </Text>
            </TouchableOpacity>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingLeft: 4,
              }}
            >
              <View
                style={{
                  width: 2,
                  height: 16,
                  backgroundColor: "#D1D5DB",
                  borderRadius: 1,
                }}
              />
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: "#F3F4F6",
                  marginLeft: 16,
                }}
              />
            </View>
            <TouchableOpacity
              onPress={() => setShowDestinationAutocomplete(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: "#EF4444",
                  marginRight: 12,
                }}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: destinationLocation ? "#111827" : "#9CA3AF",
                  fontFamily: "Figtree_500Medium",
                }}
              >
                {destinationLocation || "Where are you going?"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content area */}
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            {error && (
              <View
                style={{
                  backgroundColor: "#FEF2F2",
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: "#DC2626", fontSize: 13 }}>{error}</Text>
              </View>
            )}

            {!bothLocationsSelected ? (
              /* Sample locations / empty state */
              <View>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: "#6B7280",
                    marginBottom: 12,
                  }}
                >
                  Popular destinations
                </Text>
                {SAMPLE_LOCATIONS.map((sample, idx) => (
                  <TouchableOpacity
                    key={sample.name}
                    onPress={() => {
                      handleDestinationSelect(sample as any);
                      bottomSheetRef.current?.snapToIndex(1);
                    }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
                      borderBottomWidth:
                        idx < SAMPLE_LOCATIONS.length - 1 ? 1 : 0,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: "#F3F4F6",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <MapPin size={18} color="#6B7280" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 14,
                          color: "#111827",
                        }}
                      >
                        {sample.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: "Figtree_400Regular",
                          fontSize: 12,
                          color: "#9CA3AF",
                          marginTop: 1,
                        }}
                      >
                        {`${sample.latitude.toFixed(
                          4
                        )}, ${sample.longitude.toFixed(4)}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : loading ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={BRAND_ORANGE} />
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#9CA3AF",
                    marginTop: 12,
                  }}
                >
                  Searching ride shares...
                </Text>
              </View>
            ) : pools.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  <Users size={32} color="#9CA3AF" />
                </View>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 16,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  No Ride Shares Found
                </Text>
                <Text
                  style={{
                    fontFamily: "Figtree_400Regular",
                    fontSize: 13,
                    color: "#9CA3AF",
                    textAlign: "center",
                    paddingHorizontal: 20,
                  }}
                >
                  No available ride shares found for your route. Try different
                  locations or check back later.
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 14,
                    color: "#6B7280",
                    marginBottom: 12,
                  }}
                >
                  {total} pool{total !== 1 ? "s" : ""} available
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "#FFF",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 12,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 13,
                      color: "#111827",
                    }}
                  >
                    Passengers in this booking
                  </Text>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        setRequestedPassengers((prev) =>
                          Math.max(MIN_BOOKING_PASSENGERS, prev - 1)
                        )
                      }
                      disabled={requestedPassengers <= MIN_BOOKING_PASSENGERS}
                      activeOpacity={0.8}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F3F4F6",
                      }}
                    >
                      <Minus
                        size={16}
                        color={
                          requestedPassengers <= MIN_BOOKING_PASSENGERS
                            ? "#D1D5DB"
                            : "#6B7280"
                        }
                      />
                    </TouchableOpacity>
                    <Text
                      style={{
                        minWidth: 24,
                        textAlign: "center",
                        fontFamily: "Figtree_700Bold",
                        fontSize: 16,
                        color: "#111827",
                      }}
                    >
                      {requestedPassengers}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setRequestedPassengers((prev) => Math.min(6, prev + 1))
                      }
                      activeOpacity={0.8}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#F3F4F6",
                      }}
                    >
                      <Plus size={16} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                </View>
                {pools.map((pool) => (
                  <CarPoolCard
                    key={pool.id}
                    pool={pool}
                    onJoin={() => handleJoinPool(pool)}
                    joining={joiningPoolId === pool.id}
                    requestedPassengers={requestedPassengers}
                  />
                ))}
                {loadingMore && (
                  <View style={{ paddingVertical: 16, alignItems: "center" }}>
                    <ActivityIndicator size="small" color={BRAND_ORANGE} />
                  </View>
                )}
                {!hasMore && pools.length > 0 && (
                  <Text
                    style={{
                      textAlign: "center",
                      color: "#9CA3AF",
                      fontSize: 13,
                      paddingVertical: 16,
                    }}
                  >
                    No more ride shares to load
                  </Text>
                )}
              </>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Autocomplete Modals */}
      <AddressAutocomplete
        visible={showPickupAutocomplete}
        onClose={() => setShowPickupAutocomplete(false)}
        onSelectLocation={handlePickupSelected}
        placeholder="Search for pickup location"
        locationType="pickup"
        currentValue={pickupLocation}
        onUseMapSelection={() => {
          setEditingLocationType("pickup");
          setShowMapEditor(true);
        }}
        onCurrentLocationUsed={(loc) =>
          userType === "passenger" &&
          updatePassengerLocation(
            loc.latitude,
            loc.longitude,
            loc.address
          ).catch(() => {})
        }
      />
      <AddressAutocomplete
        visible={showDestinationAutocomplete}
        onClose={() => setShowDestinationAutocomplete(false)}
        onSelectLocation={handleDestinationSelected}
        placeholder="Search for destination"
        locationType="destination"
        currentValue={destinationLocation}
        onUseMapSelection={() => {
          setEditingLocationType("destination");
          setShowMapEditor(true);
        }}
      />

      {/* Map Editor Modal */}
      {showMapEditor && (
        <MapEditor
          visible={showMapEditor}
          onClose={() => {
            setShowMapEditor(false);
            setEditingLocationType(null);
          }}
          onConfirm={(location) => {
            if (editingLocationType)
              handleMapEdit(location, editingLocationType);
            setShowMapEditor(false);
            setEditingLocationType(null);
          }}
          initialLocation={
            editingLocationType
              ? editingLocationType === "pickup"
                ? pickupCoords
                : destinationCoords
              : pickupCoords
          }
          locationType={editingLocationType || "pickup"}
          otherLocation={
            editingLocationType
              ? editingLocationType === "pickup"
                ? destinationCoords
                : pickupCoords
              : destinationCoords
          }
          allowBothEditing={false}
        />
      )}
    </View>
  );
}

function CarPoolCard({
  pool,
  onJoin,
  joining,
  requestedPassengers,
}: {
  pool: AvailableCarPool;
  onJoin: () => void;
  joining: boolean;
  requestedPassengers: number;
}) {
  const availableSeats = getAvailableSeats(
    pool.maxPassengers,
    pool.currentPassengerCount
  );
  const canBookRequestedCount = requestedPassengers <= availableSeats;

  return (
    <View
      style={{
        backgroundColor: "#FFF",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#F3F4F6",
      }}
    >
      {/* Header: fare + driver */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: "Figtree_700Bold",
              fontSize: 18,
              color: "#111827",
            }}
          >
            {formatFare(pool.calculatedFarePerPerson)}
          </Text>
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 12,
              color: "#9CA3AF",
            }}
          >
            per person
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Star size={14} color="#FBBF24" />
            <Text
              style={{
                fontFamily: "Figtree_600SemiBold",
                fontSize: 13,
                color: "#111827",
                marginLeft: 4,
              }}
            >
              {pool.driver.rating.toFixed(1)}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "Figtree_400Regular",
              fontSize: 12,
              color: "#9CA3AF",
              marginTop: 1,
            }}
          >
            {pool.driver.fullName}
          </Text>
        </View>
      </View>

      {/* Route */}
      <View style={{ marginBottom: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 6,
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
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#111827",
            }}
          >
            {pool.startLocation}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
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
            numberOfLines={1}
            style={{
              flex: 1,
              fontFamily: "Figtree_500Medium",
              fontSize: 13,
              color: "#111827",
            }}
          >
            {pool.endLocation}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
          marginBottom: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Clock size={14} color="#6B7280" />
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 12,
              color: "#6B7280",
              marginLeft: 4,
            }}
          >
            {formatDepartureTime(pool.departureTime)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Users size={14} color="#6B7280" />
          <Text
            style={{
              fontFamily: "Figtree_500Medium",
              fontSize: 12,
              color: "#6B7280",
              marginLeft: 4,
            }}
          >
            {availableSeats} seat{availableSeats !== 1 ? "s" : ""} left
          </Text>
        </View>
      </View>

      {/* Join button */}
      <TouchableOpacity
        onPress={onJoin}
        disabled={joining || availableSeats === 0 || !canBookRequestedCount}
        activeOpacity={0.85}
        style={{
          backgroundColor:
            availableSeats === 0 || !canBookRequestedCount
              ? "#D1D5DB"
              : BRAND_ORANGE,
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        {joining ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text
            style={{
              fontFamily: "Figtree_600SemiBold",
              fontSize: 14,
              color: "#FFF",
            }}
          >
            {availableSeats === 0
              ? "Full"
              : !canBookRequestedCount
              ? `Only ${availableSeats} seat${availableSeats !== 1 ? "s" : ""} left`
              : "Request to Join"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
