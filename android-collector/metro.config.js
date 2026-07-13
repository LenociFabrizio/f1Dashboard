// metro.config.js
// ------------------------------------------------------------
// Metro non risolve i prefissi `node:`. Il core del collector è già stato
// ripulito da questi import, ma mappiamo comunque buffer/events/dgram sui
// rispettivi shim come rete di sicurezza (e per eventuali dipendenze).
// ------------------------------------------------------------
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
  events: require.resolve('events'),
  dgram: require.resolve('react-native-udp'),
};

module.exports = config;
