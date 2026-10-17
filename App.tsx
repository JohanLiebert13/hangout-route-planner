import PlacePrice from './src/PlacePrice';
import {BUDGET_LIMITS,estimatedTotal,priceTier} from './shared/prices';
import PlaceReviews from './src/PlaceReviews';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch,
  Text, View, useWindowDimensions,
} from 'react-native';
import { radioKeyboard } from './src/radio-keyboard';
import RadiusSlider from './src/RadiusSlider';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import MapCanvas from './src/MapCanvas';
import PlanControls from './src/PlanControls';
import GroupPanel from './src/GroupPanel';
import { setGroupUrl, configureSharing } from './src/group-links';
import { Icon, type IconName } from './src/Icons';
import { DEFAULT_MAP_STYLE } from './src/config';
import { fetchRuntimeConfig, generateItinerary, swapItinerary, type RuntimeConfig } from './src/api';
import { DEFAULT_START, isAbortError, priceLabel, VIBE_COPY, VIBES } from './shared/preferences';
import type { Budget, Coordinate, GroupPoll, Itinerary, PlanInput, PlanPreferences, Stop, Vibe } from './src/types';

const C = { bg: '#0D1312', sheet: '#171F1C', surface: '#202B25', border: '#303C33',
  text: '#F1F5EA', muted: '#97A79B', lime: '#D7F99A', dark: '#1B2B17' };
const EMPTY_STOPS: Stop[] = [];
const STOP_COLORS = ['#D7F99A', '#F0BD91', '#BEB3F9'];
const VIBE_ICONS: Record<Vibe, IconName> = { Date: 'heart', Friends: 'users', Family: 'sun' };
const STOP_ICONS: Record<Stop['kind'], IconName> = { activity: 'activity', restaurant: 'food', drinks: 'coffee' };
const stopIcon = (stop: Stop): IconName => stop.tags.amenity === 'nightclub' ? 'music' : ['bar', 'pub'].includes(stop.tags.amenity) ? 'drink' : STOP_ICONS[stop.kind];
const prettyDistance = (meters: number) => meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1) + ' km';
function Choice({ label, selected, onPress, children }: {
  label: string; selected: boolean; onPress: () => void; children?: React.ReactNode;
}) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }} aria-checked={selected}
    onPress={onPress} {...radioKeyboard(onPress)} style={({ pressed }) => [s.choice, selected && s.choiceActive, pressed && s.pressed]}>
    {children}<Text style={[s.choiceText, selected && s.choiceTextActive]}>{label}</Text>
  </Pressable>;
}
function Planner() {
  const { width, height } = useWindowDimensions();
  const pageWidth = Math.min(width, 560), cardWidth = Math.min(pageWidth - 72, 284);
  const [start, setStart] = useState<Coordinate>(DEFAULT_START);
  const [vibe, setVibe] = useState<Vibe>('Date');
  const [radius, setRadius] = useState(1000);
  const [budget, setBudget] = useState<Budget>(2);
  const [demoMode, setDemoMode] = useState(false);
  const [preferences,setPreferences]=useState<PlanPreferences>({friendsStyle:'bar_hop',music:'any',atmosphere:'any',timeZone:'Asia/Tbilisi'});
  const [poll,setPoll]=useState<GroupPoll|null>(null);
  const [groupBusy,setGroupBusy]=useState(false);
  const [swapping,setSwapping]=useState<number|null>(null);
  const swapHistory=useRef<Record<number,string[]>>({});
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const configAbort = useRef<AbortController | null>(null);
  const useLiveMap = !demoMode;
  const canUseLive = Boolean(runtime?.placesReady);
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0), busy = useRef(false);
  const cardsRef = useRef<ScrollView>(null);
  const pageRef = useRef<ScrollView>(null);
  useEffect(() => { loadSettings(); return () => { controller.current?.abort(); configAbort.current?.abort(); }; }, []);
  async function loadSettings() {
    configAbort.current?.abort(); const abort = new AbortController(); configAbort.current = abort;
    setConfigLoading(true); setConfigError('');
    try { const settings = await fetchRuntimeConfig(abort.signal); if (!abort.signal.aborted) { configureSharing(settings.shareBaseUrl); setRuntime(settings); } }
    catch (cause) { if (!isAbortError(cause)) setConfigError(cause instanceof Error ? cause.message : 'Cannot connect to the planner.'); }
    finally { if (!abort.signal.aborted) setConfigLoading(false); }
  }
  function invalidate() {
    generation.current += 1; controller.current?.abort(); busy.current = false;
    setLoading(false); setSwapping(null); setItinerary(null); setSelectedId(null); setDirectionsOpen(false); setError(''); setPoll(null); setGroupUrl(); swapHistory.current={};
  }
  function changeStart(coordinate: Coordinate) {
    if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude) || Math.abs(coordinate.latitude) > 90 || Math.abs(coordinate.longitude) > 180) return;
    invalidate(); setStart(coordinate);
  }
  function selectStop(id: string) {
    setSelectedId(id);
    const index = itinerary?.stops.findIndex(stop => stop.id === id) ?? -1;
    if (index >= 0) cardsRef.current?.scrollTo({ x: index * (cardWidth + 12), animated: true });
  }
  async function generate() {
    if (busy.current) return;
    busy.current = true;
    const requestId = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(''); setProgress(demoMode ? 'Building a sample itinerary…' : 'Searching nearby places and walking directions…');
    try {
      const result = await generateItinerary(vibe, radius, budget, { start, demoMode, preferences, signal: abort.signal });
      if (requestId !== generation.current) return;
      swapHistory.current={}; setGroupUrl(); setPoll(null); setItinerary(result); setSelectedId(result.stops[0]?.id ?? null);
      cardsRef.current?.scrollTo({ x: 0, animated: true });
    } catch (cause) {
      if (requestId === generation.current && !isAbortError(cause)) setError(cause instanceof Error ? cause.message : 'Something went wrong. Try again.');
    } finally {
      if (requestId === generation.current) { busy.current = false; setLoading(false); }
    }
  }
  function useGroupRoute(plan:Itinerary){controller.current?.abort();generation.current++;busy.current=false;setLoading(false);setSwapping(null);setStart(plan.start);setVibe(plan.vibe);setRadius(plan.radius);setBudget(plan.budget);setDemoMode(plan.source==='demo');setPreferences(plan.preferences||{});setItinerary(plan);setSelectedId(plan.stops[0].id);setDirectionsOpen(false);setError('');swapHistory.current={};cardsRef.current?.scrollTo({x:0,animated:false});pageRef.current?.scrollTo({y:0,animated:true});}
  async function swap(index:number){if(!itinerary||busy.current)return;busy.current=true;const requestId=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;setSwapping(index);setError('');const old=itinerary;
   try{const history=[...(swapHistory.current[index]||[]),old.stops[index].id].slice(-24);const input:PlanInput={start:old.start,vibe:old.vibe,radius:old.radius,budget:old.budget,demoMode:old.source==='demo',preferences:old.preferences};const result=await swapItinerary(input,old.stops.map(p=>p.id),index,history,abort.signal);if(requestId!==generation.current)return;swapHistory.current[index]=history;setItinerary(result);setSelectedId(result.stops[index].id);setDirectionsOpen(false);setPoll(null);setGroupUrl();}
   catch(e){if(requestId===generation.current&&!isAbortError(e))setError(e instanceof Error?e.message:'Could not swap this stop.');}finally{if(requestId===generation.current){busy.current=false;setSwapping(null);}}
  }
  const planInput:PlanInput={start,vibe,radius,budget,demoMode,preferences};
  const visitTime=(value:string)=>new Intl.DateTimeFormat('en-GB',{timeZone:itinerary?.preferences?.timeZone||'Asia/Tbilisi',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  const atRustaveli = Math.abs(start.latitude - DEFAULT_START.latitude) < 0.00005 && Math.abs(start.longitude - DEFAULT_START.longitude) < 0.00005;
  const sourceLabel = itinerary?.source === 'demo' ? 'DEMO ITINERARY' : itinerary?.source === 'osm' ? 'REAL NEARBY PLACES' : 'YOUR LITTLE ADVENTURE';
  const duration = itinerary?.route.durationSeconds;
  const totalCost = itinerary ? estimatedTotal(itinerary.stops) : undefined;
  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg} />
    <ScrollView ref={pageRef} style={s.page} contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <View style={s.brand}><View style={s.logo}><Icon name="route" color={C.dark} size={22} /></View>
          <View><Text style={s.brandName}>hangout<Text style={{ color: C.lime }}>.</Text></Text><Text style={s.brandSub}>ROUTE PLANNER</Text></View></View>
        <View style={s.modePill}><View style={[s.statusDot, { backgroundColor: demoMode ? C.lime : '#91CEC3' }]} /><Text style={s.modePillText}>{itinerary?.source === 'demo' ? 'Demo stops' : demoMode ? 'Sample mode' : itinerary?.catalogSource === 'snapshot' ? 'OSM snapshot' : 'OpenStreetMap'}</Text></View>
      </View>
      <View style={s.intro}><Text style={s.eyebrow}>LESS PLANNING. MORE LIVING.</Text>
        <Text style={s.title}>Good plans.{'\n'}<Text style={{ color: C.lime }}>Great company.</Text></Text>
        <Text style={s.subtitle}>Three stops. One lovely way to spend the day.</Text></View>
      <View style={[s.mapWrap, { height: Math.min(340, Math.max(250, height * 0.35)) }]}>
        <MapCanvas start={start} radius={radius} stops={itinerary?.stops ?? EMPTY_STOPS} route={itinerary?.route ?? null}
          selectedId={selectedId} onStartChange={changeStart} onSelectStop={selectStop} resetKey={resetKey} useLiveMap={useLiveMap} mapStyleUrl={runtime?.mapStyleUrl || DEFAULT_MAP_STYLE} onReadyChange={setMapReady} />
        <View pointerEvents="box-none" style={s.mapTop}>
          <View pointerEvents="none" style={s.locationPill}><Icon name="pin" size={17} />
            <View><Text style={s.locationLabel}>STARTING POINT</Text><Text style={s.locationName}>{atRustaveli ? 'Metro Rustaveli, Tbilisi' : start.latitude.toFixed(4) + ', ' + start.longitude.toFixed(4)}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset start to Metro Rustaveli" style={s.recenter}
            onPress={() => { changeStart(DEFAULT_START); setResetKey(key => key + 1); }}><Icon name="target" size={21} /></Pressable>
        </View>
        {useLiveMap && !itinerary && <View pointerEvents="none" style={s.mapHint}><Text style={s.mapHintText}>Tap anywhere to change your start</Text></View>}
      </View>
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.sectionTop}><Text style={s.sectionTitle}>Make it your kind of day</Text><Icon name="spark" size={20} /></View>
        {(configLoading || configError) && <View style={s.connectionCard}><View style={{ flex: 1 }}><Text style={s.connectionTitle}>{configLoading ? 'Connecting to your planner…' : 'Planner is offline'}</Text><Text style={s.connectionCopy}>{configError || 'OpenStreetMap places and walking routes. No account needed.'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Reconnect planner" disabled={configLoading} onPress={() => loadSettings()} style={s.connectionButton}><Text style={s.connectionButtonText}>{configLoading ? '…' : 'Reconnect'}</Text></Pressable></View>}
        <Text style={s.inputLabel}>WHO'S COMING?</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Event vibe" style={s.choiceRow}>{VIBES.map(option => <Choice key={option} label={option} selected={vibe === option}
          onPress={() => { if (vibe !== option) { invalidate(); setVibe(option); } }}>
          <Icon name={VIBE_ICONS[option]} size={19} color={vibe === option ? C.dark : C.muted} /></Choice>)}</View>
        <Text style={s.vibeCaption}>{VIBE_COPY[vibe].caption} · {vibe === 'Date' ? 'Scenic spots, a good table, a cozy finish.' : vibe === 'Friends' ? 'Games, shared plates, bars and clubs.' : 'Room to explore, kid-friendly picks, sweet treats.'}</Text>
        <PlanControls vibe={vibe} value={preferences} onChange={p=>{invalidate();setPreferences(p);}} />
        <View style={s.inputCard}>
          <View style={s.labelRow}><Text style={s.inputLabel}>EXPLORING RADIUS</Text><Text style={s.radiusValue}>{prettyDistance(radius)}</Text></View>
          <RadiusSlider value={radius} onChange={value => { if (value !== radius) { invalidate(); setRadius(value); } }} />
          <View style={s.labelRow}><Text style={s.rangeLabel}>500 m · close by</Text><Text style={s.rangeLabel}>2 km · wander a little</Text></View>
        </View>
        <View style={s.budgetRow}><View style={s.budgetLabel}><Text style={s.inputLabel}>YOUR BUDGET</Text><Text style={s.budgetHint}>Mock prices · per person</Text></View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Budget level" style={s.budgetChoices}>{([1, 2, 3] as Budget[]).map(tier => <Choice key={tier} label={'$'.repeat(tier)} selected={budget === tier}
            onPress={() => { if (tier !== budget) { invalidate(); setBudget(tier); } }} />)}</View></View>
        <Text accessibilityLiveRegion="polite" style={s.budgetCap}>Up to {BUDGET_LIMITS[budget]} GEL per person / stop · mock prices</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Generate route" accessibilityState={{ disabled: loading || swapping!==null || groupBusy || configLoading, busy: loading || swapping!==null }} disabled={loading || swapping!==null || groupBusy || configLoading}
          onPress={generate} style={({ pressed }) => [s.generate, pressed && s.pressed, loading && { opacity: 0.75 }]}>
          {loading ? <ActivityIndicator color={C.dark} size="small" /> : <Icon name="spark" color={C.dark} size={21} />}
          <Text style={s.generateText}>{loading ? 'Finding your hangout…' : itinerary ? 'Regenerate route' : 'Generate route'}</Text>
          {!loading && <Icon name="arrow" color={C.dark} size={22} />}
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={s.helper}>{loading ? progress : vibe === 'Friends' ? 'A little fun → shared food → a bar, pub or club' : 'A little exploring → a great meal → one more stop'}</Text>
        {error && !itinerary ? <View><Text accessibilityRole="alert" style={s.error}>{error}</Text>{!demoMode && !atRustaveli && <Pressable accessibilityRole="button" accessibilityLabel="Use Rustaveli starting point" onPress={() => { changeStart(DEFAULT_START); setResetKey(key => key + 1); }} style={s.walkButton}><Text style={s.walkButtonText}>Use Rustaveli starting point</Text></Pressable>}</View> : null}
        <View style={s.modeRow}><View style={{ flex: 1 }}><Text style={s.modeTitle}>Demo mode</Text><Text style={s.modeHint}>{canUseLive ? 'Use sample stops without querying public services' : 'Connect to the planner to switch data modes'}</Text></View>
          <Switch accessibilityLabel="Use demo data" value={demoMode} disabled={!canUseLive}
            trackColor={{ false: '#3F4F42', true: '#4B6334' }} thumbColor={demoMode ? C.lime : C.muted}
            onValueChange={value => { invalidate(); setDemoMode(value); }} /></View>
      </View>
      <View style={s.results}>
        <View style={s.labelRow}><Text style={s.eyebrow}>{sourceLabel}</Text><Text style={s.stopCount}>03 STOPS</Text></View>
        <Text style={s.resultTitle}>{itinerary ? 'The day is yours.' : 'Your next good memory.'}</Text>
        {itinerary ? <>
          {itinerary.preferences?.startLocal&&<Text style={s.notice}>Planned start: {itinerary.preferences.startLocal.replace('T',' ')} · {itinerary.preferences.timeZone}{itinerary.endAt?' · finish '+visitTime(itinerary.endAt):''}</Text>}
          {error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          <View style={s.summary}><Icon name="walk" size={17} /><Text style={s.summaryText}>{prettyDistance(itinerary.route.distanceMeters)} {itinerary.route.source === 'straight' ? 'straight-line estimate' : 'walking'}{duration !== undefined ? ' · ' + Math.round(duration / 60) + ' min' : ''}</Text></View>
          {totalCost!==undefined&&<Text style={s.costTotal}>Mock route total: {totalCost} GEL / person · 3 stops</Text>}
          {itinerary.route.source === 'osrm' && <Pressable accessibilityRole="button" accessibilityLabel="Toggle walking directions" style={s.walkButton} onPress={() => setDirectionsOpen(value => !value)}><Icon name="walk" size={19} /><Text style={s.walkButtonText}>{directionsOpen ? 'Hide walking directions' : 'Show walking directions'}</Text><Icon name="chevron" size={18} /></Pressable>}
          {directionsOpen && itinerary.route.legs && <View style={s.directions}>{itinerary.route.legs.map((leg, index) => <View key={index} style={s.directionLeg}><Text style={s.directionTitle}>{index + 1}. To {itinerary.stops[index].name} · {Math.max(1, Math.round(leg.durationSeconds / 60))} min</Text>{leg.instructions.map((instruction, step) => <Text key={step} style={s.directionText}>{step + 1}. {instruction}</Text>)}</View>)}</View>}
          <ScrollView ref={cardsRef} horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast"
            contentContainerStyle={s.cards} style={s.cardsScroll}>
            {itinerary.stops.map((stop, index) => <Pressable key={stop.id} accessibilityRole="button" accessibilityLabel={'Stop ' + (index + 1) + ', ' + stop.name}
              onPress={() => selectStop(stop.id)} style={[s.stopCard, { width: cardWidth }, selectedId === stop.id && { borderColor: STOP_COLORS[index] }]}>
              <View style={s.cardTop}><View style={[s.stopIcon, { backgroundColor: STOP_COLORS[index] }]}><Icon name={stopIcon(stop)} size={20} color={C.dark} /></View>
                <Text style={s.stopNumber}>{'0' + (index + 1)}</Text>{stop.sample && <View style={s.sampleBadge}><Text style={s.sampleText}>SAMPLE</Text></View>}</View>
              <Text style={[s.stopLabel, { color: STOP_COLORS[index] }]}>{stop.label.toUpperCase()}</Text>
              <Text style={s.stopName} numberOfLines={2}>{stop.name}</Text>
              <PlacePrice estimate={stop.priceEstimate} name={stop.name} />
              <PlaceReviews review={stop.review} name={stop.name} onError={()=>setError('Could not open the review source.')} />
              <View style={s.ratingRow}><Icon name="spark" size={13} color={STOP_COLORS[index]} /><Text style={s.rating}>{stop.matchScore}% match</Text><Text style={s.ratingDetails}>· {priceLabel(stop.priceEstimate?priceTier(stop.priceEstimate.amount):stop.priceLevel)}</Text></View>
              <Text style={s.matchReasons} numberOfLines={2}>{stop.matchReasons.slice(0, 2).join(' · ')}</Text>
              {stop.visit&&<View style={s.visitBox}><Text style={s.visitTime}>{visitTime(stop.visit.arrivalAt)}–{visitTime(stop.visit.departureAt)} · planned visit</Text><Text style={[s.visitStatus,stop.visit.openingStatus==='open'&&{color:'#c5e69e'}]}>{stop.visit.openingStatus==='open'?'Open for visit · mapped':'Hours unknown · confirm'}</Text>{stop.visit.openingHours&&<Text numberOfLines={2} style={s.traits}>{stop.visit.openingHours}</Text>}</View>}
              {(stop.musicLabel||stop.atmosphereLabel)&&<Text numberOfLines={2} style={s.traits}>{[stop.musicLabel,stop.atmosphereLabel].filter(Boolean).join(' · ')}</Text>}
              <Text style={s.address} numberOfLines={2}>{stop.address}</Text>
              {stop.sourceUrl && <Pressable accessibilityRole="link" accessibilityLabel={'View ' + stop.name + ' on OpenStreetMap'} onPress={event => { event.stopPropagation(); Linking.openURL(stop.sourceUrl!).catch(() => setError('Could not open this venue.')); }}><Text style={s.sourceLink}>View on OpenStreetMap ↗</Text></Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel={'Swap stop '+(index+1)} disabled={loading||swapping!==null||groupBusy} onPress={event=>{event.stopPropagation();swap(index);}} style={s.swapButton}>{swapping===index?<ActivityIndicator color="#d7f99a" size="small"/>:<Text style={s.swapText}>↻ Swap this stop</Text>}</Pressable>
            </Pressable>)}
          </ScrollView>
          {[...itinerary.notices, ...itinerary.route.warnings].map((notice, index) => <Text key={index} style={s.notice}>{notice}</Text>)}
        </> : <View style={s.empty}><View style={s.emptyIcon}><Icon name="route" size={30} /></View><View style={{ flex: 1 }}><Text style={s.emptyTitle}>A whole hangout, in one tap.</Text><Text style={s.emptyCopy}>Pick your vibe above. We'll find three places worth stepping out for.</Text></View></View>}
        <GroupPanel onBusy={setGroupBusy} disabled={loading||swapping!==null} input={planInput} poll={poll} onPoll={setPoll} onUse={useGroupRoute}/>
        <View style={s.credits}><Text style={s.creditText}>Map: OpenFreeMap · OpenMapTiles</Text><Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}><Text style={s.creditLink}>© OpenStreetMap contributors</Text></Pressable><View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}><Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://routing.openstreetmap.de/about.html')}><Text style={s.creditLink}>Walking routes: FOSSGIS</Text></Pressable><Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.openstreetmap.org/fixthemap')}><Text style={s.creditLink}>Fix the map</Text></Pressable></View></View>
        <View style={s.footer}><View style={s.footerLine} /><Text style={s.footerText}>GOOD COMPANY IS THE DESTINATION</Text><View style={s.footerLine} /></View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><View style={s.app}><Planner /></View></SafeAreaProvider>; }

const s = StyleSheet.create({
  budgetCap:{fontSize:10,lineHeight:16,color:'#bbcfaa',marginBottom:13},costTotal:{fontSize:11,lineHeight:18,color:'#c5dfa9',marginTop:10,marginBottom:3},
  visitBox:{padding:10,borderRadius:9,backgroundColor:'#263520',marginTop:10},visitTime:{fontSize:10,color:'#d0e1bf',fontWeight:'600'},visitStatus:{fontSize:9,color:'#cebda2',marginTop:6},traits:{fontSize:9,lineHeight:15,color:'#8fa481',marginTop:7},swapButton:{borderRadius:9,padding:11,borderWidth:1,borderColor:'#405535',alignItems:'center',marginTop:14},swapText:{fontSize:10,color:'#d7f99a',fontWeight:'600'},
  app: { flex: 1, backgroundColor: '#080D0B', alignItems: 'center' },
  safe: { flex: 1, backgroundColor: C.bg, width: '100%', maxWidth: 560 },
  page: { flex: 1 }, pageContent: { paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 18 },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' }, logo: { width: 37, height: 40, borderRadius: 12, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -1 }, brandSub: { color: C.muted, fontSize: 8, letterSpacing: 2.2, marginTop: 1 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 9 },
  statusDot: { width: 5, height: 5, borderRadius: 3 }, modePillText: { color: '#C9D9BA', fontSize: 10, fontWeight: '600' },
  intro: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 23 }, eyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1.8, fontWeight: '700' },
  title: { color: C.text, fontSize: 39, fontWeight: '700', lineHeight: 43, letterSpacing: -1.7, marginTop: 11 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
  mapWrap: { position: 'relative', backgroundColor: '#17241E', overflow: 'hidden' }, mapTop: { position: 'absolute', top: 16, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  locationPill: { flexDirection: 'row', gap: 9, alignItems: 'center', backgroundColor: 'rgba(13,22,17,0.94)', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderColor: '#354337', borderWidth: 1, flexShrink: 1 },
  locationLabel: { color: C.muted, fontSize: 7, letterSpacing: 1.6, marginBottom: 4 }, locationName: { color: C.text, fontSize: 11, fontWeight: '600' },
  recenter: { backgroundColor: 'rgba(13,22,17,0.94)', width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#354337' },
  mapHint: { position: 'absolute', bottom: 72, left: 18, borderRadius: 10, backgroundColor: 'rgba(13,22,17,0.9)', paddingHorizontal: 10, paddingVertical: 7 }, mapHintText: { fontSize: 10, color: C.text },
  sheet: { marginTop: -21, borderTopLeftRadius: 27, borderTopRightRadius: 27, backgroundColor: C.sheet, paddingHorizontal: 22, paddingBottom: 19, borderWidth: 1, borderColor: '#2E3B30' },
  handle: { alignSelf: 'center', width: 32, height: 3, borderRadius: 4, backgroundColor: '#435141', marginTop: 10, marginBottom: 18 },
  sectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 23 }, sectionTitle: { color: C.text, fontSize: 18, fontWeight: '600', letterSpacing: -0.4 },
  connectionCard: { backgroundColor: '#233025', borderColor: '#43513A', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }, connectionTitle: { color: '#D6E5C9', fontSize: 11, fontWeight: '600' }, connectionCopy: { color: '#92A38B', fontSize: 10, lineHeight: 16, marginTop: 4 }, connectionButton: { paddingVertical: 9, paddingHorizontal: 8 }, connectionButtonText: { color: '#D7F99A', fontSize: 10, fontWeight: '600' },
  directions: { backgroundColor: '#18231B', padding: 14, borderRadius: 13, marginTop: 10 }, directionLeg: { marginBottom: 15 }, directionTitle: { color: '#D7F99A', fontSize: 12, fontWeight: '600', marginBottom: 7 }, directionText: { color: '#A5B49A', fontSize: 11, lineHeight: 18, marginTop: 3 }, matchReasons: { color: '#8B9D82', fontSize: 10, lineHeight: 15, marginTop: 7 }, sourceLink: { color: '#B8D899', fontSize: 10, marginTop: 12 }, credits: { gap: 6, alignItems: 'center', marginTop: 22 }, creditText: { color: '#778D75', fontSize: 9 }, creditLink: { color: '#9DB88A', fontSize: 9 },
  walkButton: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13, borderRadius: 12, backgroundColor: '#26361F', marginTop: 16 }, walkButtonText: { color: '#D7F99A', fontSize: 12, fontWeight: '600', flex: 1 },
  inputLabel: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.3 }, choiceRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  choice: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#384334', minHeight: 45 },
  choiceActive: { backgroundColor: C.lime, borderColor: C.lime }, choiceText: { color: '#C3CEBF', fontSize: 12, fontWeight: '600' }, choiceTextActive: { color: C.dark, fontWeight: '700' },
  pressed: { opacity: 0.8 }, vibeCaption: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 10, marginBottom: 18 },
  inputCard: { backgroundColor: '#1D2821', paddingHorizontal: 14, paddingTop: 13, paddingBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: '#344030' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, radiusValue: { color: C.lime, fontSize: 15, fontWeight: '600' }, slider: { height: 37, marginHorizontal: Platform.OS === 'ios' ? 0 : -12, marginTop: 2 }, rangeLabel: { color: '#7C917E', fontSize: 9 },
  budgetRow: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 17, marginBottom: 21 }, budgetLabel: { flex: 0.8 }, budgetHint: { fontSize: 10, color: '#819682', marginTop: 5 }, budgetChoices: { flex: 1.5, flexDirection: 'row', gap: 7 },
  generate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 53, backgroundColor: C.lime, borderRadius: 14, paddingHorizontal: 17 }, generateText: { color: C.dark, fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  helper: { color: '#7F9580', fontSize: 9, textAlign: 'center', marginTop: 12, lineHeight: 16 }, error: { color: '#F3B0A6', fontSize: 12, marginTop: 10, lineHeight: 18 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#2B392E', marginTop: 17, paddingTop: 13 }, modeTitle: { color: '#B9C9B6', fontSize: 11 }, modeHint: { color: '#7E9480', fontSize: 9, marginTop: 4 },
  results: { paddingTop: 27, paddingHorizontal: 22 }, stopCount: { color: '#7E9382', fontSize: 9, letterSpacing: 1.5 }, resultTitle: { color: C.text, fontSize: 27, fontWeight: '600', letterSpacing: -0.9, marginTop: 9 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }, summaryText: { color: '#A0B596', fontSize: 11 }, cardsScroll: { marginHorizontal: -22, marginTop: 17 }, cards: { gap: 12, paddingHorizontal: 22, paddingVertical: 2 },
  stopCard: { padding: 17, borderRadius: 17, borderWidth: 1, borderColor: '#35412F', backgroundColor: '#1B251E', minHeight: 226 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, stopIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stopNumber: { color: '#758A76', fontSize: 12 }, sampleBadge: { marginLeft: 'auto', backgroundColor: '#33402C', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4 }, sampleText: { color: '#ADBF96', fontSize: 7, letterSpacing: 1 },
  stopLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1.4, marginTop: 16 }, stopName: { color: C.text, fontSize: 21, fontWeight: '600', lineHeight: 25, letterSpacing: -0.5, marginTop: 6 }, ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }, rating: { color: C.text, fontSize: 11, fontWeight: '600' }, ratingDetails: { color: '#91A18C', fontSize: 10 }, address: { color: '#8EA18D', fontSize: 10, lineHeight: 16, marginTop: 10 }, attribution: { color: '#7E9382', fontSize: 8, lineHeight: 12, marginTop: 6 },
  notice: { color: '#94A48C', fontSize: 10, lineHeight: 16, marginTop: 12 }, empty: { flexDirection: 'row', gap: 16, backgroundColor: '#17211B', borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#35482F', padding: 19, alignItems: 'center', marginTop: 19 }, emptyIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: '#2A3921', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: '#CFDDC7', fontSize: 12, fontWeight: '600' }, emptyCopy: { color: '#82937D', fontSize: 10, lineHeight: 17, marginTop: 6 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 9 }, footerLine: { flex: 1, height: 1, backgroundColor: '#293729' }, footerText: { color: '#60775F', fontSize: 7, letterSpacing: 1.2 },
});
