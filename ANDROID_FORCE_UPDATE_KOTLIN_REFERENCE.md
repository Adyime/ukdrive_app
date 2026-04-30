# Android Force Update Reference

This repo's runtime app implementation is in React Native/Expo, but if you also want a native Android version, the same server contract can be used from Kotlin.

## API response model

`GET /api/version/android`

```json
{
  "success": true,
  "data": {
    "platform": "android",
    "latestVersionCode": 72,
    "minimumRequiredVersionCode": 70,
    "packageName": "com.wnapp.id1755261066753",
    "playStoreUrl": "https://play.google.com/store/apps/details?id=com.wnapp.id1755261066753"
  }
}
```

## Retrofit models

```kotlin
data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val error: ApiError?
)

data class ApiError(
    val code: String,
    val message: String
)

data class AndroidAppVersionResponse(
    val platform: String,
    val latestVersionCode: Int,
    val minimumRequiredVersionCode: Int,
    val packageName: String,
    val playStoreUrl: String
)
```

## Retrofit service

```kotlin
interface VersionApiService {
    @GET("api/version/android")
    suspend fun getAndroidVersion(): ApiResponse<AndroidAppVersionResponse>
}
```

## Version comparison

```kotlin
enum class UpdateType {
    UP_TO_DATE,
    OPTIONAL,
    REQUIRED
}

fun resolveUpdateType(
    installedVersionCode: Int,
    remote: AndroidAppVersionResponse
): UpdateType {
    return when {
        installedVersionCode < remote.minimumRequiredVersionCode -> UpdateType.REQUIRED
        installedVersionCode < remote.latestVersionCode -> UpdateType.OPTIONAL
        else -> UpdateType.UP_TO_DATE
    }
}
```

## Installed version code

```kotlin
fun getInstalledVersionCode(context: Context): Int {
    val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
    return PackageInfoCompat.getLongVersionCode(packageInfo).toInt()
}
```

## Play Store redirect

```kotlin
fun openPlayStore(context: Context, packageName: String, fallbackUrl: String) {
    val marketIntent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("market://details?id=$packageName")
    ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    val webIntent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse(fallbackUrl)
    ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    runCatching {
        context.startActivity(marketIntent)
    }.onFailure {
        context.startActivity(webIntent)
    }
}
```

## Activity usage

```kotlin
lifecycleScope.launch {
    runCatching {
        val response = versionApiService.getAndroidVersion()
        val remote = response.data ?: return@launch
        val installedVersionCode = getInstalledVersionCode(this@MainActivity)

        when (resolveUpdateType(installedVersionCode, remote)) {
            UpdateType.REQUIRED -> {
                showForceUpdateDialog(
                    onUpdateNow = {
                        openPlayStore(
                            this@MainActivity,
                            remote.packageName,
                            remote.playStoreUrl
                        )
                    }
                )
            }
            UpdateType.OPTIONAL -> {
                showOptionalUpdateDialog(
                    onUpdateNow = {
                        openPlayStore(
                            this@MainActivity,
                            remote.packageName,
                            remote.playStoreUrl
                        )
                    },
                    onSkip = {
                        // continue using app
                    }
                )
            }
            UpdateType.UP_TO_DATE -> Unit
        }
    }.onFailure {
        // API failure must not block the user
    }
}
```

## Non-dismissible force update dialog

```kotlin
fun showForceUpdateDialog(
    activity: Activity,
    onUpdateNow: () -> Unit
) {
    MaterialAlertDialogBuilder(activity)
        .setTitle("Update Required")
        .setMessage("This version of UK Drive is no longer supported. Update now to continue.")
        .setCancelable(false)
        .setPositiveButton("Update Now") { _, _ -> onUpdateNow() }
        .show()
}
```

## Optional update dialog

```kotlin
fun showOptionalUpdateDialog(
    activity: Activity,
    onUpdateNow: () -> Unit,
    onSkip: () -> Unit
) {
    MaterialAlertDialogBuilder(activity)
        .setTitle("Update Available")
        .setMessage("A newer version of UK Drive is available.")
        .setPositiveButton("Update Now") { _, _ -> onUpdateNow() }
        .setNegativeButton("Skip") { _, _ -> onSkip() }
        .setCancelable(true)
        .show()
}
```
