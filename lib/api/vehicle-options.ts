/**
 * Vehicle options API (categories and subcategories for ride/porter/carPool).
 * Used by driver onboarding and admin.
 */

import { get } from '../api';

export type VehiclePurpose = 'passenger' | 'delivery' | 'both';

export interface VehicleSubcategoryOption {
  id: string;
  name: string;
  slug: string;
  legacyVehicleType: string | null;
  displayOrder: number;
  supportedPurposes: VehiclePurpose[];
}

export interface VehicleCategoryOption {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  displayOrder: number;
  subcategories: VehicleSubcategoryOption[];
}

export async function getVehicleOptions(service: 'ride' | 'porter' | 'carPool' = 'ride'): Promise<{
  success: boolean;
  data?: { categories: VehicleCategoryOption[] };
  error?: unknown;
}> {
  return get<{ categories: VehicleCategoryOption[] }>(`/api/vehicle-options?service=${service}`);
}
