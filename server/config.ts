import { networkInterfaces } from 'node:os';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath, URL as NodeURL } from 'node:url';
export const PROJECT_ROOT = fileURLToPath(new NodeURL('../', import.meta.url));
export type ServerConfig = { publicAppUrl?: string; preferLocalPlaces: boolean; overpassUrl: string; routingUrl: string; mapStyleUrl: string; userAgent: string; host: string; port: number; allowedOrigins: string[]; rateLimit: number; maxConcurrent: number };
export function loadConfig(): ServerConfig {
  let local: Record<string, string | undefined> = {};
  try { local = parseEnv(readFileSync(new NodeURL('../.env', import.meta.url), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const value = (name: string, fallback = ''): string => (process.env[name] ?? local[name] ?? fallback).trim();
  const port = Number(value('PORT', '63119'));
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT.');
  return { publicAppUrl: value('PUBLIC_APP_URL'), preferLocalPlaces: value('PREFER_LOCAL_PLACES', 'true').toLowerCase() !== 'false', overpassUrl: value('OVERPASS_URL') || 'https://overpass-api.de/api/interpreter',
    routingUrl: value('OSRM_FOOT_URL') || 'https://routing.openstreetmap.de/routed-foot',
    mapStyleUrl: value('MAP_STYLE_URL') || 'https://tiles.openfreemap.org/styles/dark',
    userAgent: value('UPSTREAM_USER_AGENT') || 'HangoutRoutePlanner/1.1 (private hackathon prototype)',
    host: value('HOST', '127.0.0.1'), port,
    allowedOrigins: value('CORS_ORIGINS', 'http://localhost:8081,http://127.0.0.1:8081').split(',').map(s => s.trim()).filter(Boolean),
    rateLimit: 12, maxConcurrent: 4 };
}

export function shareBaseUrl(settings:ServerConfig):string|undefined {
 if(settings.publicAppUrl){try{const url=new URL(settings.publicAppUrl);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)return url.toString().replace(/\/$/,'');}catch{}return undefined;}
 if(settings.host!=='0.0.0.0'&&settings.host!=='::')return undefined;
 const interfaces=Object.entries(networkInterfaces()).sort(([a],[b])=>Number(/wi.?fi|ethernet/i.test(b))-Number(/wi.?fi|ethernet/i.test(a)));
 for(const [,addresses] of interfaces)for(const address of addresses||[])if(address.family==='IPv4'&&!address.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address))return 'http://'+address.address+':'+settings.port;
 return undefined;
}
