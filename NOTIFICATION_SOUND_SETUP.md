# Incoming ride notifications (Android)

## Pop-up on screen when ride comes (like Uber driver)

So that the ride request **pops up on screen** when the app is minimised (heads-up / banner), you must create the **ride_request** channel in OneSignal with **Urgent** importance. Without this channel, the server returns an error and no notification is sent.

### OneSignal: Create the ride_request channel (required)

1. Go to [OneSignal](https://onesignal.com) → your app → **Settings** → **Push & In-App** → **Android** → **Notification channels** (or **Android Notification Channels**).
2. Click **Add Group** (e.g. name: "Ride requests"), then **Add Channel** inside it.
3. Set the channel exactly as below:

   | Field | Value |
   |-------|--------|
   | **Channel ID** | `ride_request` (must match exactly) |
   | **Channel name** | e.g. "Ride requests" |
   | **Importance** | **Urgent** (this makes it pop up on screen like Uber) |
   | **Sound** | Default, or Custom → `ukdrive` for your ringtone |
   | **Vibration** | Default (recommended) |
   | **Lockscreen visibility** | Public (optional, so driver sees it on lock screen) |

4. Save the channel. Then open the channel → **Edit** → copy the **Channel ID** (the UUID at the top; it is read-only). Use that UUID in `ONESIGNAL_RIDE_REQUEST_CHANNEL_ID` in the server `.env` (see Server section below).

**Why Urgent?** In OneSignal, **Urgent** = “Plays sound and appears as a heads-up or banner-style notification.” **High** does not show a pop-up. So use **Urgent** for the ride_request channel.

---

## Full-screen intent (WhatsApp-call style – window opens automatically)

When the driver’s app is **minimised** and a ride request arrives, the **ride accept/reject screen can open automatically** in a window (like an incoming WhatsApp call), without the driver tapping the notification.

This is done via the **full-screen intent** in the plugin `withRideRequestFullScreenIntent`:

- On prebuild/build it adds a OneSignal **Notification Service Extension** (Kotlin) that, for `incoming_ride` notifications, sets a full-screen intent so the system can show the app’s ride-incoming screen on top.
- The app already has the `USE_FULL_SCREEN_INTENT` permission in `app.json`.

**What you need to do:**

1. **New build:** Run `npx expo prebuild` (if you use a custom `android/` folder) or create a new build (e.g. `eas build` or `expo run:android`) so the plugin runs and the extension is included.
2. **Android 14+:** On some devices the user may need to allow full-screen intent: **Settings → Apps → UK Drive → Notifications →** enable **“Allow full screen intent”** or similar (wording may vary by OEM).
3. **Battery:** Turn off battery optimisation for UK Drive so the extension can run when the app is in the background.

After that, when a ride request arrives and the app is minimised, the system can open the ride-incoming screen automatically (and the existing notification + sound still work as before).

**Agar popup / full-screen window nahi khul raha:**

1. **Naya build lo** – Plugin tabhi apply hota hai jab `npx expo prebuild` ya naya EAS/local build chalta hai. Purana build use kar rahe ho to pehle clean prebuild karke naya build banao.
2. **Full-screen intent allow karo** – **Settings → Apps → UK Drive → Notifications** me **“Allow full screen intent”** / **“Display over other apps”** / **“Show on lock screen”** enable karo (device ke hisaab se option naam alag ho sakta hai).
3. **Battery optimisation** – UK Drive ke liye battery optimisation off karo.
4. **Notification tap** – Agar full-screen window na bhi khule, to **notification tap** karne par ab app **ride-incoming** screen khol deti hai (deep link handle ho raha hai). Toh driver ko Accept/Dismiss screen phir bhi mil jayegi.

---

## Notifications when app is minimised

With the **ride_request** channel (Urgent), when a ride request arrives the notification will:

- Appear as a **heads-up / banner** on screen (pop-up), not only in the notification drawer.
- Play sound continuously in a loop until the driver accepts, dismisses, or the request times out.
- Let the driver tap to open the app to the incoming-ride screen, or use Accept/Dismiss from the notification.

If you don’t see the pop-up:

- Ensure the **ride_request** channel exists in OneSignal with **Importance = Urgent**.
- Allow notifications for UK Drive (Settings → Apps → UK Drive → Notifications).
- Turn off battery optimisation for UK Drive.
- On some devices (e.g. Xiaomi): enable **Display pop-up** or **Show on lock screen** for UK Drive.

---

## Custom notification sound (optional)

To use your own sound (e.g. `ukdrive.mp3`) for ride requests:

1. In the **ride_request** channel (see above), set **Sound** → **Custom** and **Custom sound** → `ukdrive` (no file extension).
2. Rebuild the app so the Expo plugin copies the file: the plugin `withAndroidRideRequestSound` puts `assets/ukdrive.mp3` into `android/app/src/main/res/raw/ukdrive.mp3` at prebuild. Run `npx expo prebuild` or create a new build (e.g. `eas build` or `expo run:android`).

**Server:** By default the server does *not* send `android_channel_id` for ride requests, so notifications use the default channel and deliver even if the ride_request channel doesn’t exist. To enable the pop-up channel, create the **ride_request** channel in OneSignal (see above), then set in the server `.env`:

```env
ONESIGNAL_RIDE_REQUEST_CHANNEL_ENABLED=true
ONESIGNAL_RIDE_REQUEST_CHANNEL_ID=05e877aa-2629-41ab-811b-1fd409975ace
```
Replace the UUID with the **exact Channel ID** from the OneSignal Edit Channel modal (read-only UUID at top). Restart the server. If the channel ID is wrong, the API returns **400 "Could not find android_channel_id"**. If this is set to `true` but the channel doesn’t exist in OneSignal, the API returns **400 "Could not find android_channel_id"** and no push is sent.

## Build note

The looping ringtone and `DISMISS` action are implemented in the Android native code generated by the Expo config plugin. After changing this behavior, create a fresh Android build or run `npx expo prebuild` / `expo run:android` so the generated Kotlin files and manifest updates are applied.
