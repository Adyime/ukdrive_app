const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const TEMPLATE_DIR = path.join(__dirname, "native-driver-location");
const KOTLIN_FILES = [
  "DriverLocationForegroundService.kt",
  "DriverLocationRestartReceiver.kt",
  "DriverLocationServiceModule.kt",
  "DriverLocationServicePackage.kt",
  "DriverLocationTrackingStore.kt",
];

function ensureManifestPermission(manifest, permissionName) {
  if (manifest.includes(`android:name="${permissionName}"`)) {
    return manifest;
  }
  return manifest.replace(
    "<manifest",
    `<manifest`
  ).replace(
    /(<manifest[^>]*>)/,
    `$1\n  <uses-permission android:name="${permissionName}"/>`
  );
}

function ensureApplicationTag(manifest, tag, marker) {
  if (manifest.includes(marker)) {
    return manifest;
  }
  return manifest.replace("</application>", `    ${tag}\n  </application>`);
}

function patchMainApplication(content) {
  if (content.includes("DriverLocationServicePackage()")) {
    return content;
  }

  if (content.includes("// add(MyReactNativePackage())")) {
    return content.replace(
      "// add(MyReactNativePackage())",
      "add(DriverLocationServicePackage())"
    );
  }

  if (content.includes("PackageList(this).packages.apply {")) {
    return content.replace(
      "PackageList(this).packages.apply {",
      "PackageList(this).packages.apply {\n              add(DriverLocationServicePackage())"
    );
  }

  return content;
}

function patchBuildGradle(content) {
  const dependency = 'implementation("com.google.android.gms:play-services-location:21.3.0")';
  if (content.includes("play-services-location")) {
    return content;
  }

  return content.replace(
    /dependencies\s*\{/,
    `dependencies {\n    ${dependency}`
  );
}

function withNativeDriverLocationService(config) {
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

      for (const fileName of KOTLIN_FILES) {
        const templatePath = path.join(TEMPLATE_DIR, `${fileName}.template`);
        const targetPath = path.join(packagePath, fileName);
        const template = await fs.promises.readFile(templatePath, "utf8");
        await fs.promises.writeFile(
          targetPath,
          template.replaceAll("__PACKAGE__", packageName),
          "utf8"
        );
      }

      const mainApplicationPath = path.join(packagePath, "MainApplication.kt");
      if (fs.existsSync(mainApplicationPath)) {
        const mainApplication = await fs.promises.readFile(mainApplicationPath, "utf8");
        const patched = patchMainApplication(mainApplication);
        if (patched !== mainApplication) {
          await fs.promises.writeFile(mainApplicationPath, patched, "utf8");
        }
      } else {
        console.warn("[withNativeDriverLocationService] MainApplication.kt not found; native module registration skipped");
      }

      const buildGradlePath = path.join(platformProjectRoot, "app", "build.gradle");
      if (fs.existsSync(buildGradlePath)) {
        const buildGradle = await fs.promises.readFile(buildGradlePath, "utf8");
        const patched = patchBuildGradle(buildGradle);
        if (patched !== buildGradle) {
          await fs.promises.writeFile(buildGradlePath, patched, "utf8");
        }
      } else {
        console.warn("[withNativeDriverLocationService] app/build.gradle not found; Fused Location dependency skipped");
      }

      const manifestPath = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "AndroidManifest.xml"
      );
      if (!fs.existsSync(manifestPath)) {
        console.warn("[withNativeDriverLocationService] AndroidManifest.xml not found; manifest updates skipped");
        return config;
      }

      let manifest = await fs.promises.readFile(manifestPath, "utf8");
      [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION",
        "android.permission.INTERNET",
      ].forEach((permission) => {
        manifest = ensureManifestPermission(manifest, permission);
      });

      manifest = ensureApplicationTag(
        manifest,
        `<receiver android:name=".DriverLocationRestartReceiver" android:enabled="true" android:exported="false" />`,
        'android:name=".DriverLocationRestartReceiver"'
      );
      manifest = ensureApplicationTag(
        manifest,
        `<service android:name=".DriverLocationForegroundService" android:enabled="true" android:exported="false" android:foregroundServiceType="location" android:stopWithTask="false" />`,
        'android:name=".DriverLocationForegroundService"'
      );

      await fs.promises.writeFile(manifestPath, manifest, "utf8");
      return config;
    },
  ]);
}

module.exports = withNativeDriverLocationService;
