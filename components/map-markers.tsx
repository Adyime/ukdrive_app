/**
 * Custom Map Markers
 * Modern, minimal markers inspired by Uber's design language.
 */

import React from "react";
import {
  View,
  StyleSheet,
  Platform,
  Image,
  type ImageURISource,
} from "react-native";
import { Marker, LatLng } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { resolveVehicleMarkerImage } from "@/lib/utils/vehicle-marker-assets";

interface MarkerProps {
  coordinate: LatLng;
  title?: string;
  onPress?: () => void;
}

interface DriverMarkerProps extends MarkerProps {
  vehicleType?: string | null;
  heading?: number | null;
}

/**
 * Pickup location marker — compact green dot with white ring
 */
export const PickupMarker = React.memo(function PickupMarker({
  coordinate,
  title,
  onPress,
}: MarkerProps) {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      title={title || "Pickup"}
      description="Pickup location"
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={!isReady}
      onPress={onPress}
    >
      <View style={styles.pickupWrapper}>
        <View style={styles.pickupOuter}>
          <View style={styles.pickupInner} />
        </View>
      </View>
    </Marker>
  );
});

/**
 * Destination location marker — dark rounded square with white square inset
 */
export const DestinationMarker = React.memo(function DestinationMarker({
  coordinate,
  title,
  onPress,
}: MarkerProps) {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      title={title || "Destination"}
      description="Destination"
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={!isReady}
      onPress={onPress}
    >
      <View style={styles.destWrapper}>
        <View style={styles.destSquare}>
          <View style={styles.destInnerSquare} />
        </View>
        <View style={styles.destTail} />
      </View>
    </Marker>
  );
});

/**
 * Driver location marker - smaller orientation-aware vehicle icon.
 * Important:
 * We render <Image /> inside Marker so width/height can be controlled.
 */
export const DriverMarker = React.memo(function DriverMarker({
  coordinate,
  title,
  onPress,
  vehicleType,
  heading,
}: DriverMarkerProps) {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const headingValue =
    typeof heading === "number" && Number.isFinite(heading) ? heading : 0;

  const markerImage = resolveVehicleMarkerImage({
    vehicleType,
    heading,
  });

  const markerImageSource: number | ImageURISource | undefined =
    typeof markerImage === "number"
      ? markerImage
      : Array.isArray(markerImage)
        ? markerImage[0]
        : markerImage;

  return (
    <Marker
      coordinate={coordinate}
      title={title || "Driver"}
      description="Driver location"
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      rotation={headingValue}
      tracksViewChanges={!isReady}
      zIndex={30}
      onPress={onPress}
    >
      <View style={styles.driverMarkerWrapper}>
        <Image
          source={markerImageSource}
          style={styles.driverMarkerImage}
          resizeMode="contain"
        />
      </View>
    </Marker>
  );
});

/**
 * User/Passenger location marker — purple circle with person icon
 */
export const UserMarker = React.memo(function UserMarker({
  coordinate,
  title,
  onPress,
}: MarkerProps) {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      title={title || "You"}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={!isReady}
      onPress={onPress}
    >
      <View style={styles.userWrapper}>
        <View style={styles.userPulse} />
        <View style={styles.userCircle}>
          <Ionicons name="person" size={12} color="#FFFFFF" />
        </View>
      </View>
    </Marker>
  );
});

const SHADOW_PROPS = Platform.select({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  android: {
    elevation: 6,
  },
  default: {},
}) as Record<string, any>;

const styles = StyleSheet.create({
  // --- Pickup: smaller compact green dot ---
  pickupWrapper: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#10B981",
    ...SHADOW_PROPS,
  },
  pickupInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#10B981",
  },

  // --- Destination: smaller dark rounded square ---
  destWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  destSquare: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...SHADOW_PROPS,
  },
  destInnerSquare: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: "#FFFFFF",
  },
  destTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1F2937",
    marginTop: -1,
  },

  // --- Driver: smaller vehicle image ---
  driverMarkerWrapper: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  driverMarkerImage: {
    width: 36,
    height: 36,
  },

  // --- User: smaller purple circle ---
  userWrapper: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  userPulse: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    borderWidth: 1.2,
    borderColor: "rgba(139, 92, 246, 0.25)",
  },
  userCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    ...SHADOW_PROPS,
  },
});
