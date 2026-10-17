import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as LibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './map-overrides.css';
import OfflineMap from './OfflineMap';
import { mapBounds, radiusFeature, routeFeature } from '../shared/map-geometry';
import type { MapProps } from './types';
const COLORS = ['#D7F99A', '#F0BD91', '#BEB3F9'];
function BrowserMap(props: MapProps) {
  const container = useRef<HTMLDivElement>(null), map = useRef<LibreMap | null>(null);
  const latest = useRef(props); latest.current = props;
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!container.current) return;
    let disposed = false, styleLoaded = false;
    setError(''); setReady(false); latest.current.onReadyChange?.(false);
    const fail = () => { if (!disposed) { setError('Basemap unavailable. Showing a schematic; real venue search still works.'); latest.current.onReadyChange?.(false); } };
    const timer = setTimeout(fail, 15000);
    try {
      const current = new maplibregl.Map({ container: container.current, style: props.mapStyleUrl,
        center: [latest.current.start.longitude, latest.current.start.latitude], zoom: 15, attributionControl: { compact: true },
        dragRotate: false, pitchWithRotate: false, touchPitch: false, maxPitch: 0 });
      map.current = current;
      current.touchZoomRotate.disableRotation();
      current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      current.on('style.load', () => { styleLoaded = true; });
      current.on('error', () => { if (!styleLoaded) { clearTimeout(timer); fail(); } });
      current.on('click', event => latest.current.onStartChange({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }));
      current.once('load', () => {
        if (disposed) return;
        clearTimeout(timer);
        current.addSource('hangout-radius', { type: 'geojson', data: radiusFeature(latest.current.start, latest.current.radius) });
        current.addLayer({ id: 'radius-fill', source: 'hangout-radius', type: 'fill', paint: { 'fill-color': '#D7F99A', 'fill-opacity': 0.04 } });
        current.addLayer({ id: 'radius-border', source: 'hangout-radius', type: 'line', paint: { 'line-color': '#D7F99A', 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [3, 4] } });
        current.addSource('hangout-route', { type: 'geojson', data: routeFeature(latest.current) });
        current.addLayer({ id: 'walking-route', source: 'hangout-route', type: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D7F99A', 'line-width': 4 } });
        setReady(true); latest.current.onReadyChange?.(true);
      });
    } catch { clearTimeout(timer); fail(); }
    return () => { disposed = true; clearTimeout(timer); markers.current.forEach(marker => marker.remove()); markers.current = []; map.current?.remove(); map.current = null; };
  }, [props.mapStyleUrl, attempt]);
  useEffect(() => {
    const current = map.current;
    if (!ready || !current?.getSource('hangout-radius')) return;
    (current.getSource('hangout-radius') as GeoJSONSource).setData(radiusFeature(props.start, props.radius));
    (current.getSource('hangout-route') as GeoJSONSource).setData(routeFeature(props));
    current.setPaintProperty('walking-route', 'line-dasharray', props.route?.source === 'straight' ? [2, 2] : [1, 0]);
    markers.current.forEach(marker => marker.remove());
    const makeMarker = (longitude: number, latitude: number, label: string, color: string, title: string, id?: string) => {
      const dot = document.createElement('button'); dot.type = 'button'; dot.textContent = label; dot.setAttribute('aria-label', title);
      Object.assign(dot.style, { width: '34px', height: '34px', background: color, border: props.selectedId === id ? '3px solid white' : '3px solid #152017', borderRadius: '50%', color: '#152017', font: 'bold 13px system-ui', boxShadow: '0 3px 12px #0006', cursor: 'pointer' });
      dot.addEventListener('click', event => { event.stopPropagation(); if (id) latest.current.onSelectStop(id); });
      return new maplibregl.Marker({ element: dot, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(current);
    };
    markers.current = [makeMarker(props.start.longitude, props.start.latitude, 'S', '#F4F6F0', 'Selected starting point'),
      ...props.stops.map((stop, index) => makeMarker(stop.coordinate.longitude, stop.coordinate.latitude, String(index + 1), COLORS[index], 'Select stop ' + (index + 1) + ': ' + stop.name, stop.id))];
  }, [ready, props.start.latitude, props.start.longitude, props.radius, props.stops, props.route, props.selectedId]);
  useEffect(() => { if (ready && map.current) map.current.fitBounds(mapBounds(props), { padding: { top: 65, right: 45, bottom: 68, left: 35 }, duration: 300, maxZoom: 17 }); }, [ready, props.start.latitude, props.start.longitude, props.radius, props.stops, props.route, props.resetKey]);
  useEffect(() => { if (error) { map.current?.remove(); map.current = null; } }, [error]);
  return <View style={styles.root}>
    {error ? <OfflineMap {...props} /> : <div ref={container} className="hangout-map" aria-label="Interactive OpenStreetMap. Click to choose a start." style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 23 }} />}
    {!ready && !error && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color="#D7F99A" /><Text style={styles.message}>Loading OpenFreeMap…</Text></View>}
    {error && <View style={styles.error}><Text style={styles.message}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { setError(''); setReady(false); setAttempt(value => value + 1); }}><Text style={styles.retry}>Retry map</Text></Pressable></View>}
  </View>;
}
export default function MapCanvas(props: MapProps) {
  useEffect(() => { if (!props.useLiveMap) props.onReadyChange?.(false); }, [props.useLiveMap, props.onReadyChange]);
  return props.useLiveMap ? <BrowserMap {...props} /> : <OfflineMap {...props} />;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#131E1B' }, loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#131E1B' }, message: { color: '#C5D5B8', fontSize: 10, lineHeight: 15, textAlign: 'center' }, error: { position: 'absolute', top: 75, left: 24, right: 24, padding: 10, borderRadius: 10, backgroundColor: '#152019EE', gap: 6 }, retry: { color: '#D7F99A', textAlign: 'center', fontSize: 11 } });
