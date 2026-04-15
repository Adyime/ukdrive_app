/**
 * Passenger API Client
 * API functions for passenger-specific operations (e.g. location sharing)
 */

import { apiRequest, type ApiResponse } from '../api';

export interface PassengerLocationUpdateResponse {
  location: {
    latitude: number;
    longitude: number;
    currentLocation: string;
  };
}

/**
 * Update passenger's current location (only when they grant and use it)
 */
export async function updatePassengerLocation(
  latitude: number,
  longitude: number,
  currentLocation?: string
): Promise<ApiResponse<PassengerLocationUpdateResponse>> {
  return apiRequest<PassengerLocationUpdateResponse>('/api/passenger/location', {
    method: 'POST',
    body: JSON.stringify({
      latitude,
      longitude,
      ...(currentLocation && { currentLocation }),
    }),
  });
}
