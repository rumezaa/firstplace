const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);
const nativewindConfig = withNativewind(config);

// NativeWind redirects `react-native` imports through its own wrapper so
// className works everywhere. expo-asset (used by expo-font for the icon
// fonts) needs the real module's AssetRegistry, which the wrapper doesn't hand
// through on React Native 0.88 ("Cannot read property 'getAssetByID' of
// undefined"). Send expo-asset's `react-native` import straight to the real
// package; everything else keeps NativeWind's resolution.
const REAL_RN = path.join(__dirname, 'node_modules/react-native/index.js');
const nativewindResolve = nativewindConfig.resolver.resolveRequest;

nativewindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'react-native' &&
    platform !== 'web' &&
    /[\\/]expo-asset[\\/]/.test(context.originModulePath)
  ) {
    return { type: 'sourceFile', filePath: REAL_RN };
  }
  return nativewindResolve
    ? nativewindResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = nativewindConfig;
