import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverpassQuery, chooseBestTriplet, createPlanner, DEFAULT_START, distanceBetween, generateDemoItinerary, normalizePlaces, rankCandidates } from '../server/planner.ts';
import { RequestGate } from '../server/request-gate.ts';
import { elements, fakeProvider, raw, response, routeData, settings, START } from './fixtures/providers.mjs';
const planner = (fetchImpl = fakeProvider, extra = {}) => createPlanner({ snapshot:null, config: () => settings(), fetchImpl, overpassGate: new RequestGate(0), routingGate: new RequestGate(0), ...extra });
test('all sample vibe/radius/budget combinations are bounded and explicitly synthetic', () => {
  for (const vibe of ['Date','Friends','Family']) for (const radius of [500,1000,2000]) for (const budget of [1,2,3]) {
    const plan = generateDemoItinerary(vibe, radius, budget);
    assert.equal(plan.stops.length, 3); assert.equal(plan.source, 'demo');
    assert.equal(plan.route.source, 'straight'); assert.equal(plan.route.durationSeconds, undefined);
    for (const stop of plan.stops) { assert.ok(stop.sample); assert.ok(distanceBetween(plan.start, stop.coordinate) <= radius); assert.ok(!('rating' in stop)); assert.ok(!('reviewCount' in stop)); }
  }
});
test('one bounded Overpass query covers all three categories and named entities', () => {
  const query = buildOverpassQuery(START, 1000);
  assert.match(query, /timeout:12/); assert.match(query, /around:1000,41.701100,44.793300/); assert.match(query, /restaurant/); assert.match(query, /amusement_arcade/); assert.match(query, /out center 1000/);
  assert.throws(() => buildOverpassQuery({ latitude: NaN, longitude: 0 }, 1000));
});
test('normalization accepts nodes, way/relation centers and English labels', () => {
  const places = normalizePlaces([raw(1,{ amenity:'cafe', 'name:en':'English Café' }), {type:'way',id:2,center:{lat:41.702,lon:44.794},tags:{name:'Way Park',leisure:'park'}}, {type:'relation',id:3,center:{lat:41.702,lon:44.795},tags:{name:'Relation Museum',tourism:'museum'}}], START, 1000);
  assert.equal(places.length,3); assert.equal(places[0].name,'English Café'); assert.equal(places[1].sourceUrl,'https://www.openstreetmap.org/way/2');
});
test('normalization rejects invalid, closed, private, unnamed and outside-radius records', () => {
  const places=normalizePlaces([raw(1,{amenity:'cafe'}),raw(2,{name:'',amenity:'cafe'}),raw(3,{access:'private',amenity:'cafe'}),raw(4,{opening_hours:'closed',amenity:'cafe'}),raw(5,{disused:'yes',amenity:'cafe'}),raw(6,{amenity:'cafe'},42,45),raw(7,{amenity:'cafe'},91,0),null],START,500);
  assert.deepEqual(places.map(p=>p.id),['node/1']);
});
test('nearby duplicate representations merge while different branches survive', () => {
  const places=normalizePlaces([raw(1,{name:'Same Café',amenity:'cafe'}),raw(2,{name:'Same Café',amenity:'cafe'},41.70181,44.79401),raw(3,{name:'Same Café',amenity:'cafe'},41.705,44.794)],START,1000);
  assert.equal(places.length,2);
});
test('mapped price tiers stay separate from mock estimates, and fees do not imply free food', () => {
  const places=normalizePlaces([raw(1,{amenity:'restaurant',price_range:'$$'}),raw(2,{amenity:'cafe',price_level:'1'}),raw(3,{amenity:'cafe',fee:'no'})],START,1000);
  assert.deepEqual(places.map(p=>p.priceLevel),[2,1,undefined]); assert.ok(places[2].priceEstimate.amount>0);
});
test('budget excludes expensive tiers and filters previously unknown prices using mock estimates', () => {
  const places=normalizePlaces([raw(1,{amenity:'restaurant',price_level:'3'}),raw(2,{amenity:'restaurant'})],START,1000);
  assert.deepEqual(rankCandidates(places,START,1000,1,'Date','restaurant').map(p=>p.id),['node/2']);
});
test('family excludes adult venues and matches child-friendly activities', () => {
  const places=normalizePlaces([raw(1,{amenity:'pub'}),raw(2,{amenity:'cafe',min_age:'18'}),raw(3,{amenity:'cafe',children:'yes'}),raw(4,{leisure:'playground'})],START,1000);
  assert.deepEqual(rankCandidates(places,START,1000,2,'Family','drinks').map(p=>p.id),['node/3']);
  assert.equal(rankCandidates(places,START,1000,2,'Family','activity')[0].id,'node/4');
});
test('match scores favor the vibe and stay within 0–100 without review claims', () => {
  const places=normalizePlaces([raw(1,{leisure:'park'}),raw(2,{leisure:'amusement_arcade'})],START,1000);
  const scored=rankCandidates(places,START,1000,2,'Friends','activity');
  assert.equal(scored[0].id,'node/2'); assert.ok(scored.every(p=>p.matchScore>=0&&p.matchScore<=100)); assert.ok(scored[0].matchReasons.length);
});
test('one venue query plus one foot routing request produces a real itinerary contract', async () => {
  const calls=[]; const p=planner(async(url,init)=>{calls.push({url,init});return fakeProvider(url);});
  const plan=await p.generateItinerary('Date',1000,2);
  assert.equal(calls.length,2); assert.equal(plan.source,'osm'); assert.equal(plan.route.source,'osrm'); assert.equal(plan.route.durationSeconds,900); assert.equal(plan.route.legs.length,3);
  assert.ok(calls[1].url.includes('/routed-foot/route/v1/foot/44.793300,41.701100;')); assert.match(calls[1].url,/geometries=geojson/); assert.equal(new Set(plan.stops.map(s=>s.id)).size,3); assert.ok(plan.stops.every(s=>!s.sample));
});
test('cached venue results are reused across category and budget changes', async () => {
  let calls=0; const p=planner(async(url,init)=>{calls++;return fakeProvider(url);});
  const a=await p.fetchNearbyPlaces(START.latitude,START.longitude,1000,'restaurant',1);
  const b=await p.fetchNearbyPlaces(START.latitude,START.longitude,1000,'cafe',3);
  assert.equal(calls,1); assert.ok(a.length); assert.ok(b.length);
});
test('partial Overpass errors are rejected without caching incomplete data', async () => {
  let calls=0;const p=planner(async()=>response(++calls===1?{elements,remark:'timeout'}:{elements}));
  await assert.rejects(p.fetchNearbyPlaces(START.latitude,START.longitude,1000),{code:'OVERPASS_INCOMPLETE'});
  assert.ok((await p.fetchNearbyPlaces(START.latitude,START.longitude,1000)).length); assert.equal(calls,2);
});
test('venue search failures and no-match responses never fabricate live stops', async () => {
  await assert.rejects(planner(async()=>response({},429)).generateItinerary('Date',1000,2),{code:'PROVIDER_UNAVAILABLE'});
  await assert.rejects(planner(async()=>response({elements:[]})).generateItinerary('Date',1000,2),{code:'NO_MATCHING_PLACES'});
});
test('routing failures preserve real places and return a labeled straight line', async () => {
  const plan=await planner(async url=>url.includes('/route/')?response({},503):response({elements})).generateItinerary('Date',1000,2);
  assert.equal(plan.source,'osm'); assert.equal(plan.route.source,'straight'); assert.equal(plan.route.durationSeconds,undefined); assert.ok(plan.route.warnings.length); assert.ok(plan.stops.every(s=>!s.sample));
});
test('malformed walking coordinates do not become a fake successful route', async () => {
  const bad=structuredClone(routeData);bad.routes[0].geometry.coordinates=[[0,95],[0,96]];
  const plan=await planner(async url=>url.includes('/route/')?response(bad):response({elements})).generateItinerary('Date',1000,2);
  assert.equal(plan.route.source,'straight');
});
test('request cancellation reaches the active provider and does not produce samples', async () => {
  const controller=new AbortController(); const p=planner((_url,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));controller.abort();}));
  await assert.rejects(p.generateItinerary('Date',1000,2,{signal:controller.signal}),{name:'AbortError'});
});
test('triplets cannot repeat venue IDs and prefer a compact route at equal match', () => {
  const base=normalizePlaces(elements,START,1000);const a={...base[0],matchScore:90},b={...base[1],matchScore:90},c={...base[2],matchScore:90};
  assert.equal(chooseBestTriplet([[a],[a],[c]],START,1000),null);
  const far={...a,id:'far',coordinate:{latitude:41.708,longitude:44.7933}};
  assert.equal(chooseBestTriplet([[far,a],[b],[c]],START,1000)[0].id,a.id);
});
test('request gate enforces start spacing and serializes upstream work', async () => {
  const gate=new RequestGate(25),starts=[]; await Promise.all([0,1,2].map(()=>gate.run(async()=>{starts.push(Date.now());})));
  assert.ok(starts[1]-starts[0]>=24);assert.ok(starts[2]-starts[1]>=24);
});
test('cancelled queued jobs cannot let later work overtake an active request', async () => {
  const gate=new RequestGate(0),events=[];let release;const block=new Promise(resolve=>{release=resolve;});
  const a=gate.run(async()=>{events.push('a-start');await block;events.push('a-end');});
  const controller=new AbortController();const b=gate.run(async()=>events.push('b'),controller.signal).catch(error=>error.name);
  const c=gate.run(async()=>events.push('c'));controller.abort();assert.equal(await b,'AbortError');
  assert.deepEqual(events,['a-start']);release();await Promise.all([a,c]);assert.deepEqual(events,['a-start','a-end','c']);
});
test('invalid preferences fail before any provider request', async () => {
  const p=planner(()=>{throw Error('Must not fetch');});
  for (const args of [['Party',1000,2],['Date',400,2],['Date',1000,4]]) await assert.rejects(p.generateItinerary(...args),{code:'INVALID_INPUT'});
});

test('provider outage uses a dated real snapshot only inside its full coverage',async()=>{
 const snapshot={center:START,coverageRadius:4000,dataAsOf:'2026-10-16T20:21:21Z',elements};let queries=0;
 const p=planner(async url=>{if(String(url).includes('/route/'))return response(routeData);queries++;return response({},503);},{snapshot});
 const plan=await p.generateItinerary('Date',1000,2);assert.equal(plan.catalogSource,'snapshot');assert.equal(plan.source,'osm');assert.equal(plan.route.source,'osrm');assert.ok(plan.notices.some(n=>n.includes('snapshot dated 2026-10-16')));assert.ok(plan.stops.every(s=>!s.sample));
 await p.generateItinerary('Friends',1000,2);assert.equal(queries,1);
 await assert.rejects(()=>p.generateItinerary('Date',1000,2,{start:{latitude:48.85,longitude:2.35}}),e=>e.code==='PROVIDER_UNAVAILABLE');
});
test('bundled Rustaveli snapshot contains distinct real OSM choices for each vibe and radius',async()=>{
 const {loadBundledSnapshot}=await import('../server/snapshot.ts');const snapshot=loadBundledSnapshot();assert.ok(snapshot?.elements.length>100);
 const p=planner(fakeProvider,{snapshot});
 // Force the venue endpoint to fail while leaving routed geometry mocked.
 const offline=planner(async url=>String(url).includes('/route/')?response(routeData):response({},503),{snapshot});
 for(const vibe of ['Date','Friends','Family'])for(const radius of [500,1000,2000]){const plan=await offline.generateItinerary(vibe,radius,1);assert.equal(plan.stops.length,3);assert.equal(plan.catalogSource,'snapshot');assert.ok(plan.stops.every(s=>s.sourceUrl.startsWith('https://www.openstreetmap.org/')&&!s.sample&&distanceBetween(START,s.coordinate)<=radius+0.5));}
});

test('local-first Tbilisi search never waits for a hanging public venue service',async()=>{
 const snapshot={center:START,coverageRadius:20000,dataAsOf:'2026-10-16T20:21:21Z',elements};let queries=0;
 const p=planner(async(url,init)=>{if(String(url).includes('/route/'))return response(routeData);queries++;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));},{snapshot,config:()=>settings({preferLocalPlaces:true}),overpassTimeoutMs:10});
 const plan=await p.generateItinerary('Date',1000,2);assert.equal(queries,0);assert.equal(plan.catalogSource,'snapshot');assert.equal(plan.route.source,'osrm');assert.ok(plan.notices.some(n=>n.includes('snapshot dated')));assert.ok(!plan.notices.some(n=>n.includes('unavailable')));
});
test('live-first venue timeout still returns the dated local catalog',async()=>{
 const snapshot={center:START,coverageRadius:20000,dataAsOf:'2026-10-16T20:21:21Z',elements};let timedOut=false;
 const p=planner(async(url,init)=>String(url).includes('/route/')?response(routeData):new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{timedOut=true;reject(new DOMException('Aborted','AbortError'));})),{snapshot,overpassTimeoutMs:10});
 const plan=await p.generateItinerary('Date',1000,2);assert.ok(timedOut);assert.equal(plan.catalogSource,'snapshot');assert.equal(plan.route.source,'osrm');
});
test('outside local coverage a venue timeout gives a useful recovery message',async()=>{
 const p=planner((_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))),{overpassTimeoutMs:10});
 await assert.rejects(p.generateItinerary('Date',1000,2,{start:{latitude:48.85,longitude:2.35}}),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.message.includes('Rustaveli'));
});
test('walking timeout returns genuine cached venues with a clearly approximate line',async()=>{
 const snapshot={center:START,coverageRadius:20000,dataAsOf:'2026-10-16T20:21:21Z',elements};
 const p=planner((_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))),{snapshot,config:()=>settings({preferLocalPlaces:true}),routingTimeoutMs:10});
 const plan=await p.generateItinerary('Date',1000,2);assert.equal(plan.stops.length,3);assert.equal(plan.route.source,'straight');assert.equal(plan.route.durationSeconds,undefined);assert.ok(plan.stops.every(s=>!s.sample));
});

test('Tbilisi neighborhoods outside the former four-kilometer fallback generate locally',async()=>{
 const {loadBundledSnapshot}=await import('../server/snapshot.ts');const snapshot=loadBundledSnapshot();assert.equal(snapshot.coverageRadius,20000);
 const p=planner(async url=>{assert.ok(String(url).includes('/route/'),'No Overpass request should be needed in Tbilisi');return response(routeData);},{snapshot,config:()=>settings({preferLocalPlaces:true})});
 for(const start of [{latitude:41.711,longitude:44.75},{latitude:41.691,longitude:44.865},{latitude:41.798,longitude:44.821}]){const plan=await p.generateItinerary('Family',2000,2,{start});assert.equal(plan.catalogSource,'snapshot');assert.equal(plan.stops.length,3);assert.ok(plan.stops.every(s=>distanceBetween(start,s.coordinate)<=2000.5));}
});

test('Friends prefers a farther bar over nearby cafes when both fit the budget',()=>{
 const places=normalizePlaces([raw(101,{amenity:'cafe'},41.70111,44.79331),raw(102,{amenity:'bar'},41.707,44.7933)],START,1000);
 const ranked=rankCandidates(places,START,1000,2,'Friends','drinks');assert.deepEqual(ranked.map(p=>p.id),['node/102']);assert.ok(ranked[0].matchReasons.some(r=>r.includes('night out')));
});
test('Friends nightlife includes mapped nightclubs while Date and Family keep them out',()=>{
 assert.match(buildOverpassQuery(START,1000),/nightclub/);
 const places=normalizePlaces([raw(101,{amenity:'nightclub'}),raw(102,{amenity:'cafe'})],START,1000);
 assert.deepEqual(rankCandidates(places,START,1000,2,'Friends','drinks').map(p=>p.id),['node/101']);
 for(const vibe of ['Date','Family'])assert.deepEqual(rankCandidates(places,START,1000,2,vibe,'drinks').map(p=>p.id),['node/102']);
 const mixed=normalizePlaces([raw(103,{amenity:'nightclub',tourism:'attraction'})],START,1000);for(const vibe of ['Date','Family'])assert.deepEqual(rankCandidates(mixed,START,1000,2,vibe,'activity'),[]);
});
test('Friends still respects mapped price limits and can fall back to coffee',async()=>{
 const base=elements.filter(p=>p.tags.amenity!=='pub');const expensive=raw(101,{amenity:'bar',price_level:'3'});
 const plan=await planner(async url=>String(url).includes('/route/')?response(routeData):response({elements:[...base,expensive]})).generateItinerary('Friends',1000,1);
 assert.equal(plan.stops[2].tags.amenity,'cafe');assert.equal(plan.stops[2].label,'Coffee fallback');assert.ok(plan.notices.some(n=>n.includes('coffee or dessert fallback')));
});
test('Friends can finish at a real nightclub with a clear label and opening-hours notice',async()=>{
 const base=elements.filter(p=>p.tags.amenity!=='pub');const club=raw(101,{name:'Test Dance Club',amenity:'nightclub'});
 const plan=await planner(async url=>String(url).includes('/route/')?response(routeData):response({elements:[...base,club]})).generateItinerary('Friends',1000,2);
 assert.equal(plan.stops[2].name,'Test Dance Club');assert.equal(plan.stops[2].label,'Club night');assert.ok(plan.notices.some(n=>n.includes('opening hours and entry')));assert.equal(new Set(plan.stops.map(s=>s.id)).size,3);
});
test('nightlife outside the selected radius cannot replace a nearby coffee fallback',async()=>{
 const base=elements.filter(p=>p.tags.amenity!=='pub');const far=raw(101,{amenity:'nightclub'},41.75,44.9);
 const plan=await planner(async url=>String(url).includes('/route/')?response(routeData):response({elements:[...base,far]})).generateItinerary('Friends',500,2);
 assert.equal(plan.stops[2].tags.amenity,'cafe');assert.ok(plan.stops.every(p=>distanceBetween(START,p.coordinate)<=500.5));
});
test('bundled Tbilisi catalog includes real nightclubs without querying a public venue API',async()=>{
 const {loadBundledSnapshot}=await import('../server/snapshot.ts');const snapshot=loadBundledSnapshot();assert.ok(snapshot.elements.some(p=>p.tags.amenity==='nightclub'));
 const p=planner(async url=>{assert.ok(String(url).includes('/route/'));return response(routeData);},{snapshot,config:()=>settings({preferLocalPlaces:true})});
 const plan=await p.generateItinerary('Friends',1000,2);assert.ok(['bar','pub','nightclub'].includes(plan.stops[2].tags.amenity));assert.equal(plan.catalogSource,'snapshot');
});
