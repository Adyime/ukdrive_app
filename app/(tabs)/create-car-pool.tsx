/**
 * Create Ride Share Screen (Driver)
 * Uber-style full-screen map + draggable bottom sheet with 3-step wizard
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, Dimensions, Platform, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { router, useFocusEffect } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import MapView, {
  type MapPressEvent,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import DateTimePicker from "@react-native-community/datetimepicker";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  LocateFixed,
  User,
  ChevronRight,
  Clock,
  Minus,
  Plus,
  Users,
  MapPin,
} from "lucide-react-native";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { Loading } from "@/components/ui/loading";
import {
  getCurrentPositionWithAddress,
  useCurrentLocation,
  useLocationPermissions,
} from "@/lib/services/location";
import {
  createCarPool,
  getActiveCarPool,
  type CreateCarPoolRequest,
  type CarPoolResponse,
  CarPoolStatus,
  isCarPoolActive,
} from "@/lib/api/carPool";
import {
  SAMPLE_LOCATIONS,
  type LocationWithAddress,
} from "@/lib/utils/location";
import {
  addRecentLocation,
  getRecentLocations,
  type RecentLocation,
} from "@/lib/recent-locations";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapEditor } from "@/components/map-editor";
import { LocationPermissionDialog } from "@/components/location-permission-dialog";
import { PickupMarker, DestinationMarker } from "@/components/map-markers";
import { getRoute } from "@/lib/services/directions";
import { dispatchServiceCreated } from "@/lib/events";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const MIN_BASE_FARE = 20;
const MAX_PASSENGERS = 6;
const MIN_PASSENGERS = 1;
const BRAND_PURPLE = "#843FE3";

function getDefaultDepartureTime(): Date {
  const date = new Date();
  date.setHours(date.getHours() + 1);
  date.setMinutes(0, 0, 0);
  return date;
}

export default function CreateCarPoolScreen() {
  const { userType } = useAuth();
  const toast = useToast();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const ignoreNextMapPressRef = useRef(false);
  const insets = useSafeAreaInsets();
  const snapPoints = useMemo(() => [280, "50%", "90%"], []);

  const {
    location: currentLocation,
    loading: locationLoading,
    error: locationError,
    errorCode: locationErrorCode,
    refresh: refreshLocation,
  } = useCurrentLocation();
  const { permissions, requestForeground } = useLocationPermissions();

  const [showLocationErrorDialog, setShowLocationErrorDialog] = useState(false);
  const [hasAttemptedLocation, setHasAttemptedLocation] = useState(false);

  const [startLocation, setStartLocation] = useState("");
  const [startCoords, setStartCoords] = useState<LocationWithAddress | null>(
    null
  );
  const [endLocation, setEndLocation] = useState("");
  const [endCoords, setEndCoords] = useState<LocationWithAddress | null>(null);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);

  const [departureTime, setDepartureTime] = useState<Date>(() =>
    getDefaultDepartureTime()
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [maxPassengers, setMaxPassengers] = useState(4);
  const [baseFare, setBaseFare] = useState("");
  const [notes, setNotes] = useState("");

  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [routeLoading, setRouteLoading] = useState(false);

  const [showStartAutocomplete, setShowStartAutocomplete] = useState(false);
  const [showEndAutocomplete, setShowEndAutocomplete] = useState(false);

  const [showMapEditor, setShowMapEditor] = useState(false);
  const [editingLocationType, setEditingLocationType] = useState<
    "start" | "end" | null
  >(null);
  const [mapSelectionTarget, setMapSelectionTarget] = useState<"start" | "end">(
    "end"
  );

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [errors, setErrors] = useState<{
    start?: string;
    end?: string;
    departureTime?: string;
    maxPassengers?: string;
    baseFare?: string;
  }>({});

  // Wizard: 0=Route, 1=Schedule, 2=Fare
  const [currentStep, setCurrentStep] = useState(0);
  const STEP_LABELS = ["Route", "Schedule", "Fare"];
  const currentStepRef = useRef(currentStep);
  const startCoordsRef = useRef(startCoords);
  const endCoordsRef = useRef(endCoords);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    startCoordsRef.current = startCoords;
  }, [startCoords]);

  useEffect(() => {
    endCoordsRef.current = endCoords;
  }, [endCoords]);

  const bothLocationsSelected = startCoords !== null && endCoords !== null;

  const mapRegion = useMemo(() => {
    if (startCoords && endCoords) {
      const minLat = Math.min(startCoords.latitude, endCoords.latitude);
      const maxLat = Math.max(startCoords.latitude, endCoords.latitude);
      const minLng = Math.min(startCoords.longitude, endCoords.longitude);
      const maxLng = Math.max(startCoords.longitude, endCoords.longitude);
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
  }, [
    startCoords?.latitude,
    startCoords?.longitude,
    endCoords?.latitude,
    endCoords?.longitude,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ]);

  const quickEndLocations = useMemo<LocationWithAddress[]>(() => {
    if (recentLocations.length > 0) {
      return recentLocations.map((location) => ({
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      }));
    }
    return SAMPLE_LOCATIONS.map((sample) => ({
      latitude: sample.latitude,
      longitude: sample.longitude,
      address: sample.name,
    }));
  }, [recentLocations]);

  const refreshRecentLocations = useCallback(async () => {
    try {
      const locations = await getRecentLocations();
      setRecentLocations(locations);
    } catch (error) {
      console.warn("Failed to load recent locations:", error);
    }
  }, []);

  const rememberRecentLocation = useCallback((location: LocationWithAddress) => {
    addRecentLocation(location)
      .then((updated) => setRecentLocations(updated))
      .catch((error) => {
        console.warn("Failed to save recent location:", error);
      });
  }, []);

  const checkActiveCarPool = useCallback(async () => {
    try {
      const response = await getActiveCarPool();
      if (response.success && response.data) {
        router.replace("/(tabs)");
        return;
      }
    } catch (error) {
      console.error("Error checking active car pool:", error);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkActiveCarPool();
  }, [checkActiveCarPool]);

  useEffect(() => {
    refreshRecentLocations();
  }, [refreshRecentLocations]);

  useEffect(() => {
    if (currentLocation && !startCoords) {
      setStartCoords(currentLocation);
      setStartLocation(
        currentLocation.address ||
          `${currentLocation.latitude.toFixed(
            6
          )}, ${currentLocation.longitude.toFixed(6)}`
      );
    }
  }, [currentLocation, startCoords]);

  useEffect(() => {
    if (locationError && !locationLoading && hasAttemptedLocation) {
      if (
        locationErrorCode === "PERMISSION_DENIED" ||
        locationErrorCode === "LOCATION_DISABLED"
      ) {
        setShowLocationErrorDialog(true);
      }
    }
  }, [locationError, locationErrorCode, locationLoading, hasAttemptedLocation]);

  useFocusEffect(
    useCallback(() => {
      if (currentStepRef.current >= 2) {
        setCurrentStep(startCoordsRef.current && endCoordsRef.current ? 1 : 0);
        setDepartureTime(getDefaultDepartureTime());
        setMaxPassengers(4);
        setBaseFare("");
        setNotes("");
        setErrors({});
      }
      return () => {};
    }, [])
  );

  const getCurrentLocation = useCallback(async () => {
    setHasAttemptedLocation(true);
    if (permissions.foreground !== "granted") {
      const granted = await requestForeground();
      if (!granted) {
        setShowLocationErrorDialog(true);
        return;
      }
    }
    try {
      const position = await getCurrentPositionWithAddress();
      setStartCoords(position);
      setStartLocation(
        position.address ||
          `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, start: undefined }));
      mapRef.current?.animateToRegion({
        latitude: position.latitude,
        longitude: position.longitude,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === "PERMISSION_DENIED" ||
        code === "LOCATION_DISABLED" ||
        code === "LOCATION_TIMEOUT"
      ) {
        setShowLocationErrorDialog(true);
      } else {
        setShowLocationErrorDialog(true);
      }
    }
  }, [permissions.foreground, requestForeground]);

  const getLocationErrorType = ():
    | "permission_denied"
    | "location_disabled"
    | "timeout"
    | "unknown" => {
    if (locationErrorCode === "PERMISSION_DENIED") return "permission_denied";
    if (locationErrorCode === "LOCATION_DISABLED") return "location_disabled";
    if (locationErrorCode === "LOCATION_TIMEOUT") return "timeout";
    return "unknown";
  };

  const handleStartSelect = (location: LocationWithAddress) => {
    setStartCoords(location);
    setStartLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, start: undefined }));
    rememberRecentLocation(location);
  };

  const handleEndSelect = (location: LocationWithAddress) => {
    setEndCoords(location);
    setEndLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, end: undefined }));
    rememberRecentLocation(location);
  };

  const handleEndSelected = useCallback((location: LocationWithAddress) => {
    handleEndSelect(location);
    setCurrentStep(1);
    bottomSheetRef.current?.snapToIndex(2);
  }, []);

  const handleStartSelected = useCallback((location: LocationWithAddress) => {
    handleStartSelect(location);
  }, []);

  const handleMapEdit = (
    location: LocationWithAddress,
    locationType: "start" | "end"
  ) => {
    if (locationType === "start") {
      setStartCoords(location);
      setStartLocation(
        location.address ||
          `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, start: undefined }));
      rememberRecentLocation(location);
    } else {
      setEndCoords(location);
      setEndLocation(
        location.address ||
          `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, end: undefined }));
      rememberRecentLocation(location);
    }
  };

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      if (ignoreNextMapPressRef.current) {
        ignoreNextMapPressRef.current = false;
        return;
      }
      if ((event.nativeEvent as { action?: string }).action === "marker-press")
        return;
      const target = !startCoords
        ? "start"
        : !endCoords
        ? "end"
        : mapSelectionTarget;
      setEditingLocationType(target);
      setShowMapEditor(true);
    },
    [startCoords, endCoords, mapSelectionTarget]
  );

  useEffect(() => {
    if (!startCoords || !endCoords) {
      setRouteCoordinates([]);
      return;
    }
    let cancelled = false;
    setRouteCoordinates([]);
    setRouteLoading(true);
    const fetchRoute = async () => {
      try {
        const route = await getRoute(startCoords, endCoords);
        if (cancelled) return;
        if (route && route.coordinates.length > 0) {
          setRouteCoordinates(route.coordinates);
        } else {
          setRouteCoordinates([startCoords, endCoords]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching route:", error);
          setRouteCoordinates([startCoords, endCoords]);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    };
    fetchRoute();
    return () => {
      cancelled = true;
    };
  }, [startCoords, endCoords]);

  // Per-step validation
  const validateStep = (step: number): boolean => {
    const newErrors: typeof errors = {};
    if (step === 0) {
      if (!startLocation.trim() || !startCoords)
        newErrors.start = "Please select a start location";
      if (!endLocation.trim() || !endCoords)
        newErrors.end = "Please select an end location";
    } else if (step === 1) {
      if (departureTime <= new Date())
        newErrors.departureTime = "Departure time must be in the future";
      if (maxPassengers < MIN_PASSENGERS || maxPassengers > MAX_PASSENGERS)
        newErrors.maxPassengers = `Must be between ${MIN_PASSENGERS} and ${MAX_PASSENGERS}`;
    } else if (step === 2) {
      const baseFareNum = parseFloat(baseFare);
      if (!baseFare || isNaN(baseFareNum) || baseFareNum < MIN_BASE_FARE)
        newErrors.baseFare = `Fare must be at least ₹${MIN_BASE_FARE}`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1);
      bottomSheetRef.current?.snapToIndex(2);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      bottomSheetRef.current?.snapToIndex(2);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};
    if (!startLocation.trim() || !startCoords)
      newErrors.start = "Please select a start location";
    if (!endLocation.trim() || !endCoords)
      newErrors.end = "Please select an end location";
    if (departureTime <= new Date())
      newErrors.departureTime = "Departure time must be in the future";
    if (maxPassengers < MIN_PASSENGERS || maxPassengers > MAX_PASSENGERS)
      newErrors.maxPassengers = `Must be between ${MIN_PASSENGERS} and ${MAX_PASSENGERS}`;
    const baseFareNum = parseFloat(baseFare);
    if (!baseFare || isNaN(baseFareNum) || baseFareNum < MIN_BASE_FARE)
      newErrors.baseFare = `Fare must be at least ₹${MIN_BASE_FARE}`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateCarPool = async () => {
    if (!validateForm() || !startCoords || !endCoords) return;
    setLoading(true);
    try {
      const carPoolData: CreateCarPoolRequest = {
        startLatitude: startCoords.latitude,
        startLongitude: startCoords.longitude,
        startLocation,
        endLatitude: endCoords.latitude,
        endLongitude: endCoords.longitude,
        endLocation,
        departureTime: departureTime.toISOString(),
        maxPassengers,
        baseFare: parseFloat(baseFare),
        notes: notes.trim() || undefined,
      };
      const response = await createCarPool(carPoolData);
      if (response.success && response.data) {
        dispatchServiceCreated();
        toast.success(
          "Ride share created and is now open for passengers to join!"
        );
        router.replace("/(tabs)");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to create ride share";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error creating car pool:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startCoords && endCoords && mapRef.current) {
      mapRef.current.fitToCoordinates([startCoords, endCoords], {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  }, [startCoords, endCoords]);

  const isButtonDisabled = loading || !startCoords || !endCoords;

  if (initialLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Loading message="Loading..." />
      </SafeAreaView>
    );
  }

  if (userType !== "driver") {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center p-6">
          <View className="w-20 h-20 bg-gray-200 rounded-full items-center justify-center mb-4">
            <User size={40} color="#6B7280" />
          </View>
          <Text className="text-xl font-semibold text-gray-900 mb-2 text-center">
            Passenger Account
          </Text>
          <Text className="text-gray-600 text-center">
            This screen is for drivers. Go to Browse tab to find ride shares.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const inputStyle = {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    fontSize: 14,
    color: "#111827",
    fontFamily: "Figtree_500Medium",
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e" }}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={Platform.OS === "android" ? MAP_STYLE : undefined}
        initialRegion={mapRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onMarkerPress={() => {
          ignoreNextMapPressRef.current = true;
          setTimeout(() => {
            ignoreNextMapPressRef.current = false;
          }, 0);
        }}
        onPress={handleMapPress}
      >
        {startCoords && (
          <PickupMarker
            key="start-marker"
            coordinate={startCoords}
            title="Start"
            onPress={() => {
              setMapSelectionTarget("start");
              setEditingLocationType("start");
              setShowMapEditor(true);
            }}
          />
        )}
        {endCoords && (
          <DestinationMarker
            key="end-marker"
            coordinate={endCoords}
            title="End"
            onPress={() => {
              setMapSelectionTarget("end");
              setEditingLocationType("end");
              setShowMapEditor(true);
            }}
          />
        )}
        {routeCoordinates.length > 0 && !routeLoading && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={ROUTE_COLORS.shadowPurple}
            strokeWidth={8}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={BRAND_PURPLE}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={routeLoading ? [5, 5] : undefined}
          />
        )}
      </MapView>

      {userType === "driver" && routeLoading && (
        <View
          style={{
            position: "absolute",
            top: insets.top + 60,
            right: 16,
            backgroundColor: "#FFF",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: "#6B7280" }}>
            Loading route...
          </Text>
        </View>
      )}

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
        onPress={getCurrentLocation}
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
        <LocateFixed size={20} color={BRAND_PURPLE} />
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
        >
          {/* Header + progress */}
          <View
            style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_700Bold",
                  fontSize: 20,
                  color: "#111827",
                }}
              >
                Create Ride Share
              </Text>
              {currentStep > 0 && (
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#9CA3AF",
                  }}
                >
                  Step {currentStep + 1} of 3
                </Text>
              )}
            </View>
            {bothLocationsSelected && (
              <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
                {STEP_LABELS.map((label, idx) => (
                  <View key={label} style={{ flex: 1 }}>
                    <View
                      style={{
                        height: 3,
                        borderRadius: 2,
                        backgroundColor:
                          idx <= currentStep ? BRAND_PURPLE : "#E5E7EB",
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 10,
                        color: idx <= currentStep ? BRAND_PURPLE : "#9CA3AF",
                        marginTop: 4,
                        textAlign: "center",
                      }}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ─── STEP 0: Route ─── */}
          {currentStep === 0 && (
            <View style={{ paddingHorizontal: 16 }}>
              <View
                style={{
                  backgroundColor: "#FFF",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: 12,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setShowStartAutocomplete(true);
                    setShowEndAutocomplete(false);
                  }}
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
                      color: startLocation ? "#111827" : "#9CA3AF",
                      fontFamily: "Figtree_500Medium",
                    }}
                  >
                    {startLocation || "Start location"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setMapSelectionTarget("start");
                      setEditingLocationType("start");
                      setShowMapEditor(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MapPin size={18} color="#6B7280" />
                  </TouchableOpacity>
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
                  onPress={() => {
                    setShowEndAutocomplete(true);
                    setShowStartAutocomplete(false);
                  }}
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
                      color: endLocation ? "#111827" : "#9CA3AF",
                      fontFamily: "Figtree_500Medium",
                    }}
                  >
                    {endLocation || "End location"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setMapSelectionTarget("end");
                      setEditingLocationType("end");
                      setShowMapEditor(true);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MapPin size={18} color="#6B7280" />
                  </TouchableOpacity>
                </TouchableOpacity>
              </View>
              {errors.start && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 4,
                    marginHorizontal: 4,
                  }}
                >
                  {errors.start}
                </Text>
              )}
              {errors.end && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 4,
                    marginHorizontal: 4,
                  }}
                >
                  {errors.end}
                </Text>
              )}

              {/* Sample locations when no end yet */}
              {!endCoords && (
                <View style={{ marginTop: 16 }}>
                  {quickEndLocations.map((location, idx) => (
                    <TouchableOpacity
                      key={`${location.latitude}-${location.longitude}-${location.address}`}
                      onPress={() => {
                        handleEndSelect(location);
                        setCurrentStep(1);
                        bottomSheetRef.current?.snapToIndex(2);
                      }}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 14,
                        borderBottomWidth:
                          idx < quickEndLocations.length - 1 ? 1 : 0,
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
                        <Clock size={18} color="#6B7280" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: "Figtree_600SemiBold",
                            fontSize: 14,
                            color: "#111827",
                          }}
                        >
                          {location.address || "Pinned Location"}
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
                          {`${location.latitude.toFixed(
                            4
                          )}, ${location.longitude.toFixed(4)}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      setMapSelectionTarget("end");
                      setEditingLocationType("end");
                      setShowMapEditor(true);
                    }}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 14,
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
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 14,
                        color: "#111827",
                      }}
                    >
                      Set location on map
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {bothLocationsSelected && (
                <TouchableOpacity
                  onPress={handleNextStep}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: BRAND_PURPLE,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    marginTop: 20,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#FFF",
                    }}
                  >
                    Continue
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ─── STEP 1: Schedule ─── */}
          {currentStep === 1 && (
            <View style={{ paddingHorizontal: 16 }}>
              {/* Compact route summary */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#F9FAFB",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <View style={{ marginRight: 10, alignItems: "center" }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#16A34A",
                    }}
                  />
                  <View
                    style={{
                      width: 1.5,
                      height: 14,
                      backgroundColor: "#D1D5DB",
                      marginVertical: 2,
                    }}
                  />
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 1.5,
                      backgroundColor: "#EF4444",
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      fontFamily: "Figtree_500Medium",
                    }}
                  >
                    {startLocation}
                  </Text>
                  <View style={{ height: 6 }} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 12,
                      color: "#6B7280",
                      fontFamily: "Figtree_500Medium",
                    }}
                  >
                    {endLocation}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCurrentStep(0)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 12,
                      color: BRAND_PURPLE,
                    }}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Departure Time */}
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Departure Time
              </Text>
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: errors.departureTime ? "#EF4444" : "#E5E7EB",
                  padding: 14,
                  marginBottom: 4,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flex: 1,
                  }}
                >
                  <Clock
                    size={18}
                    color={BRAND_PURPLE}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={{
                      fontFamily: "Figtree_500Medium",
                      fontSize: 14,
                      color: "#111827",
                    }}
                  >
                    {departureTime.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </TouchableOpacity>
              {errors.departureTime && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.departureTime}
                </Text>
              )}

              {/* Max Passengers */}
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                Maximum Passengers
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
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    if (maxPassengers > MIN_PASSENGERS) {
                      setMaxPassengers(maxPassengers - 1);
                      setErrors((p) => ({ ...p, maxPassengers: undefined }));
                    }
                  }}
                  disabled={maxPassengers <= MIN_PASSENGERS}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Minus
                    size={20}
                    color={
                      maxPassengers <= MIN_PASSENGERS ? "#D1D5DB" : "#6B7280"
                    }
                  />
                </TouchableOpacity>
                <Text
                  style={{
                    fontFamily: "Figtree_700Bold",
                    fontSize: 28,
                    color: "#111827",
                  }}
                >
                  {maxPassengers}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (maxPassengers < MAX_PASSENGERS) {
                      setMaxPassengers(maxPassengers + 1);
                      setErrors((p) => ({ ...p, maxPassengers: undefined }));
                    }
                  }}
                  disabled={maxPassengers >= MAX_PASSENGERS}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: "#F3F4F6",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Plus
                    size={20}
                    color={
                      maxPassengers >= MAX_PASSENGERS ? "#D1D5DB" : "#6B7280"
                    }
                  />
                </TouchableOpacity>
              </View>
              {errors.maxPassengers && (
                <Text style={{ color: "#EF4444", fontSize: 11, marginTop: 4 }}>
                  {errors.maxPassengers}
                </Text>
              )}

              {/* Navigation */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
                <TouchableOpacity
                  onPress={handlePrevStep}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#6B7280",
                    }}
                  >
                    Back
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNextStep}
                  activeOpacity={0.85}
                  style={{
                    flex: 2,
                    backgroundColor: BRAND_PURPLE,
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
                    Continue
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ─── STEP 2: Fare & Confirm ─── */}
          {currentStep === 2 && (
            <View style={{ paddingHorizontal: 16 }}>
              {/* Summary card */}
              <View
                style={{
                  backgroundColor: "#F9FAFB",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <View style={{ marginRight: 10, alignItems: "center" }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: "#16A34A",
                      }}
                    />
                    <View
                      style={{
                        width: 1.5,
                        height: 14,
                        backgroundColor: "#D1D5DB",
                        marginVertical: 2,
                      }}
                    />
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 1.5,
                        backgroundColor: "#EF4444",
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        color: "#6B7280",
                        fontFamily: "Figtree_500Medium",
                      }}
                    >
                      {startLocation}
                    </Text>
                    <View style={{ height: 6 }} />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        color: "#6B7280",
                        fontFamily: "Figtree_500Medium",
                      }}
                    >
                      {endLocation}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: "#E5E7EB",
                    marginVertical: 6,
                  }}
                />
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Clock
                      size={13}
                      color="#6B7280"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ fontSize: 11, color: "#6B7280" }}>
                      {departureTime.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Users
                      size={13}
                      color="#6B7280"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{ fontSize: 11, color: "#6B7280" }}>
                      {maxPassengers} seats
                    </Text>
                  </View>
                </View>
              </View>

              {/* Base Fare */}
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 4,
                }}
              >
                Fare Settings
              </Text>
              <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                Price per Passenger (minimum ₹{MIN_BASE_FARE})
              </Text>
              <TextInput
                placeholder={`₹${MIN_BASE_FARE}`}
                value={baseFare}
                keyboardType="decimal-pad"
                onChangeText={(t) => {
                  setBaseFare(t);
                  setErrors((p) => ({ ...p, baseFare: undefined }));
                }}
                style={{
                  ...inputStyle,
                  marginBottom: 4,
                  borderColor: errors.baseFare ? "#EF4444" : "#E5E7EB",
                }}
                placeholderTextColor="#9CA3AF"
              />
              {errors.baseFare && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.baseFare}
                </Text>
              )}

              {/* Notes */}
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginTop: 12,
                  marginBottom: 8,
                }}
              >
                Notes (Optional)
              </Text>
              <TextInput
                placeholder="Add any additional information for passengers..."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ ...inputStyle, height: 72, marginBottom: 8 }}
                placeholderTextColor="#9CA3AF"
              />

              {/* Navigation */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  onPress={handlePrevStep}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Figtree_600SemiBold",
                      fontSize: 16,
                      color: "#6B7280",
                    }}
                  >
                    Back
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateCarPool}
                  disabled={isButtonDisabled}
                  activeOpacity={0.85}
                  style={{
                    flex: 2,
                    backgroundColor: isButtonDisabled
                      ? "#D1D5DB"
                      : BRAND_PURPLE,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 16,
                        color: "#FFF",
                      }}
                    >
                      Create Ride Share
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              <Text
                style={{
                  textAlign: "center",
                  color: "#9CA3AF",
                  fontSize: 13,
                  marginTop: 10,
                }}
              >
                After creating, passengers can search and join your pool.
              </Text>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Autocomplete Modals */}
      <AddressAutocomplete
        visible={showStartAutocomplete}
        onClose={() => setShowStartAutocomplete(false)}
        onSelectLocation={handleStartSelected}
        placeholder="Search for start location"
        locationType="pickup"
        currentValue={startLocation}
        onUseMapSelection={() => {
          setMapSelectionTarget("start");
          setEditingLocationType("start");
          setShowMapEditor(true);
        }}
      />
      <AddressAutocomplete
        visible={showEndAutocomplete}
        onClose={() => setShowEndAutocomplete(false)}
        onSelectLocation={handleEndSelected}
        placeholder="Search for end location"
        locationType="destination"
        currentValue={endLocation}
        onUseMapSelection={() => {
          setMapSelectionTarget("end");
          setEditingLocationType("end");
          setShowMapEditor(true);
        }}
      />

      {/* Map Editor */}
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
            if (editingLocationType === "end") {
              setCurrentStep(1);
              bottomSheetRef.current?.snapToIndex(2);
            }
          }}
          initialLocation={
            editingLocationType
              ? editingLocationType === "start"
                ? startCoords
                : endCoords
              : startCoords
          }
          locationType={
            editingLocationType === "start" ? "pickup" : "destination"
          }
          otherLocation={
            editingLocationType
              ? editingLocationType === "start"
                ? endCoords
                : startCoords
              : endCoords
          }
          allowBothEditing={false}
        />
      )}

      {/* Date/Time Pickers */}
      {showDatePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={departureTime}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              setDepartureTime(selectedDate);
              setShowTimePicker(true);
            }
          }}
        />
      )}
      {showTimePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={departureTime}
          mode="time"
          display="default"
          onChange={(event, selectedTime) => {
            setShowTimePicker(false);
            if (selectedTime) {
              setDepartureTime(selectedTime);
              setErrors((p) => ({ ...p, departureTime: undefined }));
            }
          }}
        />
      )}
      {showDatePicker && Platform.OS === "ios" && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#FFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 18,
                  color: "#111827",
                }}
              >
                Select Departure Time
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDatePicker(false);
                  setErrors((p) => ({ ...p, departureTime: undefined }));
                }}
              >
                <Text
                  style={{
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 16,
                    color: BRAND_PURPLE,
                  }}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={departureTime}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={(event, selectedDate) => {
                if (selectedDate) setDepartureTime(selectedDate);
              }}
              style={{ height: 200 }}
            />
          </View>
        </View>
      )}

      {/* Location Permission Dialog */}
      <LocationPermissionDialog
        visible={showLocationErrorDialog}
        onClose={() => setShowLocationErrorDialog(false)}
        errorType={getLocationErrorType()}
        title={
          locationErrorCode === "PERMISSION_DENIED"
            ? "Location Permission Required"
            : locationErrorCode === "LOCATION_DISABLED"
            ? "Location Services Disabled"
            : "Location Unavailable"
        }
        message={
          locationErrorCode === "PERMISSION_DENIED"
            ? "To use your current location, please allow location access in your device settings. You can also manually select a location on the map."
            : locationErrorCode === "LOCATION_DISABLED"
            ? "Please enable location services in your device settings to use this feature. You can also manually select a location on the map."
            : "Unable to access your location. Please check your device settings or select a location manually on the map."
        }
      />
    </View>
  );
}
