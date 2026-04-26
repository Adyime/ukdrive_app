/**
 * Map Editor Component
 * Full-screen modal for editing pickup and destination locations using fixed center pointer
 * User pans the map while pointer stays fixed at center, similar to Uber's approach
 */

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, Modal, ActivityIndicator, Dimensions, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { getCurrentPositionWithAddress, reverseGeocode } from "@/lib/services/location";
import { MAP_STYLE } from "@/constants/map-style";
import type { LocationWithAddress } from "@/lib/utils/location";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.01;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const GEOCODE_DEBOUNCE_MS = 2000; // Wait 2 seconds after map stops moving before geocoding (to minimize API calls)
const BRAND_ORANGE = "#F36D14";

interface MapEditorProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (location: LocationWithAddress) => void;
  initialLocation: LocationWithAddress | null;
  locationType: "pickup" | "destination";
  otherLocation?: LocationWithAddress | null; // The other location (for context)
  allowBothEditing?: boolean; // If true, both locations can be edited
  onPickupConfirm?: (location: LocationWithAddress) => void; // Callback for pickup when editing both
  onDestinationConfirm?: (location: LocationWithAddress) => void; // Callback for destination when editing both
}

export function MapEditor({
  visible,
  onClose,
  onConfirm,
  initialLocation,
  locationType,
  otherLocation,
  allowBothEditing = false,
  onPickupConfirm,
  onDestinationConfirm,
}: MapEditorProps) {
  const mapRef = useRef<MapView>(null);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAnimatingRef = useRef(false); // Flag to prevent geocoding during programmatic animations
  const currentEditingTypeRef = useRef<"pickup" | "destination">(
    locationType
  ); // Ref to always have latest editing type

  // State for tracking which location is being edited (when allowBothEditing)
  const [currentEditingType, setCurrentEditingType] = useState<
    "pickup" | "destination"
  >(locationType);

  // State for locations
  const [pickupLocation, setPickupLocation] =
    useState<LocationWithAddress | null>(
      allowBothEditing
        ? locationType === "pickup"
          ? (initialLocation ?? null)
          : (otherLocation ?? null)
        : null
    );
  const [destinationLocation, setDestinationLocation] =
    useState<LocationWithAddress | null>(
      allowBothEditing
        ? locationType === "destination"
          ? (initialLocation ?? null)
          : (otherLocation ?? null)
        : null
    );
  const [currentLocation, setCurrentLocation] =
    useState<LocationWithAddress | null>(
      !allowBothEditing ? initialLocation : null
    );

  // State for address display and loading
  const [pickupAddress, setPickupAddress] = useState<string>("");
  const [destinationAddress, setDestinationAddress] = useState<string>("");
  const [currentAddress, setCurrentAddress] = useState<string>("");
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [hasPendingGeocode, setHasPendingGeocode] = useState(false); // Track if there's a pending geocode

  const isPickup = currentEditingType === "pickup";
  const themeColor = isPickup ? "#10B981" : "#EF4444";

  // Disable switching when there's a pending geocode or map is moving
  const canSwitchEditingType =
    !isMapMoving && !hasPendingGeocode && !loadingAddress;

  // Reverse geocode the center of the map
  // IMPORTANT: Uses ref for editing type to avoid stale closure issues with debounced calls
  const geocodeMapCenter = useCallback(
    async (region: Region, editingTypeAtCallTime: "pickup" | "destination") => {
      const centerLat = region.latitude;
      const centerLng = region.longitude;

      // Double-check: if the editing type changed since this geocode was scheduled, skip it
      // This prevents race conditions when user switches between pickup/destination quickly
      if (editingTypeAtCallTime !== currentEditingTypeRef.current) {
        console.log(
          "[MapEditor] Skipping stale geocode - editing type changed from",
          editingTypeAtCallTime,
          "to",
          currentEditingTypeRef.current
        );
        return;
      }

      setLoadingAddress(true);

      try {
        const addr = await reverseGeocode(centerLat, centerLng);

        // Re-check after async operation - editing type might have changed during API call
        if (editingTypeAtCallTime !== currentEditingTypeRef.current) {
          console.log(
            "[MapEditor] Skipping stale geocode result - editing type changed during API call"
          );
          setLoadingAddress(false);
          return;
        }

        const newLocation: LocationWithAddress = {
          latitude: centerLat,
          longitude: centerLng,
          address: addr || undefined,
        };

        // Update the appropriate location based on editing type
        if (allowBothEditing) {
          if (editingTypeAtCallTime === "pickup") {
            setPickupLocation(newLocation);
            setPickupAddress(addr || "Address not available");
          } else {
            setDestinationLocation(newLocation);
            setDestinationAddress(addr || "Address not available");
          }
        } else {
          setCurrentLocation(newLocation);
          setCurrentAddress(addr || "Address not available");
        }
      } catch (error) {
        console.error("Error reverse geocoding:", error);

        // Re-check after async operation
        if (editingTypeAtCallTime !== currentEditingTypeRef.current) {
          setLoadingAddress(false);
          return;
        }

        const fallbackLocation: LocationWithAddress = {
          latitude: centerLat,
          longitude: centerLng,
        };

        if (allowBothEditing) {
          if (editingTypeAtCallTime === "pickup") {
            setPickupLocation(fallbackLocation);
            setPickupAddress("Address not available");
          } else {
            setDestinationLocation(fallbackLocation);
            setDestinationAddress("Address not available");
          }
        } else {
          setCurrentLocation(fallbackLocation);
          setCurrentAddress("Address not available");
        }
      } finally {
        setLoadingAddress(false);
        setHasPendingGeocode(false); // Geocode complete, allow switching again
      }
    },
    [allowBothEditing]
  );

  // Handle map region change complete (when user stops panning)
  const handleRegionChangeComplete = useCallback(
    (region: Region) => {
      setIsMapMoving(false);

      // Skip geocoding if this is a programmatic animation (e.g., when toggling editing type)
      if (isAnimatingRef.current) {
        isAnimatingRef.current = false;
        return;
      }

      // Clear existing timeout
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }

      // Capture the current editing type at the time of this event
      // This ensures we use the correct type even after debounce delay
      const editingTypeAtCallTime = currentEditingTypeRef.current;

      // Mark that we have a pending geocode - this disables switching
      setHasPendingGeocode(true);

      // Set new timeout for debounced geocoding
      geocodeTimeoutRef.current = setTimeout(() => {
        geocodeMapCenter(region, editingTypeAtCallTime);
      }, GEOCODE_DEBOUNCE_MS);
    },
    [geocodeMapCenter]
  );

  // Handle region change start (when user starts panning)
  const handleRegionChange = useCallback(() => {
    setIsMapMoving(true);
  }, []);

  // Track if the modal has been initialized to prevent re-initialization on prop changes
  const hasInitializedRef = useRef(false);

  // Initialize locations and center map when modal FIRST opens
  // IMPORTANT: Only run on `visible` change, NOT on prop changes
  // This prevents resetting state when parent updates locations
  useEffect(() => {
    let cancelled = false;

    if (visible && !hasInitializedRef.current) {
      hasInitializedRef.current = true;

      // Clear any pending geocoding from previous session
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
        geocodeTimeoutRef.current = null;
      }
      setHasPendingGeocode(false);

      if (allowBothEditing) {
        // Initialize both locations from props
        const pickup =
          locationType === "pickup" ? initialLocation : otherLocation;
        const destination =
          locationType === "destination" ? initialLocation : otherLocation;
        setPickupLocation(pickup ?? null);
        setDestinationLocation(destination ?? null);

        // Update both ref and state for editing type
        currentEditingTypeRef.current = locationType;
        setCurrentEditingType(locationType);

        // Set initial addresses
        setPickupAddress(pickup?.address || "");
        setDestinationAddress(destination?.address || "");

        // Center map on selected editing location first
        setTimeout(() => {
          const activeLocation =
            locationType === "pickup" ? pickup : destination;
          const fallbackLocation =
            locationType === "pickup" ? destination : pickup;
          const targetLocation = activeLocation ?? fallbackLocation;

          if (targetLocation && mapRef.current) {
            // Set flag to prevent geocoding during initial animation
            isAnimatingRef.current = true;

            mapRef.current.animateToRegion(
              {
                latitude: targetLocation.latitude,
                longitude: targetLocation.longitude,
                latitudeDelta: LATITUDE_DELTA,
                longitudeDelta: LONGITUDE_DELTA,
              },
              500
            );
          } else if (pickup && destination) {
            // Center to show both locations if pickup not available
            isAnimatingRef.current = true;

            const minLat = Math.min(pickup.latitude, destination.latitude);
            const maxLat = Math.max(pickup.latitude, destination.latitude);
            const minLng = Math.min(pickup.longitude, destination.longitude);
            const maxLng = Math.max(pickup.longitude, destination.longitude);

            mapRef.current?.animateToRegion(
              {
                latitude: (minLat + maxLat) / 2,
                longitude: (minLng + maxLng) / 2,
                latitudeDelta: Math.max(
                  (maxLat - minLat) * 1.5,
                  LATITUDE_DELTA
                ),
                longitudeDelta: Math.max(
                  (maxLng - minLng) * 1.5,
                  LONGITUDE_DELTA
                ),
              },
              500
            );
          }
        }, 100);
      } else {
        // Single location editing
        const singleInitialLocation = initialLocation ?? otherLocation ?? null;
        setCurrentLocation(singleInitialLocation);
        setCurrentAddress(singleInitialLocation?.address || "");

        // Update both ref and state for editing type
        currentEditingTypeRef.current = locationType;
        setCurrentEditingType(locationType);

        // Center map on the location being edited
        setTimeout(() => {
          if (singleInitialLocation && mapRef.current) {
            // Set flag to prevent geocoding during initial animation
            isAnimatingRef.current = true;

            mapRef.current.animateToRegion(
              {
                latitude: singleInitialLocation.latitude,
                longitude: singleInitialLocation.longitude,
                latitudeDelta: LATITUDE_DELTA,
                longitudeDelta: LONGITUDE_DELTA,
              },
              500
            );
            return;
          }

          // No default coordinates: use current device location when available.
          getCurrentPositionWithAddress()
            .then((loc) => {
              if (cancelled) return;
              setCurrentLocation(loc);
              setCurrentAddress(loc.address || "");
              if (!mapRef.current) return;
              isAnimatingRef.current = true;
              mapRef.current.animateToRegion(
                {
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  latitudeDelta: LATITUDE_DELTA,
                  longitudeDelta: LONGITUDE_DELTA,
                },
                500
              );
            })
            .catch((error) => {
              console.warn("[MapEditor] Failed to fetch current location:", error);
            });
        }, 100);
      }
    }

    // Reset initialization flag when modal closes
    if (!visible) {
      hasInitializedRef.current = false;
    }

    // Cleanup timeout on unmount or when modal closes
    return () => {
      cancelled = true;
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
    };
  }, [visible]); // ONLY depend on visible - props are captured at initialization time

  // Calculate initial map region
  const mapRegion = useMemo(() => {
    if (allowBothEditing && pickupLocation && destinationLocation) {
      const minLat = Math.min(
        pickupLocation.latitude,
        destinationLocation.latitude
      );
      const maxLat = Math.max(
        pickupLocation.latitude,
        destinationLocation.latitude
      );
      const minLng = Math.min(
        pickupLocation.longitude,
        destinationLocation.longitude
      );
      const maxLng = Math.max(
        pickupLocation.longitude,
        destinationLocation.longitude
      );

      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * 1.5, LATITUDE_DELTA),
        longitudeDelta: Math.max((maxLng - minLng) * 1.5, LONGITUDE_DELTA),
      };
    }

    if (currentLocation || initialLocation || otherLocation) {
      const loc = currentLocation || initialLocation || otherLocation;
      return {
        latitude: loc!.latitude,
        longitude: loc!.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    }

    return null;
  }, [
    currentLocation,
    initialLocation,
    otherLocation,
    allowBothEditing,
    pickupLocation,
    destinationLocation,
  ]);

  // Handle confirm
  const handleConfirm = () => {
    if (allowBothEditing) {
      // Confirm both locations if they exist
      if (pickupLocation && onPickupConfirm) {
        onPickupConfirm(pickupLocation);
      }
      if (destinationLocation && onDestinationConfirm) {
        onDestinationConfirm(destinationLocation);
      }
      onClose();
    } else {
      // Single location editing
      const loc = currentLocation || initialLocation || otherLocation;
      if (loc) {
        onConfirm(loc);
        onClose();
      }
    }
  };

  // Toggle between pickup and destination editing
  const handleToggleEditingType = useCallback(() => {
    // Don't allow switching while geocoding is in progress
    if (!canSwitchEditingType) {
      console.log("[MapEditor] Cannot switch - pending operation in progress");
      return;
    }

    // Clear any pending geocoding to prevent race conditions
    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
      geocodeTimeoutRef.current = null;
    }
    setHasPendingGeocode(false);

    const newEditingType =
      currentEditingTypeRef.current === "pickup" ? "destination" : "pickup";

    // Update both the ref AND the state
    // Ref is updated FIRST so any pending operations see the new value immediately
    currentEditingTypeRef.current = newEditingType;
    setCurrentEditingType(newEditingType);

    // Center map on the location being switched to
    const locationToCenter =
      newEditingType === "pickup" ? pickupLocation : destinationLocation;
    if (locationToCenter && mapRef.current) {
      // Set flag to prevent geocoding during this intentional animation
      isAnimatingRef.current = true;

      mapRef.current.animateToRegion(
        {
          latitude: locationToCenter.latitude,
          longitude: locationToCenter.longitude,
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        },
        300
      );

      // No need to geocode here - we're just switching to view the existing location
      // The user will pan the map if they want to change it
    }
  }, [pickupLocation, destinationLocation, canSwitchEditingType]);

  // Get current address being displayed
  const getCurrentAddress = (): string => {
    if (allowBothEditing) {
      return currentEditingType === "pickup"
        ? pickupAddress
        : destinationAddress;
    }
    return currentAddress;
  };

  // Get current location being edited
  const getCurrentEditingLocationValue = (): LocationWithAddress | null => {
    if (allowBothEditing) {
      return currentEditingType === "pickup"
        ? pickupLocation
        : destinationLocation;
    }
    return currentLocation;
  };
  const hasSingleLocationForConfirm = Boolean(
    getCurrentEditingLocationValue() || initialLocation || otherLocation
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }} edges={["top"]}>
        {/* Header */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderBottomWidth: 1,
            borderBottomColor: "#E5E7EB",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}>
            <TouchableOpacity onPress={onClose} style={{ padding: 8, marginLeft: -8 }}>
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text
                style={{
                  fontSize: 18,
                  color: "#111827",
                  fontFamily: "Figtree_700Bold",
                }}
              >
                Set Location on Map
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  color: "#6B7280",
                  fontFamily: "Figtree_400Regular",
                }}
              >
                Move map and place the pointer
              </Text>
            </View>
          </View>

          {/* Toggle button for switching between pickup/destination */}
          {allowBothEditing && (
            <View className="px-4 pb-3 flex-row gap-2">
              <TouchableOpacity
                onPress={() => {
                  if (currentEditingType !== "pickup" && canSwitchEditingType) {
                    handleToggleEditingType();
                  }
                }}
                disabled={currentEditingType === "pickup"}
                className={`flex-1 py-2.5 rounded-lg border ${
                  currentEditingType === "pickup"
                    ? "bg-emerald-500 border-emerald-500"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                }`}
                style={{
                  opacity:
                    currentEditingType === "pickup"
                      ? 1
                      : canSwitchEditingType
                      ? 1
                      : 0.5,
                }}
              >
                <View className="flex-row items-center justify-center">
                  <Ionicons
                    name="location"
                    size={18}
                    color={
                      currentEditingType === "pickup" ? "#FFFFFF" : "#10B981"
                    }
                  />
                  <Text
                    className={`ml-2 font-semibold ${
                      currentEditingType === "pickup"
                        ? "text-white"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    Pickup
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (
                    currentEditingType !== "destination" &&
                    canSwitchEditingType
                  ) {
                    handleToggleEditingType();
                  }
                }}
                disabled={
                  currentEditingType === "destination" || !canSwitchEditingType
                }
                className={`flex-1 py-2.5 rounded-lg border ${
                  currentEditingType === "destination"
                    ? "bg-red-500 border-red-500"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                }`}
                style={{
                  opacity:
                    currentEditingType === "destination"
                      ? 1
                      : canSwitchEditingType
                      ? 1
                      : 0.5,
                }}
              >
                <View className="flex-row items-center justify-center">
                  <Ionicons
                    name="flag"
                    size={18}
                    color={
                      currentEditingType === "destination"
                        ? "#FFFFFF"
                        : canSwitchEditingType
                        ? "#EF4444"
                        : "#9CA3AF"
                    }
                  />
                  <Text
                    className={`ml-2 font-semibold ${
                      currentEditingType === "destination"
                        ? "text-white"
                        : canSwitchEditingType
                        ? "text-gray-700 dark:text-gray-300"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    Destination
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Map */}
        <View className="flex-1 relative">
          {mapRegion ? (
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
              customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
              initialRegion={mapRegion}
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass={false}
              scrollEnabled={true}
              zoomEnabled={true}
              rotateEnabled={true}
              pitchEnabled={false}
              onRegionChange={handleRegionChange}
              onRegionChangeComplete={handleRegionChangeComplete}
            >
              {/* Show other location as a non-interactive marker for context */}
              {!allowBothEditing && otherLocation && (
                <Marker
                  coordinate={otherLocation}
                  title={
                    locationType === "pickup" ? "Destination" : "Pickup Location"
                  }
                  pinColor={locationType === "pickup" ? "#EF4444" : "#10B981"}
                  draggable={false}
                />
              )}

              {/* Show both locations as markers when editing both */}
              {allowBothEditing && (
                <>
                  {pickupLocation && currentEditingType !== "pickup" && (
                    <Marker
                      coordinate={pickupLocation}
                      title="Pickup Location"
                      pinColor="#10B981"
                      draggable={false}
                      opacity={0.5}
                    />
                  )}
                  {destinationLocation &&
                    currentEditingType !== "destination" && (
                      <Marker
                        coordinate={destinationLocation}
                        title="Destination"
                        pinColor="#EF4444"
                        draggable={false}
                        opacity={0.5}
                      />
                    )}
                </>
              )}
            </MapView>
          ) : (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#F3F4F6",
                },
              ]}
            >
              <ActivityIndicator size="small" color={BRAND_ORANGE} />
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 14,
                  color: "#374151",
                  fontFamily: "Figtree_600SemiBold",
                }}
              >
                Fetching your current location...
              </Text>
            </View>
          )}

          {/* Fixed Center Pointer with pulse animation effect */}
          <View
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              marginTop: -20,
              marginLeft: -20,
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            {/* Pulse ring for active editing */}
            {isMapMoving && (
              <View
                style={{
                  position: "absolute",
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: themeColor,
                  opacity: 0.2,
                }}
              />
            )}
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: themeColor,
                borderWidth: 3,
                borderColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 5,
              }}
            >
              <Ionicons
                name={isPickup ? "location" : "flag"}
                size={20}
                color="#FFFFFF"
              />
            </View>
            {/* Pointer pin tip */}
            <View
              style={{
                position: "absolute",
                bottom: -8,
                width: 0,
                height: 0,
                borderLeftWidth: 6,
                borderRightWidth: 6,
                borderTopWidth: 8,
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderTopColor: themeColor,
              }}
            />
          </View>

          {/* Editing indicator badge */}
          <View
            className="absolute top-4 left-4 right-4 flex-row justify-center"
            style={{ pointerEvents: "none", zIndex: 999 }}
          >
            <View
              className="px-4 py-2 rounded-full shadow-lg"
              style={{ backgroundColor: themeColor }}
            >
              <View className="flex-row items-center">
                <Ionicons
                  name={isPickup ? "location" : "flag"}
                  size={16}
                  color="#FFFFFF"
                />
                <Text className="ml-2 text-white font-semibold text-sm">
                  {isPickup ? "Setting Pickup Location" : "Setting Destination"}
                </Text>
              </View>
            </View>
          </View>

          {/* Address Display Card */}
          <View
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: "#FFFFFF",
              borderTopWidth: 1,
              borderTopColor: "#E5E7EB",
            }}
          >
            {allowBothEditing ? (
              <View className="px-4 py-4">
                {/* Pickup Address */}
                <TouchableOpacity
                  onPress={() => {
                    if (
                      currentEditingType !== "pickup" &&
                      canSwitchEditingType
                    ) {
                      handleToggleEditingType();
                    }
                  }}
                  disabled={currentEditingType === "pickup"}
                  className={`p-3 rounded-lg mb-3 border-2 ${
                    currentEditingType === "pickup"
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500"
                      : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                  }`}
                  style={{
                    opacity:
                      currentEditingType === "pickup"
                        ? 1
                        : canSwitchEditingType
                        ? 1
                        : 0.5,
                  }}
                >
                  <View className="flex-row items-center mb-1.5">
                    <View className="w-4 h-4 rounded-full mr-2 bg-emerald-500" />
                    <Text
                      className={`text-xs font-bold uppercase tracking-wide ${
                        currentEditingType === "pickup"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      Pickup Location
                    </Text>
                    {currentEditingType === "pickup" && (
                      <View className="ml-auto px-2 py-0.5 bg-emerald-500 rounded-full">
                        <Text className="text-xs font-bold text-white">
                          EDITING
                        </Text>
                      </View>
                    )}
                  </View>
                  {currentEditingType === "pickup" && loadingAddress ? (
                    <View className="flex-row items-center">
                      <ActivityIndicator size="small" color="#10B981" />
                      <Text className="ml-2 text-gray-500 dark:text-gray-400 text-sm">
                        Loading address...
                      </Text>
                    </View>
                  ) : (
                    <Text
                      className={`text-sm font-medium ${
                        currentEditingType === "pickup"
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                      numberOfLines={2}
                    >
                      {pickupLocation?.address || pickupAddress || "Not set"}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Destination Address */}
                <TouchableOpacity
                  onPress={() => {
                    if (
                      currentEditingType !== "destination" &&
                      canSwitchEditingType
                    ) {
                      handleToggleEditingType();
                    }
                  }}
                  disabled={
                    currentEditingType === "destination" ||
                    !canSwitchEditingType
                  }
                  className={`p-3 rounded-lg border-2 ${
                    currentEditingType === "destination"
                      ? "bg-red-50 dark:bg-red-900/20 border-red-500"
                      : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                  }`}
                  style={{
                    opacity:
                      currentEditingType === "destination"
                        ? 1
                        : canSwitchEditingType
                        ? 1
                        : 0.5,
                  }}
                >
                  <View className="flex-row items-center mb-1.5">
                    <View className="w-4 h-4 rounded-full mr-2 bg-red-500" />
                    <Text
                      className={`text-xs font-bold uppercase tracking-wide ${
                        currentEditingType === "destination"
                          ? "text-red-700 dark:text-red-400"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      Destination
                    </Text>
                    {currentEditingType === "destination" && (
                      <View className="ml-auto px-2 py-0.5 bg-red-500 rounded-full">
                        <Text className="text-xs font-bold text-white">
                          EDITING
                        </Text>
                      </View>
                    )}
                  </View>
                  {currentEditingType === "destination" && loadingAddress ? (
                    <View className="flex-row items-center">
                      <ActivityIndicator size="small" color="#EF4444" />
                      <Text className="ml-2 text-gray-500 dark:text-gray-400 text-sm">
                        Loading address...
                      </Text>
                    </View>
                  ) : (
                    <Text
                      className={`text-sm font-medium ${
                        currentEditingType === "destination"
                          ? "text-gray-900 dark:text-gray-100"
                          : "text-gray-600 dark:text-gray-400"
                      }`}
                      numberOfLines={2}
                    >
                      {destinationLocation?.address ||
                        destinationAddress ||
                        "Not set"}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Helper text */}
                <Text className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
                  {!canSwitchEditingType
                    ? "Wait for location to be set before switching..."
                    : "Tap a location above to switch editing, or pan the map"}
                </Text>
              </View>
            ) : (
              <View className="px-4 py-3">
                <View className="flex-row items-center mb-2">
                  <View
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: themeColor }}
                  />
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    {locationType === "pickup"
                      ? "Pickup Location"
                      : "Destination"}
                  </Text>
                </View>
                {loadingAddress ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator size="small" color={themeColor} />
                    <Text className="ml-2 text-gray-500 dark:text-gray-400">
                      Loading address...
                    </Text>
                  </View>
                ) : (
                  <Text
                    className="text-base font-medium text-gray-900 dark:text-gray-100"
                    numberOfLines={2}
                  >
                    {getCurrentAddress() ||
                      getCurrentEditingLocationValue()?.address ||
                      initialLocation?.address ||
                      "Move map to set location"}
                  </Text>
                )}
              </View>
            )}

            {/* Action Buttons */}
            <View style={{ flexDirection: "row", paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 1,
                  backgroundColor: "#F3F4F6",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 16, fontFamily: "Figtree_600SemiBold", color: "#111827" }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={
                  allowBothEditing
                    ? !pickupLocation || !destinationLocation
                    : !hasSingleLocationForConfirm
                }
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  backgroundColor: (
                    allowBothEditing
                      ? pickupLocation && destinationLocation
                      : hasSingleLocationForConfirm
                  )
                    ? BRAND_ORANGE
                    : "#9CA3AF",
                  opacity: (
                    allowBothEditing
                      ? pickupLocation && destinationLocation
                      : hasSingleLocationForConfirm
                  )
                    ? 1
                    : 0.6,
                }}
              >
                <Text style={{ fontSize: 16, fontFamily: "Figtree_600SemiBold", color: "#FFFFFF" }}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default MapEditor;
