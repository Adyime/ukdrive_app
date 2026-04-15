/**
 * Communication helpers: when Chat and Call are allowed for a given service status.
 */

import { RideStatus } from '@/lib/api/ride';
import { PorterStatus } from '@/lib/api/porter';
import { CarPoolStatus } from '@/lib/api/carPool';

const RIDE_COMMUNICATION_STATUSES: RideStatus[] = [
  RideStatus.ACCEPTED,
  RideStatus.ARRIVING,
  RideStatus.IN_PROGRESS,
];

export function canUseCommunicationRide(status: RideStatus): boolean {
  return RIDE_COMMUNICATION_STATUSES.includes(status);
}

const PORTER_COMMUNICATION_STATUSES: PorterStatus[] = [
  PorterStatus.ACCEPTED,
  PorterStatus.PICKED_UP,
  PorterStatus.IN_TRANSIT,
];

export function canUseCommunicationPorter(status: PorterStatus): boolean {
  return PORTER_COMMUNICATION_STATUSES.includes(status);
}

const CARPOOL_COMMUNICATION_STATUSES: CarPoolStatus[] = [
  CarPoolStatus.CONFIRMED,
  CarPoolStatus.IN_PROGRESS,
];

export function canUseCommunicationCarPool(status: CarPoolStatus): boolean {
  return CARPOOL_COMMUNICATION_STATUSES.includes(status);
}
