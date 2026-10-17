import type { Coordinate, MapProps } from '../src/types';
export function radiusFeature(start: Coordinate, radius: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const r = Math.PI / 180, angle = radius / 6371000, lat = start.latitude * r, lng = start.longitude * r;
  const coordinates: number[][] = [];
  for (let i = 0; i <= 64; i++) {
    const heading = i / 64 * Math.PI * 2;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(heading));
    const nextLng = lng + Math.atan2(Math.sin(heading) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
    coordinates.push([nextLng / r, nextLat / r]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } };
}
export function routeFeature(props: MapProps): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return { type: 'FeatureCollection', features: props.route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: props.route.coordinates.map(p => [p.longitude, p.latitude]) } }] : [] };
}
export function mapBounds(props: MapProps): [number, number, number, number] {
  const positions = props.stops.length ? [props.start, ...props.stops.map(s => s.coordinate), ...(props.route?.coordinates || [])].map(p => [p.longitude, p.latitude]) : radiusFeature(props.start, props.radius).geometry.coordinates[0];
  const longitudes = positions.map(p => props.start.longitude + ((p[0] - props.start.longitude + 540) % 360) - 180);
  return [Math.min(...longitudes), Math.min(...positions.map(p => p[1])), Math.max(...longitudes), Math.max(...positions.map(p => p[1]))];
}
