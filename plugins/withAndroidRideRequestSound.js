const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Copies assets/ukdrive.mp3 to Android res/raw so OneSignal
 * can use it for the ride_request notification channel.
 * In OneSignal Dashboard create channel "ride_request" with Sound: Custom, name "ukdrive".
 */
function withAndroidRideRequestSound(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const { platformProjectRoot, projectRoot } = config.modRequest;
      const sourceFile = path.join(projectRoot, "assets", "ukdrive.mp3");
      const rawDir = path.join(
        platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "raw"
      );
      const targetFile = path.join(rawDir, "ukdrive.mp3");

      if (!fs.existsSync(sourceFile)) {
        console.warn(
          "[withAndroidRideRequestSound] Sound file not found:",
          sourceFile
        );
        return config;
      }

      await fs.promises.mkdir(rawDir, { recursive: true });
      await fs.promises.copyFile(sourceFile, targetFile);

      // Prevent sound from being removed by resource shrinking (OneSignal recommendation)
      const keepPath = path.join(rawDir, "keep.xml");
      const keepXml = `<resources xmlns:tools="http://schemas.android.com/tools"
  tools:keep="@raw/ukdrive"/>
`;
      await fs.promises.writeFile(keepPath, keepXml);

      return config;
    },
  ]);
}

module.exports = withAndroidRideRequestSound;
