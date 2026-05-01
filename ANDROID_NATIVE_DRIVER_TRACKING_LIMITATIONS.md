# Android Native Driver Tracking Notes

This app now has a native Android foreground location service for driver tracking.

What it improves:
- When a driver is online, Android can keep location tracking alive more reliably while the app is minimized.
- Screen-off behavior is usually better than the Expo background-task path because tracking is anchored to a native foreground service and notification.
- Native Android code is generated during prebuild by `plugins/withNativeDriverLocationService.js`; the checked-in JS calls this service only on Android and keeps the existing foreground watcher as an app-open fallback.

What is still not guaranteed:
- If the app is removed from recents, Android may still stop or delay the service on some devices.
- Some OEM battery managers can stop foreground services unless the app is exempted from battery optimization.
- If the device loses network or location permission, server heartbeats will still stop until Android can deliver location updates again.

Important operational notes:
- Drivers should grant `Allow all the time` location access on Android.
- The persistent foreground-service notification should stay visible while the driver is online.
- Swipe-away continuation is best-effort only and depends on Android/vendor policy.
