import type { ImageSourcePropType } from "react-native";

import autoHorizontalImage from "@/assets/images/mapvehicles/autotophorizontalview.marker.png";
import autoVerticalImage from "@/assets/images/mapvehicles/autotopverticalview.marker.png";
import bikeHorizontalImage from "@/assets/images/mapvehicles/biketophorizontalview.marker.png";
import bikeVerticalImage from "@/assets/images/mapvehicles/biketopverticalview.marker.png";
import carHorizontalImage from "@/assets/images/mapvehicles/cartophorizontalview.marker.png";
import carVerticalImage from "@/assets/images/mapvehicles/cartopverticalview.marker.png";

export type VehicleMarkerCategory = "car" | "auto" | "bike";
export type VehicleMarkerOrientation = "horizontal" | "vertical";

const AUTO_VEHICLE_TYPES = new Set([
  "auto",
  "miniauto",
  "erickshaw",
  "rickshaw",
  "e-rickshaw",
  "e_rickshaw",
]);

const BIKE_VEHICLE_TYPES = new Set([
  "bike",
  "motorcycle",
  "scooter",
  "motorbike",
]);

const CAR_VEHICLE_TYPES = new Set(["car", "cab"]);

const VEHICLE_MARKER_ASSETS: Record<
  VehicleMarkerCategory,
  Record<VehicleMarkerOrientation, ImageSourcePropType>
> = {
  car: {
    horizontal: carHorizontalImage,
    vertical: carVerticalImage,
  },
  auto: {
    horizontal: autoHorizontalImage,
    vertical: autoVerticalImage,
  },
  bike: {
    horizontal: bikeHorizontalImage,
    vertical: bikeVerticalImage,
  },
};

function normalizeHeading(heading: number): number {
  const mod = heading % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function normalizeVehicleMarkerCategory(
  vehicleType?: string | null
): VehicleMarkerCategory {
  const normalized = String(vehicleType ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) return "car";

  // Canonical category shortcuts from admin category slugs
  if (normalized === "a" || normalized.startsWith("a_") || normalized.startsWith("a-")) {
    return "auto";
  }
  if (normalized === "b" || normalized.startsWith("b_") || normalized.startsWith("b-")) {
    return "bike";
  }
  if (normalized === "c" || normalized.startsWith("c_") || normalized.startsWith("c-")) {
    return "car";
  }

  if (CAR_VEHICLE_TYPES.has(normalized)) {
    return "car";
  }
  if (
    AUTO_VEHICLE_TYPES.has(normalized) ||
    normalized.includes("rickshaw") ||
    normalized.includes("auto")
  ) {
    return "auto";
  }
  if (
    BIKE_VEHICLE_TYPES.has(normalized) ||
    normalized.includes("bike") ||
    normalized.includes("motor") ||
    normalized.includes("scooter") ||
    normalized.includes("cycle") ||
    normalized.includes("two_wheeler")
  ) {
    return "bike";
  }

  if (normalized.includes("cab") || normalized.includes("car")) {
    return "car";
  }

  return "car";
}

export function getVehicleOrientationFromHeading(
  heading?: number | null
): VehicleMarkerOrientation {
  if (typeof heading !== "number" || !Number.isFinite(heading)) {
    return "vertical";
  }

  const normalizedHeading = normalizeHeading(heading);
  const isHorizontal =
    (normalizedHeading >= 45 && normalizedHeading <= 135) ||
    (normalizedHeading >= 225 && normalizedHeading <= 315);

  return isHorizontal ? "horizontal" : "vertical";
}

export function resolveVehicleMarkerImage(params: {
  vehicleType?: string | null;
  heading?: number | null;
  fallbackOrientation?: VehicleMarkerOrientation;
}): ImageSourcePropType {
  const { vehicleType, heading, fallbackOrientation = "vertical" } = params;
  const category = normalizeVehicleMarkerCategory(vehicleType);
  const orientation =
    typeof heading === "number" && Number.isFinite(heading)
      ? getVehicleOrientationFromHeading(heading)
      : fallbackOrientation;

  return VEHICLE_MARKER_ASSETS[category][orientation];
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function calculateHeadingBetweenCoordinates(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number | null {
  if (
    !Number.isFinite(from.latitude) ||
    !Number.isFinite(from.longitude) ||
    !Number.isFinite(to.latitude) ||
    !Number.isFinite(to.longitude)
  ) {
    return null;
  }

  const latDelta = Math.abs(to.latitude - from.latitude);
  const lngDelta = Math.abs(to.longitude - from.longitude);
  if (latDelta < 0.00001 && lngDelta < 0.00001) {
    return null;
  }

  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLng = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  const heading = toDegrees(Math.atan2(y, x));
  return normalizeHeading(heading);
}
