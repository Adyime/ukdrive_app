import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const expoGradlePluginRoot = path.join(
  appRoot,
  'node_modules',
  'expo-modules-autolinking',
  'android',
  'expo-gradle-plugin'
);

const rootBuildFile = path.join(expoGradlePluginRoot, 'build.gradle.kts');
const sharedBuildFile = path.join(
  expoGradlePluginRoot,
  'expo-autolinking-plugin-shared',
  'build.gradle.kts'
);

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

const rootBuild = readText(rootBuildFile);
const sharedBuild = readText(sharedBuildFile);

const kotlinVersionMatch = rootBuild.match(/kotlin\("jvm"\)\s+version\s+"([^"]+)"/);

if (!kotlinVersionMatch) {
  throw new Error(`Could not find root Kotlin version in ${rootBuildFile}`);
}

const kotlinVersion = kotlinVersionMatch[1];
const serializationVersionMatch = sharedBuild.match(
  /kotlin\("plugin\.serialization"\)\s+version\s+"([^"]+)"/
);

if (!serializationVersionMatch) {
  throw new Error(`Could not find serialization plugin version in ${sharedBuildFile}`);
}

const currentSerializationVersion = serializationVersionMatch[1];

if (currentSerializationVersion === kotlinVersion) {
  console.log(
    `[postinstall] Expo autolinking Kotlin plugin already aligned at ${kotlinVersion}.`
  );
  process.exit(0);
}

const nextSharedBuild = sharedBuild.replace(
  /kotlin\("plugin\.serialization"\)\s+version\s+"[^"]+"/,
  `kotlin("plugin.serialization") version "${kotlinVersion}"`
);

writeFileSync(sharedBuildFile, nextSharedBuild);

console.log(
  `[postinstall] Patched Expo autolinking Kotlin serialization plugin from ${currentSerializationVersion} to ${kotlinVersion}.`
);
