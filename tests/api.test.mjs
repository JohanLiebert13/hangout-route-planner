import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.ts';
import { elements, fakeProvider, response, settings, START } from './fixtures/providers.mjs';
const input={start:START,vibe:'Date',radius:1000,budget:2,demoMode:false};
async function withApp(overrides,fetchImpl,fn) {
 const app=createApp({snapshot:null,config:()=>settings(overrides),fetchImpl});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.address().port;
 const post=(body=input,options={})=>fetch(base+'/api/itineraries',{method:'POST',headers:{'Content-Type':'application/json',...options.headers},body:JSON.stringify(body),signal:options.signal});
 try{await fn({base,post});}finally{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
}
test('health and public configuration work without keys or billing',async()=>{
 await withApp({},fakeProvider,async({base})=>{assert.equal((await fetch(base+'/api/health')).status,200);const res=await fetch(base+'/api/config');const body=await res.json();assert.equal(body.placesReady,true);assert.equal(body.provider,'openstreetmap');assert.equal(body.ratingsAvailable,true);assert.equal(body.ratingMode,'mixed-demo');assert.equal(body.priceMode,'mock');assert.equal(body.currency,'GEL');assert.deepEqual(body.budgetLimits,{1:25,2:50,3:100});assert.equal(body.browserMapsKey,undefined);assert.equal(res.headers.get('cache-control'),'no-store');});
});
test('HTTP live flow uses Overpass once and foot OSRM once',async()=>{
 const calls=[];await withApp({},async(url,init)=>{calls.push({url,init});return fakeProvider(url);},async({post})=>{const res=await post();const plan=await res.json();assert.equal(res.status,200);assert.equal(plan.source,'osm');assert.equal(plan.route.source,'osrm');assert.equal(calls.length,2);assert.ok(plan.stops.every(stop=>!stop.sample&&stop.matchScore));assert.ok(plan.notices.some(n=>n.includes('not customer reviews')));assert.ok(plan.notices.some(n=>n.includes('prices')));});
});
test('explicit sample mode never queries public services',async()=>{
 await withApp({},()=>{throw Error('Unexpected provider call');},async({post})=>{const res=await post({...input,demoMode:true});const plan=await res.json();assert.equal(res.status,200);assert.equal(plan.source,'demo');assert.equal(plan.stops.length,3);});
});
test('no-match and provider failures are actionable and never invent live places',async()=>{
 for(const [fake,code,status] of [[async()=>response({elements:[]}),'NO_MATCHING_PLACES',422],[async()=>response({},429),'PROVIDER_UNAVAILABLE',502]]) await withApp({},fake,async({post})=>{const res=await post();const body=await res.json();assert.equal(res.status,status);assert.equal(body.error.code,code);assert.equal(body.stops,undefined);});
});
test('routing outage retains genuine stops and reports the straight-line fallback',async()=>{
 await withApp({},async url=>url.includes('/route/')?response({},503):response({elements}),async({post})=>{const res=await post();const plan=await res.json();assert.equal(res.status,200);assert.equal(plan.source,'osm');assert.equal(plan.route.source,'straight');assert.equal(plan.route.durationSeconds,undefined);});
});
test('strict numeric bounds and supported input types are validated before provider access',async()=>{
 await withApp({},()=>{throw Error('Unexpected request');},async({post})=>{for(const patch of [{radius:'1000'},{radius:3000},{budget:'2'},{budget:4},{vibe:'Party'},{demoMode:'true'},{start:{latitude:91,longitude:0}}]){const res=await post({...input,...patch});assert.equal(res.status,400);assert.equal((await res.json()).error.code,'INVALID_INPUT');}});
});
test('malformed JSON, content type and body size are rejected',async()=>{
 await withApp({},fakeProvider,async({base})=>{const send=(body,type='application/json')=>fetch(base+'/api/itineraries',{method:'POST',headers:{'Content-Type':type},body});assert.equal((await send('{')).status,400);assert.equal((await send('{}','text/plain')).status,415);assert.equal((await send(JSON.stringify({x:'x'.repeat(9000)}))).status,413);});
});
test('browser origins are checked and allowed preflights succeed',async()=>{
 await withApp({},fakeProvider,async({base})=>{assert.equal((await fetch(base+'/api/config',{headers:{Origin:'https://untrusted.example'}})).status,403);const allowed=await fetch(base+'/api/config',{headers:{Origin:'http://localhost:8081'}});assert.equal(allowed.status,200);assert.equal(allowed.headers.get('access-control-allow-origin'),'http://localhost:8081');assert.equal((await fetch(base+'/api/itineraries',{method:'OPTIONS',headers:{Origin:'http://localhost:8081'}})).status,204);});
});
test('local generation limits return 429 and retry guidance',async()=>{
 await withApp({rateLimit:1},fakeProvider,async({post})=>{assert.equal((await post({...input,demoMode:true})).status,200);const res=await post({...input,demoMode:true});assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'60');});
});
test('static serving never exposes local configuration or server sources',async()=>{
 await withApp({},fakeProvider,async({base})=>{for(const name of ['/.env','/server/config.ts','/%2e%2e/.env'])assert.equal((await fetch(base+name)).status,404);});
});
test('client disconnection aborts active Overpass work',async()=>{
 let started,aborted;const begun=new Promise(resolve=>{started=resolve;});const stopped=new Promise(resolve=>{aborted=resolve;});
 const fake=(_url,init)=>{started();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{aborted();reject(new DOMException('Aborted','AbortError'));}));};
 await withApp({},fake,async({post})=>{const controller=new AbortController();const result=post(input,{signal:controller.signal}).catch(error=>error);await begun;controller.abort();assert.equal((await result).name,'AbortError');await Promise.race([stopped,new Promise((_,reject)=>setTimeout(()=>reject(Error('Upstream not cancelled')),2000).unref())]);});
});
