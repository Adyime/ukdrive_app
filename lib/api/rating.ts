/**
 * Rating API
 * Handles submission of ratings for completed rides, parcel deliveries, and ride shares.
 */

import { post } from '../api';

export interface ServiceRatingPayload {
  rating: number;
  comment?: string;
}

export type RatingServiceType = 'ride' | 'porter' | 'carPool';

export interface ServiceRatingResponse {
  rating: {
    id: string;
    serviceId: string;
    serviceType: RatingServiceType;
    raterId: string;
    raterType: 'passenger' | 'driver';
    ratedId: string;
    ratedType: 'passenger' | 'driver';
    rating: number;
    comment: string | null;
    createdAt: string;
    averageRating: number | null;
  };
}

/**
 * Submit a rating for a completed ride.
 */
export async function submitRideRating(
  rideId: string,
  rating: number,
  comment?: string
): Promise<{
  success: boolean;
  data?: ServiceRatingResponse;
  error?: unknown;
  message?: string;
}> {
  return post<ServiceRatingResponse>(`/api/rating/ride/${rideId}`, {
    rating,
    ...(comment && comment.trim().length > 0 ? { comment: comment.trim() } : {}),
  } satisfies ServiceRatingPayload);
}

/**
 * Submit a rating for a completed parcel delivery.
 */
export async function submitPorterRating(
  porterServiceId: string,
  rating: number,
  comment?: string
): Promise<{
  success: boolean;
  data?: ServiceRatingResponse;
  error?: unknown;
  message?: string;
}> {
  return post<ServiceRatingResponse>(`/api/rating/porter/${porterServiceId}`, {
    rating,
    ...(comment && comment.trim().length > 0 ? { comment: comment.trim() } : {}),
  } satisfies ServiceRatingPayload);
}

/**
 * Submit a rating for a ride share trip.
 */
export async function submitCarPoolRating(
  carPoolId: string,
  rating: number,
  comment?: string
): Promise<{
  success: boolean;
  data?: ServiceRatingResponse;
  error?: unknown;
  message?: string;
}> {
  return post<ServiceRatingResponse>(`/api/rating/car-pool/${carPoolId}`, {
    rating,
    ...(comment && comment.trim().length > 0 ? { comment: comment.trim() } : {}),
  } satisfies ServiceRatingPayload);
}

