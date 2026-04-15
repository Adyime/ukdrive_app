/**
 * Static Map URL Generator
 * Generates Google Static Maps API URLs for ride route visualization
 * 
 * This is a cost-effective alternative to interactive maps:
 * - Static Maps API: ~$2/1000 loads
 * - Interactive Maps: ~$7/1000 loads + JS bundle overhead
 * 
 * Used for displaying completed ride routes in history/details screens
 */

import Constants from 'expo-constants';

// Get API key from environment
const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || 
  Constants.expoConfig?.android?.config?.googleMaps?.apiKey || '';

export interface StaticMapOptions {
  /** Width of the map image in pixels (default: 640) */
  width?: number;
  /** Height of the map image in pixels (default: 300) */
  height?: number;
  /** Map zoom level (default: auto-fit to markers) */
  zoom?: number;
  /** Map type: roadmap, satellite, terrain, hybrid (default: roadmap) */
  mapType?: 'roadmap' | 'satellite' | 'terrain' | 'hybrid';
  /** Map style: dark, light (default: based on system) */
  style?: 'dark' | 'light';
}

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Generate a Google Static Maps URL with pickup and destination markers
 * 
 * @param pickup - Pickup location coordinates
 * @param destination - Destination coordinates
 * @param options - Map configuration options
 * @returns Static map URL or null if API key not available
 */
export function generateStaticMapUrl(
  pickup: RouteCoordinate,
  destination: RouteCoordinate,
  options: StaticMapOptions = {}
): string | null {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('[StaticMap] Google Maps API key not configured');
    return null;
  }

  const {
    width = 640,
    height = 300,
    mapType = 'roadmap',
    style = 'dark',
  } = options;

  // Build URL parameters
  const params = new URLSearchParams();
  
  // Image size
  params.set('size', `${width}x${height}`);
  
  // Map type
  params.set('maptype', mapType);
  
  // Scale for high-DPI displays
  params.set('scale', '2');
  
  // Pickup marker (green)
  params.append('markers', `color:0x10B981|label:P|${pickup.latitude},${pickup.longitude}`);
  
  // Destination marker (red)
  params.append('markers', `color:0xEF4444|label:D|${destination.latitude},${destination.longitude}`);
  
  // Draw a path between pickup and destination
  // Using a simple straight line - for actual road route, we'd need Directions API polyline
  params.append('path', `color:0x3B82F680|weight:4|${pickup.latitude},${pickup.longitude}|${destination.latitude},${destination.longitude}`);
  
  // Apply dark style if requested
  if (style === 'dark') {
    // Dark mode styling
    params.append('style', 'element:geometry|color:0x212121');
    params.append('style', 'element:labels.text.stroke|color:0x212121');
    params.append('style', 'element:labels.text.fill|color:0x757575');
    params.append('style', 'feature:road|element:geometry|color:0x3c3c3c');
    params.append('style', 'feature:road|element:geometry.stroke|color:0x212121');
    params.append('style', 'feature:road.highway|element:geometry|color:0x4a4a4a');
    params.append('style', 'feature:water|element:geometry|color:0x1a1a2e');
  }
  
  // API key
  params.set('key', GOOGLE_MAPS_API_KEY);

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Generate a static map URL with an encoded polyline for the actual route
 * Use this when you have the route polyline from Directions API
 * 
 * @param pickup - Pickup location coordinates
 * @param destination - Destination coordinates
 * @param encodedPolyline - Google's encoded polyline string
 * @param options - Map configuration options
 * @returns Static map URL or null if API key not available
 */
export function generateStaticMapUrlWithRoute(
  pickup: RouteCoordinate,
  destination: RouteCoordinate,
  encodedPolyline: string,
  options: StaticMapOptions = {}
): string | null {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('[StaticMap] Google Maps API key not configured');
    return null;
  }

  const {
    width = 640,
    height = 300,
    mapType = 'roadmap',
    style = 'dark',
  } = options;

  // Build URL parameters
  const params = new URLSearchParams();
  
  // Image size
  params.set('size', `${width}x${height}`);
  
  // Map type
  params.set('maptype', mapType);
  
  // Scale for high-DPI displays
  params.set('scale', '2');
  
  // Pickup marker (green)
  params.append('markers', `color:0x10B981|label:P|${pickup.latitude},${pickup.longitude}`);
  
  // Destination marker (red)
  params.append('markers', `color:0xEF4444|label:D|${destination.latitude},${destination.longitude}`);
  
  // Draw the actual route using encoded polyline
  params.append('path', `color:0x3B82F6|weight:4|enc:${encodedPolyline}`);
  
  // Apply dark style if requested
  if (style === 'dark') {
    params.append('style', 'element:geometry|color:0x212121');
    params.append('style', 'element:labels.text.stroke|color:0x212121');
    params.append('style', 'element:labels.text.fill|color:0x757575');
    params.append('style', 'feature:road|element:geometry|color:0x3c3c3c');
    params.append('style', 'feature:road|element:geometry.stroke|color:0x212121');
    params.append('style', 'feature:road.highway|element:geometry|color:0x4a4a4a');
    params.append('style', 'feature:water|element:geometry|color:0x1a1a2e');
  }
  
  // API key
  params.set('key', GOOGLE_MAPS_API_KEY);

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}
