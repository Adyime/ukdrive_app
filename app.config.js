const appJson = require("./app.json");

module.exports = ({ config }) => {
  const baseConfig = appJson.expo || config || {};
  const buildPlatform = (process.env.EAS_BUILD_PLATFORM || process.env.EXPO_OS || "").toLowerCase();
  const argv = process.argv.join(" ").toLowerCase();
  const isAndroidBuild =
    buildPlatform === "android" ||
    /\b(--platform|-p)\s+android\b/.test(argv);

  const plugins = (baseConfig.plugins || []).filter((pluginEntry) => {
    const pluginName = Array.isArray(pluginEntry) ? pluginEntry[0] : pluginEntry;
    // OneSignal plugin injects iOS NSE target with fixed bundle id.
    // Keep it only for Android builds to avoid iOS credential target conflicts.
    if (!isAndroidBuild && pluginName === "onesignal-expo-plugin") {
      return false;
    }
    return true;
  });
  const isProductionBuild =
    (process.env.EAS_BUILD_PROFILE || "").toLowerCase() === "production" ||
    process.env.NODE_ENV === "production";

  const googleMapsApiKey = (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();
  const hasValidGoogleMapsApiKey =
    googleMapsApiKey.length > 0 && googleMapsApiKey !== "SET_IN_EAS_ENV";

  if (isAndroidBuild && !hasValidGoogleMapsApiKey) {
    throw new Error(
      "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is required for Android builds because the app uses Google Maps. Set a real API key before running expo run:android or creating an EAS Android build."
    );
  }

  const allowCleartextTraffic = String(
    process.env.EXPO_ANDROID_USES_CLEARTEXT_TRAFFIC || "false"
  ).toLowerCase() === "true";
  if (isProductionBuild && allowCleartextTraffic) {
    throw new Error("EXPO_ANDROID_USES_CLEARTEXT_TRAFFIC=true is not allowed for production builds.");
  }

  const resolvedPlugins = plugins.map((pluginEntry) => {
    const pluginName = Array.isArray(pluginEntry) ? pluginEntry[0] : pluginEntry;
    if (pluginName !== "expo-build-properties") {
      return pluginEntry;
    }

    const existingConfig =
      Array.isArray(pluginEntry) && pluginEntry[1] && typeof pluginEntry[1] === "object"
        ? pluginEntry[1]
        : {};

    return [
      "expo-build-properties",
      {
        ...existingConfig,
        android: {
          ...(existingConfig.android || {}),
          usesCleartextTraffic: allowCleartextTraffic,
        },
      },
    ];
  });

  const withMapConfig = {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra || {}),
      ...(hasValidGoogleMapsApiKey ? { googleMapsApiKey } : {}),
    },
    ios: {
      ...(baseConfig.ios || {}),
      config: {
        ...((baseConfig.ios && baseConfig.ios.config) || {}),
        ...(hasValidGoogleMapsApiKey ? { googleMapsApiKey } : {}),
      },
    },
    android: {
      ...(baseConfig.android || {}),
      config: {
        ...((baseConfig.android && baseConfig.android.config) || {}),
        ...(hasValidGoogleMapsApiKey
          ? { googleMaps: { apiKey: googleMapsApiKey } }
          : {}),
      },
    },
  };

  return {
    ...withMapConfig,
    plugins: resolvedPlugins,
  };
};
