module.exports = { expo: {
  name: 'Hangout Route Planner', slug: 'hangout-route-planner', version: '1.2.0',
  orientation: 'portrait', userInterfaceStyle: 'dark', backgroundColor: '#0D1312',
  ios: { supportsTablet: true, bundleIdentifier: 'com.hangout.routeplanner' },
  android: { package: 'com.hangout.routeplanner' },
  plugins: ['@maplibre/maplibre-react-native'],
  web: { name: 'Hangout Route Planner', bundler: 'metro' },
} };
