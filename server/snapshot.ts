import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { validCoordinate } from './geo.ts';
import type { Coordinate } from '../src/types';
export type VenueSnapshot = { center: Coordinate; coverageRadius: number; dataAsOf: string; elements: unknown[] };
export function loadBundledSnapshot(): VenueSnapshot | null {
  try {
    const data = JSON.parse(readFileSync(new URL('../data/tbilisi-osm.json', import.meta.url), 'utf8'));
    if (!validCoordinate(data.center) || !Number.isFinite(data.coverageRadius) || data.coverageRadius <= 0 || !Number.isFinite(Date.parse(data.dataAsOf)) || !Array.isArray(data.elements)) return null;
    return data;
  } catch { return null; }
}
