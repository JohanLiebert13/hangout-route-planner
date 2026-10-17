import OpeningHours from 'opening_hours';
import { PlannerError } from './errors.ts';
import { distanceBetween } from './geo.ts';
import type { Coordinate, Place, PlanPreferences, Stop, StopKind, Vibe, WalkingLeg } from '../src/types';
export function normalizePreferences(value: unknown): PlanPreferences {
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value))throw new PlannerError('Invalid plan preferences.',400,'INVALID_INPUT');
 const p=value as Record<string,unknown>, result: PlanPreferences={};
 const enums={friendsStyle:['chill','bar_hop','club_night'],music:['any','techno','house','jazz','live'],atmosphere:['any','quiet','dancing','outdoor']};
 for(const [key,values] of Object.entries(enums))if(p[key]!==undefined){if(typeof p[key]!=='string'||!values.includes(p[key] as string))throw new PlannerError('Invalid '+key+' preference.',400,'INVALID_INPUT');(result as any)[key]=p[key];}
 if(p.timeZone!==undefined){if(typeof p.timeZone!=='string'||p.timeZone.length>64)throw new PlannerError('Choose a valid time zone.',400,'INVALID_INPUT');try{new Intl.DateTimeFormat('en',{timeZone:p.timeZone});}catch{throw new PlannerError('Choose a valid time zone.',400,'INVALID_INPUT');}result.timeZone=p.timeZone;}
 if(p.startLocal!==undefined){if(typeof p.startLocal!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.startLocal))throw new PlannerError('Use a valid date and 24-hour start time.',400,'INVALID_INPUT');result.startLocal=p.startLocal;result.timeZone=result.timeZone||'Asia/Tbilisi';localToInstant(result.startLocal,result.timeZone);}
 return result;
}
const formatters=new Map<string,Intl.DateTimeFormat>();
function partsAt(date:Date,zone:string): string {
 if(!formatters.has(zone)){if(formatters.size>=64)formatters.delete(formatters.keys().next().value!);formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));}
 const parts=Object.fromEntries(formatters.get(zone)!.formatToParts(date).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;
}
export function localToInstant(local:string,zone:string): string {
 const wall=Date.parse(local+'Z');
 if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==local)throw new PlannerError('Choose a real calendar date and time.',400,'INVALID_INPUT');
 let instant=wall;
 for(let i=0;i<4;i++){const shown=Date.parse(partsAt(new Date(instant),zone)+'Z');const delta=wall-shown;if(!delta)break;instant+=delta;}
 if(partsAt(new Date(instant),zone)!==local)throw new PlannerError('This local time does not exist in that time zone. Choose another time.',400,'INVALID_INPUT');
 return new Date(instant).toISOString();
}
export function stageKinds(vibe:Vibe,p:PlanPreferences): StopKind[] {return vibe==='Friends'&&p.friendsStyle&&p.friendsStyle!=='chill'?['restaurant','drinks','drinks']:['activity','restaurant','drinks'];}
export function stageAllowed(place:Place,index:number,vibe:Vibe,p:PlanPreferences):boolean {
 if(vibe!=='Friends'||!p.friendsStyle)return true;
 const a=place.tags.amenity;
 if(p.friendsStyle==='chill')return index!==2||['cafe','ice_cream'].includes(a);
 if(index===0)return ['restaurant','fast_food','food_court'].includes(a);
 if(p.friendsStyle==='club_night'&&index===2)return a==='nightclub';
 return ['bar','pub'].includes(a);
}
export function featureMatch(place:Place,p:PlanPreferences):{score:number;allowed:boolean;musicLabel:string;atmosphereLabel:string} {
 const t=place.tags,night=['bar','pub','nightclub'].includes(t.amenity);
 const genre=[t['music:genre'],t.music,t.genre].filter(Boolean).join(';').toLowerCase();
 const noMusic=t.music==='no'||t.music==='none';
 const genreTag=t['music:genre']||t.genre;
 const knownGenre=!!genreTag||noMusic||/techno|house|jazz|rock|pop|electronic|hip.?hop|classical|metal|disco|country|folk|funk|reggae|blues/.test(genre);
 const musicMatch=!noMusic&&(p.music==='live'?t.live_music==='yes':!!p.music&&p.music!=='any'&&genre.includes(p.music));
 const musicKnown=p.music==='live'?(noMusic||['yes','no'].includes(t.live_music)):knownGenre;
 const quiet=t.quiet==='yes'||t['sound:volume']==='quiet'||t.atmosphere==='quiet';
 const dancing=t.amenity==='nightclub'||t.dancing==='yes';
 const outdoor=t.outdoor_seating==='yes'||['park','garden','playground'].includes(t.leisure);
 const atmosphereMatch=p.atmosphere==='quiet'?quiet:p.atmosphere==='dancing'?dancing:p.atmosphere==='outdoor'?outdoor:false;
 const atmosphereMismatch=p.atmosphere==='quiet'&&(dancing||t['sound:volume']==='loud'||t.quiet==='no')||p.atmosphere==='outdoor'&&t.outdoor_seating==='no'||p.atmosphere==='dancing'&&t.dancing==='no';
 const musicLabel=p.music&&p.music!=='any'?(musicMatch?(p.music==='live'?'Live music mapped':p.music+' mapped'):musicKnown?'Different music mapped':'Music unknown'):noMusic?'No music mapped':t.live_music==='yes'?'Live music mapped':knownGenre?genre.slice(0,55):'Music unknown';
 const atmosphereLabel=p.atmosphere&&p.atmosphere!=='any'?(atmosphereMatch?p.atmosphere+' mapped':'Atmosphere unknown'):dancing?'Dancing mapped':outdoor?'Outdoor space mapped':quiet?'Quiet mapped':'Atmosphere unknown';
 return {score:(musicMatch?8:0)+(atmosphereMatch?6:0),allowed:!(night&&((p.music&&p.music!=='any'&&musicKnown&&!musicMatch)||atmosphereMismatch)),musicLabel,atmosphereLabel};
}
const parserCache=new Map<string,InstanceType<typeof OpeningHours>|null>();
export function hoursState(place:Place,arrival:Date,departure:Date,zone:string):'open'|'closed'|'unknown' {
 const raw=place.tags.opening_hours;
 if(place.sample||!raw||raw.length>1500||/\b(PH|SH|sunrise|sunset|dawn|dusk)\b/.test(raw))return 'unknown';
 try {
  if(!parserCache.has(raw)){if(parserCache.size>=512)parserCache.delete(parserCache.keys().next().value!);try{parserCache.set(raw,new OpeningHours(raw));}catch{parserCache.set(raw,null);}}
  const hours=parserCache.get(raw);if(!hours)return 'unknown';
  // Evaluate venue wall-clock values independently of the server's operating-system zone.
  const a=wallDate(arrival,zone),b=wallDate(departure,zone);
  if(b<=a||Math.abs((b.getTime()-a.getTime())-(departure.getTime()-arrival.getTime()))>1000)return 'unknown';
  const [open,unknown]=hours.getOpenDuration(a,b);
  if(unknown>0||hours.getUnknown(a))return 'unknown';
  return open>=b.getTime()-a.getTime()-1?'open':'closed';
 }catch{return 'unknown';}
}
export function schedule(stops:Stop[],start:Coordinate,p:PlanPreferences,legs?:WalkingLeg[]):{stops:Stop[];endAt?:string;closed:string[]} {
 if(!p.startLocal)return {stops,closed:[]};
 const zone=p.timeZone||'Asia/Tbilisi';let cursor=Date.parse(localToInstant(p.startLocal,zone));const closed:string[]=[];
 const times=visitMinutes(stops.map(s=>s.kind),p);
 const planned=stops.map((stop,index)=>{const previous=index?stops[index-1].coordinate:start;cursor+=(legs?.[index]?.durationSeconds??distanceBetween(previous,stop.coordinate)/1.25)*1000;const arrival=new Date(cursor),departure=new Date(cursor+times[index]*60000);const state=hoursState(stop,arrival,departure,zone);if(state==='closed')closed.push(stop.id);cursor=departure.getTime();return {...stop,visit:{arrivalAt:arrival.toISOString(),departureAt:departure.toISOString(),openingStatus:state==='open'?'open' as const:'unknown' as const,openingHours:stop.tags.opening_hours}};});
 return {stops:planned,endAt:new Date(cursor).toISOString(),closed};
}
export function labelFor(place:Place,index:number,kind:StopKind,vibe:Vibe,p:PlanPreferences):string {
 if(vibe==='Friends'&&kind==='drinks')return ({bar:'Bar stop',pub:'Pub stop',nightclub:'Club night'}[place.tags.amenity]||(place.tags.amenity==='ice_cream'?'Sweet finish':p.friendsStyle==='chill'?'Coffee stop':'Coffee fallback'));
 return kind==='restaurant'?'Eat something good':'Explore';
}

function wallDate(instant:Date,zone:string):Date {
 const seconds=String(instant.getUTCSeconds()).padStart(2,'0'),millis=String(instant.getUTCMilliseconds()).padStart(3,'0');
 return new Date(partsAt(instant,zone)+':'+seconds+'.'+millis);
}
export function visitMinutes(kinds:StopKind[],p:PlanPreferences):number[]{return kinds[0]==='restaurant'?(p.friendsStyle==='club_night'?[60,60,90]:[60,60,60]):[45,60,45];}
/** Safe prefilter: reject only if no full visit can fit anywhere in the possible arrival window. */
export function hoursCanFit(place:Place,earliest:Date,latest:Date,minutes:number,zone:string):boolean {
 const raw=place.tags.opening_hours;
 if(place.sample||!raw||raw.length>1500||/\b(PH|SH|sunrise|sunset|dawn|dusk)\b/.test(raw))return true;
 try{
  if(!parserCache.has(raw)){if(parserCache.size>=512)parserCache.delete(parserCache.keys().next().value!);try{parserCache.set(raw,new OpeningHours(raw));}catch{parserCache.set(raw,null);}}
  const hours=parserCache.get(raw);if(!hours)return true;
  const end=new Date(latest.getTime()+minutes*60000),a=wallDate(earliest,zone),b=wallDate(end,zone);
  if(b<=a||Math.abs((b.getTime()-a.getTime())-(end.getTime()-earliest.getTime()))>1000)return true;
  return hours.getOpenIntervals(a,b).some(interval=>interval[2]||(interval[1].getTime()-interval[0].getTime()>=minutes*60000&&interval[0].getTime()<=b.getTime()-minutes*60000));
 }catch{return true;}
}
