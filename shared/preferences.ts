import type { Coordinate, Vibe } from '../src/types';
export const DEFAULT_START: Coordinate = { latitude: 41.7011, longitude: 44.7933 };
export const VIBES: Vibe[] = ['Date', 'Friends', 'Family'];
export const VIBE_COPY = {
  Date: { caption: 'A little spark', activity: ['park', 'art_gallery', 'tourist_attraction'], drinks: ['cafe'] },
  Friends: { caption: 'A proper night out', activity: ['amusement_center', 'video_arcade', 'bowling_alley'], drinks: ['bar', 'pub', 'nightclub'] },
  Family: { caption: 'For every generation', activity: ['park', 'museum', 'amusement_park'], drinks: ['cafe', 'ice_cream_shop'] },
} as const;

export function priceLabel(level?: number): string { return level === undefined ? 'Price unknown' : level === 0 ? 'Free' : '$'.repeat(level); }
export function isAbortError(error: unknown): boolean { return error instanceof Error && error.name === 'AbortError'; }
