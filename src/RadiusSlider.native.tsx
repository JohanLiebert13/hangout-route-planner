import React from 'react';
import Slider from '@react-native-community/slider';
import type { RadiusSliderProps } from './RadiusSlider';
export default function RadiusSlider({ value, onChange }: RadiusSliderProps) {
  return <Slider accessibilityLabel="Search radius in meters" accessibilityValue={{ min: 500, max: 2000, now: value, text: value + ' meters' }}
    style={{ height: 37, marginTop: 2 }} minimumValue={500} maximumValue={2000} step={100} value={value}
    minimumTrackTintColor="#D7F99A" maximumTrackTintColor="#42513F" thumbTintColor="#D7F99A" onValueChange={onChange} />;
}
