import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GroupPoll, PlanInput, PlanPreferences, Budget, Coordinate, Itinerary, Vibe } from './types';
import { API_BASE } from './config';
export type RuntimeConfig = { placesReady: boolean; provider: 'openstreetmap'; mapStyleUrl: string; ratingsAvailable: boolean; ratingMode?: 'mixed-demo'; priceMode?: 'mock'; currency?: 'GEL'; budgetLimits?: Record<Budget,number>; shareBaseUrl?: string };
export class ApiError extends Error { code: string; constructor(message: string, code: string) { super(message); this.code = code; } }
async function callApi<T>(endpoint: string, init: RequestInit = {}, externalSignal?: AbortSignal, timeout = 35000): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(API_BASE + endpoint, { ...init, signal: controller.signal });
    let data: any;
    try { data = await response.json(); } catch { throw new ApiError('The API is not available at this address. Start the backend and retry.', 'INVALID_RESPONSE'); }
    if (!response.ok) throw new ApiError(data.error?.message || 'The request failed. Try again.', data.error?.code || 'REQUEST_FAILED');
    return data as T;
  } catch (error) {
    if (externalSignal?.aborted) { const aborted = new Error('Cancelled'); aborted.name = 'AbortError'; throw aborted; }
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? 'The server took too long. Please retry.' : 'Cannot reach the backend. Check the server and API URL.', 'CONNECTION_FAILED');
  } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', onAbort); }
}
export function fetchRuntimeConfig(signal?: AbortSignal): Promise<RuntimeConfig> { return callApi('/api/config', {}, signal, 5000); }
export function generateItinerary(vibe: Vibe, radius: number, budget: Budget,
  options: { start: Coordinate; demoMode: boolean; preferences?: PlanPreferences; signal?: AbortSignal }): Promise<Itinerary> {
  return callApi('/api/itineraries', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: options.start, vibe, radius, budget, demoMode: options.demoMode, preferences: options.preferences }) }, options.signal);
}

export function swapItinerary(input:PlanInput,stopIds:string[],swapIndex:number,excludeIds:string[],signal?:AbortSignal):Promise<Itinerary>{return callApi('/api/itineraries/swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,stopIds,swapIndex,excludeIds})},signal);}
let tokenPromise:Promise<string>|null=null;
export function voterToken():Promise<string>{if(!tokenPromise)tokenPromise=(async()=>{let stored:string|null=null;try{stored=await AsyncStorage.getItem('hangout-voter-v1');}catch{}if(stored&&/^[A-Za-z0-9_-]{43}$/.test(stored))return stored;const {token}=await callApi<{token:string}>('/api/voter');try{await AsyncStorage.setItem('hangout-voter-v1',token);}catch{}return token;})().catch(e=>{tokenPromise=null;throw e;});return tokenPromise;}
export async function fetchGroup(id:string,signal?:AbortSignal):Promise<GroupPoll>{const token=await voterToken();return callApi('/api/groups/'+encodeURIComponent(id),{headers:{'X-Voter-Token':token}},signal);}
export async function createGroup(input:PlanInput,title:string,signal?:AbortSignal):Promise<GroupPoll>{const token=await voterToken();return callApi('/api/groups',{method:'POST',headers:{'Content-Type':'application/json','X-Voter-Token':token},body:JSON.stringify({...input,title})},signal);}
export async function voteGroup(id:string,optionId:string,signal?:AbortSignal):Promise<GroupPoll>{const token=await voterToken();return callApi('/api/groups/'+encodeURIComponent(id)+'/vote',{method:'POST',headers:{'Content-Type':'application/json','X-Voter-Token':token},body:JSON.stringify({optionId})},signal);}
