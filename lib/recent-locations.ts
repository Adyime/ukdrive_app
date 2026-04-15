import * as SecureStore from "expo-secure-store";
import type { LocationWithAddress } from "@/lib/utils/location";

const RECENT_LOCATIONS_KEY = "uk_drive_recent_locations_v1";
const MAX_RECENT_LOCATIONS = 12;

export interface RecentLocation extends LocationWithAddress {
  id: string;
  updatedAt: string;
}

function normalizeAddress(address: string | undefined): string {
  const trimmed = (address ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Pinned Location";
}

function buildLocationId(location: LocationWithAddress): string {
  const roundedLat = Number(location.latitude).toFixed(5);
  const roundedLng = Number(location.longitude).toFixed(5);
  const normalizedAddress = normalizeAddress(location.address).toLowerCase();
  return `${roundedLat}:${roundedLng}:${normalizedAddress}`;
}

function parseRecentLocations(raw: string | null): RecentLocation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentLocation => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<RecentLocation>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.latitude === "number" &&
          Number.isFinite(candidate.latitude) &&
          typeof candidate.longitude === "number" &&
          Number.isFinite(candidate.longitude) &&
          typeof candidate.address === "string" &&
          typeof candidate.updatedAt === "string"
        );
      })
      .slice(0, MAX_RECENT_LOCATIONS);
  } catch (error) {
    console.warn("Failed to parse recent locations:", error);
    return [];
  }
}

async function saveRecentLocations(locations: RecentLocation[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      RECENT_LOCATIONS_KEY,
      JSON.stringify(locations.slice(0, MAX_RECENT_LOCATIONS))
    );
  } catch (error) {
    console.warn("Failed to save recent locations:", error);
  }
}

export async function getRecentLocations(): Promise<RecentLocation[]> {
  try {
    const raw = await SecureStore.getItemAsync(RECENT_LOCATIONS_KEY);
    return parseRecentLocations(raw);
  } catch (error) {
    console.warn("Failed to get recent locations:", error);
    return [];
  }
}

export async function addRecentLocation(
  location: LocationWithAddress
): Promise<RecentLocation[]> {
  if (
    !location ||
    typeof location.latitude !== "number" ||
    !Number.isFinite(location.latitude) ||
    typeof location.longitude !== "number" ||
    !Number.isFinite(location.longitude)
  ) {
    return getRecentLocations();
  }

  const normalizedLocation: RecentLocation = {
    id: buildLocationId(location),
    latitude: location.latitude,
    longitude: location.longitude,
    address: normalizeAddress(location.address),
    updatedAt: new Date().toISOString(),
  };

  const existing = await getRecentLocations();
  const deduped = existing.filter((item) => item.id !== normalizedLocation.id);
  const updated = [normalizedLocation, ...deduped].slice(0, MAX_RECENT_LOCATIONS);
  await saveRecentLocations(updated);
  return updated;
}
