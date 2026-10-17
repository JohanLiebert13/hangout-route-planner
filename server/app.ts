import {BUDGET_LIMITS} from '../shared/prices.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createPlanner, isAbortError, PlannerError, validCoordinate } from './planner.ts';
import { loadConfig, shareBaseUrl, PROJECT_ROOT, type ServerConfig } from './config.ts';
import type { VenueSnapshot } from './snapshot.ts';
import { normalizePreferences } from './plan-preferences.ts';
import { GroupStore,newVoterToken,validVoter } from './groups.ts';
import type { PlanInput } from '../src/types';
import type { Budget, Coordinate, Vibe } from '../src/types';
const MAX_BODY = 8192;
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<any> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new PlannerError('Use application/json.', 415, 'UNSUPPORTED_MEDIA_TYPE');
  if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); throw new PlannerError('Request body is too large.', 413, 'BODY_TOO_LARGE'); }
  return new Promise((resolveBody, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    req.on('data', chunk => { size += chunk.length; if (size <= MAX_BODY) chunks.push(Buffer.from(chunk)); });
    req.once('error', reject);
    req.once('end', () => {
      if (size > MAX_BODY) return reject(new PlannerError('Request body is too large.', 413, 'BODY_TOO_LARGE'));
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new PlannerError('Invalid JSON body.', 400, 'INVALID_JSON')); }
    });
  });
}
export function validateInput(body: any): PlanInput {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !validCoordinate(body.start) ||
    !['Date', 'Friends', 'Family'].includes(body.vibe) || typeof body.radius !== 'number' || !Number.isInteger(body.radius) || body.radius < 500 || body.radius > 2000 ||
    ![1, 2, 3].includes(body.budget) || (body.demoMode !== undefined && typeof body.demoMode !== 'boolean'))
    throw new PlannerError('Choose a valid start, vibe, radius (500–2000 m) and budget (1–3).', 400, 'INVALID_INPUT');
  return { start: { latitude: body.start.latitude, longitude: body.start.longitude }, vibe: body.vibe, radius: body.radius, budget: body.budget, demoMode: body.demoMode === true, preferences: normalizePreferences(body.preferences) };
}
export function createApp(options: { groupStore?: GroupStore; snapshot?: VenueSnapshot | null; config?: () => ServerConfig; fetchImpl?: typeof fetch; staticRoot?: string } = {}) {
  const config = options.config ?? loadConfig;
  const planner = createPlanner({ config, fetchImpl: options.fetchImpl, snapshot: options.snapshot });
  const groups=options.groupStore??new GroupStore();
  const voteBuckets=new Map<string,{count:number;expires:number}>();
  const staticRoot = resolve(options.staticRoot ?? resolve(PROJECT_ROOT, 'dist'));
  const buckets = new Map<string, { count: number; expires: number }>();
  let active = 0;
  const server = createServer(async (req, res) => {
    const abort = new AbortController();
    req.once('aborted', () => abort.abort());
    res.once('close', () => { if (!res.writableEnded) abort.abort(); });
    let acquired = false;
    try {
      const settings = config();
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        const ownOrigin = 'http://' + req.headers.host;
        const secureOrigin = 'https://' + req.headers.host;
        if (origin && origin !== ownOrigin && origin !== secureOrigin && !settings.allowedOrigins.includes(origin)) throw new PlannerError('Origin is not allowed.', 403, 'ORIGIN_NOT_ALLOWED');
        if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Voter-Token');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'GET' && url.pathname === '/api/health') { json(res, 200, { ok: true, service: 'hangout-route-planner' }); return; }
        if (req.method === 'GET' && url.pathname === '/api/config') {
          json(res, 200, { placesReady: true, provider: 'openstreetmap', mapStyleUrl: settings.mapStyleUrl, ratingsAvailable: true, ratingMode: 'mixed-demo', priceMode: 'mock', currency: 'GEL', budgetLimits: BUDGET_LIMITS, shareBaseUrl: shareBaseUrl(settings) }); return;
        }
        if(req.method==='GET'&&url.pathname==='/api/voter'){json(res,200,{token:newVoterToken()});return;}
        const pollMatch=url.pathname.match(/^\/api\/groups\/([A-Za-z0-9_-]{22})(\/vote)?$/);
        if(pollMatch){
          const rawToken=req.headers['x-voter-token'];const token=typeof rawToken==='string'?rawToken:undefined;
          if(token!==undefined&&!validVoter(token))throw new PlannerError('Invalid anonymous voter token.',400,'INVALID_VOTER');
          if(req.method==='GET'&&!pollMatch[2]){json(res,200,await groups.get(pollMatch[1],token));return;}
          if(req.method==='POST'&&pollMatch[2]){
            const body=await readJson(req);if(!token||typeof body?.optionId!=='string')throw new PlannerError('Choose a route and supply your anonymous token.',400,'INVALID_INPUT');
            const key=req.socket.remoteAddress??'unknown',now=Date.now();for(const [k,b] of voteBuckets)if(b.expires<=now)voteBuckets.delete(k);
            const bucket=voteBuckets.get(key)??{count:0,expires:now+60000};if(bucket.count>=60||voteBuckets.size>=1024&&!voteBuckets.has(key)){res.setHeader('Retry-After','60');throw new PlannerError('Please wait before voting again.',429,'RATE_LIMITED');}bucket.count++;voteBuckets.set(key,bucket);
            json(res,200,await groups.vote(pollMatch[1],body.optionId,token));return;
          }
        }
        if (req.method === 'POST' && ['/api/itineraries','/api/itineraries/swap','/api/groups'].includes(url.pathname)) {
          const body=await readJson(req);
          const input = validateInput(body);
          const now = Date.now();
          for (const [key, value] of buckets) if (value.expires <= now) buckets.delete(key);
          const key = req.socket.remoteAddress ?? 'unknown';
          const bucket = buckets.get(key) ?? { count: 0, expires: now + 60000 };
          if (bucket.count >= settings.rateLimit || active >= settings.maxConcurrent || (!buckets.has(key) && buckets.size >= 1024)) {
            res.setHeader('Retry-After', '60'); throw new PlannerError('Too many requests. Wait a minute and retry.', 429, 'RATE_LIMITED');
          }
          bucket.count++; buckets.set(key, bucket); active++; acquired = true;
          const planOptions={start:input.start,signal:abort.signal,demoMode:input.demoMode,preferences:input.preferences};
          if(url.pathname==='/api/groups'){
            if(body.title!==undefined&&(typeof body.title!=='string'||body.title.length>60))throw new PlannerError('Use a group title of at most 60 characters.',400,'INVALID_INPUT');
            const token=req.headers['x-voter-token'];if(token!==undefined&&!validVoter(token))throw new PlannerError('Invalid voter token.',400,'INVALID_VOTER');
            const plans=await planner.generateOptions(input.vibe,input.radius,input.budget,planOptions);if(abort.signal.aborted)return;
            json(res,201,await groups.create(body.title||'Our hangout',plans,typeof token==='string'?token:undefined));return;
          }
          let itinerary;
          if(url.pathname==='/api/itineraries/swap'){
            if(!Array.isArray(body.stopIds)||body.stopIds.length!==3||!body.stopIds.every((id:unknown)=>typeof id==='string'&&id.length<=100)||!Number.isInteger(body.swapIndex)||body.swapIndex<0||body.swapIndex>2||(body.excludeIds!==undefined&&(!Array.isArray(body.excludeIds)||body.excludeIds.length>24||!body.excludeIds.every((id:unknown)=>typeof id==='string'&&id.length<=100))))throw new PlannerError('Invalid stop swap request.',400,'INVALID_INPUT');
            itinerary=await planner.swapStop(input.vibe,input.radius,input.budget,planOptions,body.stopIds,body.swapIndex,body.excludeIds||[]);
          }else itinerary=await planner.generateItinerary(input.vibe,input.radius,input.budget,planOptions);
          if (!abort.signal.aborted) json(res, 200, itinerary);
          return;
        }
        throw new PlannerError('API endpoint not found.', 404, 'NOT_FOUND');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new PlannerError('Method not allowed.', 405, 'METHOD_NOT_ALLOWED');
      let pathname: string;
      try { pathname = decodeURIComponent(url.pathname); } catch { throw new PlannerError('Invalid path.', 400, 'INVALID_PATH'); }
      let target = resolve(staticRoot, '.' + pathname);
      if (target !== staticRoot && !target.startsWith(staticRoot + sep)) throw new PlannerError('Not found.', 404, 'NOT_FOUND');
      try { if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html'); }
      catch { throw new PlannerError('Build the web app with npm run build:web first.', 404, 'NOT_FOUND'); }
      const content = await readFile(target);
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      res.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream', 'Cache-Control': extname(target) === '.html' ? 'no-store' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (isAbortError(error) || abort.signal.aborted || res.destroyed) return;
      if (error instanceof PlannerError) json(res, error.status, { error: { code: error.code, message: error.message } });
      else json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'The server could not complete this request. Retry in a moment.' } });
    } finally { if (acquired) active--; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  return server;
}
