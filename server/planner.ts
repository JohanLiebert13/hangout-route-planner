import { mockPrice } from './prices.ts';
import { BUDGET_LIMITS, fitsBudget } from '../shared/prices.ts';
import { reviewForPlace, recommendationScore } from './reviews.ts';
import type { Budget, Coordinate, Itinerary, Place, Stop, StopKind, Vibe, WalkingRoute } from '../src/types';
import { loadConfig, type ServerConfig } from './config.ts';
import { destination, distanceBetween, validCoordinate } from './geo.ts';
import { checkAbort, isAbortError, RequestGate } from './request-gate.ts';
import { normalizePreferences, stageKinds, stageAllowed, featureMatch, schedule, labelFor, localToInstant, hoursState, hoursCanFit, visitMinutes } from './plan-preferences.ts';
import type { PlanPreferences } from '../src/types';
import { loadBundledSnapshot, type VenueSnapshot } from './snapshot.ts';
export { distanceBetween, validCoordinate, isAbortError };
export const DEFAULT_START: Coordinate = { latitude: 41.7011, longitude: 44.7933 };
import { PlannerError } from './errors.ts';
export { PlannerError };
type RequestOptions = { start?: Coordinate; demoMode?: boolean; preferences?: PlanPreferences; signal?: AbortSignal };
type ProviderOptions = { overpassTimeoutMs?: number; routingTimeoutMs?: number; snapshot?: VenueSnapshot | null; config?: () => ServerConfig; fetchImpl?: typeof fetch; cacheTtlMs?: number; overpassGate?: RequestGate; routingGate?: RequestGate };
type Dataset = { places: Place[]; fetchedAt: string; cached: boolean; stale?: boolean; snapshot?: boolean };
function validate(start: Coordinate, radius: number, budget: number = 2, vibe: string = 'Date') {
  if (!validCoordinate(start) || !Number.isInteger(radius) || radius < 500 || radius > 2000 || ![1, 2, 3].includes(budget) || !['Date', 'Friends', 'Family'].includes(vibe))
    throw new PlannerError('Choose a valid start, vibe, radius (500–2000 m) and budget (1–3).', 400, 'INVALID_INPUT');
}
export function buildOverpassQuery(start: Coordinate, radius: number): string {
  validate(start, radius);
  const around = '(around:' + radius + ',' + start.latitude.toFixed(6) + ',' + start.longitude.toFixed(6) + ')';
  return '[out:json][timeout:12][maxsize:16777216];(' +
    'nwr["leisure"~"^(park|garden|playground|amusement_arcade|bowling_alley|sports_centre)$"]["name"]' + around + ';' +
    'nwr["tourism"~"^(museum|gallery|attraction|viewpoint)$"]["name"]' + around + ';' +
    'nwr["amenity"~"^(restaurant|cafe|bar|pub|nightclub|ice_cream|fast_food|food_court|arts_centre)$"]["name"]' + around + ';' +
    ');out center 1000;';
}
function mappedPrice(tags: Record<string, string>): number | undefined {
  const value = tags.price_level || tags.price_range;
  if (!value) return undefined;
  if (/^[0-4]$/.test(value)) return Number(value);
  if (value.length <= 4 && value.split('').every(character => character === String.fromCharCode(36))) return value.length;
  return undefined;
}
export function normalizePlaces(elements: unknown[], start: Coordinate, radius: number): Place[] {
  const places: Place[] = [], ids = new Set<string>();
  for (const value of elements) {
    const raw = value as any;
    if (!raw || !['node', 'way', 'relation'].includes(raw.type) || !Number.isSafeInteger(raw.id) || raw.id < 1 || !raw.tags || typeof raw.tags !== 'object') continue;
    const tags = Object.fromEntries(Object.entries(raw.tags).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    const name = (tags['name:en'] || tags.name || '').trim();
    const coordinate = { latitude: raw.lat ?? raw.center?.lat, longitude: raw.lon ?? raw.center?.lon };
    if (!name || !validCoordinate(coordinate) || distanceBetween(start, coordinate) > radius + 0.5 || tags.access === 'private' || tags.access === 'no' || tags.disused === 'yes' || tags.abandoned === 'yes' || tags.opening_hours === 'closed' || tags['disused:amenity']) continue;
    const id = raw.type + '/' + raw.id;
    const signature = name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (ids.has(id) || places.some(place => place.name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === signature && distanceBetween(place.coordinate, coordinate) < 35)) continue;
    ids.add(id);
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    const address = [street, tags['addr:city']].filter(Boolean).join(', ') || Math.round(distanceBetween(start, coordinate)) + ' m from your start · address not mapped';
    places.push({ priceEstimate: mockPrice({id,tags,priceLevel:mappedPrice(tags)}), review: reviewForPlace({id,name,coordinate}), id, name, coordinate, address, tags, priceLevel: mappedPrice(tags),
      types: [tags.amenity, tags.leisure, tags.tourism].filter(Boolean), matchScore: 0, matchReasons: [], sourceUrl: 'https://www.openstreetmap.org/' + id });
  }
  return places;
}
export function categoryFit(place: Place, kind: StopKind, vibe: Vibe): number {
  const { amenity, leisure, tourism } = place.tags;
  if (vibe === 'Date' && amenity === 'nightclub') return 0;
  if (vibe === 'Family' && (['bar', 'pub', 'nightclub'].includes(amenity) || place.tags.children === 'no' || Number(place.tags.min_age) >= 18)) return 0;
  if (kind === 'restaurant') return amenity === 'restaurant' ? 28 : ['fast_food', 'food_court'].includes(amenity) ? 20 : 0;
  if (kind === 'drinks') {
    if (vibe === 'Friends' && ['bar', 'pub', 'nightclub'].includes(amenity)) return amenity === 'nightclub' ? 35 : 34;
    return amenity === 'cafe' ? 30 : amenity === 'ice_cream' ? (vibe === 'Family' ? 32 : 24) : 0;
  }
  if (vibe === 'Date') return tourism === 'viewpoint' ? 32 : ['park', 'garden'].includes(leisure) ? 30 : tourism === 'gallery' ? 28 : ['museum', 'attraction'].includes(tourism) ? 24 : amenity === 'arts_centre' ? 22 : 0;
  if (vibe === 'Friends') return ['amusement_arcade', 'bowling_alley'].includes(leisure) ? 34 : leisure === 'sports_centre' ? 28 : ['park', 'garden'].includes(leisure) ? 22 : ['attraction', 'museum', 'gallery'].includes(tourism) ? 18 : 0;
  return leisure === 'playground' ? 34 : ['park', 'garden'].includes(leisure) ? 32 : tourism === 'museum' ? 30 : ['gallery', 'attraction'].includes(tourism) ? 22 : 0;
}
export function rankCandidates(places: Place[], start: Coordinate, radius: number, budget: Budget, vibe: Vibe, kind: StopKind, preferences: PlanPreferences = {}, limit = 8): Place[] {
  const priced=places.map(place=>({...place,priceEstimate:place.priceEstimate??mockPrice(place)}));
  const eligible = priced.filter(place => categoryFit(place, kind, vibe) > 0 && featureMatch(place, preferences).allowed && fitsBudget(place,budget));
  const nightlife = vibe === 'Friends' && kind === 'drinks' ? eligible.filter(place => ['bar', 'pub', 'nightclub'].includes(place.tags.amenity)) : [];
  // Venue type is a real preference, not a tiny score bonus that a close cafe can erase.
  return (nightlife.length ? nightlife : eligible).map(place => {
      const fit = categoryFit(place, kind, vibe), meters = distanceBetween(start, place.coordinate);
      let score = 45 + fit + 15 * Math.max(0, 1 - meters / radius) + featureMatch(place, preferences).score;
      const nightlifeReason = { bar: 'Bar for your night out', pub: 'Pub for your night out', nightclub: 'Dancing and nightlife' }[place.tags.amenity];
      const reasons = [vibe === 'Friends' && kind === 'drinks' ? (nightlifeReason || 'Coffee or dessert fallback') : 'Fits your ' + vibe.toLowerCase() + ' plan', Math.round(meters) + ' m from start'];
      if (vibe === 'Friends' && place.tags.live_music === 'yes') { score += 3; reasons.push('Live music mapped'); }
      if (vibe === 'Date' && place.tags.outdoor_seating === 'yes') { score += 4; reasons.push('Outdoor seating mapped'); }
      if (vibe === 'Family' && (place.tags.children === 'yes' || place.tags.playground === 'yes')) { score += 4; reasons.push('Child-friendly facilities mapped'); }
      if (kind === 'restaurant' && budget === 1 && ['fast_food', 'food_court'].includes(place.tags.amenity)) { score += 7; reasons.push('Casual food preference'); }
      reasons.push('Mock price '+place.priceEstimate.amount+' GEL fits budget');
      return { ...place, matchScore: Math.min(100, Math.round(score)), matchReasons: reasons };
    }).sort((a, b) => recommendationScore(b) - recommendationScore(a) || distanceBetween(start, a.coordinate) - distanceBetween(start, b.coordinate) || a.id.localeCompare(b.id)).slice(0, limit);
}
export function chooseBestTriplet(pools: Place[][], start: Coordinate, radius: number): Place[] | null {
  if (pools.length !== 3 || pools.some(pool => !pool.length)) return null;
  let best: Place[] | null = null, bestScore = -Infinity;
  for (const activity of pools[0]) for (const food of pools[1]) for (const drinks of pools[2]) {
    const places = [activity, food, drinks];
    if (new Set(places.map(p => p.id)).size !== 3) continue;
    const meters = distanceBetween(start, activity.coordinate) + distanceBetween(activity.coordinate, food.coordinate) + distanceBetween(food.coordinate, drinks.coordinate);
    const score = places.reduce((sum, p) => sum + recommendationScore(p), 0) - meters / radius * 3;
    if (score > bestScore) { bestScore = score; best = places; }
  }
  return best;
}
export function straightRoute(start: Coordinate, stops: Stop[]): WalkingRoute {
  const coordinates = [start, ...stops.map(stop => stop.coordinate)];
  return { coordinates, distanceMeters: coordinates.slice(1).reduce((sum, p, i) => sum + distanceBetween(coordinates[i], p), 0), source: 'straight',
    warnings: ['Straight-line estimate; a verified walking route is unavailable. Follow actual paths and crossings.'] };
}
function instruction(step: any): string {
  const maneuver = step.maneuver || {}, road = typeof step.name === 'string' && step.name.trim() ? ' on ' + step.name.trim() : '';
  if (maneuver.type === 'arrive') return 'Arrive at this stop';
  if (maneuver.type === 'depart') return 'Start walking' + road;
  if (maneuver.type?.includes('roundabout')) return 'At the roundabout, take exit ' + (maneuver.exit || 'ahead') + road;
  const modifier = typeof maneuver.modifier === 'string' ? maneuver.modifier.replace('uturn', 'back') : 'ahead';
  return (maneuver.type === 'turn' ? 'Turn ' + modifier : 'Continue ' + modifier) + road;
}
export function generateDemoItinerary(vibe: Vibe, radius: number, budget: Budget, start = DEFAULT_START): Itinerary {
  validate(start, radius, budget, vibe);
  const names = { Date: ['Garden & Gallery', 'Supper for Two', 'Little Hours Café'], Friends: ['Sidequest Arcade', 'The Shared Table', 'After Hours Bar'], Family: ['Discovery Garden', 'Sunday Kitchen', 'Scoops & Smiles'] };
  const kinds: StopKind[] = ['activity', 'restaurant', 'drinks'];
  const stops = kinds.map((kind, i): Stop => ({ id: 'demo-' + kind, name: names[vibe][i], coordinate: destination(start, radius * [0.28, 0.52, 0.68][i], [310, 40, 125][i]),
    address: 'Illustrative location · ' + Math.round(radius * [0.28, 0.52, 0.68][i]) + ' m from start', matchScore: [92, 89, 86][i], matchReasons: ['Illustrative match score'],
    priceLevel: i === 0 ? 0 : 1, tags: i === 2 && vibe === 'Friends' ? { amenity: 'bar' } : {}, types: [], sample: true, kind, label: i === 2 && vibe === 'Friends' ? 'Bar stop' : ['Explore', 'Eat something good', 'One more stop'][i] }));
  for (const stop of stops) { stop.review = reviewForPlace(stop); stop.priceEstimate = mockPrice(stop); }
  return { start, vibe, radius, budget, stops, source: 'demo', route: straightRoute(start, stops), notices: ['Sample mode: venue names, locations, prices, ratings and feedback are illustrative.'] };
}
export function createPlanner(options: ProviderOptions = {}) {
  const config = options.config ?? loadConfig, fetchImpl = options.fetchImpl ?? fetch;
  const overpassGate = options.overpassGate ?? new RequestGate(2000), routingGate = options.routingGate ?? new RequestGate(1100);
  const snapshot = options.snapshot === undefined ? loadBundledSnapshot() : options.snapshot;
  const cache = new Map<string, { dataset: Dataset; saved: number }>(), ttl = options.cacheTtlMs ?? 600000;
  async function requestJson(url: string, init: RequestInit, signal?: AbortSignal, timeout = 6000): Promise<any> {
    checkAbort(signal);
    const controller = new AbortController(), cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeout);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new PlannerError(response.status === 429 ? 'The public service is busy. Please wait a moment before retrying.' : 'The public map service is temporarily unavailable.', 502, 'PROVIDER_UNAVAILABLE');
      const data = await response.json(); checkAbort(signal); return data;
    } catch (error) {
      checkAbort(signal);
      if (error instanceof PlannerError) throw error;
      throw new PlannerError(controller.signal.aborted ? 'Nearby venue search timed out. Try the Rustaveli start for cached Tbilisi places, or try live search again later.' : 'Could not connect to the public map service.', 502, 'PROVIDER_UNAVAILABLE');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  async function dataset(start: Coordinate, radius: number, signal?: AbortSignal): Promise<Dataset> {
    validate(start, radius); checkAbort(signal);
    const settings = config(), key = (settings.preferLocalPlaces ? 'local:' : 'live:') + settings.overpassUrl + ':' + start.latitude.toFixed(5) + ':' + start.longitude.toFixed(5) + ':' + radius;
    const previous = cache.get(key);
    if (previous && Date.now() - previous.saved < ttl) return { ...previous.dataset, cached: true };
    const hasLocalCoverage = snapshot && distanceBetween(start, snapshot.center) + radius <= snapshot.coverageRadius;
    function localPlaces(stale: boolean): Dataset {
      const result: Dataset = { places: normalizePlaces(snapshot!.elements, start, radius), fetchedAt: snapshot!.dataAsOf, cached: true, stale, snapshot: true };
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, { dataset: result, saved: Date.now() });
      return result;
    }
    if (settings.preferLocalPlaces && hasLocalCoverage) return localPlaces(false);
    try {
      return await overpassGate.run(async () => {
        const recent = cache.get(key);
        if (recent && Date.now() - recent.saved < ttl) return { ...recent.dataset, cached: true };
        const data = await requestJson(settings.overpassUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': settings.userAgent },
          body: new URLSearchParams({ data: buildOverpassQuery(start, radius) }).toString() }, signal, options.overpassTimeoutMs ?? 6000);
        if (!Array.isArray(data.elements) || data.remark) throw new PlannerError('The public venue search could not finish. Please retry later.', 502, 'OVERPASS_INCOMPLETE');
        const result = { places: normalizePlaces(data.elements, start, radius), fetchedAt: new Date().toISOString(), cached: false };
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, { dataset: result, saved: Date.now() });
        return result;
      }, signal);
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (previous && Date.now() - previous.saved < 86400000) return { ...previous.dataset, cached: true, stale: true };
      if (hasLocalCoverage) return localPlaces(true);
      throw error;
    }
  }
  async function fetchNearbyPlaces(lat: number, lng: number, radius: number, placeType?: string, maxPrice?: number, signal?: AbortSignal): Promise<Place[]> {
    if (maxPrice !== undefined && ![0, 1, 2, 3, 4].includes(maxPrice)) throw new PlannerError('Invalid budget.', 400, 'INVALID_INPUT');
    const result = await dataset({ latitude: lat, longitude: lng }, radius, signal);
    return result.places.filter(place => (!placeType || place.types.includes(placeType)) && (maxPrice === undefined || fitsBudget(place,maxPrice)));
  }
  async function fetchWalkingRoute(start: Coordinate, stops: Stop[], signal?: AbortSignal): Promise<WalkingRoute> {
    checkAbort(signal); const fallback = straightRoute(start, stops);
    if (stops.length !== 3 || stops.some(stop => stop.sample)) return fallback;
    const settings = config(), coordinates = [start, ...stops.map(stop => stop.coordinate)].map(p => p.longitude.toFixed(6) + ',' + p.latitude.toFixed(6)).join(';');
    try {
      return await routingGate.run(async () => {
        const data = await requestJson(settings.routingUrl.replace(/\/$/, '') + '/route/v1/foot/' + coordinates + '?overview=full&geometries=geojson&steps=true', { headers: { 'User-Agent': settings.userAgent } }, signal, options.routingTimeoutMs ?? 6000);
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route || !Array.isArray(route.geometry?.coordinates) || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 0 || route.duration < 0 || !Array.isArray(route.legs) || route.legs.length !== 3) throw new Error('Invalid walking route.');
        const points = route.geometry.coordinates.map((p: number[]) => ({ latitude: p[1], longitude: p[0] }));
        if (points.length < 2 || !points.every(validCoordinate)) throw new Error('Invalid walking coordinates.');
        const legs = route.legs.map((leg: any) => {
          if (!Number.isFinite(leg.distance) || !Number.isFinite(leg.duration) || leg.distance < 0 || leg.duration < 0 || !Array.isArray(leg.steps)) throw new Error('Invalid walking leg.');
          return { distanceMeters: leg.distance, durationSeconds: leg.duration, instructions: leg.steps.map(instruction) };
        });
        return { coordinates: points, distanceMeters: route.distance, durationSeconds: route.duration, source: 'osrm' as const, warnings: [], legs };
      }, signal);
    } catch (error) { if (isAbortError(error)) throw error; return { ...fallback, warnings: ['Walking directions are temporarily unavailable. ' + fallback.warnings[0]] }; }
  }
  function optionsOf(settings:RequestOptions):PlanPreferences { return normalizePreferences(settings.preferences); }
  function asStops(places:Place[],vibe:Vibe,p:PlanPreferences):Stop[] {
    const kinds=stageKinds(vibe,p);return places.map((place,index)=>({...place,kind:kinds[index],label:labelFor(place,index,kinds[index],vibe,p),musicLabel:featureMatch(place,p).musicLabel,atmosphereLabel:featureMatch(place,p).atmosphereLabel}));
  }
  async function candidates(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions,constraints?:{stopIds:string[];index:number;excluded:string[]}) {
    const start={...(settings.start??DEFAULT_START)},p=optionsOf(settings);validate(start,radius,budget,vibe);checkAbort(settings.signal);
    const data=await dataset(start,radius,settings.signal),kinds=stageKinds(vibe,p),durations=visitMinutes(kinds,p);
    if(constraints&&constraints.stopIds.some(id=>!data.places.some(place=>place.id===id)))throw new PlannerError('A current stop is no longer available in this search. Generate a fresh route.',400,'INVALID_STOPS');
    const pools=kinds.map((kind,index)=>{
      const within=data.places.filter(place=>distanceBetween(start,place.coordinate)<=radius+0.5&&stageAllowed(place,index,vibe,p)&&(!constraints||(index===constraints.index?![constraints.stopIds[index],...constraints.excluded].includes(place.id):place.id===constraints.stopIds[index])));
      const available=p.startLocal?within.filter(place=>{
        const before=durations.slice(0,index).reduce((a,b)=>a+b,0)*60000,base=Date.parse(localToInstant(p.startLocal!,p.timeZone||'Asia/Tbilisi'))+before;
        const earliest=new Date(base+distanceBetween(start,place.coordinate)/1.25*1000),latest=new Date(base+radius*(2*index+1)/1.25*1000);
        return hoursCanFit(place,earliest,latest,durations[index],p.timeZone||'Asia/Tbilisi');
      }):within;
      return rankCandidates(available,start,radius,budget,vibe,kind,p,16);
    });
    const missing=pools.findIndex(pool=>!pool.length);
    if(missing>=0)throw new PlannerError('No matching '+(vibe==='Friends'&&p.friendsStyle==='club_night'&&missing===2?'nightclubs':kinds[missing]+' venues')+' fit this radius, time and '+BUDGET_LIMITS[budget]+' GEL mock price limit per person per stop. Increase the budget or radius, change the time or relax a preference.',422,'NO_MATCHING_PLACES');
    const combinations:{places:Place[];score:number}[]=[];
    const collect=(limit:number)=>{for(const a of pools[0].slice(0,limit))for(const b of pools[1].slice(0,limit))for(const c of pools[2].slice(0,limit)){
      const places=[a,b,c];if(new Set(places.map(s=>s.id)).size!==3)continue;
      const timed=schedule(asStops(places,vibe,p),start,p);if(timed.closed.length)continue;
      const meters=distanceBetween(start,a.coordinate)+distanceBetween(a.coordinate,b.coordinate)+distanceBetween(b.coordinate,c.coordinate);
      combinations.push({places,score:places.reduce((sum,s)=>sum+recommendationScore(s),0)-meters/radius*3+(timed.stops.filter(s=>s.visit?.openingStatus==='open').length*3)});
    }};
    collect(8);if(!combinations.length&&pools.some(pool=>pool.length>8))collect(16);
    combinations.sort((a,b)=>b.score-a.score||a.places.map(p=>p.id).join().localeCompare(b.places.map(p=>p.id).join()));
    if(!combinations.length)throw new PlannerError('Not enough distinct venues fit this route, planned visits and mock budget. Increase the budget or radius, or change the start time or style.',422,'INSUFFICIENT_UNIQUE_PLACES');
    return {start,p,data,pools,combinations};
  }
  async function materialize(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions,context:Awaited<ReturnType<typeof candidates>>,places:Place[]):Promise<Itinerary>{
    const {start,p,data}=context;let stops=asStops(places,vibe,p);const route=await fetchWalkingRoute(start,stops,settings.signal);checkAbort(settings.signal);
    const timed=schedule(stops,start,p,route.legs);if(timed.closed.length)throw Object.assign(new PlannerError('The walking time would reach a venue outside its mapped opening hours. Try another start time or route.',422,'SCHEDULE_CONFLICT'),{closedIds:timed.closed});stops=timed.stops;
    const notices=['Match scores reflect vibe and distance, not customer reviews.','Ratings also influence route ranking: most stars and feedback are simulated demo data, not customer reviews. The few online snapshots show their source and research date.'];
    if(vibe==='Friends'&&!p.friendsStyle)notices.push(['bar','pub','nightclub'].includes(stops[2].tags.amenity)?'Nightlife picks use mapped venue types. Confirm opening hours and entry requirements before heading out.':'No matching bar, pub or club is mapped in this radius and budget. The final stop is a coffee or dessert fallback.');
    if(vibe==='Friends'&&p.friendsStyle&&p.friendsStyle!=='chill')notices.push('Confirm tonight’s events and entry requirements with the venue.');
    if(p.startLocal){notices.push('Visit times include planned stays and '+(route.source==='osrm'?'routed walking times.':'estimated walking times.'));if(stops.some(s=>s.visit?.openingStatus==='unknown'))notices.push('Some opening hours are unknown or too complex to verify. Confirm directly with those venues.');notices.push('Mapped opening hours may be outdated. Open for visit means the mapped schedule covers the entire planned stay.');}
    if(p.music&&p.music!=='any'||p.atmosphere&&p.atmosphere!=='any')notices.push('Music and atmosphere use mapped tags. Unknown details remain visible; known conflicting nightlife venues are excluded.');
    notices.push('All prices are mock estimates in GEL per person per stop, guided by public Tbilisi menus. Every stop fits the selected '+BUDGET_LIMITS[budget]+' GEL limit. Actual prices, fees and portions may differ.');
    if(data.snapshot)notices.push((data.stale?'Public venue search is unavailable. ':'')+'Using the Tbilisi OpenStreetMap snapshot dated '+data.fetchedAt.slice(0,10)+'; details may have changed.');else if(data.stale)notices.push('Using cached OpenStreetMap places from '+data.fetchedAt+' while the public search service is unavailable.');
    return {start,vibe,radius,budget,preferences:p,stops,route,source:'osm',catalogSource:data.snapshot?'snapshot':'overpass',notices,fetchedAt:data.fetchedAt,cached:data.cached,endAt:timed.endAt};
  }
  function sample(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions,ids?:string[],swapIndex?:number):Itinerary {
    const p=optionsOf(settings),plan=generateDemoItinerary(vibe,radius,budget,settings.start??DEFAULT_START),kinds=stageKinds(vibe,p);
    const variants=[['Discovery Garden','Sidequest Arcade','The Courtyard'],['Sunday Kitchen','The Shared Table','Supper Club'],['Little Hours Café','Sweet Corner','Slow Coffee']];
    const bars=['After Hours Bar','The Brass Pub','Corner Cocktails','Amber Bar','The Vinyl Pub','Last Light Bar'];
    const clubs=['Night Signal Club','Orbit Dance Club','Midnight Room','Pulse Club','Basement Beats','Neon Club'];
    plan.stops=plan.stops.map((s,i)=>{
      const variant=ids?Number(ids[i].split('-').at(-1))||0:0;
      const night=vibe==='Friends'&&p.friendsStyle&&p.friendsStyle!=='chill';const amenity=night?(i===0?'restaurant':p.friendsStyle==='club_night'&&i===2?'nightclub':'bar'):(kinds[i]==='restaurant'?'restaurant':kinds[i]==='drinks'?'cafe':undefined);
      const name=night?(i===0?['The Shared Table','Sunday Kitchen','Supper for Two'][variant%3]:(amenity==='nightclub'?clubs:bars)[variant%6]):variants[i][variant%3];
      const next:Stop={...s,priceLevel:i===0&&!night?0:[1,1,1,2,2,3][variant],id:'demo-'+i+'-'+variant,name,kind:kinds[i],tags:amenity?{amenity}:{leisure:'park'},coordinate:destination(plan.start,radius*([0.28,0.52,0.68][i]+variant*0.015),[310,40,125][i]+variant*12)};
      return {...next,priceEstimate:mockPrice(next),review:reviewForPlace(next),label:labelFor(next,i,kinds[i],vibe,p),musicLabel:'Sample music details',atmosphereLabel:'Sample atmosphere'};
    });
    if(plan.stops.some(stop=>!fitsBudget(stop,budget)))throw new PlannerError('The current sample stops exceed the mock budget. Generate a new route.',422,'NO_MATCHING_PLACES');
    const timed=schedule(plan.stops,plan.start,p);plan.stops=timed.stops;plan.endAt=timed.endAt;plan.preferences=p;plan.route=straightRoute(plan.start,plan.stops);return plan;
  }
  async function generateItinerary(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions={}):Promise<Itinerary>{
    validate(settings.start??DEFAULT_START,radius,budget,vibe);optionsOf(settings);checkAbort(settings.signal);
    if(settings.demoMode)return settings.preferences?sample(vibe,radius,budget,settings):generateDemoItinerary(vibe,radius,budget,settings.start??DEFAULT_START);
    const context=await candidates(vibe,radius,budget,settings);return materializeBest(vibe,radius,budget,settings,context);
  }
  async function swapStop(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions,stopIds:string[],index:number,excluded:string[]=[]):Promise<Itinerary>{
    if(!Number.isInteger(index)||index<0||index>2||stopIds.length!==3||new Set(stopIds).size!==3)throw new PlannerError('Choose one of the three existing stops.',400,'INVALID_INPUT');
    validate(settings.start??DEFAULT_START,radius,budget,vibe);checkAbort(settings.signal);
    if(settings.demoMode){if(!stopIds.every((id,i)=>id.startsWith('demo-'+i+'-')&&/^demo-[012]-[0-5]$/.test(id)))throw new PlannerError('Invalid sample stop IDs. Generate a new sample route.',400,'INVALID_STOPS');const ids=[...stopIds];let variant=(Number(ids[index].split('-').at(-1))||0)+1;const freeActivity=stageKinds(vibe,optionsOf(settings))[index]==='activity';while(variant<=5&&(excluded.includes('demo-'+index+'-'+variant)||!freeActivity&&[1,1,1,2,2,3][variant]>budget))variant++;if(variant>5)throw new PlannerError('No more sample alternatives. Generate a new sample.',422,'NO_ALTERNATIVES');ids[index]='demo-'+index+'-'+variant;return sample(vibe,radius,budget,settings,ids,index);}
    try {
      const context=await candidates(vibe,radius,budget,settings,{stopIds,index,excluded});
      return await materializeBest(vibe,radius,budget,settings,context);
    }catch(error){if(error instanceof PlannerError&&['NO_MATCHING_PLACES','INSUFFICIENT_UNIQUE_PLACES'].includes(error.code))throw new PlannerError('No other matching stop fits this mock budget while keeping the other two venues. Increase the budget or radius. Your current route is unchanged.',422,'NO_ALTERNATIVES');throw error;}
  }

  async function generateOptions(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions):Promise<Itinerary[]>{
    if(settings.demoMode)return [0,1,2].map(variant=>sample(vibe,radius,budget,settings,[0,1,2].map(i=>'demo-'+i+'-'+variant)));
    const context=await candidates(vibe,radius,budget,settings),accepted:Itinerary[]=[],used=new Set<string>(),blocked=new Set<string>();let attempts=0;
    while(accepted.length<3&&attempts<5){
      const remaining=context.combinations.filter(c=>!used.has(c.places.map(p=>p.id).join())&&!c.places.some(p=>blocked.has(p.id)));
      remaining.sort((a,b)=>{const score=(candidate:typeof a)=>candidate.score-(accepted.length?Math.max(...accepted.map(old=>candidate.places.filter((p,i)=>p.id===old.stops[i].id).length))*12:0);return score(b)-score(a);});
      const next=remaining[0];if(!next)break;used.add(next.places.map(p=>p.id).join());attempts++;checkAbort(settings.signal);
      try{accepted.push(await materialize(vibe,radius,budget,settings,context,next.places));}catch(error){if(!(error instanceof PlannerError)||error.code!=='SCHEDULE_CONFLICT')throw error;for(const id of (error as PlannerError&{closedIds?:string[]}).closedIds||[])blocked.add(id);}
    }
    if(accepted.length<2)throw new PlannerError('Fewer than two distinct routes fit the walking schedule. Increase the radius or change the start time.',422,'NOT_ENOUGH_OPTIONS');return accepted;
  }
  async function materializeBest(vibe:Vibe,radius:number,budget:Budget,settings:RequestOptions,context:Awaited<ReturnType<typeof candidates>>):Promise<Itinerary>{
    const blocked=new Set<string>();let last:unknown;
    for(let attempt=0;attempt<3;attempt++){
      const choice=context.combinations.find(c=>!c.places.some(place=>blocked.has(place.id)));if(!choice)break;checkAbort(settings.signal);
      try{return await materialize(vibe,radius,budget,settings,context,choice.places);}catch(error){if(!(error instanceof PlannerError)||error.code!=='SCHEDULE_CONFLICT')throw error;last=error;for(const id of (error as PlannerError&{closedIds?:string[]}).closedIds||[])blocked.add(id);}
    }
    throw last||new PlannerError('No eligible route remains. Try different preferences.',422,'NO_MATCHING_PLACES');
  }

  return {fetchNearbyPlaces,fetchWalkingRoute,generateItinerary,swapStop,generateOptions};
}
const defaultPlanner=createPlanner();
export const fetchNearbyPlaces=defaultPlanner.fetchNearbyPlaces;
export const generateItinerary=defaultPlanner.generateItinerary;
