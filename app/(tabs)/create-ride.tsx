/**
 * Create Ride Screen (Passenger)
 * Allows passengers to request a new ride with interactive map
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import {
  View,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Image,
  Animated,
  Easing,
  type ImageSourcePropType,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import MapView, {
  Circle,
  type MapPressEvent,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  ArrowLeft,
  LocateFixed,
  Car,
  Clock,
  MapPin,
  Star,
  X,
  Users,
} from "lucide-react-native";
import {
  PickupMarker,
  DestinationMarker,
  DriverMarker,
} from "@/components/map-markers";

import { useAuth } from "@/context/auth-context";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loading";
import {
  getCurrentPositionWithAddress,
  useCurrentLocation,
  useLocationPermissions,
} from "@/lib/services/location";
import {
  createRide,
  getNearbyDrivers,
  getActiveRide,
  getRideEstimate,
  type CreateRideRequest,
  type NearbyDriverPublic,
  type RideResponse,
  type RideEstimateOption,
} from "@/lib/api/ride";
import { formatVehicleType } from "@/lib/api/ride";
import { updatePassengerLocation } from "@/lib/api/passenger";
import {
  SAMPLE_LOCATIONS,
  type LocationWithAddress,
} from "@/lib/utils/location";
import { setLastRideVehicleSlug } from "@/lib/storage";
import {
  addRecentLocation,
  getRecentLocations,
  type RecentLocation,
} from "@/lib/recent-locations";
import {
  calculateHeadingBetweenCoordinates,
} from "@/lib/utils/vehicle-marker-assets";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { MapEditor } from "@/components/map-editor";
import { LocationPermissionDialog } from "@/components/location-permission-dialog";
import { getRoute } from "@/lib/services/directions";
import { dispatchServiceCreated } from "@/lib/events";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";
import sedanImage from "@/assets/images/sedan.png";
import bikeImage from "@/assets/images/bike.png";
import suvImage from "@/assets/images/suv.png";
import autoImage from "@/assets/images/auto.png";

// Constants
const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const RIDE_SEARCH_RADIUS_KM = 3;
const RIDE_FALLBACK_SEARCH_RADIUS_KM = 12;
const NEARBY_MARKER_DESTINATION_INCLUDE_KM = 4.5;

const BRAND_ORANGE = "#F36D14";

const VEHICLE_IMAGE_MAP: Record<string, ImageSourcePropType> = {
  bike: bikeImage,
  motorcycle: bikeImage,
  car: sedanImage,
  cab: sedanImage,
  suv: suvImage,
  auto: autoImage,
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceKmBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type NearbyVehicleMarker = {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string | null;
  heading?: number;
};

type RideCategoryCard = {
  categoryName: string;
  representative: RideEstimateOption;
};

function isSameRideOption(
  a: RideEstimateOption,
  b: RideEstimateOption
): boolean {
  return (
    (a.vehicleSubcategoryId ?? "") === (b.vehicleSubcategoryId ?? "") &&
    (a.slug ?? "") === (b.slug ?? "") &&
    (a.vehicleType ?? "") === (b.vehicleType ?? "")
  );
}

export default function CreateRideScreen() {
  const { userType } = useAuth();
  const toast = useToast();
  const {
    destinationLat: destinationLatParam,
    destinationLng: destinationLngParam,
    destinationAddress: destinationAddressParam,
    prefillTs: prefillTsParam,
  } = useLocalSearchParams<{
    destinationLat?: string;
    destinationLng?: string;
    destinationAddress?: string;
    prefillTs?: string;
  }>();
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const ignoreNextMapPressRef = useRef(false);
  const appliedDestinationPrefillRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();

  const snapPoints = useMemo(() => [280, "50%", "85%"], []);

  // Location permissions and current location
  const {
    location: currentLocation,
    loading: locationLoading,
    error: locationError,
    errorCode: locationErrorCode,
    refresh: refreshLocation,
  } = useCurrentLocation();
  const { permissions, requestForeground } = useLocationPermissions();

  // Location error dialog state
  const [showLocationErrorDialog, setShowLocationErrorDialog] = useState(false);
  const [hasAttemptedLocation, setHasAttemptedLocation] = useState(false);

  // Form state
  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupCoords, setPickupCoords] = useState<LocationWithAddress | null>(
    null
  );
  const [destination, setDestination] = useState("");
  const [destinationCoords, setDestinationCoords] =
    useState<LocationWithAddress | null>(null);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [selectedOption, setSelectedOption] =
    useState<RideEstimateOption | null>(null);
  const [selectedRideCategory, setSelectedRideCategory] = useState<string | null>(
    null
  );
  const [rideSelectionByCategory, setRideSelectionByCategory] = useState<
    Record<string, string>
  >({});

  // Estimate state
  const [estimateOptions, setEstimateOptions] = useState<RideEstimateOption[]>(
    []
  );
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [selectedOptionLoading, setSelectedOptionLoading] = useState(false);
  const [fareLoadingByKey, setFareLoadingByKey] = useState<
    Record<string, boolean>
  >({});
  const estimateCacheRef = useRef<Map<string, RideEstimateOption>>(new Map());
  const lastEstimateFetchRef = useRef<{ key: string; at: number } | null>(null);
  const farePrefetchInFlightRef = useRef<Set<string>>(new Set());
  const ESTIMATE_RATE_LIMIT_MS = 3000;
  const rideSheetScrollRef = useRef<any>(null);
  const rideSubcategoryOffsetsRef = useRef<Record<string, number>>({});
  const rideSelectionAnim = useRef(new Animated.Value(1)).current;

  // Route state
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const latestRouteFetchRef = useRef(0);

  // Autocomplete modal state
  const [showPickupAutocomplete, setShowPickupAutocomplete] = useState(false);
  const [showDestinationAutocomplete, setShowDestinationAutocomplete] =
    useState(false);

  // Map editor modal state
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [editingLocationType, setEditingLocationType] = useState<
    "pickup" | "destination" | null
  >(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [activeRide, setActiveRide] = useState<RideResponse | null>(null);
  /** Nearby vehicles for map only Ã¢â‚¬â€ replaced on each fetch, never appended */
  const [nearbyVehicles, setNearbyVehicles] = useState<NearbyVehicleMarker[]>(
    []
  );
  const nearbyVehiclePreviousPositionRef = useRef<
    Map<string, { latitude: number; longitude: number }>
  >(new Map());
  const [showDriverListModal, setShowDriverListModal] = useState(false);
  const [driverListPublic, setDriverListPublic] = useState<
    NearbyDriverPublic[]
  >([]);
  const [driverListLoading, setDriverListLoading] = useState(false);
  const [requestingDriverId, setRequestingDriverId] = useState<string | null>(
    null
  );
  const [errors, setErrors] = useState<{
    pickup?: string;
    destination?: string;
  }>({});

  const bothLocationsSelected =
    pickupCoords !== null && destinationCoords !== null;

  const estimateCacheKey = useMemo(() => {
    if (!pickupCoords || !destinationCoords) return "";
    return `${pickupCoords.latitude},${pickupCoords.longitude},${destinationCoords.latitude},${destinationCoords.longitude}`;
  }, [
    pickupCoords?.latitude,
    pickupCoords?.longitude,
    destinationCoords?.latitude,
    destinationCoords?.longitude,
  ]);

  const getOptionCacheKey = useCallback(
    (item: RideEstimateOption) =>
      `${estimateCacheKey},${item.slug},${item.vehicleSubcategoryId ?? ""},${
        item.vehicleType ?? ""
      }`,
    [estimateCacheKey]
  );

  const getRideSelectionMemoryKey = useCallback(
    (item: RideEstimateOption) =>
      `${item.vehicleSubcategoryId ?? ""}|${item.slug ?? ""}|${
        item.vehicleType ?? ""
      }`,
    []
  );

  const rideCategoryCards = useMemo<RideCategoryCard[]>(() => {
    const grouped = new Map<string, RideEstimateOption[]>();
    for (const option of estimateOptions) {
      const categoryName =
        typeof option.categoryName === "string" && option.categoryName.trim()
          ? option.categoryName.trim()
          : "Other";
      const current = grouped.get(categoryName) ?? [];
      current.push(option);
      grouped.set(categoryName, current);
    }

    const cards: RideCategoryCard[] = [];
    for (const [categoryName, options] of grouped.entries()) {
      if (options.length === 0) continue;
      cards.push({
        categoryName,
        representative: options[0],
      });
    }

    return cards.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [estimateOptions]);

  const rideSubcategoryOptions = useMemo(() => {
    if (!selectedRideCategory) return [];
    return estimateOptions.filter(
      (option) => option.categoryName === selectedRideCategory
    );
  }, [estimateOptions, selectedRideCategory]);

  const mapRegion = useMemo(() => {
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
  }, [
    pickupCoords?.latitude,
    pickupCoords?.longitude,
    destinationCoords?.latitude,
    destinationCoords?.longitude,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ]);

  const quickDestinationLocations = useMemo<LocationWithAddress[]>(() => {
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

  useEffect(() => {
    refreshRecentLocations();
  }, [refreshRecentLocations]);

  useEffect(() => {
    const parseParam = (value?: string | string[]) =>
      Array.isArray(value) ? value[0] : value;

    const latRaw = parseParam(destinationLatParam);
    const lngRaw = parseParam(destinationLngParam);
    const addressRaw = parseParam(destinationAddressParam);
    const prefillTsRaw = parseParam(prefillTsParam);

    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const resolvedAddress =
      typeof addressRaw === "string" && addressRaw.trim().length > 0
        ? addressRaw.trim()
        : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

    const prefillKey = `${prefillTsRaw ?? "no-ts"}:${latitude.toFixed(
      6
    )}:${longitude.toFixed(6)}:${resolvedAddress}`;

    if (appliedDestinationPrefillRef.current === prefillKey) {
      return;
    }

    const prefetchedDestination: LocationWithAddress = {
      latitude,
      longitude,
      address: resolvedAddress,
    };

    setDestinationCoords(prefetchedDestination);
    setDestination(resolvedAddress);
    setErrors((prev) => ({ ...prev, destination: undefined }));
    appliedDestinationPrefillRef.current = prefillKey;
  }, [
    destinationLatParam,
    destinationLngParam,
    destinationAddressParam,
    prefillTsParam,
  ]);

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
    if (locationError && !locationLoading && hasAttemptedLocation) {
      if (
        locationErrorCode === "PERMISSION_DENIED" ||
        locationErrorCode === "LOCATION_DISABLED"
      ) {
        setShowLocationErrorDialog(true);
      }
    }
  }, [locationError, locationErrorCode, locationLoading, hasAttemptedLocation]);

  const checkActiveRide = async () => {
    try {
      const response = await getActiveRide();
      if (response.success && response.data?.ride) {
        const rideData = response.data.ride;
        const isPassengerCashSettledRide =
          rideData.status === "COMPLETED" &&
          rideData.ridePayment?.status === "PENDING" &&
          rideData.ridePayment?.paymentMethod === "CASH";

        if (!isPassengerCashSettledRide) {
          setActiveRide(rideData);
          router.replace("/(tabs)/active-ride");
        }
      }
    } catch (error) {
      console.error("Error checking active ride:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    checkActiveRide();
  }, []);

  const fetchNearbyVehicles = useCallback(async () => {
    if (!pickupCoords) return;
    const toNum = (v: number | string | null | undefined): number => {
      if (typeof v === "number" && !Number.isNaN(v)) return v;
      if (typeof v === "string") return parseFloat(v);
      return Number.NaN;
    };
    const parseDrivers = (
      raw: unknown
    ): NearbyVehicleMarker[] => {
      if (!raw || !Array.isArray(raw)) return [];
      return (
        raw as {
          id: string;
          latitude?: unknown;
          longitude?: unknown;
          lat?: unknown;
          lng?: unknown;
          location?: { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown } | null;
          coordinate?: { latitude?: unknown; longitude?: unknown; lat?: unknown; lng?: unknown } | null;
          heading?: number | string | null;
          vehicleType?: string | null;
          vehicle_type?: string | null;
          vehicleSubcategorySlug?: string | null;
          vehicle_subcategory_slug?: string | null;
          vehicleCategorySlug?: string | null;
          vehicle_category_slug?: string | null;
          vehicleCategoryName?: string | null;
          vehicle_category_name?: string | null;
          slug?: string | null;
          vehicleSubcategory?: { slug?: string | null } | null;
          vehicle_subcategory?: { slug?: string | null } | null;
          vehicleCategory?: { slug?: string | null; name?: string | null } | null;
          vehicle_category?: { slug?: string | null; name?: string | null } | null;
        }[]
      )
        .map((d) => {
          const latCandidates = [
            d.latitude,
            d.lat,
            d.location?.latitude,
            d.location?.lat,
            d.coordinate?.latitude,
            d.coordinate?.lat,
          ];
          const lngCandidates = [
            d.longitude,
            d.lng,
            d.location?.longitude,
            d.location?.lng,
            d.coordinate?.longitude,
            d.coordinate?.lng,
          ];
          const lat =
            latCandidates
              .map((value) => toNum(value as number | string | null | undefined))
              .find((value) => Number.isFinite(value)) ?? Number.NaN;
          const lng =
            lngCandidates
              .map((value) => toNum(value as number | string | null | undefined))
              .find((value) => Number.isFinite(value)) ?? Number.NaN;
          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
          const parsedHeading = toNum(
            d.heading as number | string | null | undefined
          );
          const resolvedVehicleType = [
            d.vehicleType,
            d.vehicle_type,
            d.vehicleCategorySlug,
            d.vehicle_category_slug,
            d.vehicleCategory?.slug,
            d.vehicle_category?.slug,
            d.vehicleCategoryName,
            d.vehicle_category_name,
            d.vehicleCategory?.name,
            d.vehicle_category?.name,
            d.vehicleSubcategorySlug,
            d.vehicle_subcategory_slug,
            d.vehicleSubcategory?.slug,
            d.vehicle_subcategory?.slug,
            d.slug,
          ].find((value): value is string => typeof value === "string" && value.trim().length > 0);

          return {
            id: d.id,
            latitude: lat,
            longitude: lng,
            heading: Number.isFinite(parsedHeading) ? parsedHeading : undefined,
            vehicleType: resolvedVehicleType,
          };
        })
        .filter((v): v is NonNullable<typeof v> => v != null);
    };
    const extractDrivers = (response: {
      success?: boolean;
      data?: unknown;
    }): unknown[] => {
      if (!response?.success) return [];
      const d = response.data as Record<string, unknown> | undefined;
      if (!d) return [];
      const fromData = d.drivers;
      const fromNested = (d.data as Record<string, unknown> | undefined)
        ?.drivers;
      const list = fromNested ?? fromData ?? [];
      return Array.isArray(list) ? list : [];
    };

    try {
      const response = await getNearbyDrivers(
        pickupCoords.latitude,
        pickupCoords.longitude,
        selectedOption?.vehicleType ?? undefined,
        RIDE_SEARCH_RADIUS_KM,
        selectedOption?.vehicleSubcategoryId ?? undefined
      );
      let driversRaw = extractDrivers(response);
      let list = parseDrivers(driversRaw);

      // Jaise Uber: vehicle select karte hi relevant drivers. Agar subcategory se 0 aaye to same category (vehicleType) se fetch karke dikhao
      if (
        list.length === 0 &&
        selectedOption?.vehicleSubcategoryId &&
        selectedOption?.vehicleType
      ) {
        const fallback = await getNearbyDrivers(
          pickupCoords.latitude,
          pickupCoords.longitude,
          selectedOption.vehicleType,
          RIDE_FALLBACK_SEARCH_RADIUS_KM,
          undefined
        );
        driversRaw = extractDrivers(fallback);
        list = parseDrivers(driversRaw);
      }

      // Final fallback: if strict vehicle filtering returns 0, show any nearby available drivers.
      if (list.length === 0) {
        const fallbackAny = await getNearbyDrivers(
          pickupCoords.latitude,
          pickupCoords.longitude,
          undefined,
          RIDE_FALLBACK_SEARCH_RADIUS_KM,
          undefined
        );
        driversRaw = extractDrivers(fallbackAny);
        list = parseDrivers(driversRaw);
      }

      const previousPositions = nearbyVehiclePreviousPositionRef.current;
      const nextPositions = new Map<string, { latitude: number; longitude: number }>();

      const vehiclesWithHeading = list.map((vehicle) => {
        const previous = previousPositions.get(vehicle.id);
        const derivedHeading =
          previous && (vehicle.heading == null || !Number.isFinite(vehicle.heading))
            ? calculateHeadingBetweenCoordinates(previous, vehicle)
            : null;

        nextPositions.set(vehicle.id, {
          latitude: vehicle.latitude,
          longitude: vehicle.longitude,
        });

        return {
          ...vehicle,
          vehicleType: vehicle.vehicleType ?? selectedOption?.vehicleType,
          heading:
            vehicle.heading != null && Number.isFinite(vehicle.heading)
              ? vehicle.heading
              : (derivedHeading ?? undefined),
        };
      });

      nearbyVehiclePreviousPositionRef.current = nextPositions;
      setNearbyVehicles(vehiclesWithHeading);
    } catch (error) {
      console.error("Error fetching nearby vehicles:", error);
      setNearbyVehicles([]);
    }
  }, [
    pickupCoords,
    selectedOption?.vehicleType,
    selectedOption?.vehicleSubcategoryId,
  ]);

  // Fetch nearby drivers whenever we have pickup on the ride booking map (every 7s). Filter by vehicle type when one is selected.
  useEffect(() => {
    if (!pickupCoords) return;
    fetchNearbyVehicles();
    const interval = setInterval(fetchNearbyVehicles, 7000);
    return () => clearInterval(interval);
  }, [pickupCoords, fetchNearbyVehicles]);

  // Keep nearby drivers visible around pickup (Uber-style), even for long trips.
  useEffect(() => {
    if (nearbyVehicles.length === 0 || !mapRef.current || !pickupCoords) return;
    const includeDestination =
      destinationCoords != null &&
      distanceKmBetween(pickupCoords, destinationCoords) <=
        NEARBY_MARKER_DESTINATION_INCLUDE_KM;

    const coords = [
      pickupCoords,
      ...(includeDestination && destinationCoords ? [destinationCoords] : []),
      ...nearbyVehicles.map((v) => ({
        latitude: v.latitude,
        longitude: v.longitude,
      })),
    ];
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 80, bottom: 350, left: 80 },
      animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fit when count or locations change, not every poll
  }, [nearbyVehicles.length, pickupCoords, destinationCoords]);

  useEffect(() => {
    if (!pickupCoords || !destinationCoords) {
      setEstimateOptions([]);
      setEstimateError(null);
      setSelectedOption(null);
      setSelectedRideCategory(null);
      setRideSelectionByCategory({});
      setFareLoadingByKey({});
      farePrefetchInFlightRef.current.clear();
      rideSubcategoryOffsetsRef.current = {};
      estimateCacheRef.current.clear();
      return;
    }
    let cancelled = false;
    setEstimateLoading(true);
    setEstimateError(null);
    setSelectedOption(null);
    setSelectedRideCategory(null);
    setRideSelectionByCategory({});
    setFareLoadingByKey({});
    farePrefetchInFlightRef.current.clear();
    rideSubcategoryOffsetsRef.current = {};
    estimateCacheRef.current.clear();
    getRideEstimate(
      pickupCoords.latitude,
      pickupCoords.longitude,
      destinationCoords.latitude,
      destinationCoords.longitude
    )
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          const msg =
            typeof res.error === "object" &&
            res.error !== null &&
            "message" in res.error
              ? String((res.error as { message: string }).message)
              : "Unable to load ride options";
          setEstimateOptions([]);
          setEstimateError(msg);
          return;
        }
        const options = res.data?.options ?? [];
        if (options.length > 0) {
          setEstimateOptions(options);
          setEstimateError(null);
        } else {
          setEstimateOptions([]);
          setEstimateError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEstimateOptions([]);
          setEstimateError("Failed to load estimates");
        }
      })
      .finally(() => {
        if (!cancelled) setEstimateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    pickupCoords?.latitude,
    pickupCoords?.longitude,
    destinationCoords?.latitude,
    destinationCoords?.longitude,
  ]);

  const fetchEstimateForOption = useCallback(
    async (item: RideEstimateOption) => {
      if (!pickupCoords || !destinationCoords) return;
      const key = getOptionCacheKey(item);
      const now = Date.now();
      const last = lastEstimateFetchRef.current;
      if (last?.key === key && now - last.at < ESTIMATE_RATE_LIMIT_MS) return;
      lastEstimateFetchRef.current = { key, at: now };
      setSelectedOptionLoading(true);
      try {
        const res = await getRideEstimate(
          pickupCoords.latitude,
          pickupCoords.longitude,
          destinationCoords.latitude,
          destinationCoords.longitude,
          {
            vehicleSlug: item.slug,
            vehicleSubcategoryId: item.vehicleSubcategoryId ?? undefined,
          }
        );
        if (res.success && res.data?.options?.[0]) {
          const option = res.data.options[0];
          estimateCacheRef.current.set(key, option);
          setSelectedOption(option);
          setLastRideVehicleSlug(item.slug).catch(() => {});
        }
      } catch {
        setEstimateError("Failed to load estimate");
      } finally {
        setSelectedOptionLoading(false);
      }
    },
    [pickupCoords, destinationCoords, getOptionCacheKey]
  );

  const prefetchFareForOption = useCallback(
    async (item: RideEstimateOption) => {
      if (!pickupCoords || !destinationCoords) return;
      const key = getOptionCacheKey(item);
      if (estimateCacheRef.current.has(key)) return;
      if (farePrefetchInFlightRef.current.has(key)) return;

      farePrefetchInFlightRef.current.add(key);
      setFareLoadingByKey((prev) => ({ ...prev, [key]: true }));
      try {
        const res = await getRideEstimate(
          pickupCoords.latitude,
          pickupCoords.longitude,
          destinationCoords.latitude,
          destinationCoords.longitude,
          {
            vehicleSlug: item.slug,
            vehicleSubcategoryId: item.vehicleSubcategoryId ?? undefined,
          }
        );
        if (res.success && res.data?.options?.[0]) {
          const enriched = res.data.options[0];
          estimateCacheRef.current.set(key, enriched);
          setEstimateOptions((prev) =>
            prev.map((option) =>
              isSameRideOption(option, item) ? { ...option, ...enriched } : option
            )
          );
          if (selectedOption && isSameRideOption(selectedOption, item)) {
            setSelectedOption((prev) =>
              prev ? { ...prev, ...enriched } : prev
            );
          }
        }
      } catch {
        // Ignore per-option prefetch failures; selection flow still fetches on tap.
      } finally {
        farePrefetchInFlightRef.current.delete(key);
        setFareLoadingByKey((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [
      pickupCoords,
      destinationCoords,
      getOptionCacheKey,
      selectedOption,
      setSelectedOption,
    ]
  );

  const handleVehicleSelect = useCallback(
    (item: RideEstimateOption) => {
      const isSelected =
        selectedOption?.slug === item.slug &&
        selectedOption?.vehicleSubcategoryId === item.vehicleSubcategoryId &&
        selectedOption?.vehicleType === item.vehicleType;
      if (isSelected) return;
      const key = getOptionCacheKey(item);
      const cached = estimateCacheRef.current.get(key);
      if (cached) {
        setSelectedOption(cached);
        setSelectedRideCategory(item.categoryName);
        setRideSelectionByCategory((prev) => ({
          ...prev,
          [item.categoryName]: getRideSelectionMemoryKey(item),
        }));
        setLastRideVehicleSlug(item.slug).catch(() => {});
        return;
      }
      setSelectedOption(item);
      setSelectedRideCategory(item.categoryName);
      setRideSelectionByCategory((prev) => ({
        ...prev,
        [item.categoryName]: getRideSelectionMemoryKey(item),
      }));
      fetchEstimateForOption(item);
    },
    [
      selectedOption,
      getOptionCacheKey,
      fetchEstimateForOption,
      getRideSelectionMemoryKey,
    ]
  );

  const handleOpenRideSubcategories = useCallback((categoryName: string) => {
    setSelectedRideCategory(categoryName);
    if (selectedOption?.categoryName === categoryName) return;

    const rememberedKey = rideSelectionByCategory[categoryName];
    if (rememberedKey) {
      const rememberedOption = estimateOptions.find(
        (option) =>
          option.categoryName === categoryName &&
          getRideSelectionMemoryKey(option) === rememberedKey
      );
      if (rememberedOption) {
        handleVehicleSelect(rememberedOption);
        return;
      }
    }

    setSelectedOption(null);
  }, [
    selectedOption?.categoryName,
    rideSelectionByCategory,
    estimateOptions,
    getRideSelectionMemoryKey,
    handleVehicleSelect,
  ]);

  const handleBackToRideCategories = useCallback(() => {
    setSelectedRideCategory(null);
  }, []);

  useEffect(() => {
    rideSelectionAnim.setValue(0);
    Animated.timing(rideSelectionAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selectedRideCategory, rideSelectionAnim]);

  useEffect(() => {
    if (!selectedRideCategory) return;
    const selectedKey = rideSelectionByCategory[selectedRideCategory];
    if (!selectedKey) return;

    const timer = setTimeout(() => {
      const y = rideSubcategoryOffsetsRef.current[selectedKey];
      if (typeof y === "number") {
        rideSheetScrollRef.current?.scrollTo?.({
          y: Math.max(y - 120, 0),
          animated: true,
        });
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [selectedRideCategory, rideSelectionByCategory, rideSubcategoryOptions.length]);

  useEffect(() => {
    if (!selectedRideCategory) return;
    if (rideSubcategoryOptions.length === 0) return;
    rideSubcategoryOptions.forEach((option) => {
      void prefetchFareForOption(option);
    });
  }, [selectedRideCategory, rideSubcategoryOptions, prefetchFareForOption]);

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
      setPickupCoords(position);
      setPickupLocation(
        position.address ||
          `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, pickup: undefined }));
      if (userType === "passenger") {
        updatePassengerLocation(
          position.latitude,
          position.longitude,
          position.address
        ).catch(() => {});
      }
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
  }, [permissions.foreground, requestForeground, userType]);

  const handleSelectQuickDestination = (location: LocationWithAddress) => {
    setDestinationCoords(location);
    setDestination(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, destination: undefined }));
    rememberRecentLocation(location);
  };

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

  const handleMapEdit = (
    location: LocationWithAddress,
    locationType: "pickup" | "destination"
  ) => {
    if (locationType === "pickup") {
      setPickupCoords(location);
      setPickupLocation(
        location.address ||
          `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, pickup: undefined }));
      rememberRecentLocation(location);
    } else {
      setDestinationCoords(location);
      setDestination(
        location.address ||
          `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, destination: undefined }));
      rememberRecentLocation(location);
    }
  };

  useEffect(() => {
    const fetchRoute = async () => {
      if (!pickupCoords || !destinationCoords) {
        setRouteCoordinates([]);
        return;
      }
      const fetchId = ++latestRouteFetchRef.current;
      setRouteLoading(true);
      try {
        const route = await getRoute(
          pickupCoords,
          destinationCoords,
          selectedOption?.vehicleType ?? undefined
        );
        if (fetchId !== latestRouteFetchRef.current) return;
        if (route && route.coordinates.length > 0) {
          setRouteCoordinates(route.coordinates);
        } else {
          setRouteCoordinates([pickupCoords, destinationCoords]);
        }
      } catch (error) {
        console.error("Error fetching route:", error);
        if (fetchId !== latestRouteFetchRef.current) return;
        setRouteCoordinates([pickupCoords, destinationCoords]);
      } finally {
        if (fetchId !== latestRouteFetchRef.current) return;
        setRouteLoading(false);
      }
    };
    fetchRoute();
  }, [pickupCoords, destinationCoords, selectedOption?.vehicleType]);

  const handleMapPress = useCallback(
    (event: MapPressEvent) => {
      if (ignoreNextMapPressRef.current) {
        ignoreNextMapPressRef.current = false;
        return;
      }
      // Marker taps may bubble as map taps on Android.
      if ((event.nativeEvent as { action?: string }).action === "marker-press")
        return;
      if (!pickupCoords) return;
      // Keep editing explicit to avoid accidentally overwriting pickup.
      setEditingLocationType(destinationCoords ? "destination" : "pickup");
      setShowMapEditor(true);
    },
    [pickupCoords, destinationCoords]
  );

  const handlePickupSelect = (location: LocationWithAddress) => {
    setPickupCoords(location);
    setPickupLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, pickup: undefined }));
    rememberRecentLocation(location);
  };

  const handleDestinationSelect = (location: LocationWithAddress) => {
    setDestinationCoords(location);
    setDestination(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, destination: undefined }));
    rememberRecentLocation(location);
  };

  const validateForm = (): boolean => {
    const newErrors: { pickup?: string; destination?: string } = {};
    if (!pickupLocation.trim() || !pickupCoords)
      newErrors.pickup = "Please select a pickup location";
    if (!destination.trim() || !destinationCoords)
      newErrors.destination = "Please select a destination";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildRideData = useCallback((): CreateRideRequest | null => {
    if (!pickupCoords || !destinationCoords) return null;
    const rideData: CreateRideRequest = {
      pickupLatitude: Number(pickupCoords.latitude),
      pickupLongitude: Number(pickupCoords.longitude),
      pickupLocation: String(pickupLocation),
      destinationLat: Number(destinationCoords.latitude),
      destinationLng: Number(destinationCoords.longitude),
      destination: String(destination),
    };
    if (selectedOption?.vehicleSubcategoryId)
      rideData.vehicleSubcategoryId = String(
        selectedOption.vehicleSubcategoryId
      );
    if (selectedOption?.slug)
      rideData.vehicleSubcategorySlug = String(selectedOption.slug);
    return rideData;
  }, [
    pickupCoords,
    destinationCoords,
    pickupLocation,
    destination,
    selectedOption,
  ]);

  const handleCreateRide = async (requestedDriverId?: string) => {
    const rideData = buildRideData();
    if (!rideData || !validateForm()) return;
    const driverId =
      typeof requestedDriverId === "string" && requestedDriverId.length > 0
        ? requestedDriverId
        : undefined;
    if (driverId) {
      setRequestingDriverId(driverId);
    } else {
      setLoading(true);
    }
    try {
      if (driverId) rideData.requestedDriverId = driverId;
      const response = await createRide(rideData);
      if (response.success && response.data) {
        dispatchServiceCreated();
        if (driverId) {
          setShowDriverListModal(false);
          setDriverListPublic([]);
        }
        toast.success(
          driverId
            ? "Request sent to driver! They have 30 seconds to accept."
            : "Ride request created! Finding a driver..."
        );
        router.replace("/(tabs)/active-ride");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to create ride request";
        const errMsgLower = errorMessage.toLowerCase();
        const hasExistingRide =
          (errMsgLower.includes("active") && errMsgLower.includes("ride")) ||
          (errMsgLower.includes("pending") && errMsgLower.includes("ride"));
        if (hasExistingRide) {
          toast.success("Taking you to your active ride.");
          router.replace("/(tabs)/active-ride");
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (error) {
      console.error("Error creating ride:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setRequestingDriverId(null);
    }
  };

  const openDriverListModal = useCallback(async () => {
    if (!pickupCoords) return;
    setShowDriverListModal(true);
    setDriverListLoading(true);
    setDriverListPublic([]);
    try {
      const response = await getNearbyDrivers(
        pickupCoords.latitude,
        pickupCoords.longitude,
        selectedOption?.vehicleType ?? undefined,
        RIDE_SEARCH_RADIUS_KM,
        selectedOption?.vehicleSubcategoryId ?? undefined,
        true
      );
      if (response.success && response.data?.drivers) {
        setDriverListPublic(response.data.drivers as NearbyDriverPublic[]);
      }
    } catch (e) {
      console.error("Error fetching driver list:", e);
    } finally {
      setDriverListLoading(false);
    }
  }, [
    pickupCoords,
    selectedOption?.vehicleType,
    selectedOption?.vehicleSubcategoryId,
  ]);

  useEffect(() => {
    if (pickupCoords && destinationCoords && mapRef.current) {
      mapRef.current.fitToCoordinates([pickupCoords, destinationCoords], {
        edgePadding: { top: 120, right: 80, bottom: 350, left: 80 },
        animated: true,
      });
    }
  }, [pickupCoords, destinationCoords]);

  // Snap sheet down when destination is chosen via autocomplete
  const handleDestinationSelected = useCallback(
    (location: LocationWithAddress) => {
      handleDestinationSelect(location);
      bottomSheetRef.current?.snapToIndex(0);
    },
    []
  );

  const handlePickupSelected = useCallback((location: LocationWithAddress) => {
    handlePickupSelect(location);
  }, []);

  const isButtonDisabled =
    loading ||
    !pickupCoords ||
    !destinationCoords ||
    !!estimateError ||
    (estimateOptions.length > 0 && !selectedOption);

  // Show loading state
  if (initialLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFFFFF",
        }}
      >
        <Loading message="Loading..." />
      </SafeAreaView>
    );
  }

  // Show message if not a passenger
  if (userType !== "passenger") {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900">
        <View className="items-center justify-center flex-1 p-6">
          <View className="items-center justify-center w-20 h-20 mb-4 bg-gray-200 rounded-full dark:bg-gray-700">
            <Car size={40} color="#6B7280" />
          </View>
          <Text className="mb-2 text-xl font-semibold text-center text-gray-900 dark:text-gray-100">
            Driver Account
          </Text>
          <Text className="text-center text-gray-600 dark:text-gray-400">
            This screen is for passengers. Go to the Rides tab to see pending
            ride requests.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e" }}>
      {/* Full-screen map background */}
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
        {/* Pickup radius circle */}
        {pickupCoords && (
          <Circle
            center={pickupCoords}
            radius={150}
            fillColor="rgba(16, 185, 129, 0.08)"
            strokeColor="rgba(16, 185, 129, 0.25)"
            strokeWidth={1.5}
          />
        )}
        {pickupCoords && (
          <PickupMarker
            key="pickup-marker"
            coordinate={pickupCoords}
            title={pickupLocation || "Pickup"}
            onPress={() => {
              setEditingLocationType("pickup");
              setShowMapEditor(true);
            }}
          />
        )}
        {destinationCoords && (
          <DestinationMarker
            key="destination-marker"
            coordinate={destinationCoords}
            title={destination || "Destination"}
            onPress={() => {
              setEditingLocationType("destination");
              setShowMapEditor(true);
            }}
          />
        )}
        {/* Route shadow line */}
        {routeCoordinates.length > 0 && !routeLoading && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={ROUTE_COLORS.shadow}
            strokeWidth={8}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {/* Route main line */}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={ROUTE_COLORS.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {/* Nearby drivers Ã¢â‚¬â€ vehicle-type top-view markers (ride-hailing style, before booking) */}
        {nearbyVehicles.map((vehicle) => (
          <DriverMarker
            key={vehicle.id}
            coordinate={{
              latitude: vehicle.latitude,
              longitude: vehicle.longitude,
            }}
            title="Nearby vehicle"
            vehicleType={vehicle.vehicleType}
            heading={vehicle.heading ?? null}
          />
        ))}
      </MapView>

      {/* Loading route: hidden for passengers (driver-only UI) */}

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

      {/* Get Current Location button */}
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
        <LocateFixed size={20} color={BRAND_ORANGE} />
      </TouchableOpacity>

      {/* Fit-route button (includes pickup, destination, and nearby vehicles) */}

      {/* Draggable Bottom Sheet */}
      <BottomSheet
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enableBlurKeyboardOnGesture={true}
        android_keyboardInputMode="adjustResize"
        ref={bottomSheetRef}
        index={2}
        snapPoints={snapPoints}
        backgroundStyle={{
          backgroundColor: "#FFFFFF",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
        }}
        handleIndicatorStyle={{ backgroundColor: "#D1D5DB", width: 40 }}
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          ref={rideSheetScrollRef}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
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
              Book a Ride
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
            {/* Pickup row */}
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

            {/* Separator */}
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

            {/* Destination row */}
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
                  color: destination ? "#111827" : "#9CA3AF",
                  fontFamily: "Figtree_500Medium",
                }}
              >
                {destination || "Where to?"}
              </Text>
            </TouchableOpacity>
          </View>

          {errors.pickup && (
            <Text
              style={{
                color: "#EF4444",
                fontSize: 12,
                marginHorizontal: 20,
                marginTop: 4,
              }}
            >
              {errors.pickup}
            </Text>
          )}
          {errors.destination && (
            <Text
              style={{
                color: "#EF4444",
                fontSize: 12,
                marginHorizontal: 20,
                marginTop: 4,
              }}
            >
              {errors.destination}
            </Text>
          )}

          {/* Recent / Saved section (when no destination yet) */}
          {!destinationCoords && (
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              {quickDestinationLocations.map((location, idx) => (
                <TouchableOpacity
                  key={`${location.latitude}-${location.longitude}-${location.address}`}
                  onPress={() => {
                    handleSelectQuickDestination(location);
                    bottomSheetRef.current?.snapToIndex(0);
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 14,
                    borderBottomWidth:
                      idx < quickDestinationLocations.length - 1 ? 1 : 0,
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
                  setEditingLocationType("destination");
                  setShowMapEditor(true);
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  borderBottomWidth: 1,
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

              <TouchableOpacity
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
                  <Star size={18} color="#6B7280" />
                </View>
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 14,
                    color: "#111827",
                  }}
                >
                  Saved places
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Vehicle options + Request (when destination is set) */}
          {bothLocationsSelected && (
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Choose a ride
              </Text>

              <Animated.View
                style={{
                  opacity: rideSelectionAnim,
                  transform: [
                    {
                      translateY: rideSelectionAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 0],
                      }),
                    },
                  ],
                }}
              >
              {estimateLoading ? (
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 12,
                    padding: 24,
                    alignItems: "center",
                  }}
                >
                  <ActivityIndicator size="small" color={BRAND_ORANGE} />
                  <Text
                    style={{ color: "#9CA3AF", fontSize: 13, marginTop: 8 }}
                  >
                    Loading options...
                  </Text>
                </View>
              ) : estimateError ? (
                <View
                  style={{
                    backgroundColor: "#FFF7ED",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <Text
                    style={{
                      color: "#92400E",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    {estimateError}
                  </Text>
                </View>
              ) : estimateOptions.length === 0 ? (
                <View
                  style={{
                    backgroundColor: "#F9FAFB",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <Text
                    style={{
                      color: "#9CA3AF",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    No ride options in this area
                  </Text>
                </View>
              ) : !selectedRideCategory ? (
                rideCategoryCards.map((category) => {
                  const isSelectedCategory =
                    selectedOption?.categoryName === category.categoryName;
                  const vehicleImage =
                    VEHICLE_IMAGE_MAP[category.representative.slug] ||
                    VEHICLE_IMAGE_MAP[
                      category.representative.categoryName?.toLowerCase?.() || ""
                    ] ||
                    null;

                  return (
                    <TouchableOpacity
                      key={category.categoryName}
                      onPress={() =>
                        handleOpenRideSubcategories(category.categoryName)
                      }
                      activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: 12,
                      marginBottom: 8,
                      borderRadius: 12,
                        borderWidth: 1,
                      borderColor: isSelectedCategory ? BRAND_ORANGE : "#F3F4F6",
                      backgroundColor: isSelectedCategory ? "#FFE4D6" : "#FAFAFA",
                    }}
                    >
                      <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                        backgroundColor: "#FFF",
                        overflow: "hidden",
                      }}
                      >
                        {vehicleImage ? (
                          <Image
                            source={vehicleImage}
                            style={{
                              width: "100%",
                              height: "100%",
                              resizeMode: "contain",
                            }}
                          />
                        ) : (
                          <Car size={22} color="#9CA3AF" />
                        )}
                      </View>

                    <Text
                      style={{
                        flex: 1,
                        fontFamily: "Figtree_700Bold",
                        fontSize: 16,
                        color: isSelectedCategory ? BRAND_ORANGE : "#111827",
                      }}
                    >
                        {category.categoryName}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View>
                  <TouchableOpacity
                    onPress={handleBackToRideCategories}
                    activeOpacity={0.8}
                    style={{
                      alignSelf: "flex-start",
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: "#F3F4F6",
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Figtree_600SemiBold",
                        fontSize: 12,
                        color: "#374151",
                      }}
                    >
                      Back to Categories
                    </Text>
                  </TouchableOpacity>

                  {rideSubcategoryOptions.map((item) => {
                    const isSelected =
                      selectedOption?.slug === item.slug &&
                      selectedOption?.vehicleSubcategoryId ===
                        item.vehicleSubcategoryId &&
                      selectedOption?.vehicleType === item.vehicleType;
                    const optionKey = getOptionCacheKey(item);
                    const cachedOption = estimateCacheRef.current.get(optionKey);
                    const displayOption = isSelected
                      ? selectedOption
                      : (cachedOption ?? item);
                    const isFareLoading =
                      fareLoadingByKey[optionKey] === true ||
                      (selectedOptionLoading && isSelected);
                    const hasFare =
                      displayOption &&
                      (displayOption.estimatedFare > 0 ||
                        displayOption.distanceKm > 0);
                    const vehicleImage =
                      VEHICLE_IMAGE_MAP[item.slug] ||
                      VEHICLE_IMAGE_MAP[item.categoryName?.toLowerCase?.() || ""] ||
                      null;

                    return (
                      <TouchableOpacity
                        key={item.slug + (item.vehicleSubcategoryId ?? "")}
                        onPress={() => handleVehicleSelect(item)}
                        disabled={selectedOptionLoading && !isSelected}
                        onLayout={(event) => {
                          rideSubcategoryOffsetsRef.current[
                            getRideSelectionMemoryKey(item)
                          ] = event.nativeEvent.layout.y;
                        }}
                        activeOpacity={0.7}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 12,
                          marginBottom: 8,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSelected ? BRAND_ORANGE : "#F3F4F6",
                          backgroundColor: isSelected ? "#FFE4D6" : "#FAFAFA",
                        }}
                      >
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 16,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 12,
                            backgroundColor: "#FFF",
                            overflow: "hidden",
                          }}
                        >
                          {vehicleImage ? (
                            <Image
                              source={vehicleImage}
                              style={{
                                width: "100%",
                                height: "100%",
                                resizeMode: "contain",
                              }}
                            />
                          ) : (
                            <Car size={22} color="#9CA3AF" />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontFamily: "Figtree_600SemiBold",
                              fontSize: 14,
                              color: isSelected ? BRAND_ORANGE : "#111827",
                            }}
                          >
                            {item.subcategoryName !== "Standard"
                              ? item.subcategoryName
                              : item.categoryName}
                          </Text>
                          <Text
                            style={{
                              color: "#6B7280",
                              fontSize: 12,
                              marginTop: 4,
                              fontFamily: "Figtree_500Medium",
                            }}
                          >
                            {hasFare
                              ? `${displayOption.distanceKm.toFixed(1)} km - ${
                                  displayOption.noDriversAvailable
                                    ? "No drivers"
                                    : displayOption.etaDriverMinutes != null
                                      ? `~${displayOption.etaDriverMinutes} min`
                                      : "--"
                                }`
                              : isFareLoading
                                ? "Loading..."
                                : "Tap for price"}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontFamily: "Figtree_700Bold",
                            fontSize: 16,
                            color: isSelected ? BRAND_ORANGE : "#111827",
                          }}
                        >
                          {hasFare
                            ? `Rs.${displayOption.estimatedFare.toFixed(2)}`
                            : isFareLoading
                              ? "..."
                              : "--"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              </Animated.View>

              {/* Request Ride button */}
              <TouchableOpacity
                onPress={() => handleCreateRide()}
                disabled={isButtonDisabled}
                activeOpacity={0.85}
                style={{
                  backgroundColor: isButtonDisabled ? "#D1D5DB" : BRAND_ORANGE,
                  borderRadius: 16,
                  paddingVertical: 16,
                  alignItems: "center",
                  marginTop: 16,
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
                    Request Ride
                  </Text>
                )}
              </TouchableOpacity>
              <Text
                style={{
                  textAlign: "center",
                  color: "#9CA3AF",
                  fontSize: 13,
                  marginTop: 10,
                }}
              >
                {
                  "You'll be matched with a nearby driver once you request the ride."
                }
              </Text>
            </View>
          )}
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
        currentValue={destination}
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
            if (editingLocationType === "destination")
              bottomSheetRef.current?.snapToIndex(0);
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

      {/* Full-screen booking loader */}
      <Modal
        visible={loading}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator size="large" color={BRAND_ORANGE} />
          </View>
          <Text
            style={{
              marginTop: 18,
              fontSize: 20,
              color: "#111827",
              fontFamily: "Figtree_700Bold",
            }}
          >
            Finding your ride...
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              color: "#6B7280",
              textAlign: "center",
              fontFamily: "Figtree_400Regular",
            }}
          >
            Connecting you to nearby drivers
          </Text>
        </View>
      </Modal>

      {/* Driver List Modal */}
      <Modal
        visible={showDriverListModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDriverListModal(false)}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onPress={() => setShowDriverListModal(false)}
        >
          <Pressable
            style={{
              backgroundColor: "#FFF",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "70%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={{
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
              }}
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
                    fontFamily: "Figtree_600SemiBold",
                    fontSize: 18,
                    color: "#111827",
                  }}
                >
                  Choose a driver
                </Text>
                <TouchableOpacity
                  onPress={() => setShowDriverListModal(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <X size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>
                Request will be sent directly to the driver (30s to accept)
              </Text>
            </View>
            {driverListLoading ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <ActivityIndicator size="large" color={BRAND_ORANGE} />
                <Text style={{ color: "#9CA3AF", marginTop: 8 }}>
                  Loading drivers...
                </Text>
              </View>
            ) : driverListPublic.length === 0 ? (
              <View style={{ paddingVertical: 48, alignItems: "center" }}>
                <Users size={48} color="#9CA3AF" />
                <Text style={{ color: "#9CA3AF", marginTop: 8 }}>
                  No drivers available
                </Text>
              </View>
            ) : (
              <FlatList
                data={driverListPublic}
                keyExtractor={(item) => item.id}
                style={{ flex: 1 }}
                renderItem={({ item }) => (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 14,
                          color: "#111827",
                        }}
                      >
                        {item.fullName}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 4,
                          gap: 8,
                        }}
                      >
                        <Text style={{ fontSize: 13, color: "#6B7280" }}>
                          {formatVehicleType(item.vehicleType)}
                        </Text>
                        <Text style={{ fontSize: 13, color: "#D97706" }}>
                          Ã¢Ëœâ€¦ {item.rating.toFixed(1)}
                        </Text>
                        <Text style={{ fontSize: 13, color: "#6B7280" }}>
                          {item.distanceKm.toFixed(1)} km away
                        </Text>
                      </View>
                    </View>
                    <Button
                      size="sm"
                      onPress={() => handleCreateRide(item.id)}
                      loading={requestingDriverId === item.id}
                      disabled={!!requestingDriverId}
                    >
                      Request
                    </Button>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Location Permission Error Dialog */}
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
