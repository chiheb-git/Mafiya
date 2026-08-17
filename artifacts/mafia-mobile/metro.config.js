const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const videoExtensions = ['mp4', 'mov', 'webm', 'm4v'];
config.resolver.assetExts = Array.from(
  new Set([...config.resolver.assetExts, ...videoExtensions])
);

module.exports = config;
