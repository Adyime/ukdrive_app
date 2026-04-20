const required = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
];

const errors = [];
const warnings = [];

for (const key of required) {
  const value = (process.env[key] || "").trim();
  if (!value || value === "SET_IN_EAS_ENV") {
    errors.push(`${key} is missing or still set to SET_IN_EAS_ENV.`);
  }
}

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || "").trim();
if (apiUrl) {
  const isLocalhost =
    apiUrl.startsWith("http://localhost") ||
    apiUrl.startsWith("http://127.0.0.1");
  const isHttps = apiUrl.startsWith("https://");
  if (!isHttps && !isLocalhost) {
    errors.push(
      "EXPO_PUBLIC_API_URL must be HTTPS for real iPhone testing (ATS requirement)."
    );
  }
}

const iosPushPublic = (process.env.EXPO_PUBLIC_IOS_PUSH_ENABLED || "").trim();
const iosPushConfig = (process.env.EXPO_IOS_ONESIGNAL_ENABLED || "").trim();
const oneSignalAppId = (process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID || "").trim();

if (iosPushPublic === "true" || iosPushConfig === "true") {
  if (!oneSignalAppId || oneSignalAppId === "SET_IN_EAS_ENV") {
    errors.push(
      "EXPO_PUBLIC_ONESIGNAL_APP_ID is required when iOS push is enabled."
    );
  }
}

if (iosPushPublic && iosPushConfig && iosPushPublic !== iosPushConfig) {
  warnings.push(
    "EXPO_PUBLIC_IOS_PUSH_ENABLED and EXPO_IOS_ONESIGNAL_ENABLED differ. Runtime/build behavior may diverge."
  );
}

if (errors.length > 0) {
  console.error("[iOS env check] Failed:");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  if (warnings.length > 0) {
    console.error("[iOS env check] Warnings:");
    for (const message of warnings) {
      console.error(`- ${message}`);
    }
  }
  process.exit(1);
}

console.log("[iOS env check] OK");
if (warnings.length > 0) {
  for (const message of warnings) {
    console.warn(`- ${message}`);
  }
}
