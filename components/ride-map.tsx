/**
 * Ride Map Component
 * Interactive map for displaying ride tracking, driver location, and route
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { LocalizedText as Text } from "@/components/localized-text";
import { View, StyleSheet, Platform, Dimensions, TouchableOpacity, ActivityIndicator } from "react-native";
import MapView, {
  Circle,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
  LatLng,
} from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { RideStatus } from "@/lib/api/ride";
import { MAP_STYLE, ROUTE_COLORS } from "@/constants/map-style";
import {
  PickupMarker,
  DestinationMarker,
  DriverMarker,
} from "@/components/map-markers";
import { calculateHeadingBetweenCoordinates } from "@/lib/utils/vehicle-marker-assets";

// Constants
const { width, height } = Dimensions.get("window");
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.02;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;
const EDGE_PADDING = { top: 120, right: 80, bottom: 350, left: 80 };
const DRIVER_SMOOTH_TRANSITION_MS = 10000;
const DRIVER_SMOOTH_TICK_MS = 250;
const MIN_DRIVER_MOVEMENT_DEGREES = 0.00001;

// Types
export interface MapLocation {
  latitude: number;
  longitude: number;
  title?: string;
}

export interface NearbyVehicleMarker {
  id: string;
  latitude: number;
  longitude: number;
  vehicleType?: string | null;
  heading?: number;
}

export interface RideMapProps {
  pickupLocation?: MapLocation;
  destinationLocation?: MapLocation;
  driverLocation?: MapLocation;
  driverTrailCoordinates?: LatLng[];
  driverVehicleType?: string | null;
  userLocation?: MapLocation;
  nearbyVehicles?: NearbyVehicleMarker[];

  showRoute?: boolean;
  routeCoordinates?: LatLng[];
  interactive?: boolean;
  showsUserLocation?: boolean;

  zoomMode?: "active-route" | "all-markers";
  status?: RideStatus;
  activeRouteCoordinates?: LatLng[];

  height?: number;
  className?: string;

  onMapReady?: () => void;
  onRegionChange?: (region: Region) => void;
}

/**
 * Main RideMap component
 */
export function RideMap({
  pickupLocation,
  destinationLocation,
  driverLocation,
  driverTrailCoordinates,
  driverVehicleType,
  userLocation,
  nearbyVehicles,
  showRoute = true,
  routeCoordinates,
  interactive = true,
  showsUserLocation = false,
  zoomMode = "all-markers",
  status,
  activeRouteCoordinates,
  height: mapHeight = 300,
  className,
  onMapReady,
  onRegionChange,
}: RideMapProps) {
  const mapRef = useRef<MapView>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const userInteractedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRecenterButton, setShowRecenterButton] = useState(false);
  const lastStatusRef = useRef<RideStatus | undefined>(status);
  const previousDriverLocationRef = useRef<LatLng | null>(null);
  const [driverHeading, setDriverHeading] = useState<number | null>(null);
  const driverAnimationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const [driverMarkerLocation, setDriverMarkerLocation] = useState<
    MapLocation | undefined
  >(driverLocation);
  const driverMarkerLocationRef = useRef<MapLocation | undefined>(driverLocation);
  const lastDriverTargetAtRef = useRef<number | null>(null);
  const driverLatitude = driverLocation?.latitude;
  const driverLongitude = driverLocation?.longitude;

  useEffect(() => {
    driverMarkerLocationRef.current = driverMarkerLocation;
  }, [driverMarkerLocation]);

  const clearDriverAnimation = useCallback(() => {
    if (driverAnimationIntervalRef.current) {
      clearInterval(driverAnimationIntervalRef.current);
      driverAnimationIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearDriverAnimation();
    };
  }, [clearDriverAnimation]);

  useEffect(() => {
    if (
      typeof driverLatitude !== "number" ||
      !Number.isFinite(driverLatitude) ||
      typeof driverLongitude !== "number" ||
      !Number.isFinite(driverLongitude)
    ) {
      clearDriverAnimation();
      lastDriverTargetAtRef.current = null;
      setDriverMarkerLocation(undefined);
      return;
    }

    const target: MapLocation = {
      latitude: driverLatitude,
      longitude: driverLongitude,
      title: driverLocation?.title,
    };
    const current = driverMarkerLocationRef.current;

    if (
      !current ||
      !Number.isFinite(current.latitude) ||
      !Number.isFinite(current.longitude)
    ) {
      lastDriverTargetAtRef.current = Date.now();
      setDriverMarkerLocation(target);
      return;
    }

    const latDiff = Math.abs(target.latitude - current.latitude);
    const lngDiff = Math.abs(target.longitude - current.longitude);
    if (
      latDiff < MIN_DRIVER_MOVEMENT_DEGREES &&
      lngDiff < MIN_DRIVER_MOVEMENT_DEGREES
    ) {
      lastDriverTargetAtRef.current = Date.now();
      setDriverMarkerLocation(target);
      return;
    }

    clearDriverAnimation();

    const start = { latitude: current.latitude, longitude: current.longitude };
    const startAt = Date.now();
    const previousTargetAt = lastDriverTargetAtRef.current;
    lastDriverTargetAtRef.current = startAt;
    const transitionDuration =
      previousTargetAt != null
        ? Math.max(
            1500,
            Math.min(DRIVER_SMOOTH_TRANSITION_MS, startAt - previousTargetAt)
          )
        : DRIVER_SMOOTH_TRANSITION_MS;

    driverAnimationIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startAt;
      const progress = Math.min(elapsed / transitionDuration, 1);

      const next: MapLocation = {
        latitude: start.latitude + (target.latitude - start.latitude) * progress,
        longitude:
          start.longitude + (target.longitude - start.longitude) * progress,
        title: target.title ?? current.title,
      };

      setDriverMarkerLocation(next);

      if (progress >= 1) {
        clearDriverAnimation();
        setDriverMarkerLocation(target);
      }
    }, DRIVER_SMOOTH_TICK_MS);
  }, [
    driverLatitude,
    driverLongitude,
    driverLocation?.title,
    clearDriverAnimation,
  ]);

  const initialRegion = useMemo(() => {
    const points: LatLng[] = [];

    if (pickupLocation) {
      points.push({
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
      });
    }
    if (destinationLocation) {
      points.push({
        latitude: destinationLocation.latitude,
        longitude: destinationLocation.longitude,
      });
    }
    if (driverLocation) {
      points.push({
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
      });
    }
    if (driverTrailCoordinates?.length) {
      points.push(...driverTrailCoordinates);
    }
    if (userLocation) {
      points.push({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      });
    }

    if (points.length === 0) {
      return {
        latitude: 28.6139,
        longitude: 77.209,
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    }

    if (points.length === 1) {
      return {
        ...points[0],
        latitudeDelta: LATITUDE_DELTA,
        longitudeDelta: LONGITUDE_DELTA,
      };
    }

    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, LATITUDE_DELTA),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, LONGITUDE_DELTA),
    };
  }, [pickupLocation, destinationLocation, driverLocation, driverTrailCoordinates, userLocation]);

  const handleUserInteraction = () => {
    if (!userInteractedRef.current) {
      userInteractedRef.current = true;
      setShowRecenterButton(true);
    }
  };

  const handleRecenter = () => {
    userInteractedRef.current = false;
    setShowRecenterButton(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (
      typeof driverLatitude !== "number" ||
      !Number.isFinite(driverLatitude) ||
      typeof driverLongitude !== "number" ||
      !Number.isFinite(driverLongitude)
    ) {
      previousDriverLocationRef.current = null;
      setDriverHeading(null);
      return;
    }

    const current = {
      latitude: driverLatitude,
      longitude: driverLongitude,
    };
    const previous = previousDriverLocationRef.current;

    if (previous) {
      const nextHeading = calculateHeadingBetweenCoordinates(previous, current);
      if (nextHeading != null) {
        setDriverHeading(nextHeading);
      }
    }

    previousDriverLocationRef.current = current;
  }, [driverLatitude, driverLongitude]);

  // Smart zoom with status-based focus and debouncing
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    if (userInteractedRef.current) return;

    const statusChanged = lastStatusRef.current !== status;
    if (statusChanged) {
      lastStatusRef.current = status;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const performZoom = () => {
      if (!mapRef.current) return;

      let coords: LatLng[] = [];

      if (
        zoomMode === "active-route" &&
        activeRouteCoordinates?.length &&
        status
      ) {
        if (status === RideStatus.ACCEPTED || status === RideStatus.ARRIVING) {
          if (driverLocation)
            coords.push({
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            });
          if (pickupLocation)
            coords.push({
              latitude: pickupLocation.latitude,
              longitude: pickupLocation.longitude,
            });
          if (activeRouteCoordinates?.length)
            coords.push(...activeRouteCoordinates);
        } else if (status === RideStatus.IN_PROGRESS) {
          if (driverLocation)
            coords.push({
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            });
          if (destinationLocation)
            coords.push({
              latitude: destinationLocation.latitude,
              longitude: destinationLocation.longitude,
            });
          if (activeRouteCoordinates?.length)
            coords.push(...activeRouteCoordinates);
        } else {
          if (driverLocation)
            coords.push({
              latitude: driverLocation.latitude,
              longitude: driverLocation.longitude,
            });
          if (pickupLocation)
            coords.push({
              latitude: pickupLocation.latitude,
              longitude: pickupLocation.longitude,
            });
          if (destinationLocation)
            coords.push({
              latitude: destinationLocation.latitude,
              longitude: destinationLocation.longitude,
            });
        }
      } else {
        if (driverTrailCoordinates?.length) {
          coords.push(...driverTrailCoordinates);
        }
        if (driverLocation)
          coords.push({
            latitude: driverLocation.latitude,
            longitude: driverLocation.longitude,
          });
        if (pickupLocation)
          coords.push({
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
          });
        if (destinationLocation)
          coords.push({
            latitude: destinationLocation.latitude,
            longitude: destinationLocation.longitude,
          });
      }

      if (coords.length >= 2) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: EDGE_PADDING,
          animated: true,
        });
      }
    };

    if (statusChanged) {
      performZoom();
    } else {
      debounceTimerRef.current = setTimeout(performZoom, 3000);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    isMapReady,
    zoomMode,
    status,
    driverLocation,
    driverTrailCoordinates,
    pickupLocation,
    destinationLocation,
    activeRouteCoordinates,
  ]);

  const displayRouteCoordinates = useMemo(() => {
    if (routeCoordinates && routeCoordinates.length > 0) {
      return routeCoordinates;
    }
    return [];
  }, [routeCoordinates]);

  const handleMapReady = () => {
    setIsMapReady(true);
    onMapReady?.();
  };

  return (
    <View
      style={[styles.container, { height: mapHeight }]}
      className={className}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        customMapStyle={MAP_STYLE}
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        showsCompass={true}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
        onMapReady={handleMapReady}
        onRegionChangeComplete={onRegionChange}
        onPanDrag={handleUserInteraction}
        onTouchStart={handleUserInteraction}
      >
        {/* Pickup radius circle */}
        {pickupLocation && (
          <Circle
            center={{
              latitude: pickupLocation.latitude,
              longitude: pickupLocation.longitude,
            }}
            radius={150}
            fillColor="rgba(16, 185, 129, 0.08)"
            strokeColor="rgba(16, 185, 129, 0.25)"
            strokeWidth={1.5}
          />
        )}

        {/* Pickup marker */}
        {pickupLocation && (
          <PickupMarker
            key="pickup-marker"
            coordinate={pickupLocation}
            title={pickupLocation.title}
          />
        )}

        {/* Destination marker */}
        {destinationLocation && (
          <DestinationMarker
            key="destination-marker"
            coordinate={destinationLocation}
            title={destinationLocation.title}
          />
        )}

        {/* Driver marker */}
        {driverMarkerLocation && (
          <DriverMarker
            key="driver-marker"
            coordinate={driverMarkerLocation}
            title={driverMarkerLocation.title}
            vehicleType={driverVehicleType}
            heading={driverHeading}
          />
        )}

        {/* Nearby vehicle markers (shown during REQUESTED status) */}
        {nearbyVehicles?.map((vehicle) => (
          <DriverMarker
            key={`nearby-${vehicle.id}`}
            coordinate={{
              latitude: vehicle.latitude,
              longitude: vehicle.longitude,
            }}
            vehicleType={vehicle.vehicleType}
            heading={vehicle.heading ?? null}
          />
        ))}

        {/* Route line */}
        {displayRouteCoordinates.length >= 2 && (
          <Polyline
            coordinates={displayRouteCoordinates}
            strokeColor={ROUTE_COLORS.primary}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {/* Loading overlay */}
      {!isMapReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#F36D14" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}

      {/* Floating recenter button */}
      {showRecenterButton && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={handleRecenter}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={20} color="#F36D14" />
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Compact map for ride cards
 */
export function RideMapCompact({
  pickupLocation,
  destinationLocation,
  height = 150,
}: {
  pickupLocation?: MapLocation;
  destinationLocation?: MapLocation;
  height?: number;
}) {
  return (
    <RideMap
      pickupLocation={pickupLocation}
      destinationLocation={destinationLocation}
      interactive={false}
      height={height}
      showRoute={true}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(243, 244, 246, 0.95)",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#6b7280",
    fontSize: 13,
  },
  recenterButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});

export default RideMap;
