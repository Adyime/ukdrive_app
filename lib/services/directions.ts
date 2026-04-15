/**
 * Directions Service: backend first (OSRM then Google), then client Google fallback.
 * Fetches actual road routes; polyline is Google-compatible (OSRM uses same encoding).
 */

import Constants from 'expo-constants';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey ||
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey || '';

// Route cache configuration
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000; // Cache routes for 5 minutes
const COORDINATE_PRECISION = 4; // Round coordinates to 4 decimal places (~11 meters) for cache key

interface CachedRoute {
  route: RouteInfo;
  timestamp: number;
}

// In-memory route cache
const routeCache = new Map<string, CachedRoute>();

/**
 * Generate cache key from origin and destination coordinates
 * Rounds coordinates to reduce cache misses from minor GPS variations
 */
function getCacheKey(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  vehicleType?: string | null
): string {
  const roundCoord = (coord: number) => 
    Math.round(coord * Math.pow(10, COORDINATE_PRECISION)) / Math.pow(10, COORDINATE_PRECISION);
  
  const originLat = roundCoord(origin.latitude);
  const originLng = roundCoord(origin.longitude);
  const destLat = roundCoord(destination.latitude);
  const destLng = roundCoord(destination.longitude);
  const mode = getTravelMode(vehicleType);
  
  return `${originLat},${originLng}|${destLat},${destLng}|${mode}`;
}

/**
 * Get cached route if available and not expired
 */
function getCachedRoute(cacheKey: string): RouteInfo | null {
  const cached = routeCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  
  const age = Date.now() - cached.timestamp;
  if (age > ROUTE_CACHE_TTL_MS) {
    // Cache expired, remove it
    routeCache.delete(cacheKey);
    return null;
  }
  
  return cached.route;
}

/**
 * Store route in cache
 */
function setCachedRoute(cacheKey: string, route: RouteInfo): void {
  routeCache.set(cacheKey, {
    route,
    timestamp: Date.now(),
  });
  
  // Limit cache size to prevent memory issues (keep last 100 routes)
  if (routeCache.size > 100) {
    const firstKey = routeCache.keys().next().value;
    if (firstKey) {
      routeCache.delete(firstKey);
    }
  }
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  coordinates: RoutePoint[];
  distance: number; // in meters
  duration: number; // in seconds
}

/**
 * Get travel mode based on vehicle type
 */
function getTravelMode(vehicleType?: string | null): string {
  switch (vehicleType) {
    case 'bike':
    case 'motorcycle':
      return 'bicycling';
    case 'erickshaw':
    case 'auto':
      return 'driving'; // Auto-rickshaws and e-rickshaws use driving mode
    case 'car':
    case 'cab':
      return 'driving';
    default:
      return 'driving'; // Default to driving for "Any" or undefined
  }
}

/**
 * Fetch route from backend (OSRM first, Google fallback). On backend failure, use Google Directions in client.
 */
async function fetchRouteFromBackend(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  vehicleType?: string | null
): Promise<RouteInfo | null> {
  const params = new URLSearchParams({
    originLat: String(origin.latitude),
    originLng: String(origin.longitude),
    destLat: String(destination.latitude),
    destLng: String(destination.longitude),
  });
  if (vehicleType) params.set('vehicleType', vehicleType);
  const response = await fetch(`${API_BASE_URL}/api/geo/route?${params.toString()}`);
  if (!response.ok) return null;
  const json = (await response.json()) as {
    data?: { polyline?: string; distanceMeters?: number; durationSeconds?: number };
  };
  const d = json.data;
  if (!d?.polyline) return null;
  const coordinates = decodePolyline(d.polyline);
  if (coordinates.length === 0) return null;
  return {
    coordinates,
    distance: d.distanceMeters ?? 0,
    duration: d.durationSeconds ?? 0,
  };
}

/**
 * Fetch route from Google Directions API (client fallback).
 */
async function fetchRouteFromGoogle(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  vehicleType?: string | null
): Promise<RouteInfo | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;
  const originStr = `${origin.latitude},${origin.longitude}`;
  const destStr = `${destination.latitude},${destination.longitude}`;
  const mode = getTravelMode(vehicleType);
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&key=${GOOGLE_MAPS_API_KEY}&mode=${mode}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status !== 'OK' || !data.routes?.length) return null;
  const route = data.routes[0];
  const leg = route.legs[0];
  const coordinates = route.overview_polyline?.points
    ? decodePolyline(route.overview_polyline.points)
    : [origin, destination];
  return {
    coordinates,
    distance: leg.distance?.value ?? 0,
    duration: leg.duration?.value ?? 0,
  };
}

/**
 * Get route: cache first, then backend (OSRM/Google), then client Google fallback.
 */
export async function getRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  vehicleType?: string | null
): Promise<RouteInfo | null> {
  const cacheKey = getCacheKey(origin, destination, vehicleType);
  const cachedRoute = getCachedRoute(cacheKey);
  if (cachedRoute) {
    if (__DEV__) console.log('[Directions] Using cached route');
    return cachedRoute;
  }

  let routeInfo: RouteInfo | null = null;
  routeInfo = await fetchRouteFromBackend(origin, destination, vehicleType);
  if (!routeInfo) routeInfo = await fetchRouteFromGoogle(origin, destination, vehicleType);

  if (routeInfo) setCachedRoute(cacheKey, routeInfo);
  return routeInfo;
}

/**
 * Clear the route cache
 * Useful when you want to force fresh routes
 */
export function clearRouteCache(): void {
  routeCache.clear();
}

/**
 * Decode Google's encoded polyline string to coordinates
 * Implements the polyline encoding algorithm
 */
export function decodePolyline(encoded: string): RoutePoint[] {
  const coordinates: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    // Decode latitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    // Decode longitude
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({
      latitude: lat * 1e-5,
      longitude: lng * 1e-5,
    });
  }

  return coordinates;
}
