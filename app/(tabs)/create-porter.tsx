/**
 * Create Porter Service Screen (Passenger)
 * Uber-style full-screen map + draggable bottom sheet
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
import { View, ScrollView, TouchableOpacity, Alert, Dimensions, Switch, ActivityIndicator, StyleSheet, Platform, Image, ImageSourcePropType, Animated, Easing } from "react-native";
import { router } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import MapView, {
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
  FileText,
  UtensilsCrossed,
  Smartphone,
  Box,
  Shirt,
  MoreHorizontal,
  User,
  UserPlus,
  type LucideIcon,
} from "lucide-react-native";

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
  createPorterService,
  getNearbyDriversForPorter,
  getActivePorterService,
  getPorterEstimate,
  type CreatePorterRequest,
  type PorterServiceResponse,
  type PackageType,
  type PorterEstimateOption,
} from "@/lib/api/porter";
import { updatePassengerLocation } from "@/lib/api/passenger";
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
import {
  PickupMarker,
  DestinationMarker,
  DriverMarker,
} from "@/components/map-markers";
import { LocationPermissionDialog } from "@/components/location-permission-dialog";
import { getRoute } from "@/lib/services/directions";
import { dispatchServiceCreated } from "@/lib/events";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";
import { calculateHeadingBetweenCoordinates } from "@/lib/utils/vehicle-marker-assets";
import sedanImage from "@/assets/images/sedan.png";
import bikeImage from "@/assets/images/bike.png";
import suvImage from "@/assets/images/suv.png";
import autoImage from "@/assets/images/auto.png";

const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.015;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const PORTER_SEARCH_RADIUS_KM = 3;
const PORTER_FALLBACK_SEARCH_RADIUS_KM = 12;
const NEARBY_MARKER_DESTINATION_INCLUDE_KM = 4.5;

const BRAND_ORANGE = "#F36D14";

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

const VEHICLE_IMAGE_MAP: Record<string, ImageSourcePropType> = {
  bike: bikeImage,
  motorcycle: bikeImage,
  car: sedanImage,
  cab: sedanImage,
  suv: suvImage,
  auto: autoImage,
};

const PACKAGE_TYPES: {
  value: PackageType;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "DOCUMENT", label: "Document", icon: FileText },
  { value: "FOOD", label: "Food", icon: UtensilsCrossed },
  { value: "ELECTRONICS", label: "Electronics", icon: Smartphone },
  { value: "FURNITURE", label: "Furniture", icon: Box },
  { value: "CLOTHING", label: "Clothing", icon: Shirt },
  { value: "OTHER", label: "Other", icon: MoreHorizontal },
];

type PorterCategoryCard = {
  categoryName: string;
  representative: PorterEstimateOption;
};

export default function CreatePorterScreen() {
  const { userType, user } = useAuth();
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

  const [pickupLocation, setPickupLocation] = useState("");
  const [pickupCoords, setPickupCoords] = useState<LocationWithAddress | null>(
    null
  );
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryCoords, setDeliveryCoords] =
    useState<LocationWithAddress | null>(null);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);

  const [pickupContactName, setPickupContactName] = useState("");
  const [pickupContactPhone, setPickupContactPhone] = useState("");
  const [deliveryContactName, setDeliveryContactName] = useState("");
  const [deliveryContactPhone, setDeliveryContactPhone] = useState("");

  const [packageType, setPackageType] = useState<PackageType>("DOCUMENT");
  const [packageWeight, setPackageWeight] = useState("");
  const [packageLength, setPackageLength] = useState("");
  const [packageWidth, setPackageWidth] = useState("");
  const [packageHeight, setPackageHeight] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [isFragile, setIsFragile] = useState(false);
  const [paymentParty, setPaymentParty] = useState<"SENDER" | "RECEIVER">(
    "SENDER"
  );
  const [estimateOptions, setEstimateOptions] = useState<PorterEstimateOption[]>(
    []
  );
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [selectedOption, setSelectedOption] =
    useState<PorterEstimateOption | null>(null);
  const [selectedPorterCategory, setSelectedPorterCategory] = useState<
    string | null
  >(null);
  const [porterSelectionByCategory, setPorterSelectionByCategory] = useState<
    Record<string, string>
  >({});
  const porterSheetScrollRef = useRef<any>(null);
  const porterSubcategoryOffsetsRef = useRef<Record<string, number>>({});
  const porterSelectionAnim = useRef(new Animated.Value(1)).current;

  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);
  const [routeLoading, setRouteLoading] = useState(false);

  const [showPickupAutocomplete, setShowPickupAutocomplete] = useState(false);
  const [showDeliveryAutocomplete, setShowDeliveryAutocomplete] =
    useState(false);

  const [showMapEditor, setShowMapEditor] = useState(false);
  const [editingLocationType, setEditingLocationType] = useState<
    "pickup" | "delivery" | null
  >(null);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [nearbyVehicles, setNearbyVehicles] = useState<
    Array<{
      id: string;
      latitude: number;
      longitude: number;
      heading?: number;
      vehicleType?: string | null;
    }>
  >([]);
  const nearbyVehiclePreviousPositionRef = useRef<
    Map<string, { latitude: number; longitude: number }>
  >(new Map());
  const [activePorterService, setActivePorterService] =
    useState<PorterServiceResponse | null>(null);
  const [errors, setErrors] = useState<{
    pickup?: string;
    delivery?: string;
    pickupContactName?: string;
    pickupContactPhone?: string;
    deliveryContactName?: string;
    deliveryContactPhone?: string;
    packageWeight?: string;
    packageDimensions?: string;
  }>({});

  const normalizeIndianPhoneInput = useCallback((value: string): string => {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("91")) {
      return digits.slice(-10);
    }
    return digits.slice(0, 10);
  }, []);

  const formatIndianPhoneForApi = useCallback(
    (value: string): string => {
      const normalized = normalizeIndianPhoneInput(value);
      if (normalized.length === 10) return `+91${normalized}`;
      return value.trim();
    },
    [normalizeIndianPhoneInput]
  );

  // Wizard step: 0=locations, 1=contacts, 2=package, 3=vehicle+pay+confirm
  const [currentStep, setCurrentStep] = useState(0);
  const STEP_LABELS = ["Route", "Contacts", "Package", "Confirm"];

  const bothLocationsSelected =
    pickupCoords !== null && deliveryCoords !== null;
  const parsedPackageWeight = useMemo(
    () => Number(packageWeight.trim()),
    [packageWeight]
  );
  const hasValidPackageWeight =
    packageWeight.trim().length > 0 &&
    Number.isFinite(parsedPackageWeight) &&
    parsedPackageWeight >= 0.1 &&
    parsedPackageWeight <= 100;

  const porterCategoryCards = useMemo<PorterCategoryCard[]>(() => {
    const grouped = new Map<string, PorterEstimateOption[]>();
    for (const option of estimateOptions) {
      const categoryName =
        typeof option.categoryName === "string" && option.categoryName.trim()
          ? option.categoryName.trim()
          : "Other";
      const current = grouped.get(categoryName) ?? [];
      current.push(option);
      grouped.set(categoryName, current);
    }

    const cards: PorterCategoryCard[] = [];
    for (const [categoryName, options] of grouped.entries()) {
      if (options.length === 0) continue;
      cards.push({
        categoryName,
        representative: options[0],
      });
    }

    return cards.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [estimateOptions]);

  const porterSubcategoryOptions = useMemo(() => {
    if (!selectedPorterCategory) return [];
    return estimateOptions.filter(
      (option) => option.categoryName === selectedPorterCategory
    );
  }, [estimateOptions, selectedPorterCategory]);

  const getPorterSelectionMemoryKey = useCallback(
    (item: PorterEstimateOption) =>
      `${item.vehicleSubcategoryId ?? ""}|${item.slug ?? ""}|${
        item.vehicleType ?? ""
      }`,
    []
  );

  const mapRegion = useMemo(() => {
    if (pickupCoords && deliveryCoords) {
      const minLat = Math.min(pickupCoords.latitude, deliveryCoords.latitude);
      const maxLat = Math.max(pickupCoords.latitude, deliveryCoords.latitude);
      const minLng = Math.min(pickupCoords.longitude, deliveryCoords.longitude);
      const maxLng = Math.max(pickupCoords.longitude, deliveryCoords.longitude);
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
    deliveryCoords?.latitude,
    deliveryCoords?.longitude,
    currentLocation?.latitude,
    currentLocation?.longitude,
  ]);

  const quickDeliveryLocations = useMemo<LocationWithAddress[]>(() => {
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
    checkActivePorterService();
  }, []);

  useEffect(() => {
    refreshRecentLocations();
  }, [refreshRecentLocations]);

  useEffect(() => {
    if (userType !== "passenger" || !user) return;
    if (!pickupContactName.trim() && typeof user.fullName === "string") {
      setPickupContactName(user.fullName);
    }
    if (!pickupContactPhone.trim() && typeof user.phone === "string") {
      setPickupContactPhone(normalizeIndianPhoneInput(user.phone));
    }
  }, [
    userType,
    user,
    pickupContactName,
    pickupContactPhone,
    normalizeIndianPhoneInput,
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

  // Fetch porter estimate (vehicle options with cost) when route and package details are set
  useEffect(() => {
    if (!pickupCoords || !deliveryCoords) {
      setEstimateOptions([]);
      setSelectedOption(null);
      setSelectedPorterCategory(null);
      setPorterSelectionByCategory({});
      porterSubcategoryOffsetsRef.current = {};
      setEstimateLoading(false);
      return;
    }
    if (!hasValidPackageWeight) {
      setEstimateOptions([]);
      setSelectedOption(null);
      setSelectedPorterCategory(null);
      setPorterSelectionByCategory({});
      porterSubcategoryOffsetsRef.current = {};
      setEstimateLoading(false);
      return;
    }
    let cancelled = false;
    setEstimateLoading(true);
    setSelectedOption(null);
    setSelectedPorterCategory(null);
    setPorterSelectionByCategory({});
    porterSubcategoryOffsetsRef.current = {};
    getPorterEstimate(
      pickupCoords.latitude,
      pickupCoords.longitude,
      deliveryCoords.latitude,
      deliveryCoords.longitude,
      {
        packageType,
        packageWeight: parsedPackageWeight,
        isFragile,
      }
    )
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data?.options) {
          setEstimateOptions(res.data.options);
        } else {
          setEstimateOptions([]);
        }
      })
      .catch(() => {
        if (!cancelled) setEstimateOptions([]);
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
    deliveryCoords?.latitude,
    deliveryCoords?.longitude,
    packageType,
    parsedPackageWeight,
    hasValidPackageWeight,
    isFragile,
  ]);

  const handleOpenPorterSubcategories = useCallback((categoryName: string) => {
    setSelectedPorterCategory(categoryName);
    if (selectedOption?.categoryName === categoryName) return;

    const rememberedKey = porterSelectionByCategory[categoryName];
    if (rememberedKey) {
      const rememberedOption = estimateOptions.find(
        (option) =>
          option.categoryName === categoryName &&
          getPorterSelectionMemoryKey(option) === rememberedKey
      );
      if (rememberedOption) {
        setSelectedOption(rememberedOption);
        return;
      }
    }

    setSelectedOption(null);
  }, [
    selectedOption?.categoryName,
    porterSelectionByCategory,
    estimateOptions,
    getPorterSelectionMemoryKey,
  ]);

  const handleBackToPorterCategories = useCallback(() => {
    setSelectedPorterCategory(null);
  }, []);

  useEffect(() => {
    porterSelectionAnim.setValue(0);
    Animated.timing(porterSelectionAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [selectedPorterCategory, porterSelectionAnim]);

  useEffect(() => {
    if (!selectedPorterCategory) return;
    const selectedKey = porterSelectionByCategory[selectedPorterCategory];
    if (!selectedKey) return;

    const timer = setTimeout(() => {
      const y = porterSubcategoryOffsetsRef.current[selectedKey];
      if (typeof y === "number") {
        porterSheetScrollRef.current?.scrollTo?.({
          y: Math.max(y - 120, 0),
          animated: true,
        });
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [
    selectedPorterCategory,
    porterSelectionByCategory,
    porterSubcategoryOptions.length,
  ]);

  const checkActivePorterService = async () => {
    try {
      const response = await getActivePorterService();
      if (response.success && response.data?.porterService) {
        setActivePorterService(response.data.porterService);
        router.replace("/(tabs)");
      }
    } catch (error) {
      console.error("Error checking active porter service:", error);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchNearbyVehicles = useCallback(async () => {
    if (!pickupCoords) return;
    const toNum = (value: unknown): number => {
      const parsed =
        typeof value === "number"
          ? value
          : typeof value === "string"
          ? parseFloat(value)
          : Number.NaN;
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };
    const parseDrivers = (
      raw: unknown[]
    ): Array<{
      id: string;
      latitude: number;
      longitude: number;
      heading?: number;
      vehicleType?: string;
    }> => {
      return raw
        .map((item) => {
          const d = item as Record<string, unknown>;
          if (!d || typeof d.id !== "string") return null;
          const location = d.location as Record<string, unknown> | undefined;
          const coordinate = d.coordinate as Record<string, unknown> | undefined;
          const latCandidates = [
            d.latitude,
            d.lat,
            location?.latitude,
            location?.lat,
            coordinate?.latitude,
            coordinate?.lat,
          ];
          const lngCandidates = [
            d.longitude,
            d.lng,
            location?.longitude,
            location?.lng,
            coordinate?.longitude,
            coordinate?.lng,
          ];
          const lat =
            latCandidates
              .map((value) => toNum(value as unknown))
              .find((value) => Number.isFinite(value)) ?? Number.NaN;
          const lng =
            lngCandidates
              .map((value) => toNum(value as unknown))
              .find((value) => Number.isFinite(value)) ?? Number.NaN;

          if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

          const parsedHeading = toNum(d.heading);
          const resolvedVehicleType = [
            d.vehicleType,
            d.vehicle_type,
            (d as { vehicleCategorySlug?: unknown }).vehicleCategorySlug,
            (d as { vehicle_category_slug?: unknown }).vehicle_category_slug,
            (d as { vehicleCategory?: { slug?: unknown } }).vehicleCategory?.slug,
            (d as { vehicle_category?: { slug?: unknown } }).vehicle_category?.slug,
            (d as { vehicleCategoryName?: unknown }).vehicleCategoryName,
            (d as { vehicle_category_name?: unknown }).vehicle_category_name,
            (d as { vehicleCategory?: { name?: unknown } }).vehicleCategory?.name,
            (d as { vehicle_category?: { name?: unknown } }).vehicle_category?.name,
            (d as { vehicleSubcategorySlug?: unknown }).vehicleSubcategorySlug,
            (d as { vehicle_subcategory_slug?: unknown }).vehicle_subcategory_slug,
            (d as { slug?: unknown }).slug,
            (d as { vehicleSubcategory?: { slug?: unknown } }).vehicleSubcategory
              ?.slug,
            (d as { vehicle_subcategory?: { slug?: unknown } }).vehicle_subcategory
              ?.slug,
          ].find(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          );

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
      const response = await getNearbyDriversForPorter(
        pickupCoords.latitude,
        pickupCoords.longitude,
        selectedOption?.vehicleType ?? undefined,
        PORTER_SEARCH_RADIUS_KM,
        selectedOption?.vehicleSubcategoryId ?? undefined
      );

      let driversRaw = extractDrivers(response);
      let list = parseDrivers(driversRaw);

      if (
        list.length === 0 &&
        selectedOption?.vehicleSubcategoryId &&
        selectedOption?.vehicleType
      ) {
        const fallback = await getNearbyDriversForPorter(
          pickupCoords.latitude,
          pickupCoords.longitude,
          selectedOption.vehicleType,
          PORTER_FALLBACK_SEARCH_RADIUS_KM,
          undefined
        );
        driversRaw = extractDrivers(fallback);
        list = parseDrivers(driversRaw);
      }

      if (list.length === 0) {
        const fallbackAny = await getNearbyDriversForPorter(
          pickupCoords.latitude,
          pickupCoords.longitude,
          undefined,
          PORTER_FALLBACK_SEARCH_RADIUS_KM,
          undefined
        );
        driversRaw = extractDrivers(fallbackAny);
        list = parseDrivers(driversRaw);
      }

      const previousPositions = nearbyVehiclePreviousPositionRef.current;
      const nextPositions = new Map<
        string,
        { latitude: number; longitude: number }
      >();

      const vehiclesWithHeading = list.map((vehicle) => {
        const previous = previousPositions.get(vehicle.id);
        const derivedHeading =
          previous &&
          (vehicle.heading == null || !Number.isFinite(vehicle.heading))
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

  useEffect(() => {
    if (!pickupCoords) return;
    fetchNearbyVehicles();
    const interval = setInterval(fetchNearbyVehicles, 7000);
    return () => clearInterval(interval);
  }, [pickupCoords, fetchNearbyVehicles]);

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

  const handlePickupSelect = (location: LocationWithAddress) => {
    setPickupCoords(location);
    setPickupLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, pickup: undefined }));
    rememberRecentLocation(location);
  };

  const handleDeliverySelect = (location: LocationWithAddress) => {
    setDeliveryCoords(location);
    setDeliveryLocation(
      location.address ||
        `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
    );
    setErrors((prev) => ({ ...prev, delivery: undefined }));
    rememberRecentLocation(location);
  };

  const handleDeliverySelected = useCallback(
    (location: LocationWithAddress) => {
      handleDeliverySelect(location);
      setCurrentStep(1);
      bottomSheetRef.current?.snapToIndex(2);
    },
    []
  );

  const handlePickupSelected = useCallback((location: LocationWithAddress) => {
    handlePickupSelect(location);
  }, []);

  const handleMapEdit = (
    location: LocationWithAddress,
    locationType: "pickup" | "delivery"
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
      setDeliveryCoords(location);
      setDeliveryLocation(
        location.address ||
          `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
      );
      setErrors((prev) => ({ ...prev, delivery: undefined }));
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
      if (!pickupCoords) return;
      setEditingLocationType(deliveryCoords ? "delivery" : "pickup");
      setShowMapEditor(true);
    },
    [pickupCoords, deliveryCoords]
  );

  useEffect(() => {
    if (!pickupCoords || !deliveryCoords) {
      setRouteCoordinates([]);
      return;
    }
    let cancelled = false;
    setRouteCoordinates([]);
    setRouteLoading(true);
    const fetchRoute = async () => {
      try {
        const route = await getRoute(
          pickupCoords,
          deliveryCoords,
          selectedOption?.vehicleType ?? undefined
        );
        if (cancelled) return;
        if (route && route.coordinates.length > 0) {
          setRouteCoordinates(route.coordinates);
        } else {
          setRouteCoordinates([pickupCoords, deliveryCoords]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching route:", error);
          setRouteCoordinates([pickupCoords, deliveryCoords]);
        }
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    };
    fetchRoute();
    return () => {
      cancelled = true;
    };
  }, [pickupCoords, deliveryCoords, selectedOption?.vehicleType]);

  const validatePhone = (phone: string): boolean =>
    /^[6-9]\d{9}$/.test(normalizeIndianPhoneInput(phone));

  const parsePackageWeightValue = (): number | null => {
    const value = packageWeight.trim();
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  };

  const validatePackageWeight = (): string | null => {
    const weight = parsePackageWeightValue();
    if (weight == null) return "Package weight is required";
    if (weight < 0.1) return "Weight must be at least 0.1 kg";
    if (weight > 100) return "Weight cannot exceed 100 kg";
    return null;
  };

  const parseDimensionValue = (value: string): number | null => {
    if (!value.trim()) return null;
    const num = Number(value);
    if (Number.isNaN(num) || num <= 0) return Number.NaN;
    return num;
  };

  const validateDimensions = (): string | null => {
    const l = parseDimensionValue(packageLength);
    const w = parseDimensionValue(packageWidth);
    const h = parseDimensionValue(packageHeight);
    if (l === null && w === null && h === null) return null;
    if (
      (l !== null && Number.isNaN(l)) ||
      (w !== null && Number.isNaN(w)) ||
      (h !== null && Number.isNaN(h))
    )
      return "Dimensions must be positive numbers (in cm).";
    return null;
  };

  const formatDimensionsForApi = (): string | undefined => {
    const parts: number[] = [];
    const l = parseDimensionValue(packageLength);
    const w = parseDimensionValue(packageWidth);
    const h = parseDimensionValue(packageHeight);
    if (l !== null && !Number.isNaN(l)) parts.push(l);
    if (w !== null && !Number.isNaN(w)) parts.push(w);
    if (h !== null && !Number.isNaN(h)) parts.push(h);
    return parts.length === 0 ? undefined : parts.join("x");
  };

  const validateStep = (step: number): boolean => {
    const newErrors: typeof errors = {};
    if (step === 0) {
      if (!pickupLocation.trim() || !pickupCoords)
        newErrors.pickup = "Please select a pickup location";
      if (!deliveryLocation.trim() || !deliveryCoords)
        newErrors.delivery = "Please select a delivery location";
    } else if (step === 1) {
      if (!pickupContactName.trim())
        newErrors.pickupContactName = "Pickup contact name is required";
      if (!pickupContactPhone.trim())
        newErrors.pickupContactPhone = "Pickup contact phone is required";
      else if (!validatePhone(pickupContactPhone))
        newErrors.pickupContactPhone = "Invalid phone number format";
      if (!deliveryContactName.trim())
        newErrors.deliveryContactName = "Delivery contact name is required";
      if (!deliveryContactPhone.trim())
        newErrors.deliveryContactPhone = "Delivery contact phone is required";
      else if (!validatePhone(deliveryContactPhone))
        newErrors.deliveryContactPhone = "Invalid phone number format";
    } else if (step === 2) {
      const weightErr = validatePackageWeight();
      if (weightErr) newErrors.packageWeight = weightErr;
      const dimErr = validateDimensions();
      if (dimErr) newErrors.packageDimensions = dimErr;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < 3) {
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
    if (!pickupLocation.trim() || !pickupCoords)
      newErrors.pickup = "Please select a pickup location";
    if (!deliveryLocation.trim() || !deliveryCoords)
      newErrors.delivery = "Please select a delivery location";
    if (!pickupContactName.trim())
      newErrors.pickupContactName = "Pickup contact name is required";
    if (!pickupContactPhone.trim())
      newErrors.pickupContactPhone = "Pickup contact phone is required";
    else if (!validatePhone(pickupContactPhone))
      newErrors.pickupContactPhone = "Invalid phone number format";
    if (!deliveryContactName.trim())
      newErrors.deliveryContactName = "Delivery contact name is required";
    if (!deliveryContactPhone.trim())
      newErrors.deliveryContactPhone = "Delivery contact phone is required";
    else if (!validatePhone(deliveryContactPhone))
      newErrors.deliveryContactPhone = "Invalid phone number format";
    const weightErr = validatePackageWeight();
    if (weightErr) newErrors.packageWeight = weightErr;
    const dimErr = validateDimensions();
    if (dimErr) newErrors.packageDimensions = dimErr;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreatePorterService = async () => {
    if (!validateForm() || !pickupCoords || !deliveryCoords) return;
    setLoading(true);
    try {
      const porterData: CreatePorterRequest = {
        pickupLatitude: pickupCoords.latitude,
        pickupLongitude: pickupCoords.longitude,
        pickupLocation,
        pickupContactName: pickupContactName.trim(),
        pickupContactPhone: formatIndianPhoneForApi(pickupContactPhone),
        deliveryLatitude: deliveryCoords.latitude,
        deliveryLongitude: deliveryCoords.longitude,
        deliveryLocation,
        deliveryContactName: deliveryContactName.trim(),
        deliveryContactPhone: formatIndianPhoneForApi(deliveryContactPhone),
        packageType,
        packageWeight: Number(packageWeight.trim()),
        packageDimensions: formatDimensionsForApi(),
        packageDescription: packageDescription.trim() || undefined,
        isFragile,
        vehicleSubcategoryId: selectedOption?.vehicleSubcategoryId ?? undefined,
        paymentParty,
      };
      const response = await createPorterService(porterData);
      if (response.success && response.data) {
        dispatchServiceCreated();
        toast.success("Parcel service request created! Finding a driver...");
        router.replace("/(tabs)");
      } else {
        const errorMessage =
          typeof response.error === "object" &&
          response.error !== null &&
          "message" in response.error
            ? String((response.error as { message: string }).message)
            : "Failed to create Parcel service request";
        toast.error(errorMessage);
      }
    } catch (error) {
      console.error("Error creating Parcel service:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pickupCoords || !mapRef.current) return;

    if (nearbyVehicles.length === 0) {
      if (!deliveryCoords) return;
      mapRef.current.fitToCoordinates([pickupCoords, deliveryCoords], {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
      return;
    }

    const includeDelivery =
      deliveryCoords != null &&
      distanceKmBetween(pickupCoords, deliveryCoords) <=
        NEARBY_MARKER_DESTINATION_INCLUDE_KM;

    const coords = [
      pickupCoords,
      ...(includeDelivery && deliveryCoords ? [deliveryCoords] : []),
      ...nearbyVehicles.map((v) => ({
        latitude: v.latitude,
        longitude: v.longitude,
      })),
    ];

    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 80, bottom: 350, left: 80 },
      animated: true,
    });
  }, [pickupCoords, deliveryCoords, nearbyVehicles]);

  const isButtonDisabled =
    loading ||
    !pickupCoords ||
    !deliveryCoords ||
    (estimateOptions.length > 0 && !selectedOption);

  if (initialLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Loading message="Loading..." />
      </SafeAreaView>
    );
  }

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
            This screen is for passengers. Go to the Rides tab to see pending
            requests.
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
        {pickupCoords && (
          <PickupMarker
            key="pickup-marker"
            coordinate={pickupCoords}
            title="Pickup"
            onPress={() => {
              setEditingLocationType("pickup");
              setShowMapEditor(true);
            }}
          />
        )}
        {deliveryCoords && (
          <DestinationMarker
            key="delivery-marker"
            coordinate={deliveryCoords}
            title="Delivery"
            onPress={() => {
              setEditingLocationType("delivery");
              setShowMapEditor(true);
            }}
          />
        )}
        {routeCoordinates.length > 0 && !routeLoading && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={ROUTE_COLORS.shadow}
            strokeWidth={8}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor={ROUTE_COLORS.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={routeLoading ? [5, 5] : undefined}
          />
        )}
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

      {/* My-location button */}
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
          ref={porterSheetScrollRef}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header + step indicator */}
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
                Send a Package
              </Text>
              {currentStep > 0 && (
                <Text
                  style={{
                    fontFamily: "Figtree_500Medium",
                    fontSize: 13,
                    color: "#9CA3AF",
                  }}
                >
                  Step {currentStep + 1} of 4
                </Text>
              )}
            </View>

            {/* Progress bar */}
            {bothLocationsSelected && (
              <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>
                {STEP_LABELS.map((label, idx) => (
                  <View key={label} style={{ flex: 1 }}>
                    <View
                      style={{
                        height: 3,
                        borderRadius: 2,
                        backgroundColor:
                          idx <= currentStep ? BRAND_ORANGE : "#E5E7EB",
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "Figtree_500Medium",
                        fontSize: 10,
                        color: idx <= currentStep ? BRAND_ORANGE : "#9CA3AF",
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

          {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ STEP 0: Locations Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {currentStep === 0 && (
            <View style={{ paddingHorizontal: 16 }}>
              {/* Pickup + Delivery card */}
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
                  onPress={() => setShowDeliveryAutocomplete(true)}
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
                      color: deliveryLocation ? "#111827" : "#9CA3AF",
                      fontFamily: "Figtree_500Medium",
                    }}
                  >
                    {deliveryLocation || "Delivery location"}
                  </Text>
                </TouchableOpacity>
              </View>
              {errors.pickup && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 4,
                    marginHorizontal: 4,
                  }}
                >
                  {errors.pickup}
                </Text>
              )}
              {errors.delivery && (
                <Text
                  style={{
                    color: "#EF4444",
                    fontSize: 12,
                    marginTop: 4,
                    marginHorizontal: 4,
                  }}
                >
                  {errors.delivery}
                </Text>
              )}

              {/* Recent locations (when no delivery yet) */}
              {!deliveryCoords && (
                <View style={{ marginTop: 16 }}>
                  {quickDeliveryLocations.map((location, idx) => (
                    <TouchableOpacity
                      key={`${location.latitude}-${location.longitude}-${location.address}`}
                      onPress={() => {
                        handleDeliverySelect(location);
                        setCurrentStep(1);
                        bottomSheetRef.current?.snapToIndex(2);
                      }}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 14,
                        borderBottomWidth:
                          idx < quickDeliveryLocations.length - 1 ? 1 : 0,
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
                      setEditingLocationType("delivery");
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

              {/* Continue button (only if both locations set) */}
              {bothLocationsSelected && (
                <TouchableOpacity
                  onPress={handleNextStep}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: BRAND_ORANGE,
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

          {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ STEP 1: Contacts Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
                    {pickupLocation}
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
                    {deliveryLocation}
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
                      color: BRAND_ORANGE,
                    }}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>
              </View>

              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Pickup Contact
              </Text>
              <TextInput
                placeholder="Contact name"
                value={pickupContactName}
                onChangeText={(t) => {
                  setPickupContactName(t);
                  setErrors((p) => ({ ...p, pickupContactName: undefined }));
                }}
                style={{
                  ...inputStyle,
                  marginBottom: 8,
                  borderColor: errors.pickupContactName ? "#EF4444" : "#E5E7EB",
                }}
                placeholderTextColor="#9CA3AF"
              />
              {errors.pickupContactName && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.pickupContactName}
                </Text>
              )}
              <TextInput
                placeholder="Phone (10 digits)"
                value={pickupContactPhone}
                keyboardType="phone-pad"
                onChangeText={(t) => {
                  setPickupContactPhone(normalizeIndianPhoneInput(t));
                  setErrors((p) => ({ ...p, pickupContactPhone: undefined }));
                }}
                style={{
                  ...inputStyle,
                  marginBottom: 4,
                  borderColor: errors.pickupContactPhone
                    ? "#EF4444"
                    : "#E5E7EB",
                }}
                placeholderTextColor="#9CA3AF"
              />
              {errors.pickupContactPhone && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.pickupContactPhone}
                </Text>
              )}

              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                Delivery Contact
              </Text>
              <TextInput
                placeholder="Contact name"
                value={deliveryContactName}
                onChangeText={(t) => {
                  setDeliveryContactName(t);
                  setErrors((p) => ({ ...p, deliveryContactName: undefined }));
                }}
                style={{
                  ...inputStyle,
                  marginBottom: 8,
                  borderColor: errors.deliveryContactName
                    ? "#EF4444"
                    : "#E5E7EB",
                }}
                placeholderTextColor="#9CA3AF"
              />
              {errors.deliveryContactName && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.deliveryContactName}
                </Text>
              )}
              <TextInput
                placeholder="Phone (10 digits)"
                value={deliveryContactPhone}
                keyboardType="phone-pad"
                onChangeText={(t) => {
                  setDeliveryContactPhone(normalizeIndianPhoneInput(t));
                  setErrors((p) => ({ ...p, deliveryContactPhone: undefined }));
                }}
                style={{
                  ...inputStyle,
                  marginBottom: 4,
                  borderColor: errors.deliveryContactPhone
                    ? "#EF4444"
                    : "#E5E7EB",
                }}
                placeholderTextColor="#9CA3AF"
              />
              {errors.deliveryContactPhone && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.deliveryContactPhone}
                </Text>
              )}

              {/* Navigation */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
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
                    backgroundColor: BRAND_ORANGE,
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

          {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ STEP 2: Package Details Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {currentStep === 2 && (
            <View style={{ paddingHorizontal: 16 }}>
              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Package Type
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 16 }}
              >
                {PACKAGE_TYPES.map((type) => {
                  const sel = packageType === type.value;
                  return (
                    <TouchableOpacity
                      key={type.value}
                      onPress={() => setPackageType(type.value)}
                      activeOpacity={0.8}
                      style={{
                        marginRight: 8,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        alignItems: "center",
                        minWidth: 90,
                        backgroundColor: sel ? "#FFE4D6" : "#FAFAFA",
                        borderColor: sel ? BRAND_ORANGE : "#F3F4F6",
                      }}
                    >
                      {React.createElement(type.icon, {
                        size: 22,
                        color: sel ? BRAND_ORANGE : "#6B7280",
                      })}
                      <Text
                        style={{
                          fontFamily: "Figtree_500Medium",
                          fontSize: 12,
                          marginTop: 4,
                          color: sel ? BRAND_ORANGE : "#6B7280",
                        }}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TextInput
                placeholder="Weight (kg) *"
                value={packageWeight}
                keyboardType="decimal-pad"
                onChangeText={(t) => {
                  setPackageWeight(t);
                  setErrors((p) => ({ ...p, packageWeight: undefined }));
                }}
                style={{
                  ...inputStyle,
                  marginBottom: 8,
                  borderColor: errors.packageWeight ? "#EF4444" : "#E5E7EB",
                }}
                placeholderTextColor="#9CA3AF"
              />
              {errors.packageWeight && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.packageWeight}
                </Text>
              )}

              <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                Dimensions (cm) - Optional
              </Text>
              <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                <TextInput
                  placeholder="L"
                  value={packageLength}
                  keyboardType="numeric"
                  onChangeText={(t) => {
                    setPackageLength(t);
                    setErrors((p) => ({ ...p, packageDimensions: undefined }));
                  }}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    borderColor: errors.packageDimensions
                      ? "#EF4444"
                      : "#E5E7EB",
                  }}
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  placeholder="W"
                  value={packageWidth}
                  keyboardType="numeric"
                  onChangeText={(t) => {
                    setPackageWidth(t);
                    setErrors((p) => ({ ...p, packageDimensions: undefined }));
                  }}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    borderColor: errors.packageDimensions
                      ? "#EF4444"
                      : "#E5E7EB",
                  }}
                  placeholderTextColor="#9CA3AF"
                />
                <TextInput
                  placeholder="H"
                  value={packageHeight}
                  keyboardType="numeric"
                  onChangeText={(t) => {
                    setPackageHeight(t);
                    setErrors((p) => ({ ...p, packageDimensions: undefined }));
                  }}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    borderColor: errors.packageDimensions
                      ? "#EF4444"
                      : "#E5E7EB",
                  }}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              {errors.packageDimensions && (
                <Text
                  style={{ color: "#EF4444", fontSize: 11, marginBottom: 4 }}
                >
                  {errors.packageDimensions}
                </Text>
              )}

              <TextInput
                placeholder="Package description (optional)"
                value={packageDescription}
                onChangeText={setPackageDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ ...inputStyle, height: 72, marginBottom: 8 }}
                placeholderTextColor="#9CA3AF"
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#FFF",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: 12,
                  marginBottom: 4,
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
                    Fragile Item
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}
                  >
                    Handle with extra care
                  </Text>
                </View>
                <Switch
                  value={isFragile}
                  onValueChange={setIsFragile}
                  trackColor={{ false: "#D1D5DB", true: BRAND_ORANGE }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Navigation */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
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
                    backgroundColor: BRAND_ORANGE,
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

          {/* Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ STEP 3: Vehicle, Payment & Confirm Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ */}
          {currentStep === 3 && (
            <View style={{ paddingHorizontal: 16 }}>
              {/* Order summary */}
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
                      {pickupLocation}
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
                      {deliveryLocation}
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
                  <Text style={{ fontSize: 11, color: "#6B7280" }}>
                    {PACKAGE_TYPES.find((p) => p.value === packageType)
                      ?.label ?? packageType}
                  </Text>
                  {packageWeight ? (
                    <Text style={{ fontSize: 11, color: "#6B7280" }}>
                      {packageWeight} kg
                    </Text>
                  ) : null}
                  {isFragile && (
                    <Text style={{ fontSize: 11, color: BRAND_ORANGE }}>
                      Fragile
                    </Text>
                  )}
                </View>
              </View>

              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Vehicle Type
              </Text>
              <Animated.View
                style={{
                  opacity: porterSelectionAnim,
                  transform: [
                    {
                      translateY: porterSelectionAnim.interpolate({
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
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                  }}
                >
                  <ActivityIndicator size="small" color={BRAND_ORANGE} />
                  <Text
                    style={{ color: "#9CA3AF", fontSize: 13, marginLeft: 8 }}
                  >
                    Loading options...
                  </Text>
                </View>
              ) : estimateOptions.length === 0 ? (
                <View
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    marginBottom: 16,
                    backgroundColor: "#F9FAFB",
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ color: "#6B7280", fontSize: 13 }}>
                    No vehicle options for this route. Check pickup and delivery locations.
                  </Text>
                </View>
              ) : !selectedPorterCategory ? (
                porterCategoryCards.map((category) => {
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
                        handleOpenPorterSubcategories(category.categoryName)
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
                    onPress={handleBackToPorterCategories}
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

                  {porterSubcategoryOptions.map((item) => {
                    const isSelected =
                      selectedOption?.vehicleSubcategoryId ===
                        item.vehicleSubcategoryId &&
                      selectedOption?.slug === item.slug;
                    const vehicleImage =
                      VEHICLE_IMAGE_MAP[item.slug] ||
                      VEHICLE_IMAGE_MAP[item.categoryName?.toLowerCase?.() || ""] ||
                      null;

                    return (
                      <TouchableOpacity
                        key={item.vehicleSubcategoryId}
                        onPress={() => {
                          setSelectedOption(item);
                          setPorterSelectionByCategory((prev) => ({
                            ...prev,
                            [item.categoryName]: getPorterSelectionMemoryKey(item),
                          }));
                        }}
                        onLayout={(event) => {
                          porterSubcategoryOffsetsRef.current[
                            getPorterSelectionMemoryKey(item)
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
                            {`${item.distanceKm.toFixed(1)} km`}
                          </Text>
                        </View>

                        <Text
                          style={{
                            fontFamily: "Figtree_700Bold",
                            fontSize: 16,
                            color: isSelected ? BRAND_ORANGE : "#111827",
                          }}
                        >
                          {item.estimatedFare > 0
                            ? `Rs.${item.estimatedFare.toFixed(2)}`
                            : "--"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              </Animated.View>

              <Text
                style={{
                  fontFamily: "Figtree_600SemiBold",
                  fontSize: 14,
                  color: "#111827",
                  marginBottom: 8,
                }}
              >
                Who pays?
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                {(["SENDER", "RECEIVER"] as const).map((party) => {
                  const sel = paymentParty === party;
                  return (
                    <TouchableOpacity
                      key={party}
                      onPress={() => setPaymentParty(party)}
                      activeOpacity={0.8}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        backgroundColor: sel ? "#FFE4D6" : "#FFF",
                        borderColor: sel ? BRAND_ORANGE : "#E5E7EB",
                      }}
                    >
                      {React.createElement(
                        party === "SENDER" ? User : UserPlus,
                        {
                          size: 20,
                          color: sel ? BRAND_ORANGE : "#9CA3AF",
                        }
                      )}
                      <Text
                        style={{
                          fontFamily: "Figtree_600SemiBold",
                          fontSize: 14,
                          marginTop: 4,
                          color: sel ? BRAND_ORANGE : "#111827",
                        }}
                      >
                        {party === "SENDER" ? "I'll pay" : "Receiver pays"}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}
                      >
                        {party === "SENDER"
                          ? "Sender pays now"
                          : "Cash on delivery"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Navigation */}
              <View style={{ flexDirection: "row", gap: 10 }}>
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
                  onPress={handleCreatePorterService}
                  disabled={isButtonDisabled}
                  activeOpacity={0.85}
                  style={{
                    flex: 2,
                    backgroundColor: isButtonDisabled
                      ? "#D1D5DB"
                      : BRAND_ORANGE,
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
                      Request Parcel Service
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
                {
                  "You'll be matched with a nearby driver once you request the service."
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
        visible={showDeliveryAutocomplete}
        onClose={() => setShowDeliveryAutocomplete(false)}
        onSelectLocation={handleDeliverySelected}
        placeholder="Search for delivery location"
        locationType="destination"
        currentValue={deliveryLocation}
        onUseMapSelection={() => {
          setEditingLocationType("delivery");
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
            if (editingLocationType === "delivery") {
              setCurrentStep(1);
              bottomSheetRef.current?.snapToIndex(2);
            }
          }}
          initialLocation={
            editingLocationType
              ? editingLocationType === "pickup"
                ? pickupCoords
                : deliveryCoords
              : pickupCoords
          }
          locationType={
            editingLocationType === "delivery"
              ? "destination"
              : editingLocationType || "pickup"
          }
          otherLocation={
            editingLocationType
              ? editingLocationType === "pickup"
                ? deliveryCoords
                : pickupCoords
              : deliveryCoords
          }
          allowBothEditing={false}
        />
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
