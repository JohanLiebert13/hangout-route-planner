// Optional maintainer tool: derive a small venue catalog from an official regional extract.
// Download https://download.geofabrik.de/europe/georgia-latest.osm.pbf once into artifacts/.
import {createReadStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import parseOSM from 'osm-pbf-parser';
import {Readable} from 'node:stream';
import {distanceBetween,DEFAULT_START} from '../server/planner.ts';
const center=DEFAULT_START,coverageRadius=20000;
const dataAsOf=process.argv[3];
if(!dataAsOf||!Number.isFinite(Date.parse(dataAsOf)))throw Error('Pass the extract data timestamp as argument 3 (from the Geofabrik download page).');
const nodes=new Map(),wayBounds=new Map(),elements=[];
const wanted=t=>(t.name||t['name:en'])&&(/^(park|garden|playground|amusement_arcade|bowling_alley|sports_centre)$/.test(t.leisure)||/^(museum|gallery|attraction|viewpoint)$/.test(t.tourism)||/^(restaurant|cafe|bar|pub|nightclub|ice_cream|fast_food|food_court|arts_centre)$/.test(t.amenity));
const midpoint=b=>({lat:(b[0]+b[2])/2,lon:(b[1]+b[3])/2});
const inside=p=>distanceBetween(center,{latitude:p.lat,longitude:p.lon})<=coverageRadius;
const bounds=points=>points.reduce((b,p)=>[Math.min(b[0],p.lat),Math.min(b[1],p.lon),Math.max(b[2],p.lat),Math.max(b[3],p.lon)],[Infinity,Infinity,-Infinity,-Infinity]);
const stream=createReadStream(process.argv[2]||'artifacts/georgia-latest.osm.pbf').pipe(parseOSM());
for await(const batch of new Readable({objectMode:true}).wrap(stream))for(const item of batch){
 if(item.type==='node'){
  const p={lat:item.lat,lon:item.lon};if(distanceBetween(center,{latitude:p.lat,longitude:p.lon})<=coverageRadius+2500)nodes.set(item.id,p);
  if(wanted(item.tags)&&inside(p))elements.push({type:item.type,id:item.id,...p,tags:item.tags});
 }else if(item.type==='way'){
  if(!item.refs?.length||!item.refs.every(id=>nodes.has(id)))continue;
  const b=bounds(item.refs.map(id=>nodes.get(id)));wayBounds.set(item.id,b);const p=midpoint(b);
  if(wanted(item.tags)&&inside(p))elements.push({type:item.type,id:item.id,center:p,tags:item.tags});
 }else if(item.type==='relation'&&wanted(item.tags)){
  const members=item.members.filter(m=>m.type==='way');if(!members.length||!members.every(m=>wayBounds.has(m.id)))continue;
  const points=members.flatMap(m=>{const b=wayBounds.get(m.id);return [{lat:b[0],lon:b[1]},{lat:b[2],lon:b[3]}];});const p=midpoint(bounds(points));
  if(inside(p))elements.push({type:item.type,id:item.id,center:p,tags:item.tags});
 }
}
const snapshot={center,coverageRadius,downloadedAt:new Date().toISOString(),dataAsOf,source:'https://download.geofabrik.de/europe/georgia.html',extractUrl:'https://download.geofabrik.de/europe/georgia-latest.osm.pbf',attribution:'© OpenStreetMap contributors · extract by Geofabrik',license:'https://opendatacommons.org/licenses/odbl/1-0/',elements};
await mkdir('data',{recursive:true});await writeFile('data/tbilisi-osm.json',JSON.stringify(snapshot,null,2));console.log('Saved',elements.length,'real OSM venues; nodes in working area',nodes.size);
