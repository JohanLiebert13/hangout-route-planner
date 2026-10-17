import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map as NativeMap, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import OfflineMap from './OfflineMap';
import { mapBounds, radiusFeature, routeFeature } from '../shared/map-geometry';
import type { MapProps } from './types';
const COLORS = ['#D7F99A', '#F0BD91', '#BEB3F9'];
function LiveMap(props: MapProps) {
  const camera = useRef<CameraRef>(null), [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  useEffect(() => { if (ready) camera.current?.fitBounds(mapBounds(props), { padding: { top: 65, right: 35, bottom: 55, left: 35 }, duration: 300 }); }, [ready, props.start.latitude, props.start.longitude, props.radius, props.stops, props.route, props.resetKey]);
  if (failed) return <View style={{ flex: 1 }}><OfflineMap {...props} /><Text style={styles.error}>Basemap unavailable · schematic view</Text></View>;
  return <NativeMap style={{ flex: 1 }} mapStyle={props.mapStyleUrl} touchRotate={false} touchPitch={false} attribution={true} attributionPosition={{ bottom: 30, right: 8 }} logoPosition={{ bottom: 30, left: 8 }}
    onDidFinishLoadingMap={() => { setReady(true); props.onReadyChange?.(true); }} onDidFailLoadingMap={() => { setFailed(true); props.onReadyChange?.(false); }}
    onPress={event => { const [longitude, latitude] = event.nativeEvent.lngLat; props.onStartChange({ latitude, longitude }); }}>
    <Camera ref={camera} initialViewState={{ center: [props.start.longitude, props.start.latitude], zoom: 15 }} />
    <GeoJSONSource id="hangout-radius" data={radiusFeature(props.start, props.radius)}>
      <Layer id="radius-fill" type="fill" paint={{ 'fill-color': '#D7F99A', 'fill-opacity': 0.04 }} />
      <Layer id="radius-border" type="line" paint={{ 'line-color': '#D7F99A', 'line-width': 1, 'line-opacity': 0.4 }} />
    </GeoJSONSource>
    <GeoJSONSource id="hangout-route" data={routeFeature(props)}><Layer id="walking-route" type="line" paint={{ 'line-color': '#D7F99A', 'line-width': 4, 'line-dasharray': props.route?.source === 'straight' ? [2, 2] : [1, 0] }} /></GeoJSONSource>
    <Marker id="start" lngLat={[props.start.longitude, props.start.latitude]}><View style={[styles.marker, { backgroundColor: '#F4F6F0' }]}><Text style={styles.label}>S</Text></View></Marker>
    {props.stops.map((stop, index) => <Marker key={stop.id} id={stop.id.replace('/', '-')} lngLat={[stop.coordinate.longitude, stop.coordinate.latitude]}
      onPress={event => { event.stopPropagation(); props.onSelectStop(stop.id); }}><View style={[styles.marker, { backgroundColor: COLORS[index], borderColor: props.selectedId === stop.id ? '#FFFFFF' : '#152017' }]}><Text style={styles.label}>{index + 1}</Text></View></Marker>)}
  </NativeMap>;
}
export default function MapCanvas(props: MapProps) { return props.useLiveMap ? <LiveMap {...props} /> : <OfflineMap {...props} />; }
const styles = StyleSheet.create({ marker: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' }, label: { color: '#152017', fontWeight: '800' }, error: { position: 'absolute', top: 80, alignSelf: 'center', color: '#D7F99A', backgroundColor: '#152017', padding: 8, borderRadius: 8, fontSize: 10 } });
