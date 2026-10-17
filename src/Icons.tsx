import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
export type IconName = 'route' | 'heart' | 'users' | 'sun' | 'pin' | 'spark' | 'arrow' | 'target' | 'walk' | 'star' | 'coffee' | 'food' | 'activity' | 'chevron' | 'check' | 'drink' | 'music';
const paths: Record<IconName, string> = {
  route: 'M5 6h9a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8M5 3v6M2 6h6M14 19l3 3-3 3',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  spark: 'm12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  target: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z',
  walk: 'm13 7-3 5 4 3-2 6M10 12l-4 3-2 5M13 7l3 5h4M9 4h.01M15 3h.01',
  star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9L12 3Z',
  drink: 'M4 3h16l-8 9-8-9ZM12 12v9M8 21h8M7 6h10',
  music: 'M9 18V5l11-2v13M9 5l11-2M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3ZM20 16a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z',
  coffee: 'M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8ZM16 8h2a3 3 0 0 1 0 6h-2M6 2v3M10 2v3M14 2v3',
  food: 'M4 3v6a3 3 0 0 0 6 0V3M7 3v19M20 22V3c-4 2-5 7-4 11h4',
  activity: 'm3 17 6-9 4 6 3-4 5 7H3ZM9 4h.01M18 3v3M16.5 4.5h3',
  chevron: 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
};
export function Icon({ name, size = 22, color = '#D8F89B' }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={paths[name]} />{name === 'walk' && <Circle cx={14} cy={3} r={2} fill={color} stroke="none" />}</Svg>;
}
