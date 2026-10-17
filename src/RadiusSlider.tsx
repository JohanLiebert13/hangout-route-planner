import React from 'react';
export type RadiusSliderProps = { value: number; onChange: (value: number) => void };
export default function RadiusSlider({ value, onChange }: RadiusSliderProps) {
  return <input type="range" aria-label="Search radius in meters" aria-valuetext={value + ' meters'} min={500} max={2000} step={100} value={value}
    onChange={event => onChange(Number(event.currentTarget.value))}
    style={{ width: '100%', height: 36, margin: '4px 0 0', padding: 0, accentColor: '#D7F99A', cursor: 'pointer' }} />;
}
