const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Keep Expo's defaults intact and only append the monorepo root for workspace package watching.
config.watchFolders = Array.from(new Set([...(config.watchFolders ?? []), monorepoRoot]));

// Prefer the app-local node_modules path so native/runtime packages stay aligned with Expo SDK 55.
config.resolver.nodeModulesPaths = Array.from(
  new Set([path.resolve(projectRoot, "node_modules"), ...(config.resolver.nodeModulesPaths ?? [])])
);

module.exports = config;