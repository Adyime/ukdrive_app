/**
 * Generic Service Map Component
 * Reusable map component for Ride, Porter, and Car Pool services
 * Extends RideMap functionality for different service types
 */

import React from 'react';
import { RideMap, type MapLocation, type RideMapProps } from './ride-map';

export interface ServiceMapProps extends Omit<RideMapProps, 'status'> {
  serviceType?: 'ride' | 'porter' | 'carpool';
  // Additional locations for car pool (multiple passengers)
  additionalLocations?: MapLocation[];
}

/**
 * Service Map Component
 * Wrapper around RideMap with service-specific configurations
 */
export function ServiceMap({
  serviceType = 'ride',
  additionalLocations,
  ...props
}: ServiceMapProps) {
  // For now, we use RideMap directly
  // In the future, we can add service-specific markers (e.g., package pickup/delivery icons)
  return <RideMap {...props} />;
}

export type { MapLocation } from './ride-map';
export default ServiceMap;
