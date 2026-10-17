import { Platform } from 'react-native';
export const API_BASE = Platform.OS === 'web' && !__DEV__ ? '' : (process.env.EXPO_PUBLIC_API_BASE_URL || (Platform.OS === 'web' ? '' : 'http://127.0.0.1:63119')).replace(/\/+$/, '');
export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
