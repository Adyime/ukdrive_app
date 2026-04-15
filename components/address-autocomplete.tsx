/**
 * Address Autocomplete Component
 * Backend-first: OSM (Nominatim) then Google fallback. Place details from backend or Google.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { LocalizedTextInput as TextInput } from "@/components/localized-text-input";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, TouchableOpacity, FlatList, ActivityIndicator, Modal, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCurrentLocation } from "@/lib/services/location";
import { type LocationWithAddress } from "@/lib/utils/location";
import {
  addRecentLocation,
  getRecentLocations,
  type RecentLocation,
} from "@/lib/recent-locations";
import Constants from "expo-constants";

const BRAND_ORANGE = "#F36D14";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// Types: backend can return OSM (with coords) or Google (placeId only)
interface PlacePrediction {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  source?: "osm" | "google";
}

interface AddressAutocompleteProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (location: LocationWithAddress) => void;
  placeholder?: string;
  locationType?: "pickup" | "destination";
  currentValue?: string;
  /** Called when passenger uses "Use Current Location" - use to persist passenger location */
  onCurrentLocationUsed?: (location: LocationWithAddress) => void;
  /** Optional: open map-based picker for current locationType */
  onUseMapSelection?: () => void;
}

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
  "";

/** Backend autocomplete (OSM first, Google fallback). Returns [] on failure. */
async function fetchPlacePredictionsFromBackend(
  input: string,
  location?: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<PlacePrediction[]> {
  const params = new URLSearchParams({ q: input });
  if (location) {
    params.set("lat", String(location.lat));
    params.set("lng", String(location.lng));
  }
  const url = `${API_BASE_URL}/api/geo/autocomplete?${params.toString()}`;
  const response = await fetch(url, { signal });
  if (!response.ok) return [];
  const json = (await response.json()) as {
    data?: {
      results?: {
        placeId: string;
        mainText: string;
        secondaryText: string;
        latitude?: number;
        longitude?: number;
        address?: string;
        source: "osm" | "google";
      }[];
    };
  };
  const results = json.data?.results ?? [];
  return results.map((r) => ({
    placeId: r.placeId,
    description: [r.mainText, r.secondaryText].filter(Boolean).join(", "),
    mainText: r.mainText,
    secondaryText: r.secondaryText,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    source: r.source,
  }));
}

/** Backend place details (Google only). Returns null on failure. */
async function fetchPlaceDetailsFromBackend(
  placeId: string
): Promise<LocationWithAddress | null> {
  const url = `${API_BASE_URL}/api/geo/place-details?placeId=${encodeURIComponent(
    placeId
  )}&source=google`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const json = (await response.json()) as {
    data?: { latitude: number; longitude: number; address: string };
  };
  const d = json.data;
  if (
    d == null ||
    typeof d.latitude !== "number" ||
    typeof d.longitude !== "number"
  )
    return null;
  return {
    latitude: d.latitude,
    longitude: d.longitude,
    address: d.address ?? "",
  };
}

/** Google Places Autocomplete (fallback when backend fails). */
async function fetchPlacePredictionsGoogle(
  input: string,
  location?: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<PlacePrediction[]> {
  if (!GOOGLE_MAPS_API_KEY) return [];
  let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&key=${GOOGLE_MAPS_API_KEY}&components=country:in`;
  if (location) url += `&location=${location.lat},${location.lng}&radius=50000`;
  const response = await fetch(url, { signal });
  const data = await response.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return (data.predictions || []).map(
    (p: {
      place_id?: string;
      description?: string;
      structured_formatting?: { main_text?: string; secondary_text?: string };
    }) => ({
      placeId: p.place_id ?? "",
      description: p.description ?? "",
      mainText: p.structured_formatting?.main_text ?? p.description ?? "",
      secondaryText: p.structured_formatting?.secondary_text ?? "",
      source: "google" as const,
    })
  );
}

/**
 * Fetch place predictions: backend first (OSM then Google), fallback to direct Google on backend failure.
 */
async function fetchPlacePredictions(
  input: string,
  location?: { lat: number; lng: number },
  signal?: AbortSignal
): Promise<PlacePrediction[]> {
  if (!input || input.length < 2) return [];
  try {
    const fromBackend = await fetchPlacePredictionsFromBackend(
      input,
      location,
      signal
    );
    if (fromBackend.length > 0) return fromBackend;
    return await fetchPlacePredictionsGoogle(input, location, signal);
  } catch (e: unknown) {
    if ((e as { name?: string }).name === "AbortError") return [];
    try {
      return await fetchPlacePredictionsGoogle(input, location, signal);
    } catch {
      return [];
    }
  }
}

/** Google Place Details (fallback when backend place-details fails). */
async function fetchPlaceDetailsGoogle(
  placeId: string
): Promise<LocationWithAddress | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
    placeId
  )}&fields=geometry,formatted_address,name&key=${GOOGLE_MAPS_API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== "OK" || !data.result?.geometry?.location) return null;
  return {
    latitude: data.result.geometry.location.lat,
    longitude: data.result.geometry.location.lng,
    address: data.result.formatted_address || data.result.name,
  };
}

/**
 * Address Autocomplete Modal Component
 */
export function AddressAutocomplete({
  visible,
  onClose,
  onSelectLocation,
  placeholder = "Search for a location",
  locationType = "pickup",
  currentValue = "",
  onCurrentLocationUsed,
  onUseMapSelection,
}: AddressAutocompleteProps) {
  const [searchText, setSearchText] = useState(currentValue);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const { location: currentLocation } = useCurrentLocation();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentLocationRef = useRef<LocationWithAddress | null>(null);
  const loadRecentLocations = useCallback(async () => {
    try {
      const locations = await getRecentLocations();
      setRecentLocations(locations);
    } catch (error) {
      console.warn("Failed to load recent locations:", error);
    }
  }, []);

  const selectLocationAndClose = useCallback(
    async (location: LocationWithAddress) => {
      try {
        const updated = await addRecentLocation(location);
        setRecentLocations(updated);
      } catch (error) {
        console.warn("Failed to save recent location:", error);
      }
      onSelectLocation(location);
      onClose();
    },
    [onClose, onSelectLocation]
  );

  // Keep currentLocation in ref to avoid callback recreation
  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  // Reset search when modal opens
  useEffect(() => {
    if (visible) {
      setSearchText(currentValue);
      setPredictions([]);
      setLoading(false);
      loadRecentLocations();
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, currentValue, loadRecentLocations]);

  // Cleanup on unmount or modal close
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Debounced search
  const handleSearch = useCallback((text: string) => {
    setSearchText(text);

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Clear previous timeout
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text || text.length < 2) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    debounceTimerRef.current = setTimeout(async () => {
      // Use ref to get current location without dependency
      const location = currentLocationRef.current
        ? {
            lat: currentLocationRef.current.latitude,
            lng: currentLocationRef.current.longitude,
          }
        : undefined;

      try {
        const results = await fetchPlacePredictions(text, location, signal);
        // Only update if request wasn't aborted
        if (!signal.aborted) {
          setPredictions(results);
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Error in autocomplete search:", error);
          setPredictions([]);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }, 400);
  }, []);

  // Handle selecting a prediction: OSM items have coords; Google items need place-details from backend or client.
  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setLoadingDetails(true);
    Keyboard.dismiss();

    let location: LocationWithAddress | null = null;
    if (prediction.latitude != null && prediction.longitude != null) {
      location = {
        latitude: prediction.latitude,
        longitude: prediction.longitude,
        address:
          prediction.address ??
          [prediction.mainText, prediction.secondaryText]
            .filter(Boolean)
            .join(", "),
      };
    } else {
      location = await fetchPlaceDetailsFromBackend(prediction.placeId);
      if (!location)
        location = await fetchPlaceDetailsGoogle(prediction.placeId);
    }

    setLoadingDetails(false);
    if (location) {
      await selectLocationAndClose(location);
    }
  };

  // Handle selecting a recent location
  const handleSelectRecent = (location: RecentLocation) => {
    void selectLocationAndClose({
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    });
  };

  // Handle using current location
  const handleUseCurrentLocation = () => {
    if (currentLocation) {
      onCurrentLocationUsed?.(currentLocation);
      void selectLocationAndClose(currentLocation);
    }
  };

  const handleUseMapSelection = () => {
    Keyboard.dismiss();
    onClose();
    onUseMapSelection?.();
  };

  const isPickup = locationType === "pickup";
  const themeColor = BRAND_ORANGE;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row items-center px-4 py-3 border-b border-gray-200">
          <TouchableOpacity onPress={onClose} className="p-2 -ml-2">
            <Ionicons name="arrow-back" size={24} color="#6B7280" />
          </TouchableOpacity>
          <Text className="flex-1 text-lg font-semibold text-gray-900 ml-2">
            {isPickup ? "Select Pickup Location" : "Select Destination"}
          </Text>
        </View>

        {/* Search Input */}
        <View className="px-4 py-3">
          <View className="flex-row items-center bg-gray-100 rounded-lg px-3 py-2">
            <View
              className="w-3 h-3 rounded-full mr-3"
              style={{ backgroundColor: isPickup ? "#22C55E" : "#EF4444" }}
            />
            <TextInput
              ref={inputRef}
              className="flex-1 text-base text-gray-900"
              placeholder={placeholder}
              placeholderTextColor="#9CA3AF"
              value={searchText}
              onChangeText={handleSearch}
              autoFocus
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => handleSearch("")}
                className="p-1"
              >
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
            {loading && <ActivityIndicator size="small" color={themeColor} />}
          </View>
        </View>

        {/* Loading overlay for place details */}
        {loadingDetails && (
          <View className="absolute inset-0 bg-black/20 items-center justify-center z-10">
            <View className="bg-white p-6 rounded-xl">
              <ActivityIndicator size="large" color={themeColor} />
              <Text className="mt-3 text-gray-700">Loading location...</Text>
            </View>
          </View>
        )}

        {/* Current Location Option (for pickup) */}
        {isPickup && currentLocation && !searchText && (
          <TouchableOpacity
            onPress={handleUseCurrentLocation}
            className="flex-row items-center px-4 py-3 border-b border-gray-100"
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: "#FFE4D6" }}
            >
              <Ionicons name="locate" size={20} color={BRAND_ORANGE} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-medium text-gray-900">
                Use Current Location
              </Text>
              <Text className="text-sm text-gray-500" numberOfLines={1}>
                {currentLocation.address || "Your current location"}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Set from map marker option */}
        {!searchText && onUseMapSelection && (
          <TouchableOpacity
            onPress={handleUseMapSelection}
            className="flex-row items-center px-4 py-3 border-b border-gray-100"
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: "#F3F4F6" }}
            >
              <Ionicons name="map-outline" size={20} color="#6B7280" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-medium text-gray-900">
                {isPickup ? "Set pickup on map" : "Set destination on map"}
              </Text>
              <Text className="text-sm text-gray-500" numberOfLines={1}>
                Choose location using map marker
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Search Results */}
        {predictions.length > 0 ? (
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.placeId}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelectPrediction(item)}
                className="flex-row items-center px-4 py-3 border-b border-gray-100"
              >
                <View className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-3">
                  <Ionicons name="location-outline" size={20} color="#6B7280" />
                </View>
                <View className="flex-1">
                  <Text className="text-base text-gray-900" numberOfLines={1}>
                    {item.mainText}
                  </Text>
                  {item.secondaryText && (
                    <Text className="text-sm text-gray-500" numberOfLines={1}>
                      {item.secondaryText}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
          />
        ) : !searchText ? (
          /* Recent locations when no search */
          <View className="px-4 pt-4">
            <Text className="text-sm font-medium text-gray-500 mb-3">
              Recent Locations
            </Text>
            {recentLocations.length > 0 ? (
              recentLocations.slice(0, 8).map((location) => (
                <TouchableOpacity
                  key={location.id}
                  onPress={() => handleSelectRecent(location)}
                  className="flex-row items-center py-3 border-b border-gray-100"
                >
                  <View className="w-10 h-10 bg-gray-100 rounded-full items-center justify-center mr-3">
                    <Ionicons name="time-outline" size={18} color="#6B7280" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base text-gray-900" numberOfLines={1}>
                      {location.address || "Pinned Location"}
                    </Text>
                    <Text className="text-sm text-gray-500" numberOfLines={1}>
                      {`${location.latitude.toFixed(
                        4
                      )}, ${location.longitude.toFixed(4)}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View className="py-8 items-center justify-center">
                <Ionicons name="time-outline" size={24} color="#9CA3AF" />
                <Text className="mt-2 text-sm text-gray-500">
                  No recent locations yet
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* No results message */}
        {searchText.length >= 2 && predictions.length === 0 && !loading && (
          <View className="flex-1 items-center justify-center p-8 bg-white">
            <Ionicons name="search" size={48} color="#9CA3AF" />
            <Text className="mt-4 text-gray-500 text-center">
              No locations found for &quot;{searchText}&quot;
            </Text>
            <Text className="mt-2 text-gray-400 text-center text-sm">
              Try a different search term
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export default AddressAutocomplete;
