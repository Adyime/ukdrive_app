# Vehicle Marker Rendering Guide

This document explains how vehicle markers are rendered on map screens in the passenger app, including:

- Book a Ride (nearby vehicles before booking)
- Driver Arriving / On The Way
- Ride Started / In Progress

It is the single reference for marker data flow, sizing, heading/orientation, and performance behavior.

## 1) Source of truth files

- Marker assets + orientation logic:
  - `lib/utils/vehicle-marker-assets.ts`
- Shared marker components:
  - `components/map-markers.tsx`
- Book a Ride nearby marker flow:
  - `app/(tabs)/create-ride.tsx`
- Active ride map flow (arriving/in-progress):
  - `app/(tabs)/active-ride.tsx`
  - `components/ride-map.tsx`

## 2) Marker rendering architecture

### 2.1 Asset resolution

`lib/utils/vehicle-marker-assets.ts` is responsible for:

- mapping vehicle type to category (`car | auto | bike`)
- choosing orientation from heading (`horizontal | vertical`)
- resolving the correct local PNG asset for that pair

Functions used:

- `normalizeVehicleMarkerCategory(...)`
- `getVehicleOrientationFromHeading(...)`
- `resolveVehicleMarkerImage(...)`
- `calculateHeadingBetweenCoordinates(...)`

### 2.2 Shared marker component

`components/map-markers.tsx` provides `DriverMarker`, which is used for live vehicle display.

Key behavior in `DriverMarker`:

- Uses orientation-aware and category-aware size map: `DRIVER_MARKER_SIZE_MAP`
- Uses center anchor: `anchor={{ x: 0.5, y: 0.5 }}`
- Sets `zIndex={30}` to keep vehicle above route/other map layers
- Uses minimal view + image marker structure for Android stability
- Controls `tracksViewChanges` carefully:
  - set `true` briefly when visual variant changes
  - auto-set `false` after ~120ms to avoid expensive continuous re-renders

This keeps markers clear and performant when many vehicles are rendered.

## 3) Screen-specific flow

### 3.1 Book a Ride (`create-ride`)

File: `app/(tabs)/create-ride.tsx`

Flow:

1. Fetch nearby drivers from API using pickup (and selected vehicle filters).
2. Parse driver list and normalize coordinates.
3. If heading is missing, derive it from previous position using `calculateHeadingBetweenCoordinates(...)`.
4. Store as `nearbyVehicles`.
5. Render each vehicle on map using shared `<DriverMarker ... />`.

Important:

- Nearby vehicles are polled periodically.
- If strict subcategory filter returns 0 drivers, fallback queries are used so user still sees nearby vehicles.
- Both selected-vehicle and default scenarios use the same marker component path now.

### 3.2 Driver Arriving / On The Way (`active-ride`)

Files:

- `app/(tabs)/active-ride.tsx`
- `components/ride-map.tsx`

Flow:

1. `active-ride` passes `driverLocation`, `driverVehicleType`, `status` to `RideMap`.
2. `RideMap` tracks previous driver coordinates and derives heading for smooth orientation updates.
3. `RideMap` renders `<DriverMarker ... heading={driverHeading} />`.
4. Status-based zoom behavior changes map framing for ACCEPTED/ARRIVING states.

### 3.3 Ride Started / In Progress

Same `active-ride` + `RideMap` pipeline as above.

Difference:

- In `IN_PROGRESS`, routing/zoom prioritizes driver + destination corridor.
- Marker rendering stays identical (same `DriverMarker`).

## 4) Why markers previously looked tiny/cropped

Primary cause:

- Vehicle PNG assets include transparent padding.
- If rendered at small fixed dimensions, visible vehicle content appears tiny even though image dimensions are technically set.

Fix approach:

- Use category/orientation-specific marker sizing (`DRIVER_MARKER_SIZE_MAP`) to compensate per asset class.
- Keep explicit canvas and image sizes in shared marker renderer.
- Keep anchor centered and layer priority explicit.

## 5) Performance rules

To keep live markers smooth:

1. Reuse shared `DriverMarker` instead of screen-specific custom marker implementations.
2. Keep marker child tree minimal (avoid heavy nested animated content).
3. Use local bundled assets (no remote image fetch for live markers).
4. Keep `tracksViewChanges` off except short windows when visual representation changes.
5. Use `React.memo` on marker components.

## 6) Debug checklist

If marker looks wrong again, verify in this order:

1. Is the screen rendering `DriverMarker` (not a custom ad-hoc marker)?
2. Is heading valid / finite?
3. Is `resolveVehicleMarkerImage(...)` returning the expected asset?
4. Is the marker using center anchor (`0.5, 0.5`)?
5. Is `DRIVER_MARKER_SIZE_MAP` suitable for that vehicle category/orientation?
6. Is `tracksViewChanges` stuck on (perf issue) or off too early (stale icon)?
7. Is route/polyline or circle visually covering marker (zIndex/layer issue)?

## 7) When updating marker assets

If you replace PNGs in `assets/images/mapvehicles`, you must:

1. Validate transparent padding of new assets.
2. Re-tune `DRIVER_MARKER_SIZE_MAP` for each category + orientation.
3. Test on both Android and iOS in:
   - Book a Ride
   - Driver Arriving
   - Ride Started

