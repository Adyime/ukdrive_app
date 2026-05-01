# Driver Location And Time Update Flow

This document explains how the driver's `latitude`, `longitude`, and `last_location_updated_at` are updated today.

The server updates `last_location_updated_at` only when `POST /api/driver/location` succeeds.

## Server Update Rule

- Endpoint: `POST /api/driver/location`
- Server behavior:
  - Updates `latitude`
  - Updates `longitude`
  - Sets `lastLocationUpdatedAt = new Date()`
- File:
  - `uk_drive_server/src/routes/driver/location.ts`

## Scenario 1: App Open / Screen On

This is the most reliable case.

### How it works

- Driver goes online.
- App starts the driver service and also keeps a foreground location watcher active.
- Home screen watcher uses:
  - `timeInterval: 10000`
  - `distanceInterval: 20`
- While app state is `active`, the foreground watcher is allowed to publish directly.
- Foreground publish is throttled to about once every 10 seconds.
- Stationary drivers are also heartbeated now; movement is not required anymore for the foreground publish path.

### Current expected result

- `latitude` and `longitude` should update on server.
- `last_location_updated_at` should update about every 10 seconds while driver is online and the app is open.

### Main files

- `uk_drive_app/app/(tabs)/index.tsx`
- `uk_drive_app/lib/services/location.ts`
- `uk_drive_app/lib/services/driver-location-updater.ts`

## Scenario 2: App Minimized / Screen Off

This depends on Android background execution and Expo background location delivery.

### How it works

- App starts `Location.startLocationUpdatesAsync(...)` with task name `DRIVER_LOCATION_TASK`.
- A background task defined with `TaskManager.defineTask(...)` receives location callbacks.
- When a callback arrives:
  - task checks driver auth tokens
  - task calls `POST /api/driver/location`
  - server updates lat/long/time

### Current configuration

- Background task interval target:
  - `timeInterval: 10000`
- Distance gating removed for background task config:
  - `distanceInterval: 0`
- Accuracy:
  - `Location.Accuracy.Highest`
- Android foreground service:
  - shown while driver is available

### Current expected result

- Intended behavior:
  - server should continue receiving updates while app is minimized or screen is off
- Actual observed behavior on your device:
  - server time is not updating once app goes to background or screen turns off

### Important note

This means the app is not getting reliable background location callbacks from Android / Expo on the tested device, even though the foreground case works.

### Main files

- `uk_drive_app/lib/services/driver-foreground-service.ts`
- `uk_drive_app/app.json`

## Scenario 3: App Swiped Away / Killed From Recents

This is the least reliable case on Android.

### How it works

- App tries to keep the Android tracking service alive with:
  - `killServiceOnDestroy: false`
- If Android still keeps the foreground location service alive, the background task may continue to receive location callbacks.
- If Android/vendor kills the app process fully, updates stop.

### Current expected result

- Intended behavior:
  - app tries to continue background tracking
- Actual observed behavior on your device:
  - after swipe-away, server time is not updating

### Important note

Expo documentation already warns that Android behavior after removing from recents varies by device vendor, and terminated apps do not automatically restart on location events.

## Summary Table

| Scenario | Current Status | Expected Server Update |
| --- | --- | --- |
| App open / screen on | Working | About every 10 seconds |
| App minimized / screen off | Not working on tested device | Should continue, but currently does not |
| App swiped away / killed from recents | Not working on tested device | Not reliable on Android |

## Current Conclusion

- Foreground tracking is working.
- Server route is working.
- Heartbeat logic is working while app is active.
- The failing area is Android background delivery of location updates on the tested device.

## If We Need Stronger Reliability

If business requires updates when:

- app is minimized
- screen is off
- app may be swiped from recents

then the next likely step is a more native Android foreground-service implementation rather than relying only on the Expo background location task abstraction.
