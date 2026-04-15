/**
 * Location Utilities
 * Helper functions for location-related operations
 */

// Default location is no longer used - use getCurrentPositionWithAddress from location service instead
// This constant is kept for backward compatibility but should not be used for actual location
export const DEFAULT_LOCATION = {
  latitude: 0,
  longitude: 0,
  address: 'Location not available',
};

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface LocationWithAddress extends LocationCoordinates {
  address?: string;
}

/**
 * Get current device location
 * @deprecated Use getCurrentPositionWithAddress from @/lib/services/location instead
 * This function now throws an error to prevent accidental use.
 */
export async function getCurrentLocation(): Promise<LocationWithAddress> {
  // This function is deprecated - use the location service instead
  // Import: import { getCurrentPositionWithAddress } from '@/lib/services/location';
  throw new Error(
    'getCurrentLocation is deprecated. Use getCurrentPositionWithAddress from @/lib/services/location instead.'
  );
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Format coordinates as string
 */
export function formatCoordinates(lat: number, lon: number): string {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/**
 * Check if coordinates are valid
 */
export function isValidCoordinates(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Get a human-readable direction from bearing
 */
export function getBearingDirection(bearing: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

/**
 * Calculate bearing between two points
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = toRadians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRadians(lat2));
  const x =
    Math.cos(toRadians(lat1)) * Math.sin(toRadians(lat2)) -
    Math.sin(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.cos(dLon);
  let bearing = Math.atan2(y, x);
  bearing = (bearing * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Parse location string to coordinates (simple implementation)
 * In production, use a geocoding service like Google Places API
 */
export function parseLocationString(location: string): LocationCoordinates | null {
  // Try to parse as "lat, lon" format
  const match = location.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    if (isValidCoordinates(lat, lon)) {
      return { latitude: lat, longitude: lon };
    }
  }
  return null;
}

// Sample locations for testing (Indian cities)
export const SAMPLE_LOCATIONS = [
  { name: 'Connaught Place', latitude: 28.6315, longitude: 77.2167 },
  { name: 'India Gate', latitude: 28.6129, longitude: 77.2295 },
  { name: 'Red Fort', latitude: 28.6562, longitude: 77.241 },
  { name: 'Lotus Temple', latitude: 28.5535, longitude: 77.2588 },
  { name: 'Qutub Minar', latitude: 28.5245, longitude: 77.1855 },
  { name: 'IGI Airport T3', latitude: 28.5562, longitude: 77.0871 },
  { name: 'Hauz Khas', latitude: 28.5494, longitude: 77.2001 },
  { name: 'Nehru Place', latitude: 28.5491, longitude: 77.2533 },
];

/**
 * Get random sample location for testing
 */
export function getRandomSampleLocation(): LocationWithAddress {
  const location = SAMPLE_LOCATIONS[Math.floor(Math.random() * SAMPLE_LOCATIONS.length)];
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    address: location.name,
  };
}

