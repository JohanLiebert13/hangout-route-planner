import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { Coordinate, MapProps } from './types';
const COLORS = ['#D7F99A', '#F0BD91', '#BEB3F9'];
export default function OfflineMap(props: MapProps) {
  const [size, setSize] = useState({ width: 400, height: 300 });
  const scale = Math.min(size.width, size.height) * 0.36 / props.radius;
  const cosine = Math.max(0.02, Math.cos(props.start.latitude * Math.PI / 180));
  const project = (p: Coordinate) => {
    const lng = ((p.longitude - props.start.longitude + 540) % 360) - 180;
    return { x: size.width / 2 + lng * 111195 * cosine * scale,
      y: size.height / 2 - (p.latitude - props.start.latitude) * 111195 * scale };
  };
  const route = props.route?.coordinates.map(project).map(p => p.x + ',' + p.y).join(' ');
  const marker = (coordinate: Coordinate, label: string, color: string, id?: string) => {
    const p = project(coordinate);
    return <Pressable key={id || 'start'} accessibilityRole="button" accessibilityLabel={id ? 'Select stop ' + label : 'Selected start point'}
      onPress={event => { event.stopPropagation(); if (id) props.onSelectStop(id); }}
      style={[s.marker, { left: p.x - 17, top: p.y - 17, backgroundColor: color }, props.selectedId === id && s.selected]}>
      <Text style={s.markerText}>{label}</Text></Pressable>;
  };
  return <Pressable accessibilityRole="button" accessibilityLabel="Schematic map. Tap to choose a starting point."
    style={s.root} onLayout={event => setSize(event.nativeEvent.layout)}
    onPress={event => {
      let { locationX: x, locationY: y } = event.nativeEvent;
      if (Platform.OS === 'web') {
        const pointer = event.nativeEvent as unknown as { clientX?: number; clientY?: number };
        const element = event.currentTarget as unknown as HTMLElement;
        const bounds = element.getBoundingClientRect?.();
        if (bounds && pointer.clientX !== undefined && pointer.clientY !== undefined) { x = pointer.clientX - bounds.left; y = pointer.clientY - bounds.top; }
      }
      if (!Number.isFinite(x) || !Number.isFinite(y) || scale <= 0) return;
      const latitude = Math.max(-89.9, Math.min(89.9, props.start.latitude - (y - size.height / 2) / (111195 * scale)));
      const longitude = ((props.start.longitude + (x - size.width / 2) / (111195 * cosine * scale) + 540) % 360) - 180;
      props.onStartChange({ latitude, longitude });
    }}>
    <Svg width={size.width} height={size.height} pointerEvents="none">
      <Rect width={size.width} height={size.height} fill="#131E1B" />
      {Array.from({ length: 11 }, (_, index) => <Line key={'v' + index} x1={index * 68 - 140} y1={-20} x2={index * 68 + 40} y2={size.height + 20} stroke="#23342D" strokeWidth={15} />)}
      {Array.from({ length: 7 }, (_, index) => <Line key={'h' + index} x1={0} y1={index * 68 - 40} x2={size.width} y2={index * 68 - 130} stroke="#23342D" strokeWidth={12} />)}
      <Path d={'M ' + size.width * 0.78 + ' -30 Q ' + size.width * 0.5 + ' 130 ' + size.width * 0.9 + ' 220 T ' + size.width + ' 430'} fill="none" stroke="#1A3937" strokeWidth={29} />
      <Rect x={size.width * 0.13} y={size.height * 0.15} width={74} height={51} rx={18} fill="#223C28" transform={'rotate(-13 ' + size.width * 0.13 + ' ' + size.height * 0.15 + ')'} />
      <Rect x={size.width * 0.61} y={size.height * 0.66} width={58} height={44} rx={15} fill="#223C28" />
      <Circle cx={size.width / 2} cy={size.height / 2} r={props.radius * scale} fill="#D7F99A" fillOpacity={0.035} stroke="#D7F99A" strokeOpacity={0.3} strokeDasharray="5 7" />
      {route && <Polyline points={route} fill="none" stroke="#D7F99A" strokeWidth={3} strokeDasharray="6 6" strokeLinejoin="round" />}
      <Circle cx={size.width / 2} cy={size.height / 2} r={25} fill="#D7F99A" fillOpacity={0.09} />
    </Svg>
    <View pointerEvents="none" style={s.mapLabel}><Text style={s.mapLabelText}>NEIGHBORHOOD SKETCH</Text><Text style={s.mapHint}>Illustrative map · tap to move start</Text></View>
    {marker(props.start, 'S', '#F4F6F0')}
    {props.stops.map((stop, index) => marker(stop.coordinate, String(index + 1), COLORS[index], stop.id))}
  </Pressable>;
}
const s = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: '#131E1B' },
  marker: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#111B17', alignItems: 'center', justifyContent: 'center' },
  markerText: { color: '#152017', fontWeight: '800', fontSize: 13 },
  selected: { borderColor: '#FFFFFF', transform: [{ scale: 1.15 }] },
  mapLabel: { position: 'absolute', bottom: 34, left: 18 },
  mapLabelText: { fontSize: 9, letterSpacing: 2, color: '#708879', fontWeight: '700' },
  mapHint: { fontSize: 10, color: '#8A9C90', marginTop: 4 },
});
