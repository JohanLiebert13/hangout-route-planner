import type { Coordinate } from '../src/types';
export function validCoordinate(p: Coordinate): boolean { return Number.isFinite(p?.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p?.longitude) && Math.abs(p.longitude) <= 180; }
export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const r = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function destination(start: Coordinate, meters: number, bearing: number): Coordinate {
  const r = Math.PI / 180, angle = meters / 6371000, heading = bearing * r, lat = start.latitude * r, lng = start.longitude * r;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(heading));
  const nextLng = lng + Math.atan2(Math.sin(heading) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
  return { latitude: nextLat / r, longitude: ((nextLng / r + 540) % 360) - 180 };
}
