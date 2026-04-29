const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function buildNotificationExtensionKotlin(packageName) {
  return `package ${packageName}

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.annotation.Keep
import androidx.core.app.NotificationCompat
import com.onesignal.notifications.INotificationReceivedEvent
import com.onesignal.notifications.INotificationServiceExtension
import java.time.Instant
import org.json.JSONObject

@Keep
class RideRequestNotificationExtension : INotificationServiceExtension {

    companion object {
        private const val CHANNEL_ID = "ride_request_fullscreen_v4"
        private const val CHANNEL_NAME = "Ride Requests"
        private const val TIMEOUT_MS = 20_000L
        private const val DEDUPE_PREFS = "ride_request_notification_dedupe"
        private const val DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000L
        private const val RIDE_GUARD_PREFS = "ride_notification_guard"
        private const val ACTIVE_RIDE_KEY = "activeRideId"
        private const val HANDLED_PREFIX = "ride:"
        private const val LEGACY_HANDLED_VALUE = "handled"
        // Closed/background delivery can be delayed by Doze/OEM battery policies.
        // Keep this below the 5-minute ride request expiry, but much higher than 20s.
        private const val MAX_NOTIFICATION_AGE_MS = 4 * 60 * 1000L
        private val DEDUPE_LOCK = Any()
    }

    override fun onNotificationReceived(event: INotificationReceivedEvent) {
        val notification = event.notification
        val context = event.context
        val additionalData = notification.additionalData ?: return

        val notificationType = additionalData.optString("notificationType", "")
        val type = additionalData.optString("type", "")
        if (isTerminalIncomingEvent(notificationType, type)) {
            IncomingRequestSoundController.stop()
            clearIncomingRequestNotifications(context)
            return
        }

        val hasRideRequest = notificationType == "incoming_ride" ||
            type == "ride_request"
        val hasPorterRequest = notificationType == "incoming_porter" ||
            type == "porter_request"

        // ride_handled_clear: the accepting driver cancelled — clear stale "handled" state
        // so the re-dispatched notification can come through
        val isHandledClear = notificationType == "ride_handled_clear" ||
            type == "ride_handled_clear"
        if (isHandledClear) {
            val rideId = additionalData.optString("rideId", "").ifBlank { null }
            if (rideId != null) {
                context.getSharedPreferences(RIDE_GUARD_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .remove(HANDLED_PREFIX + rideId)
                    .apply()
            }
            return
        }

        if (!hasRideRequest && !hasPorterRequest) return

        val requestId = if (hasRideRequest) {
            additionalData.optString("rideId", "").ifBlank { null }
        } else {
            additionalData.optString("porterServiceId", "").ifBlank { null }
        } ?: return

        if (hasRideRequest && shouldSkipRideRequest(context, requestId, additionalData)) {
            return
        }

        val notificationTimestamp = extractNotificationTimestamp(additionalData)
        val dedupeKey = buildDedupeKey(
            if (hasRideRequest) "ride" else "porter",
            requestId,
            notificationTimestamp
        )
        if (shouldSkipDuplicate(context, dedupeKey)) {
            return
        }

        IncomingRequestSoundController.start(context, TIMEOUT_MS)

        val pickup = additionalData.optString("pickupLocation", "")
        val destination = if (hasRideRequest) {
            additionalData.optString("destination", "")
        } else {
            additionalData.optString("deliveryLocation", "")
        }
        val fare = additionalData.optString("estimatedFare", additionalData.optString("fare", ""))
        val sentAt = additionalData.optString("sentAt", additionalData.optString("sent_at", ""))

        ensureRideRequestChannel(context)

        val launchIntent = Intent(context, RideIncomingProxyActivity::class.java).apply {
            putExtra("rideId", if (hasRideRequest) requestId else "")
            putExtra("porterServiceId", if (hasPorterRequest) requestId else "")
            putExtra("pickupLocation", pickup)
            putExtra("destination", destination)
            putExtra("fare", fare)
            putExtra("sentAt", sentAt)
            putExtra("isRideRequest", hasRideRequest)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else PendingIntent.FLAG_IMMUTABLE)
        val contentIntent = PendingIntent.getActivity(context, requestId.hashCode(), launchIntent, flags)
        val deleteIntent = PendingIntent.getBroadcast(
            context,
            requestId.hashCode() + 1,
            Intent(context, IncomingRequestNotificationDeleteReceiver::class.java),
            flags
        )
        val allowFullScreen = canUseFullScreenIntent(context)

        notification.setExtender { builder ->
            builder
                .setChannelId(CHANNEL_ID)
                .setContentIntent(contentIntent)
                .setDeleteIntent(deleteIntent)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(false)
                .setOngoing(true)
                .setTimeoutAfter(TIMEOUT_MS)
                .setVibrate(longArrayOf(0, 350, 250, 350))
                .apply {
                    if (allowFullScreen) {
                        setFullScreenIntent(contentIntent, true)
                    }
                }
        }
    }

    private fun shouldSkipRideRequest(
        context: Context,
        rideId: String,
        additionalData: JSONObject
    ): Boolean {
        val prefs = context.getSharedPreferences(RIDE_GUARD_PREFS, Context.MODE_PRIVATE)

        val handledKey = HANDLED_PREFIX + rideId
        val handledState = prefs.getString(handledKey, null)
        val handledAtMs = parseHandledAt(handledState)
        val sentAtMs = extractNotificationTimestamp(additionalData)

        if (handledAtMs != null && (sentAtMs == null || sentAtMs <= handledAtMs)) {
            return true
        }

        val activeRideId = prefs.getString(ACTIVE_RIDE_KEY, null)
        if (!activeRideId.isNullOrBlank() && activeRideId == rideId) {
            return true
        }

        if (sentAtMs != null) {
            val ageMs = System.currentTimeMillis() - sentAtMs
            if (ageMs > MAX_NOTIFICATION_AGE_MS) {
                return true
            }
        }

        return false
    }

    private fun extractNotificationTimestamp(additionalData: JSONObject): Long? {
        val candidates = listOf("sentAt", "sent_at", "createdAt", "created_at")

        for (key in candidates) {
            if (!additionalData.has(key)) continue
            val parsed = parseTimestamp(additionalData.opt(key))
            if (parsed != null) {
                return parsed
            }
        }

        return null
    }

    private fun parseHandledAt(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        if (value == LEGACY_HANDLED_VALUE) return 1L
        return value.toLongOrNull()?.takeIf { it > 0L }
    }

    private fun parseTimestamp(value: Any?): Long? {
        when (value) {
            is Number -> {
                var ts = value.toLong()
                if (ts in 1_000_000_000L..9_999_999_999L) {
                    ts *= 1000
                }
                return if (ts > 1_000_000_000_000L) ts else null
            }
            is String -> {
                val trimmed = value.trim()
                if (trimmed.isEmpty()) return null

                val asLong = trimmed.toLongOrNull()
                if (asLong != null) {
                    return parseTimestamp(asLong)
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        return Instant.parse(trimmed).toEpochMilli()
                    } catch (_: Throwable) {
                    }
                }
            }
        }
        return null
    }

    private fun ensureRideRequestChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return

        val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Incoming ride requests"
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 350, 250, 350)
            // Native looping audio is handled by IncomingRequestSoundController.
            // Keep the notification channel silent so Android does not add a second one-shot sound.
            setSound(null, null)
        }

        manager.createNotificationChannel(channel)
    }

    private fun canUseFullScreenIntent(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
        return manager.canUseFullScreenIntent()
    }

    private fun buildDedupeKey(kind: String, requestId: String, notificationTimestamp: Long?): String {
        val baseKey = kind + ":" + requestId
        return if (notificationTimestamp != null && notificationTimestamp > 0L) {
            baseKey + ":" + notificationTimestamp
        } else {
            baseKey
        }
    }

    private fun shouldSkipDuplicate(context: Context, dedupeKey: String): Boolean {
        synchronized(DEDUPE_LOCK) {
            val prefs = context.getSharedPreferences(DEDUPE_PREFS, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            val lastShownAt = prefs.getLong(dedupeKey, 0L)

            if (lastShownAt > 0L && now - lastShownAt <= DEDUPE_WINDOW_MS) {
                return true
            }

            // Write immediately so concurrent callbacks for the same ride/porter
            // cannot both pass dedupe before the timestamp is saved.
            prefs.edit().putLong(dedupeKey, now).commit()
            return false
        }
    }

    private fun isTerminalIncomingEvent(notificationType: String, type: String): Boolean {
        val normalizedType = type.trim().lowercase()
        val normalizedNotificationType = notificationType.trim().lowercase()

        val terminalTypes = setOf(
            "ride_request_dismissed",
            "ride_request_cancelled",
            "ride_cancelled",
            "ride_dismissed",
            "porter_request_dismissed",
            "porter_request_cancelled",
            "porter_dismissed",
            "porter_cancelled"
        )
        val terminalNotificationTypes = setOf(
            "ride_dismissed",
            "ride_cancelled",
            "porter_dismissed",
            "porter_cancelled"
        )

        return normalizedType in terminalTypes ||
            normalizedNotificationType in terminalNotificationTypes
    }

    private fun clearIncomingRequestNotifications(context: Context) {
        try {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            manager?.cancelAll()
        } catch (_: Throwable) {
        }
    }
}
`;
}

function buildIncomingRequestSoundControllerKotlin(packageName) {
  return `package ${packageName}

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.Keep

@Keep
object IncomingRequestSoundController {
    private val lock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())

    private var mediaPlayer: MediaPlayer? = null
    private var scheduledStop: Runnable? = null

    fun start(context: Context) {
        start(context, null)
    }

    fun start(context: Context, timeoutMs: Long?) {
        val appContext = context.applicationContext

        synchronized(lock) {
            stopLocked()

            val resId = appContext.resources.getIdentifier("ukdrive", "raw", appContext.packageName)
            if (resId == 0) {
                return
            }

            val player = MediaPlayer.create(appContext, resId) ?: return

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    player.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                }

                player.isLooping = true
                player.setOnErrorListener { mp, _, _ ->
                    synchronized(lock) {
                        if (mediaPlayer === mp) {
                            stopLocked()
                        } else {
                            try {
                                mp.reset()
                                mp.release()
                            } catch (_: Throwable) {
                            }
                        }
                    }
                    true
                }
                player.start()
            } catch (_: Throwable) {
                try {
                    player.release()
                } catch (_: Throwable) {
                }
                return
            }

            mediaPlayer = player
            scheduleStopLocked(timeoutMs)
        }
    }

    fun stop() {
        synchronized(lock) {
            stopLocked()
        }
    }

    private fun stopLocked() {
        clearScheduledStopLocked()

        mediaPlayer?.let { player ->
            try {
                if (player.isPlaying) {
                    player.stop()
                }
            } catch (_: Throwable) {
            }

            try {
                player.reset()
            } catch (_: Throwable) {
            }

            try {
                player.release()
            } catch (_: Throwable) {
            }
        }

        mediaPlayer = null
    }

    private fun scheduleStopLocked(timeoutMs: Long?) {
        clearScheduledStopLocked()
        if (timeoutMs == null || timeoutMs <= 0L) {
            return
        }

        val runnable = Runnable {
            stop()
        }
        scheduledStop = runnable
        mainHandler.postDelayed(runnable, timeoutMs)
    }

    private fun clearScheduledStopLocked() {
        scheduledStop?.let { runnable ->
            mainHandler.removeCallbacks(runnable)
        }
        scheduledStop = null
    }
}
`;
}

function buildIncomingRequestNotificationDeleteReceiverKotlin(packageName) {
  return `package ${packageName}

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.annotation.Keep

@Keep
class IncomingRequestNotificationDeleteReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        IncomingRequestSoundController.stop()
    }
}
`;
}

function buildProxyActivityKotlin(packageName) {
  return `package ${packageName}

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.annotation.Keep

@Keep
class RideIncomingProxyActivity : Activity() {
    companion object {
        private const val RIDE_GUARD_PREFS = "ride_notification_guard"
        private const val ACTIVE_RIDE_KEY = "activeRideId"
        private const val HANDLED_PREFIX = "ride:"
        private const val LEGACY_HANDLED_VALUE = "handled"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }

        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )

        openIncomingScreen()
    }

    override fun onDestroy() {
        IncomingRequestSoundController.stop()
        super.onDestroy()
    }

    private fun shouldIgnoreRideRequest(rideId: String, sentAtRaw: String?): Boolean {
        val prefs = getSharedPreferences(RIDE_GUARD_PREFS, Context.MODE_PRIVATE)
        val handledAtMs = parseHandledAt(prefs.getString(HANDLED_PREFIX + rideId, null))
        val sentAtMs = parseTimestamp(sentAtRaw)
        if (handledAtMs != null && (sentAtMs == null || sentAtMs <= handledAtMs)) {
            return true
        }

        val activeRideId = prefs.getString(ACTIVE_RIDE_KEY, null)
        return !activeRideId.isNullOrBlank() && activeRideId == rideId
    }

    private fun parseHandledAt(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        if (value == LEGACY_HANDLED_VALUE) return 1L
        return value.toLongOrNull()?.takeIf { it > 0L }
    }

    private fun parseTimestamp(value: String?): Long? {
        if (value.isNullOrBlank()) return null

        val asLong = value.toLongOrNull()
        if (asLong != null) {
            return when {
                asLong > 1_000_000_000_000L -> asLong
                asLong > 1_000_000_000L -> asLong * 1000L
                else -> null
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                return java.time.Instant.parse(value).toEpochMilli()
            } catch (_: Throwable) {
            }
        }

        return null
    }

    private fun openIncomingScreen() {
        val rideId = intent?.getStringExtra("rideId").orEmpty()
        val porterServiceId = intent?.getStringExtra("porterServiceId").orEmpty()
        val pickup = intent?.getStringExtra("pickupLocation").orEmpty()
        val destination = intent?.getStringExtra("destination").orEmpty()
        val fare = intent?.getStringExtra("fare").orEmpty()
        val sentAt = intent?.getStringExtra("sentAt").orEmpty()
        val isRideRequest = intent?.getBooleanExtra("isRideRequest", true) ?: true

        if (isRideRequest && rideId.isNotBlank() && shouldIgnoreRideRequest(rideId, sentAt)) {
            finish()
            return
        }

        val uriBuilder = if (isRideRequest && rideId.isNotBlank()) {
            Uri.parse("ukdrive://ride-incoming").buildUpon()
                .appendQueryParameter("rideId", rideId)
                .appendQueryParameter("pickupLocation", pickup)
                .appendQueryParameter("destination", destination)
                .appendQueryParameter("fare", fare)
                .appendQueryParameter("sentAt", sentAt)
        } else {
            Uri.parse("ukdrive://porter-incoming").buildUpon()
                .appendQueryParameter("porterServiceId", porterServiceId)
                .appendQueryParameter("pickupLocation", pickup)
                .appendQueryParameter("deliveryLocation", destination)
                .appendQueryParameter("fare", fare)
        }

        val deepLinkIntent = Intent(Intent.ACTION_VIEW, uriBuilder.build()).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            addFlags(Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        }

        startActivity(deepLinkIntent)
        finish()
    }
}
`;
}

function buildRideNotificationGuardModuleKotlin(packageName) {
  return `package ${packageName}

import android.content.Context
import androidx.annotation.Keep
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

@Keep
class RideNotificationGuardModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val PREFS_NAME = "ride_notification_guard"
        private const val ACTIVE_RIDE_KEY = "activeRideId"
        private const val HANDLED_PREFIX = "ride:"
        private const val LEGACY_HANDLED_VALUE = "handled"
    }

    override fun getName(): String = "RideNotificationGuard"

    private fun prefs() =
        reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    @ReactMethod
    fun setRideHandled(rideId: String, handledAtMs: Double?, promise: Promise) {
        try {
            if (rideId.isBlank()) {
                promise.resolve(null)
                return
            }
            val handledAt = handledAtMs?.toLong()?.takeIf { it > 0L } ?: System.currentTimeMillis()
            prefs().edit().putString(HANDLED_PREFIX + rideId, handledAt.toString()).apply()
            promise.resolve(null)
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_SET_HANDLED_FAILED", error)
        }
    }

    @ReactMethod
    fun isRideHandled(rideId: String, sentAtMs: Double?, promise: Promise) {
        try {
            if (rideId.isBlank()) {
                promise.resolve(false)
                return
            }
            val value = prefs().getString(HANDLED_PREFIX + rideId, null)
            val handledAt = parseHandledAt(value)
            val sentAt = sentAtMs?.toLong()?.takeIf { it > 0L }
            promise.resolve(handledAt != null && (sentAt == null || sentAt <= handledAt))
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_IS_HANDLED_FAILED", error)
        }
    }

    @ReactMethod
    fun clearRideHandled(rideId: String, promise: Promise) {
        try {
            if (rideId.isNotBlank()) {
                prefs().edit().remove(HANDLED_PREFIX + rideId).apply()
            }
            promise.resolve(null)
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_CLEAR_HANDLED_FAILED", error)
        }
    }

    @ReactMethod
    fun setActiveRideId(rideId: String, promise: Promise) {
        try {
            if (rideId.isBlank()) {
                prefs().edit().remove(ACTIVE_RIDE_KEY).apply()
            } else {
                prefs().edit().putString(ACTIVE_RIDE_KEY, rideId).apply()
            }
            promise.resolve(null)
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_SET_ACTIVE_FAILED", error)
        }
    }

    @ReactMethod
    fun clearActiveRideId(promise: Promise) {
        try {
            prefs().edit().remove(ACTIVE_RIDE_KEY).apply()
            promise.resolve(null)
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_CLEAR_ACTIVE_FAILED", error)
        }
    }

    @ReactMethod
    fun getActiveRideId(promise: Promise) {
        try {
            promise.resolve(prefs().getString(ACTIVE_RIDE_KEY, null))
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_GET_ACTIVE_FAILED", error)
        }
    }

    @ReactMethod
    fun stopIncomingAlertSound(promise: Promise) {
        try {
            IncomingRequestSoundController.stop()
            promise.resolve(null)
        } catch (error: Throwable) {
            promise.reject("RIDE_GUARD_STOP_SOUND_FAILED", error)
        }
    }

    private fun parseHandledAt(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        if (value == LEGACY_HANDLED_VALUE) return 1L
        return value.toLongOrNull()?.takeIf { it > 0L }
    }
}
`;
}

function buildRideNotificationGuardPackageKotlin(packageName) {
  return `package ${packageName}

import androidx.annotation.Keep
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

@Keep
class RideNotificationGuardPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(RideNotificationGuardModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
}

function patchMainApplication(mainApplicationContent) {
  if (mainApplicationContent.includes("RideNotificationGuardPackage()")) {
    return mainApplicationContent;
  }

  if (mainApplicationContent.includes("// add(MyReactNativePackage())")) {
    return mainApplicationContent.replace(
      "// add(MyReactNativePackage())",
      "add(RideNotificationGuardPackage())"
    );
  }

  if (mainApplicationContent.includes("PackageList(this).packages.apply {")) {
    return mainApplicationContent.replace(
      "PackageList(this).packages.apply {",
      "PackageList(this).packages.apply {\n              add(RideNotificationGuardPackage())"
    );
  }

  return mainApplicationContent;
}

function withRideRequestFullScreenIntent(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const packageName = config.android?.package || "com.wnapp.id1755261066753";
      const packageSegments = packageName.split(".");

      const { platformProjectRoot } = config.modRequest;
      const packagePath = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...packageSegments
      );

      await fs.promises.mkdir(packagePath, { recursive: true });
      await fs.promises.writeFile(
        path.join(packagePath, "RideRequestNotificationExtension.kt"),
        buildNotificationExtensionKotlin(packageName),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(packagePath, "RideIncomingProxyActivity.kt"),
        buildProxyActivityKotlin(packageName),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(packagePath, "IncomingRequestSoundController.kt"),
        buildIncomingRequestSoundControllerKotlin(packageName),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(packagePath, "IncomingRequestNotificationDeleteReceiver.kt"),
        buildIncomingRequestNotificationDeleteReceiverKotlin(packageName),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(packagePath, "RideNotificationGuardModule.kt"),
        buildRideNotificationGuardModuleKotlin(packageName),
        "utf8"
      );
      await fs.promises.writeFile(
        path.join(packagePath, "RideNotificationGuardPackage.kt"),
        buildRideNotificationGuardPackageKotlin(packageName),
        "utf8"
      );

      const mainApplicationPath = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...packageSegments,
        "MainApplication.kt"
      );
      if (fs.existsSync(mainApplicationPath)) {
        const mainApplication = await fs.promises.readFile(mainApplicationPath, "utf8");
        const patchedMainApplication = patchMainApplication(mainApplication);
        if (patchedMainApplication !== mainApplication) {
          await fs.promises.writeFile(mainApplicationPath, patchedMainApplication, "utf8");
        }
      } else {
        console.warn("[withRideRequestFullScreenIntent] MainApplication.kt not found, skipping package registration");
      }

      const manifestPath = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "AndroidManifest.xml"
      );
      if (!fs.existsSync(manifestPath)) {
        console.warn("[withRideRequestFullScreenIntent] AndroidManifest.xml not found, skipping manifest updates");
        return config;
      }

      let manifest = await fs.promises.readFile(manifestPath, "utf8");

      const metaDataTag = `<meta-data android:name="com.onesignal.NotificationServiceExtension" android:value="${packageName}.RideRequestNotificationExtension" />`;
      if (!manifest.includes('android:name="com.onesignal.NotificationServiceExtension"')) {
        manifest = manifest.replace("</application>", `  ${metaDataTag}\n</application>`);
      }

      const proxyActivityTag =
        `<activity android:name=".RideIncomingProxyActivity" android:exported="false" android:excludeFromRecents="true" android:launchMode="singleTop" android:showOnLockScreen="true" android:turnScreenOn="true" android:theme="@android:style/Theme.Translucent.NoTitleBar" />`;
      if (!manifest.includes('android:name=".RideIncomingProxyActivity"')) {
        manifest = manifest.replace("</application>", `  ${proxyActivityTag}\n</application>`);
      }

      const deleteReceiverTag =
        `<receiver android:name=".IncomingRequestNotificationDeleteReceiver" android:exported="false" />`;
      if (!manifest.includes('android:name=".IncomingRequestNotificationDeleteReceiver"')) {
        manifest = manifest.replace("</application>", `  ${deleteReceiverTag}\n</application>`);
      }

      await fs.promises.writeFile(manifestPath, manifest, "utf8");

      return config;
    },
  ]);
}

module.exports = withRideRequestFullScreenIntent;
