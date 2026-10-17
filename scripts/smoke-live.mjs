import { createPlanner, DEFAULT_START } from '../server/planner.ts';
import { loadConfig } from '../server/config.ts';
import { writeFile, mkdir } from 'node:fs/promises';
const planner = createPlanner();
const config = loadConfig();
const [style, places] = await Promise.all([
  fetch(config.mapStyleUrl, { signal: AbortSignal.timeout(15000) }).then(async response => { if (!response.ok) throw Error('Map style HTTP ' + response.status); const json = await response.json(); return { version: json.version, sourceCount: Object.keys(json.sources || {}).length }; }),
  planner.fetchNearbyPlaces(DEFAULT_START.latitude, DEFAULT_START.longitude, 1000),
]);
const itinerary = await planner.generateItinerary('Date', 1000, 2);
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/live-itinerary.json', JSON.stringify({ checkedAt: new Date().toISOString(), style, candidateCount: places.length, itinerary }, null, 2));
console.log(JSON.stringify({ style, candidateCount: places.length, source: itinerary.source, catalogSource: itinerary.catalogSource, stops: itinerary.stops.map(stop => ({ name: stop.name, matchScore: stop.matchScore, address: stop.address })), route: itinerary.route.source, meters: itinerary.route.distanceMeters, minutes: itinerary.route.durationSeconds ? Math.round(itinerary.route.durationSeconds / 60) : null }, null, 2));
